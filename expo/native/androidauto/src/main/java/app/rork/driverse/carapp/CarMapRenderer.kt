package app.rork.driverse.carapp

import android.graphics.Color
import android.graphics.Rect
import android.util.Log
import androidx.car.app.AppManager
import androidx.car.app.CarContext
import androidx.car.app.SurfaceCallback
import androidx.car.app.SurfaceContainer

/**
 * Owns the car's drawing surface and keeps the map pointed at the car.
 *
 * A Navigation-category app is not given a map by the host — it is handed a raw
 * `Surface` and renders onto it itself. The phone's map is `@rnmapbox/maps`, a
 * React Native component that can only draw into a React view tree, so none of
 * it transfers. What does transfer is the Maps SDK underneath it, driven from
 * Kotlin by [MapboxCarMap].
 *
 * NOTHING IN THIS FILE NAMES A MAPBOX TYPE, and that is not an accident — see
 * [CarMapSurface]. [MapboxCarMap] is constructed inside a `catch (t: Throwable)`
 * so that a Maps SDK that moved under us produces a dark map with a working
 * template over it, rather than an uncaught throwable inside a `SurfaceCallback`
 * that takes down the car app and gets Driverse dropped from the car display.
 */
class CarMapRenderer(
    private val carContext: CarContext,
) : SurfaceCallback {

    companion object {
        private const val TAG = "DriverseCarMap"

        /** Zoom while driving. Tighter than the phone's overview. */
        private const val DRIVING_ZOOM = 16.5

        /** Tilt, matching the phone's chase camera so the two look related. */
        private const val DRIVING_PITCH = 45.0

        /** `colors.racingRed` from `constants/theme.ts`, the route accent. */
        private const val TRACE_COLOUR = "#E5303A"
    }

    private var map: CarMapSurface? = null
    private var visibleArea: Rect? = null
    private var lastRenderedFixAt: Long? = null

    /* ---------------------------------------------------------------- *
     * SurfaceCallback
     * ---------------------------------------------------------------- */

    override fun onSurfaceAvailable(surfaceContainer: SurfaceContainer) {
        val surface = surfaceContainer.surface ?: return
        // A surface with no dimensions yet is normal on some head units; the
        // host follows up with onVisibleAreaChanged. Attaching a zero-sized map
        // gives a renderer that never recovers, so wait for the real one.
        if (surfaceContainer.width <= 0 || surfaceContainer.height <= 0) return

        try {
            val created: CarMapSurface = MapboxCarMap(carContext)
            created.setNightMode(carContext.isDarkMode)
            created.attach(surface, surfaceContainer.width, surfaceContainer.height)
            map = created
            render(force = true)
        } catch (t: Throwable) {
            // Throwable, not Exception, and this is the load-bearing catch of
            // the whole feature: a Maps SDK whose classes moved fails as
            // NoClassDefFoundError, which is an Error. Catching only Exception
            // here would let it escape into the host.
            Log.w(TAG, "Car map unavailable; the template will draw on a blank surface", t)
            map = null
        }
    }

    override fun onSurfaceDestroyed(surfaceContainer: SurfaceContainer) {
        try {
            map?.destroy()
        } catch (t: Throwable) {
            Log.w(TAG, "Car map teardown failed", t)
        } finally {
            map = null
            lastRenderedFixAt = null
        }
    }

    override fun onVisibleAreaChanged(visibleArea: Rect) {
        // The host reserves parts of the surface for its own chrome — the
        // maneuver card at the top, the action strip down one side. Anything
        // drawn outside this rectangle can be permanently covered, so the
        // camera's focal point moves rather than the map being centred on the
        // raw surface and the car ending up under a button.
        this.visibleArea = visibleArea
        render(force = true)
    }

    override fun onStableAreaChanged(stableArea: Rect) {
        // Ignored deliberately. The stable area is the smaller rectangle that
        // survives every template state; re-centring on it would make the map
        // lurch each time the maneuver card appears and disappears.
    }

    override fun onScale(focusX: Float, focusY: Float, scaleFactor: Float) {
        try {
            map?.scaleBy(scaleFactor.toDouble())
        } catch (t: Throwable) {
            Log.w(TAG, "Scale gesture failed", t)
        }
    }

    override fun onScroll(distanceX: Float, distanceY: Float) {
        try {
            map?.scrollBy(distanceX.toDouble(), distanceY.toDouble())
        } catch (t: Throwable) {
            Log.w(TAG, "Scroll gesture failed", t)
        }
    }

    /* ---------------------------------------------------------------- *
     * Rendering
     * ---------------------------------------------------------------- */

    /**
     * Follows the car. Called on every published snapshot, so 1 Hz.
     *
     * The `lastRenderedFixAt` guard means a stationary car — every traffic
     * light, and the whole time the app sits idle — does not re-issue a camera
     * move each second. On a head unit that reads as a map that will not settle.
     */
    fun render(force: Boolean = false) {
        val target = map ?: return
        val fix = TripStore.current().lastFix ?: return
        if (!force && lastRenderedFixAt == fix.timestamp) return
        lastRenderedFixAt = fix.timestamp

        try {
            target.setCamera(
                latitude = fix.latitude,
                longitude = fix.longitude,
                zoom = DRIVING_ZOOM,
                bearing = fix.bearing.toDouble(),
                pitch = DRIVING_PITCH,
                padding = visibleArea,
            )
            target.setTrace(TripStore.pathSnapshot(), Color.parseColor(TRACE_COLOUR))
        } catch (t: Throwable) {
            Log.w(TAG, "Car map render failed", t)
        }
    }

    /**
     * The map action strip's zoom buttons.
     *
     * A discrete step rather than a gesture: the strip's buttons are the only
     * zoom a car without a touchscreen has, and every head unit has those
     * buttons. Half and double a zoom level, matching what one pinch does.
     */
    fun zoomIn() {
        try {
            map?.scaleBy(2.0)
        } catch (t: Throwable) {
            Log.w(TAG, "Zoom in failed", t)
        }
    }

    fun zoomOut() {
        try {
            map?.scaleBy(0.5)
        } catch (t: Throwable) {
            Log.w(TAG, "Zoom out failed", t)
        }
    }

    /**
     * Re-styles when the car switches between day and night.
     *
     * This follows the CAR's signal — its headlights and light sensor, via
     * `CarContext.isDarkMode` — not the phone's theme and not the clock. A
     * phone in dark mode must not darken the car's map at noon, and a phone in
     * light mode must not put a white screen in front of a driver at midnight.
     */
    fun onConfigurationChanged() {
        try {
            map?.setNightMode(carContext.isDarkMode)
            render(force = true)
        } catch (t: Throwable) {
            Log.w(TAG, "Car map style change failed", t)
        }
    }

    /** Installs this renderer as the car's surface callback. */
    fun attach() {
        try {
            carContext.getCarService(AppManager::class.java).setSurfaceCallback(this)
        } catch (t: Throwable) {
            // Without ACCESS_SURFACE in the manifest this throws, and the
            // symptom is a car app that works except that the map is missing —
            // worth a log line naming the likely cause.
            Log.w(TAG, "Could not take the car surface; is ACCESS_SURFACE declared?", t)
        }
    }
}
