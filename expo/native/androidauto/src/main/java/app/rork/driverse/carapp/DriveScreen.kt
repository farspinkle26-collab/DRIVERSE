package app.rork.driverse.carapp

import android.text.SpannableString
import android.util.Log
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.ActionStrip
import androidx.car.app.model.CarColor
import androidx.car.app.model.CarIcon
import androidx.car.app.model.Distance
import androidx.car.app.model.DateTimeWithZone
import androidx.car.app.model.Template
import androidx.car.app.navigation.NavigationManager
import androidx.car.app.navigation.NavigationManagerCallback
import androidx.car.app.navigation.model.Destination
import androidx.car.app.navigation.model.Maneuver
import androidx.car.app.navigation.model.MessageInfo
import androidx.car.app.navigation.model.NavigationTemplate
import androidx.car.app.navigation.model.RoutingInfo
import androidx.car.app.navigation.model.Step
import androidx.car.app.navigation.model.TravelEstimate
import androidx.car.app.navigation.model.Trip
import androidx.core.graphics.drawable.IconCompat
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.TimeZone
import java.util.concurrent.TimeUnit

/**
 * The car display. One screen, one template, for the whole feature.
 *
 * Everything it may show comes through [CarScreenModel] — no field of
 * [TripSnapshot] is read here directly. That is the enforcement point for the
 * scope decision in `lib/carTrip.ts`: the snapshot has `speedKmh` and
 * `topSpeedKmh` on it, and the model this screen renders from has nowhere to
 * put them, so "just show the speed too" is a change to the model's type rather
 * than a line added to a render method.
 *
 * WHAT THE DRIVER SEES
 *
 *  - With a destination: the next maneuver, distance to it, and remaining
 *    distance and ETA — ordinary turn-by-turn navigation.
 *  - Without one, which is Driverse's common case: "Recording drive", the
 *    distance driven and the elapsed time. Two numbers.
 *  - With no usable GPS: "Waiting for GPS" and no numbers at all, because a
 *    frozen distance on a car screen is indistinguishable from a live one.
 */
class DriveScreen(carContext: CarContext) : Screen(carContext), DefaultLifecycleObserver {

    companion object {
        private const val TAG = "DriverseCarScreen"
    }

    private val renderer = CarMapRenderer(carContext)
    private var collectJob: Job? = null
    private var holdingFocus = false

    /**
     * A destination asked for by voice that the phone has not resolved yet.
     *
     * Held so the screen can say so instead of appearing to ignore the driver.
     * Resolution is the phone's job — see [DriverseSession]'s header for why
     * there is not a second geocoder in Kotlin.
     */
    private var pendingVoiceDestination: String? = null

    init {
        lifecycle.addObserver(this)
    }

    /* ---------------------------------------------------------------- *
     * Lifecycle
     * ---------------------------------------------------------------- */

    override fun onCreate(owner: LifecycleOwner) {
        renderer.attach()
        try {
            carContext.getCarService(NavigationManager::class.java)
                .setNavigationManagerCallback(navigationCallback)
        } catch (t: Throwable) {
            Log.w(TAG, "NavigationManager unavailable", t)
        }
    }

    override fun onStart(owner: LifecycleOwner) {
        collectJob = lifecycleScope.launch {
            // The store publishes at 1 Hz whether or not fixes are arriving,
            // which is what makes the elapsed clock advance at a traffic light
            // and what makes "Waiting for GPS" appear when fixes stop. A
            // fix-driven redraw could do neither, because both are about the
            // absence of fixes.
            TripStore.state.collectLatest {
                renderer.render()
                invalidate()
            }
        }
    }

    override fun onStop(owner: LifecycleOwner) {
        collectJob?.cancel()
        collectJob = null
    }

    override fun onDestroy(owner: LifecycleOwner) {
        // Releasing navigation focus is not optional politeness. A car app that
        // holds it after going away stops other navigation apps from taking it,
        // and the host eventually stops trusting this one.
        releaseNavigationFocus()
    }

    /** The car switched between day and night. */
    fun onCarConfigurationChanged() {
        renderer.onConfigurationChanged()
        invalidate()
    }

    /** A `geo:` intent arrived, from the Assistant or another app. */
    fun onNavigateRequested(target: String) {
        pendingVoiceDestination = target
        // The phone owns geocoding and routing. If it is not running, the
        // driver gets a screen that says so — which is a worse outcome than
        // routing, and a much better one than a car screen that silently
        // swallows what they just said out loud.
        CarCommandBus.emit(CarCommandBus.Command.START)
        invalidate()
    }

