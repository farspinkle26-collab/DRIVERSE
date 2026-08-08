package app.rork.driverse.carapp

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** What the recorder is doing. Mirrors `CarRecordingState` in `lib/carTrip.ts`. */
enum class RecordingState { IDLE, RECORDING, PAUSED }

/** One accepted GPS fix. */
data class Fix(
    val latitude: Double,
    val longitude: Double,
    val timestamp: Long,
    val bearing: Float,
)

/**
 * The active destination route, pushed down from JS.
 *
 * Mirrors `CarRoute` in `lib/carTrip.ts` field for field. The steps arrive as
 * parallel arrays rather than a list of objects because that is the cheap shape
 * to cross the React Native bridge and the cheap shape for [TripGeo]'s
 * proximity scan; nothing else reads them.
 */
data class RouteInfo(
    val destinationName: String?,
    val instructions: List<String>,
    val maneuverTypes: List<String>,
    val maneuverModifiers: List<String?>,
    val stepLats: DoubleArray,
    val stepLons: DoubleArray,
    val stepDistances: DoubleArray,
    val totalMeters: Double,
    val totalSeconds: Double,
) {
    // Kotlin generates identity equals for DoubleArray members, which makes the
    // data class's own equals meaningless. Nothing here depends on structural
    // equality, so it is left explicit rather than silently wrong.
    override fun equals(other: Any?): Boolean = this === other
    override fun hashCode(): Int = System.identityHashCode(this)
}

/**
 * Everything known about the drive in progress.
 *
 * `speedKmh` and `topSpeedKmh` are recorded because the phone's trip row and
 * share card need them. They are NOT part of what the car screen is given —
 * `CarScreenModel` is built without them, and `lib/carTrip.ts` explains at
 * length why putting a top-speed readout in a driver's eyeline is the one
 * thing this feature must not do.
 */
data class TripSnapshot(
    val recording: RecordingState = RecordingState.IDLE,
    val distanceMeters: Double = 0.0,
    val elapsedMs: Long = 0L,
    val startedAt: Long? = null,
    val lastFixAt: Long? = null,
    val lastFix: Fix? = null,
    val speedKmh: Double = 0.0,
    val topSpeedKmh: Double = 0.0,
    val route: RouteInfo? = null,
    val stepIndex: Int = 0,
    val distanceToManeuverMeters: Double = 0.0,
)

/**
 * The single source of truth for a drive in progress, for this whole process.
 *
 * WHY A PROCESS-WIDE SINGLETON RATHER THAN STATE INSIDE THE SERVICE
 *
 * Three things need this state and none of them can own it:
 *
 *  - `TripRecorderService`, which produces it, but which Android may kill and
 *    restart mid-drive;
 *  - `TripRecorderModule`, the React Native bridge, which exists only while the
 *    RN host is alive — i.e. not when the car app was launched on its own;
 *  - `DriveScreen`, the car display, which exists only while the head unit is
 *    connected and the app is in the car's foreground.
 *
 * Any of the three can come and go while a drive continues. A singleton
 * outlives all of them, which is the property that makes "the driver started a
 * drive on the phone, put the phone in their pocket, and plugged into the car
 * ten minutes later" work at all.
 *
 * It does NOT outlive the process. If Android kills the app entirely mid-drive
 * the recording is gone — see ANDROID_AUTO_REFERENCE.md §6, which is honest
 * about this being a known gap rather than pretending the foreground service
 * makes it impossible.
 */
object TripStore {

    private val _state = MutableStateFlow(TripSnapshot())

    /** Observed by both the car screen and the React Native bridge. */
    val state: StateFlow<TripSnapshot> = _state.asStateFlow()

    /**
     * Fixes accumulated this drive.
     *
     * Held separately from the snapshot so that emitting a state update does
     * not copy the whole path on every GPS tick — a two-hour drive is some
     * seven thousand points, and the snapshot is emitted at 1 Hz to two
     * subscribers.
     */
    private val path = mutableListOf<Fix>()

    @Synchronized
    fun update(transform: (TripSnapshot) -> TripSnapshot) {
        _state.value = transform(_state.value)
    }

    @Synchronized
    fun appendFix(fix: Fix) {
        path.add(fix)
    }

    /** A copy of the recorded path. Taken once, when the drive ends. */
    @Synchronized
    fun pathSnapshot(): List<Fix> = path.toList()

    @Synchronized
    fun reset() {
        path.clear()
        _state.value = TripSnapshot()
    }

    fun current(): TripSnapshot = _state.value
}
