package app.rork.driverse.carapp

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * The drive recorder. One per process, and the only thing that touches GPS.
 *
 * WHY THIS EXISTS RATHER THAN THE `watchPositionAsync` IN `map.tsx`
 *
 * The phone recorder is a subscription inside a React effect on the map screen.
 * It stops being true the moment the screen unmounts, the app is backgrounded
 * for long enough, or the process has no React tree at all — and Android Auto
 * produces the last case routinely: the host can start `DriverseCarAppService`
 * with the phone app never having been opened this boot. A car screen whose
 * data source only exists while someone is looking at their phone is not a car
 * screen.
 *
 * So the recording moved here, and both the phone UI and the car display became
 * subscribers to [TripStore]. This service is what keeps a drive alive across
 * the three transitions §6 of ANDROID_AUTO_REFERENCE.md requires us to test:
 * screen off, phone unplugged from the head unit, and network lost.
 *
 * WHY `LocationManager` AND NOT FUSED LOCATION
 *
 * `FusedLocationProviderClient` is the better API — better battery, better
 * indoor behaviour — but it lives in `play-services-location`, which this
 * project does not declare. It arrives transitively through `expo-location`
 * today, and building on another module's transitive dependency is how a build
 * breaks on a version bump that has nothing to do with this feature. Platform
 * `LocationManager` has no such dependency and is adequate for a use case that
 * is, by construction, outdoors and moving. Recorded as a follow-up in §8.
 *
 * WHAT THIS SERVICE DOES NOT DO
 *
 * It does not survive process death. Android killing the app mid-drive loses
 * the recording — there is no on-disk journal. §6 is explicit that this is a
 * known gap rather than something the foreground type makes impossible.
 */
class TripRecorderService : Service(), LocationListener {

    companion object {
        const val ACTION_START = "app.rork.driverse.carapp.START"
        const val ACTION_PAUSE = "app.rork.driverse.carapp.PAUSE"
        const val ACTION_RESUME = "app.rork.driverse.carapp.RESUME"
        const val ACTION_STOP = "app.rork.driverse.carapp.STOP"

        private const val CHANNEL_ID = "driverse_trip_recorder"
        private const val NOTIFICATION_ID = 4711

        /** GPS sample interval. Matches the phone recorder's ~1 Hz. */
        private const val MIN_TIME_MS = 1_000L

        /** Provider-side distance filter. [TripGeo] does the real filtering. */
        private const val MIN_DISTANCE_M = 0f

        /**
         * How often the snapshot is published.
         *
         * Not on every fix: the elapsed clock has to keep advancing on the car
         * display while the vehicle is stopped at a light and no fix moves, and
         * the staleness banner has to appear when fixes stop arriving at all —
         * neither of which a fix-driven update can do, because both are about
         * the absence of fixes.
         */
        private const val PUBLISH_INTERVAL_MS = 1_000L

        fun start(context: Context) = send(context, ACTION_START)
        fun pause(context: Context) = send(context, ACTION_PAUSE)
        fun resume(context: Context) = send(context, ACTION_RESUME)
        fun stop(context: Context) = send(context, ACTION_STOP)

        private fun send(context: Context, action: String) {
            val intent = Intent(context, TripRecorderService::class.java).setAction(action)
            // A foreground service must be started with startForegroundService
            // from API 26, and must then call startForeground within ~5s or the
            // system throws ForegroundServiceDidNotStartInTimeException.
            ContextCompat.startForegroundService(context, intent)
        }

        /** Whether the caller may ask for location at all. */
        fun hasLocationPermission(context: Context): Boolean =
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED
    }

    private val handler = Handler(Looper.getMainLooper())
    private var locationManager: LocationManager? = null
    private var listening = false

    /** Banked paused time, and when the current pause began. */
    private var pausedAccumMs = 0L
    private var pausedSince: Long? = null