    /* ---------------------------------------------------------------- *
     * Template
     * ---------------------------------------------------------------- */

    override fun onGetTemplate(): Template {
        val snapshot = TripStore.current()
        val model = CarScreenModel.from(snapshot, System.currentTimeMillis())
        syncNavigationFocus(model, snapshot)

        val builder = NavigationTemplate.Builder()
            .setActionStrip(actionStrip(model))
            .setBackgroundColor(CarColor.PRIMARY)

        mapActionStrip()?.let { builder.setMapActionStrip(it) }

        val maneuver = model.maneuver
        if (maneuver != null) {
            builder.setNavigationInfo(routingInfo(maneuver, model))
            travelEstimate(model)?.let { builder.setDestinationTravelEstimate(it) }
        } else {
            builder.setNavigationInfo(messageInfo(model))
        }

        return builder.build()
    }

    /**
     * The maneuver card.
     *
     * `setCurrentStep` takes the distance to the maneuver separately from the
     * step itself, because the host re-renders that number far more often than
     * the instruction changes.
     */
    private fun routingInfo(maneuver: ManeuverInfo, model: CarScreenModel): RoutingInfo {
        val step = Step.Builder(SpannableString(maneuver.instruction))
            .setManeuver(carManeuver(maneuver))
            .build()
        return RoutingInfo.Builder()
            .setCurrentStep(step, meters(maneuver.distanceMeters))
            .build()
    }

    /**
     * The card shown when there is no maneuver to give.
     *
     * This is where Driverse spends most of its time on the car display: a
     * drive with no destination, which has no next turn and no ETA, and where
     * the only two honest numbers are how far and how long.
     */
    private fun messageInfo(model: CarScreenModel): MessageInfo {
        val title = pendingVoiceDestination?.let { "Open Driverse on your phone to route here" }
            ?: model.message
            ?: "Driverse"
        val builder = MessageInfo.Builder(title)
        when (val readout = model.readout) {
            is Readout.Free -> builder.setText(
                "${formatKm(readout.distanceMeters)}  ·  ${formatDuration(readout.elapsedMs)}",
            )
            is Readout.Route -> builder.setText(formatKm(readout.remainingMeters))
            null -> Unit
        }
        return builder.build()
    }

    /**
     * Remaining distance and arrival time.
     *
     * Only ever built for a route: `setDestinationTravelEstimate` may not be
     * set on a template whose navigation info is a `MessageInfo`, and doing it
     * anyway throws on the car rather than being ignored.
     */
    private fun travelEstimate(model: CarScreenModel): TravelEstimate? {
        val readout = model.readout as? Readout.Route ?: return null
        val arrivalMs = System.currentTimeMillis() +
            TimeUnit.SECONDS.toMillis(readout.remainingSeconds.toLong())
        val zone = TimeZone.getDefault()
        val arrival = DateTimeWithZone.create(
            arrivalMs,
            zone.getOffset(arrivalMs) / 1000,
            zone.id,
        )
        return TravelEstimate.Builder(meters(readout.remainingMeters), arrival)
            .setRemainingTimeSeconds(readout.remainingSeconds.toLong())
            .build()
    }

    /* ---------------------------------------------------------------- *
     * Actions
     * ---------------------------------------------------------------- */

    private fun actionStrip(model: CarScreenModel): ActionStrip {
        val builder = ActionStrip.Builder()
        model.actions.forEach { action ->
            builder.addAction(
                Action.Builder()
                    .setTitle(actionTitle(action))
                    .setOnClickListener { onAction(action) }
                    .build(),
            )
        }
        return builder.build()
    }

    private fun actionTitle(action: CarAction): String = when (action) {
        CarAction.START -> "Start"
        CarAction.PAUSE -> "Pause"
        CarAction.RESUME -> "Resume"
        CarAction.END -> "End"
    }

    /**
     * Sends the button both ways at once, and both are needed.
     *
     * The service is told directly so the drive starts or stops whether or not
     * the phone app exists. The bus is for the phone: without it, a driver who
     * ends a drive on the head unit picks up their phone at the destination and
     * finds it still showing a drive in progress that will never be saved.
     */
    private fun onAction(action: CarAction) {
        when (action) {
            CarAction.START -> {
                TripRecorderService.start(carContext)
                CarCommandBus.emit(CarCommandBus.Command.START)
            }
            CarAction.PAUSE -> {
                TripRecorderService.pause(carContext)
                CarCommandBus.emit(CarCommandBus.Command.PAUSE)
            }
            CarAction.RESUME -> {
                TripRecorderService.resume(carContext)
                CarCommandBus.emit(CarCommandBus.Command.RESUME)
            }
            CarAction.END -> {
                TripRecorderService.stop(carContext)
                CarCommandBus.emit(CarCommandBus.Command.END)
                pendingVoiceDestination = null
            }
        }
        invalidate()
    }

