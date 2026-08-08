package app.rork.driverse.carapp

/**
 * What the car display is allowed to show — the Kotlin half of the rule set in
 * `lib/carTrip.ts`.
 *
 * The two exist because the decision has to be enforced where the pixels are
 * drawn, and the pixels are drawn here: `DriveScreen` cannot reach
 * [TripSnapshot] directly, only the model this file builds from it. That is
 * what stops "just add the speed, we already have it" from being a one-line
 * change — [TripSnapshot] has `speedKmh` and `topSpeedKmh`, and [CarScreenModel]
 * has no field they could be put in.
 *
 * The rules, in full, are in `lib/carTrip.ts`'s header. In short: no speed of
 * any kind, no XP or scores, and a stale GPS fix is shown as stale rather than
 * left on screen as a frozen number the driver has no way to distinguish from a
 * live one.
 *
 * Kept free of `androidx.car.app.*` types so it can be tested on the JVM.
 */

/** How much the last fix can be trusted. Mirrors `CarStaleness`. */
enum class Staleness { FRESH, STALE, LOST }

/** A button in the car's action strip. */
enum class CarAction { START, END, PAUSE, RESUME }

/** The stats line under the maneuver card. */
sealed class Readout {
    /** Genuine navigation: what is left to the destination. */
    data class Route(
        val remainingMeters: Double,
        val remainingSeconds: Double,
        val destinationName: String?,
    ) : Readout()

    /** A drive with no destination — the common Driverse case. */
    data class Free(
        val distanceMeters: Double,
        val elapsedMs: Long,
    ) : Readout()
}

/**
 * The next maneuver, when there is a destination route.
 *
 * Named `ManeuverInfo` rather than `Maneuver` because the car library has its
 * own `androidx.car.app.navigation.model.Maneuver`, and `DriveScreen` has to
 * name both in one file. They are genuinely different things — this one is
 * Mapbox's description of a turn, theirs is the host's icon vocabulary — and
 * `DriveScreen.carManeuver` is the translation between them.
 */
data class ManeuverInfo(
    val instruction: String,
    val type: String,
    val modifier: String?,
    val distanceMeters: Double,
)

/**
 * The whole car screen.
 *
 * [maneuver] and [message] are mutually exclusive: `NavigationTemplate` accepts
 * exactly one of `RoutingInfo` and `MessageInfo`, and setting both throws on the
 * car rather than merely looking wrong. [CarScreenModel.from] is the only
 * constructor, and it cannot produce both.
 */
