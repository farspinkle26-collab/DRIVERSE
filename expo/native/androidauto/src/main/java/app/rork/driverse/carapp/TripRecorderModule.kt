package app.rork.driverse.carapp

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * The React Native half of the recorder — the module `lib/tripRecorder.ts` talks
 * to, registered under the name `DriverseTripRecorder`.
 *
 * THE NAME IS LOAD-BEARING. `lib/tripRecorder.ts` reads
 * `NativeModules.DriverseTripRecorder` and treats `null` as "no native recorder
 * on this build, keep using the JS one". Renaming this without renaming that
 * does not produce an error — it produces an app that quietly falls back to the
 * old recorder forever, on a build that has a perfectly good service sitting
 * unused. See LAUNCH_SAFETY_REFERENCE.md §10 for why the JS side asks that way
 * rather than with `requireNativeModule`.
 *
 * This module is a *subscriber* to [TripStore], not an owner of it. It can be
 * created and destroyed several times over one drive — every RN host reload
 * does it — and nothing about the recording depends on it existing.
 */
class TripRecorderModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "DriverseTripRecorder"
        private const val TRIP_UPDATE_EVENT = "DriverseTripUpdate"
        private const val CAR_COMMAND_EVENT = "DriverseCarCommand"
    }

    override fun getName(): String = NAME

    private val job = SupervisorJob()
    private val scope = CoroutineScope(Dispatchers.Main.immediate + job)
    private var stateJob: Job? = null
    private var commandJob: Job? = null

    /**
     * Listener count, so the flows are only collected while JS cares.
     *
     * `addListener`/`removeListeners` are required by RN's event emitter
     * contract — `NativeEventEmitter` warns loudly without them — and are used
     * here for what they are actually good for: not running a 1 Hz collector
     * and a bridge emit for a screen nobody has open.
     */
    private var listenerCount = 0

    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount += 1
        if (listenerCount == 1) startCollecting()
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount = (listenerCount - count).coerceAtLeast(0)
        if (listenerCount == 0) stopCollecting()
    }

    override fun invalidate() {
        stopCollecting()
        scope.cancel()
        super.invalidate()
    }

    private fun startCollecting() {
        if (stateJob == null) {
            stateJob = scope.launch {
                TripStore.state.collectLatest { snapshot -> emitState(snapshot) }
            }
        }
        if (commandJob == null) {
            commandJob = scope.launch {
                CarCommandBus.commands.collectLatest { command ->
                    val payload = Arguments.createMap().apply {
                        putString("action", command.name.lowercase())
                    }
                    send(CAR_COMMAND_EVENT, payload)
                    // Delivered — so a host that starts an hour from now does
                    // not replay this press against a different drive.
                    CarCommandBus.clearReplay()
                }
            }
        }
    }

    private fun stopCollecting() {
        stateJob?.cancel()
        stateJob = null
        commandJob?.cancel()
        commandJob = null
    }

    private fun send(event: String, payload: WritableMap) {
        if (!reactContext.hasActiveReactInstance()) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, payload)
    }

    private fun emitState(snapshot: TripSnapshot) {
        send(TRIP_UPDATE_EVENT, snapshotToMap(snapshot))
    }

    /* ---------------------------------------------------------------- *
     * Commands
     * ---------------------------------------------------------------- */

    @ReactMethod
    fun startTrip(promise: Promise) {
        if (!TripRecorderService.hasLocationPermission(reactContext)) {
            // The JS side turns any rejection into "keep using the JS
            // recorder", which is the right outcome: expo-location's permission
            // flow already runs on the phone, and duplicating a native prompt
            // here would ask the driver twice.
            promise.reject("E_NO_PERMISSION", "Location permission not granted")
            return
        }
        TripRecorderService.start(reactContext)
        promise.resolve(null)
    }

    @ReactMethod
    fun pauseTrip(promise: Promise) {
        TripRecorderService.pause(reactContext)
        promise.resolve(null)
    }

    @ReactMethod
    fun resumeTrip(promise: Promise) {
        TripRecorderService.resume(reactContext)
        promise.resolve(null)
    }

    /**
     * Ends the drive and hands back what was recorded.
     *
     * The path is read from the store BEFORE the service is told to stop.
     * Stopping is asynchronous — an intent, a service, a `stopSelf` — and
     * reading afterwards is a race whose losing side is a drive with no route.
     */
    @ReactMethod
    fun stopTrip(promise: Promise) {
        val snapshot = TripStore.current()
        val path = TripStore.pathSnapshot()
        TripRecorderService.stop(reactContext)

        val result = Arguments.createMap().apply {
            putDouble("distanceMeters", snapshot.distanceMeters)
            putDouble("durationMs", snapshot.elapsedMs.toDouble())
            putDouble("startedAt", (snapshot.startedAt ?: 0L).toDouble())
            putDouble("endedAt", System.currentTimeMillis().toDouble())
            putArray(
                "path",
                Arguments.createArray().apply {
                    path.forEach { fix ->
                        pushMap(
                            Arguments.createMap().apply {
                                putDouble("latitude", fix.latitude)
                                putDouble("longitude", fix.longitude)
                                putDouble("t", fix.timestamp.toDouble())
                            },
                        )
                    }
                },
            )
        }
        promise.resolve(result)
    }

    @ReactMethod
    fun getState(promise: Promise) {
        promise.resolve(snapshotToMap(TripStore.current()))
    }

    /**
     * Publishes the destination route, or clears it with `null`.
     *
     * Directions are fetched once by `lib/mapboxApi.ts` for the phone's
     * navigation card and pushed down here. Re-fetching in Kotlin would give
     * one car two subtly different routes on two screens, and would spend a
     * network call in the place least likely to have one.
     */
    @ReactMethod
    fun setRoute(route: ReadableMap?, promise: Promise) {
        if (route == null) {
            TripStore.update { it.copy(route = null, stepIndex = 0, distanceToManeuverMeters = 0.0) }
            promise.resolve(null)
            return
        }

        val steps = route.getArray("steps")
        val size = steps?.size() ?: 0
        val instructions = ArrayList<String>(size)
        val types = ArrayList<String>(size)
        val modifiers = ArrayList<String?>(size)
        val lats = DoubleArray(size)
        val lons = DoubleArray(size)
        val distances = DoubleArray(size)

        for (i in 0 until size) {
            val step = steps?.getMap(i) ?: continue
            instructions.add(if (step.hasKey("instruction")) step.getString("instruction") ?: "" else "")
            types.add(if (step.hasKey("maneuverType")) step.getString("maneuverType") ?: "straight" else "straight")
            modifiers.add(if (step.hasKey("maneuverModifier")) step.getString("maneuverModifier") else null)
            lats[i] = if (step.hasKey("latitude")) step.getDouble("latitude") else 0.0
            lons[i] = if (step.hasKey("longitude")) step.getDouble("longitude") else 0.0
            distances[i] = if (step.hasKey("distanceMeters")) step.getDouble("distanceMeters") else 0.0
        }

        val info = RouteInfo(
            destinationName = if (route.hasKey("destinationName")) route.getString("destinationName") else null,
            instructions = instructions,
            maneuverTypes = types,
            maneuverModifiers = modifiers,
            stepLats = lats,
            stepLons = lons,
            stepDistances = distances,
            totalMeters = if (route.hasKey("remainingMeters")) route.getDouble("remainingMeters") else 0.0,
            totalSeconds = if (route.hasKey("remainingSeconds")) route.getDouble("remainingSeconds") else 0.0,
        )
        TripStore.update { it.copy(route = info, stepIndex = 0) }
        promise.resolve(null)
    }

    /* ---------------------------------------------------------------- *
     * Serialisation
     * ---------------------------------------------------------------- */

    /**
     * Note that this DOES carry speed, and the car model does not.
     *
     * The phone needs it — the trip row, the share card's speed heatmap and the
     * Drive Hub all read it — and the phone is not the screen the rule in
     * `lib/carTrip.ts` is about. The separation happens at [CarScreenModel],
     * which is built from [TripSnapshot] and has nowhere to put it.
     */
    private fun snapshotToMap(snapshot: TripSnapshot): WritableMap =
        Arguments.createMap().apply {
            putString(
                "recording",
                when (snapshot.recording) {
                    RecordingState.IDLE -> "idle"
                    RecordingState.RECORDING -> "recording"
                    RecordingState.PAUSED -> "paused"
                },
            )
            putDouble("distanceMeters", snapshot.distanceMeters)
            putDouble("elapsedMs", snapshot.elapsedMs.toDouble())
            if (snapshot.lastFixAt != null) {
                putDouble("lastFixAt", snapshot.lastFixAt.toDouble())
            } else {
                putNull("lastFixAt")
            }
            if (snapshot.startedAt != null) {
                putDouble("startedAt", snapshot.startedAt.toDouble())
            } else {
                putNull("startedAt")
            }
            putDouble("speedKmh", snapshot.speedKmh)
            putDouble("topSpeedKmh", snapshot.topSpeedKmh)
            // The path is not sent on every tick — a two-hour drive is some
            // seven thousand points and this fires at 1 Hz. The phone keeps
            // drawing its own live polyline from its own fixes; the full path
            // crosses the bridge once, when the drive ends.
            putArray("fixes", Arguments.createArray())
        }
}