    /**
     * Pan and zoom.
     *
     * Returns null rather than a half-built strip if any icon is missing:
     * `setMapActionStrip` rejects an action without an icon by throwing, and a
     * car app that crashes on its first template is worse than one without
     * zoom buttons.
     */
    private fun mapActionStrip(): ActionStrip? {
        val zoomIn = icon("ic_car_zoom_in") ?: return null
        val zoomOut = icon("ic_car_zoom_out") ?: return null
        val recenter = icon("ic_car_recenter") ?: return null
        return try {
            ActionStrip.Builder()
                .addAction(
                    Action.Builder()
                        .setIcon(zoomIn)
                        .setOnClickListener { renderer.zoomIn() }
                        .build(),
                )
                .addAction(
                    Action.Builder()
                        .setIcon(zoomOut)
                        .setOnClickListener { renderer.zoomOut() }
                        .build(),
                )
                .addAction(
                    Action.Builder()
                        .setIcon(recenter)
                        .setOnClickListener { renderer.render(force = true) }
                        .build(),
                )
                // Action.PAN is required in a map action strip — it is how the
                // host knows to route the car's rotary controller or trackpad
                // into onScroll. Without it, pan works on a touchscreen and
                // nowhere else.
                .addAction(Action.PAN)
                .build()
        } catch (t: Throwable) {
            Log.w(TAG, "Map action strip rejected; continuing without it", t)
            null
        }
    }

    private fun icon(name: String): CarIcon? {
        val id = carContext.resources.getIdentifier(name, "drawable", carContext.packageName)
        if (id == 0) return null
        return CarIcon.Builder(IconCompat.createWithResource(carContext, id)).build()
    }

    /* ---------------------------------------------------------------- *
     * Navigation focus
     * ---------------------------------------------------------------- */

    /**
     * Tells the host when this app is and is not navigating.
     *
     * `navigationStarted()` is what earns the audio focus for guidance and what
     * stops another nav app from talking over it. `navigationEnded()` has to
     * follow, and a paused drive counts as ended — holding the car's navigation
     * focus while parked at a petrol station is exactly the behaviour that gets
     * an app flagged in review.
     */
    private fun syncNavigationFocus(model: CarScreenModel, snapshot: TripSnapshot) {
        val manager = try {
            carContext.getCarService(NavigationManager::class.java)
        } catch (t: Throwable) {
            return
        }
        try {
            if (model.holdsNavigationFocus && !holdingFocus) {
                manager.navigationStarted()
                holdingFocus = true
            } else if (!model.holdsNavigationFocus && holdingFocus) {
                manager.navigationEnded()
                holdingFocus = false
            }
            if (holdingFocus) manager.updateTrip(trip(model, snapshot))
        } catch (t: Throwable) {
            Log.w(TAG, "Navigation focus sync failed", t)
        }
    }

    private fun releaseNavigationFocus() {
        if (!holdingFocus) return
        try {
            carContext.getCarService(NavigationManager::class.java).navigationEnded()
        } catch (t: Throwable) {
            Log.w(TAG, "Could not release navigation focus", t)
        } finally {
            holdingFocus = false
        }
    }

    /**
     * The trip handed to the host for the instrument cluster.
     *
     * This is what puts the next turn in front of the driver on a car that has
     * a second screen behind the wheel — the one place a glance costs nothing.
     * Built from the same model as the main template so the two cannot disagree.
     */
    private fun trip(model: CarScreenModel, snapshot: TripSnapshot): Trip {
        val builder = Trip.Builder()
        val maneuver = model.maneuver
        val readout = model.readout

        if (maneuver != null && readout is Readout.Route) {
            val estimate = travelEstimate(model)
            val step = Step.Builder(SpannableString(maneuver.instruction))
                .setManeuver(carManeuver(maneuver))
                .build()
            if (estimate != null) {
                builder.addDestination(
                    Destination.Builder()
                        .setName(readout.destinationName ?: "Destination")
                        .build(),
                    estimate,
                )
                builder.addStep(step, estimate)
            }
        } else {
            // A free drive has no destination and no next step, so the cluster
            // gets the state as text rather than an empty trip that renders as
            // a blank card.
            builder.setLoading(false)
            builder.setCurrentRoad(model.message ?: "Recording drive")
        }
        return builder.build()
    }