    private val publishTick = object : Runnable {
        override fun run() {
            publish()
            handler.postDelayed(this, PUBLISH_INTERVAL_MS)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // startForeground FIRST, before anything that can fail or take time.
        // Reaching the 5-second deadline because permission checks or GPS
        // registration ran first is a crash, not a degraded recording.
        goForeground()

        when (intent?.action) {
            ACTION_START -> beginTrip()
            ACTION_PAUSE -> pauseTrip()
            ACTION_RESUME -> resumeTrip()
            ACTION_STOP -> endTrip()
            // A null action is the system restarting us after a kill. There is
            // no persisted drive to resume (see the header), so stop rather
            // than sit in the foreground recording nothing.
            else -> if (TripStore.current().recording == RecordingState.IDLE) stopSelf()
        }

        // START_STICKY would have Android recreate the service with a null
        // intent after a kill, which — with no journal — means a notification
        // for a drive whose data is gone. NOT_STICKY is the honest choice.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopListening()
        handler.removeCallbacks(publishTick)
        super.onDestroy()
    }

    /* ---------------------------------------------------------------- *
     * Trip lifecycle
     * ---------------------------------------------------------------- */

    private fun beginTrip() {
        val now = System.currentTimeMillis()
        pausedAccumMs = 0L
        pausedSince = null
        TripStore.reset()
        TripStore.update {
            it.copy(recording = RecordingState.RECORDING, startedAt = now)
        }
        startListening()
        handler.removeCallbacks(publishTick)
        handler.post(publishTick)
        publish()
    }

    private fun pauseTrip() {
        if (TripStore.current().recording != RecordingState.RECORDING) return
        pausedSince = System.currentTimeMillis()
        TripStore.update { it.copy(recording = RecordingState.PAUSED, speedKmh = 0.0) }
        // GPS stays registered while paused. Re-acquiring a fix costs 10–30
        // seconds cold, and the first thing a driver does after resuming is
        // look at the screen.
        publish()
    }

    private fun resumeTrip() {
        if (TripStore.current().recording != RecordingState.PAUSED) return
        val since = pausedSince
        if (since != null) pausedAccumMs += System.currentTimeMillis() - since
        pausedSince = null
        TripStore.update { it.copy(recording = RecordingState.RECORDING) }
        publish()
    }

    private fun endTrip() {
        stopListening()
        handler.removeCallbacks(publishTick)
        // The snapshot is left intact for whoever asks next — the RN bridge
        // reads the final distance and path out of the store when it resolves
        // `stopTrip`. TripStore.reset() happens at the START of the next drive,
        // not the end of this one, so a car screen showing the finished totals
        // does not blank the instant the driver stops.
        TripStore.update { it.copy(recording = RecordingState.IDLE, speedKmh = 0.0) }
        publish()
        stopForegroundCompat()
        stopSelf()
    }

    /* ---------------------------------------------------------------- *
     * Location
     * ---------------------------------------------------------------- */

    private fun startListening() {
        if (listening) return
        if (!hasLocationPermission(this)) {
            // No permission is not a crash and not a silent no-op: the store
            // says "recording" with no fixes ever arriving, which the display
            // model turns into "Waiting for GPS" on both screens.
            return
        }
        val lm = locationManager ?: return
        try {
            if (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                lm.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    MIN_TIME_MS,
                    MIN_DISTANCE_M,
                    this,
                    Looper.getMainLooper(),
                )
            }
            // Network provider as well, not instead: it is the only thing that
            // produces a fix in a tunnel or a covered car park, and the
            // distance filters in TripGeo reject the bad ones it also produces.
            if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                lm.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    MIN_TIME_MS,
                    MIN_DISTANCE_M,
                    this,
                    Looper.getMainLooper(),
                )
            }
            listening = true
        } catch (e: SecurityException) {
            // Permission revoked between the check above and here. Same outcome
            // as never having had it.
            listening = false
        }
    }

    private fun stopListening() {
        if (!listening) return
        try {
            locationManager?.removeUpdates(this)
        } catch (e: SecurityException) {
            // Nothing to do; we are stopping anyway.
        }
        listening = false
    }

    override fun onLocationChanged(location: Location) {
        val snapshot = TripStore.current()
        if (snapshot.recording != RecordingState.RECORDING) {
            // Paused: keep the fix as proof the receiver is alive, so the
            // display does not show "Waiting for GPS" over a parked car, but
            // do not accrue distance.
            TripStore.update { it.copy(lastFixAt = System.currentTimeMillis()) }
            return
        }

        val now = System.currentTimeMillis()
        val previous = snapshot.lastFix
        val fix = Fix(
            latitude = location.latitude,
            longitude = location.longitude,
            timestamp = now,
            bearing = if (location.hasBearing()) location.bearing else previous?.bearing ?: 0f,
        )

        var added = 0.0
        if (previous != null) {
            added = TripGeo.acceptedStepMeters(
                previous.latitude,
                previous.longitude,
                fix.latitude,
                fix.longitude,
            )
            // A rejected step still updates lastFix — otherwise a single
            // teleport makes every subsequent step measure from the stale
            // position and the whole rest of the drive is wrong.
        }

        // Speed from the provider where it has one, derived otherwise. Recorded
        // for the phone's trip row and share card; never shown on the car.
        val speedKmh = if (location.hasSpeed()) {
            location.speed * 3.6
        } else if (previous != null && now > previous.timestamp) {
            val dt = (now - previous.timestamp) / 1000.0
            if (dt > 0.3) (added / 1000.0) / (dt / 3600.0) else snapshot.speedKmh
        } else {
            snapshot.speedKmh
        }

        if (added > 0.0) TripStore.appendFix(fix)

        TripStore.update { s ->
            val stepIndex = s.route?.let { route ->
                TripGeo.currentStepIndex(
                    route.stepLats,
                    route.stepLons,
                    fix.latitude,
                    fix.longitude,
                    s.stepIndex,
                )
            } ?: 0
            val toManeuver = s.route?.let { route ->
                if (route.stepLats.isEmpty()) 0.0
                else {
                    val i = (stepIndex + 1).coerceAtMost(route.stepLats.size - 1)
                    TripGeo.haversineMeters(
                        fix.latitude,
                        fix.longitude,
                        route.stepLats[i],
                        route.stepLons[i],
                    )
                }
            } ?: 0.0

            s.copy(
                distanceMeters = s.distanceMeters + added,
                lastFix = fix,
                lastFixAt = now,
                speedKmh = if (speedKmh in 0.0..320.0) speedKmh else s.speedKmh,
                topSpeedKmh = maxOf(s.topSpeedKmh, if (speedKmh in 0.0..320.0) speedKmh else 0.0),
                stepIndex = stepIndex,
                distanceToManeuverMeters = toManeuver,
            )
        }
    }

    /** Required by `LocationListener` on API < 30; harmless above it. */
    @Deprecated("Retained for API < 30 compatibility")
    override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) {
    }

    override fun onProviderEnabled(provider: String) {}

    override fun onProviderDisabled(provider: String) {
        // The driver turned location off mid-drive. Fixes simply stop; the
        // staleness rule turns that into "Waiting for GPS" on both screens
        // after 90 seconds rather than leaving a frozen distance on display.
    }

    /* ---------------------------------------------------------------- *
     * Publishing
     * ---------------------------------------------------------------- */

    /**
     * Recomputes the derived clock and pushes the snapshot out.
     *
     * Elapsed time is recomputed here rather than incremented, because
     * [TripGeo.movingElapsedMs] derives it from absolute timestamps — a
     * counter would drift and, worse, would reset if this service were ever
     * restarted mid-drive.
     */
    private fun publish() {
        val s = TripStore.current()
        val startedAt = s.startedAt ?: return
        val elapsed = TripGeo.movingElapsedMs(
            startedAt = startedAt,
            now = System.currentTimeMillis(),
            pausedAccumMs = pausedAccumMs,
            pausedSince = pausedSince,
        )
        TripStore.update { it.copy(elapsedMs = elapsed) }
    }

    /* ---------------------------------------------------------------- *
     * Foreground notification
     * ---------------------------------------------------------------- */

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Drive recording",
            // LOW: the drive notification is a status, not an alert. IMPORTANCE
            // above this makes a sound every time Android recreates it.
            NotificationManager.IMPORTANCE_LOW,
        ).apply {
            description = "Shown while Driverse is recording a drive."
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)
    }

    private fun goForeground() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14 requires the type at the call site as well as in the
            // manifest, and throws if they disagree.
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(): Notification {
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        val pending = launch?.let {
            PendingIntent.getActivity(
                this,
                0,
                it,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Recording drive")
            .setContentText("Driverse is recording your route.")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pending)
            .build()
    }

    @Suppress("DEPRECATION")
    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            stopForeground(true)
        }
    }
}
