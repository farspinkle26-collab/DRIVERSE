package app.rork.driverse.carapp

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The arithmetic behind a recorded drive, with no Android in it.
 *
 * Kept free of `android.*` types on purpose: everything here is a pure function
 * of numbers, so it is the only part of the Kotlin side that can be unit-tested
 * on the JVM without an emulator. That matters more than usual here — see
 * ANDROID_AUTO_REFERENCE.md §7 for what this repository can and cannot verify
 * without a head unit.
 *
 * The distance rule mirrors `app/(tabs)/map.tsx` deliberately. A drive recorded
 * by the car and a drive recorded by the phone must produce the same kilometre
 * count, or the same road produces two different trips depending on which
 * screen the driver happened to be looking at.
 */
object TripGeo {

    /** Mean Earth radius, metres. */
    private const val EARTH_RADIUS_M = 6_371_000.0

    /**
     * Fixes closer together than this are treated as GPS jitter and dropped.
     *
     * A stationary phone still produces a drifting fix every second. Without a
     * floor, a car parked for twenty minutes accumulates several hundred metres
     * of "drive" — which then becomes distance on the car display, distance in
     * the `trips` row, and XP. The phone recorder uses 0.1 m for the same
     * reason; this is higher because the service also runs with the screen off,
     * where drift is unattended for far longer.
     */
    const val MIN_STEP_METERS = 1.5

    /**
     * Fixes further apart than this are treated as a teleport and dropped.
     *
     * A GPS reacquiring after a tunnel reports its first fix at the new
     * position with no path between, and a naive accumulator books the whole
     * chord as distance travelled. So does a phone that lost signal in a car
     * park and found it again three suburbs away. 3 km between consecutive
     * accepted fixes is far beyond anything a 1 Hz sampler sees in traffic.
     */
    const val MAX_STEP_METERS = 3_000.0

    /**
     * Great-circle distance in metres.
     *
     * Haversine rather than a projected approximation: the app is used across
     * Indonesia and the error of a flat-earth shortcut grows with latitude,
     * which would make the same drive measure differently in Jakarta and in
     * Medan.
     */
    fun haversineMeters(
        lat1: Double,
        lon1: Double,
        lat2: Double,
        lon2: Double,
    ): Double {
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
            sin(dLon / 2) * sin(dLon / 2)
        return EARTH_RADIUS_M * 2 * atan2(sqrt(a), sqrt(1 - a))
    }

    /**
     * How much of a step counts towards the drive.
     *
     * Returns 0 for jitter and for teleports — the two cases above — so the
     * caller can add the result unconditionally rather than remembering to
     * branch. A caller that wants to know *why* a step was rejected should ask
     * [stepRejection] instead; nothing in the recorder needs to.
     */
    fun acceptedStepMeters(
        lat1: Double,
        lon1: Double,
        lat2: Double,
        lon2: Double,
    ): Double {
        val d = haversineMeters(lat1, lon1, lat2, lon2)
        if (d < MIN_STEP_METERS) return 0.0
        if (d > MAX_STEP_METERS) return 0.0
        return d
    }

    /** Why a step was not counted, for logging and tests. */
    enum class StepRejection { ACCEPTED, JITTER, TELEPORT }

    fun stepRejection(
        lat1: Double,
        lon1: Double,
        lat2: Double,
        lon2: Double,
    ): StepRejection {
        val d = haversineMeters(lat1, lon1, lat2, lon2)
        return when {
            d < MIN_STEP_METERS -> StepRejection.JITTER
            d > MAX_STEP_METERS -> StepRejection.TELEPORT
            else -> StepRejection.ACCEPTED
        }
    }

    /**
     * Elapsed moving time, given the pause bookkeeping.
     *
     * Pause has to subtract rather than stop a timer, because the service can
     * be killed and restarted mid-drive and a restarted timer would silently
     * reset. Everything is derived from absolute timestamps for that reason.
     *
     * @param startedAt when the drive began
     * @param now the moment being asked about
     * @param pausedAccumMs total paused milliseconds already banked
     * @param pausedSince when the current pause began, or null if not paused
     */
    fun movingElapsedMs(
        startedAt: Long,
        now: Long,
        pausedAccumMs: Long,
        pausedSince: Long?,
    ): Long {
        if (now <= startedAt) return 0L
        val currentPause = if (pausedSince != null && now > pausedSince) now - pausedSince else 0L
        val elapsed = now - startedAt - pausedAccumMs - currentPause
        // A clock that moved backwards mid-drive (NTP, the driver crossing a
        // timezone) must not produce a negative duration on the car display.
        return if (elapsed < 0) 0L else elapsed
    }

    /**
     * Which step of a route the car is on, by proximity to each step's start.
     *
     * The route and its turn-by-turn steps are computed once on the JS side and
     * pushed down, so the service never re-fetches directions — two screens in
     * one car showing two subtly different routes is worse than either being
     * slightly stale. What the service does need to do is advance through the
     * steps as the driver actually moves, which is this.
     *
     * Deliberately monotonic: it never returns an index lower than [fromIndex].
     * Without that, a road that doubles back past an earlier maneuver point
     * makes the car display jump backwards to a turn already taken.
     */
    fun currentStepIndex(
        stepLats: DoubleArray,
        stepLons: DoubleArray,
        lat: Double,
        lon: Double,
        fromIndex: Int,
    ): Int {
        if (stepLats.isEmpty()) return 0
        val start = fromIndex.coerceIn(0, stepLats.size - 1)
        var best = start
        var bestD = Double.MAX_VALUE
        for (i in start until stepLats.size) {
            val d = haversineMeters(lat, lon, stepLats[i], stepLons[i])
            if (d < bestD) {
                bestD = d
                best = i
            }
        }
        return best
    }

    /**
     * Whether a heading change is worth redrawing the car map for.
     *
     * The car surface is redrawn on every accepted fix, and at 1 Hz a camera
     * that chases raw GPS course visibly shivers when the car is stopped. A
     * degree threshold is cheaper than a filter and is enough at driving speed.
     */
    fun headingChangedEnough(previous: Float, next: Float, thresholdDeg: Float = 3f): Boolean {
        val raw = abs(next - previous) % 360f
        val delta = if (raw > 180f) 360f - raw else raw
        return delta >= thresholdDeg
    }
}