    /* ---------------------------------------------------------------- *
     * Host callbacks
     * ---------------------------------------------------------------- */

    private val navigationCallback = object : NavigationManagerCallback {
        /**
         * The host is taking navigation away — another app started navigating,
         * or the driver told the car to stop.
         *
         * This must actually stop the drive, not just clear the screen. An app
         * that keeps recording after being told to stop is the specific
         * behaviour `NavigationManagerCallback` exists to prevent.
         */
        override fun onStopNavigation() {
            TripRecorderService.stop(carContext)
            CarCommandBus.emit(CarCommandBus.Command.END)
            holdingFocus = false
            invalidate()
        }

        override fun onAutoDriveEnabled() {
            // The DHU's `auto-drive` command, used to exercise a route without
            // a car. Nothing to do: this app's positions come from the platform
            // location provider, which the DHU's mock location already feeds.
            Log.i(TAG, "Auto-drive enabled by the host")
        }
    }

    /* ---------------------------------------------------------------- *
     * Formatting
     * ---------------------------------------------------------------- */

    private fun meters(m: Double): Distance =
        if (m >= 1000) {
            Distance.create(m / 1000.0, Distance.UNIT_KILOMETERS)
        } else {
            Distance.create(m, Distance.UNIT_METERS)
        }

    private fun formatKm(m: Double): String = String.format("%.1f km", m / 1000.0)

    private fun formatDuration(ms: Long): String {
        val totalSeconds = ms / 1000
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        return if (hours > 0) {
            String.format("%d:%02d", hours, minutes)
        } else {
            String.format("%d min", minutes)
        }
    }

    /**
     * Mapbox's maneuver vocabulary onto the car library's.
     *
     * The two do not line up, and the mismatch is the interesting part: Mapbox
     * describes a turn with a `type` plus a `modifier` ("turn" + "slight left"),
     * while the car library has one flat enum. Anything unrecognised becomes a
     * straight arrow rather than no arrow — a maneuver card with a blank icon
     * reads as a broken app, and "keep going" is the safest thing to be wrong
     * about.
     */
    private fun carManeuver(m: ManeuverInfo): Maneuver {
        val type = when (m.type) {
            "turn", "end of road", "fork", "new name", "continue" -> when (m.modifier) {
                "left" -> Maneuver.TYPE_TURN_NORMAL_LEFT
                "right" -> Maneuver.TYPE_TURN_NORMAL_RIGHT
                "slight left" -> Maneuver.TYPE_TURN_SLIGHT_LEFT
                "slight right" -> Maneuver.TYPE_TURN_SLIGHT_RIGHT
                "sharp left" -> Maneuver.TYPE_TURN_SHARP_LEFT
                "sharp right" -> Maneuver.TYPE_TURN_SHARP_RIGHT
                "uturn" -> Maneuver.TYPE_U_TURN_LEFT
                else -> Maneuver.TYPE_STRAIGHT
            }
            "merge" -> when (m.modifier) {
                "left" -> Maneuver.TYPE_MERGE_LEFT
                "right" -> Maneuver.TYPE_MERGE_RIGHT
                else -> Maneuver.TYPE_MERGE_SIDE_UNSPECIFIED
            }
            "on ramp" -> when (m.modifier) {
                "left" -> Maneuver.TYPE_ON_RAMP_NORMAL_LEFT
                "right" -> Maneuver.TYPE_ON_RAMP_NORMAL_RIGHT
                else -> Maneuver.TYPE_STRAIGHT
            }
            "off ramp" -> when (m.modifier) {
                "left" -> Maneuver.TYPE_OFF_RAMP_NORMAL_LEFT
                "right" -> Maneuver.TYPE_OFF_RAMP_NORMAL_RIGHT
                else -> Maneuver.TYPE_STRAIGHT
            }
            "roundabout", "rotary" -> Maneuver.TYPE_ROUNDABOUT_ENTER_AND_EXIT_CW
            "arrive" -> Maneuver.TYPE_DESTINATION
            "depart" -> Maneuver.TYPE_DEPART
            else -> Maneuver.TYPE_STRAIGHT
        }
        return Maneuver.Builder(type).build()
    }
}
