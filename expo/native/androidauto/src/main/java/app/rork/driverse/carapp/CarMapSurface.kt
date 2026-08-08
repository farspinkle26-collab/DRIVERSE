package app.rork.driverse.carapp

import android.graphics.Rect
import android.view.Surface

/**
 * What the car's map surface must be able to do, with no Mapbox types in it.
 *
 * THIS INTERFACE IS THE WHOLE POINT, so it is worth saying why it exists rather
 * than [CarMapRenderer] simply calling Mapbox directly.
 *
 * The Mapbox Maps SDK is in this build as a dependency of `@rnmapbox/maps`.
 * Nothing in this repository chose its version, and a `@rnmapbox/maps` bump —
 * routine, and made for reasons that have nothing to do with the car — can move
 * or remove the classes the implementation names. When that happens the JVM
 * does not report a compile error, because the code compiled against whatever
 * was there at build time. It throws `NoClassDefFoundError` at the moment the
 * class is first loaded.
 *
 * If the implementation's types appeared in [CarMapRenderer]'s fields or
 * signatures, that moment would be while the car app was attaching its surface
 * — inside a `SurfaceCallback`, where an uncaught throwable takes down the
 * whole car app and the host responds by removing Driverse from the car
 * display. Behind this interface, the same failure is one `catch (t: Throwable)`
 * around one constructor call, and the result is a dark map under a working
 * template.
 *
 * That is LAUNCH_SAFETY_REFERENCE.md's lesson in a different runtime: the
 * dangerous thing is not the missing dependency, it is where the failure lands.
 * §10 was a static import putting a native lookup at module scope; this is a
 * typed field putting a class load inside a callback. Same shape, and the fix
 * is the same shape too — make the risky load happen somewhere you can catch it.
 */
interface CarMapSurface {

    /** Called once the car has given us a surface with real dimensions. */
    fun attach(surface: Surface, width: Int, height: Int)

    /** Point the camera at the car. `padding` is the host's visible area. */
    fun setCamera(
        latitude: Double,
        longitude: Double,
        zoom: Double,
        bearing: Double,
        pitch: Double,
        padding: Rect?,
    )

    /** Draw the drive recorded so far. */
    fun setTrace(points: List<Fix>, colour: Int)

    /** Swap between the day and night styles when the car says so. */
    fun setNightMode(night: Boolean)

    /** Pinch-zoom from the car's touchscreen, where it has one. */
    fun scaleBy(factor: Double)

    /** Drag-pan from the car's touchscreen or rotary controller. */
    fun scrollBy(dx: Double, dy: Double)

    /** Release everything. Called when the car takes its surface back. */
    fun destroy()
}