data class CarScreenModel(
    val maneuver: ManeuverInfo?,
    val message: String?,
    val readout: Readout?,
    val actions: List<CarAction>,
    val staleness: Staleness,
    /** Whether `NavigationManager.navigationStarted()` should be in effect. */
    val holdsNavigationFocus: Boolean,
) {
    companion object {

        /** Fixes older than this are not trusted to describe where the car is. */
        const val STALE_FIX_MS = 20_000L

        /** Beyond this the drive is interrupted, not merely lagging. */
        const val LOST_FIX_MS = 90_000L

        fun staleness(lastFixAt: Long?, now: Long): Staleness {
            if (lastFixAt == null) return Staleness.LOST
            val age = now - lastFixAt
            // A fix stamped in the future means the clock moved, not that GPS
            // failed. Do not report a working receiver as lost.
            if (age < 0) return Staleness.FRESH
            return when {
                age >= LOST_FIX_MS -> Staleness.LOST
                age >= STALE_FIX_MS -> Staleness.STALE
                else -> Staleness.FRESH
            }
        }

        fun actions(recording: RecordingState): List<CarAction> = when (recording) {
            RecordingState.IDLE -> listOf(CarAction.START)
            RecordingState.RECORDING -> listOf(CarAction.PAUSE, CarAction.END)
            RecordingState.PAUSED -> listOf(CarAction.RESUME, CarAction.END)
        }

        /**
         * Projects the recorder's state onto what the car may see.
         *
         * Kept in the same order as `carDisplayModel` in `lib/carTrip.ts`, and
         * with the same branch conditions, so the two can be read side by side
         * when one of them changes.
         */
        fun from(snapshot: TripSnapshot, now: Long): CarScreenModel {
            val stale = staleness(snapshot.lastFixAt, now)
            val actions = actions(snapshot.recording)
            val focus = snapshot.recording == RecordingState.RECORDING

            if (snapshot.recording == RecordingState.IDLE) {
                return CarScreenModel(
                    maneuver = null,
                    message = "Ready to drive",
                    readout = null,
                    actions = actions,
                    staleness = stale,
                    holdsNavigationFocus = false,
                )
            }

            if (snapshot.recording == RecordingState.PAUSED) {
                return CarScreenModel(
                    maneuver = null,
                    message = "Drive paused",
                    readout = Readout.Free(snapshot.distanceMeters, snapshot.elapsedMs),
                    actions = actions,
                    staleness = stale,
                    holdsNavigationFocus = false,
                )
            }

            // Recording. A lost fix outranks everything: the maneuver would be
            // describing a position we no longer have, and the distance stopped
            // advancing without saying so.
            if (stale == Staleness.LOST) {
                return CarScreenModel(
                    maneuver = null,
                    message = "Waiting for GPS",
                    readout = null,
                    actions = actions,
                    staleness = stale,
                    holdsNavigationFocus = focus,
                )
            }

            val route = snapshot.route
            if (route != null && route.instructions.isNotEmpty()) {
                val i = snapshot.stepIndex.coerceIn(0, route.instructions.size - 1)
                val remaining = remainingMeters(route, i, snapshot.distanceToManeuverMeters)
                return CarScreenModel(
                    maneuver = ManeuverInfo(
                        instruction = route.instructions[i],
                        type = route.maneuverTypes.getOrElse(i) { "straight" },
                        modifier = route.maneuverModifiers.getOrNull(i),
                        distanceMeters = snapshot.distanceToManeuverMeters,
                    ),
                    message = null,
                    readout = Readout.Route(
                        remainingMeters = remaining,
                        remainingSeconds = remainingSeconds(route, remaining),
                        destinationName = route.destinationName,
                    ),
                    actions = actions,
                    staleness = stale,
                    holdsNavigationFocus = focus,
                )
            }

            return CarScreenModel(
                maneuver = null,
                message = "Recording drive",
                readout = Readout.Free(snapshot.distanceMeters, snapshot.elapsedMs),
                actions = actions,
                staleness = stale,
                holdsNavigationFocus = focus,
            )
        }

        /**
         * Metres left to the destination: this step's remainder plus every
         * step after it.
         *
         * Derived from the route rather than from `totalMeters` minus distance
         * driven, because the drive's odometer includes any detour the driver
         * took off-route — subtracting it would make the ETA improve while
         * driving the wrong way.
         */
        internal fun remainingMeters(
            route: RouteInfo,
            stepIndex: Int,
            distanceToManeuver: Double,
        ): Double {
            var sum = distanceToManeuver
            for (i in (stepIndex + 1) until route.stepDistances.size) {
                sum += route.stepDistances[i]
            }
            return sum
        }

        /**
         * Seconds left, scaled from the route's own duration by how much of it
         * is left.
         *
         * Cruder than re-requesting directions, and deliberately so: a route
         * refetch on every fix is a network call per second in a car whose
         * connection is the thing most likely to drop. §6 records this as a
         * known simplification — it does not react to traffic that appeared
         * after the route was fetched.
         */
        internal fun remainingSeconds(route: RouteInfo, remainingMeters: Double): Double {
            if (route.totalMeters <= 0.0) return 0.0
            val fraction = (remainingMeters / route.totalMeters).coerceIn(0.0, 1.0)
            return route.totalSeconds * fraction
        }
    }
}
