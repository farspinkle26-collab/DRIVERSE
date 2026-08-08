package app.rork.driverse.carapp

import android.content.Context
import android.graphics.Rect
import android.util.Log
import android.view.Surface
import com.mapbox.geojson.LineString
import com.mapbox.geojson.Point
import com.mapbox.maps.CameraOptions
import com.mapbox.maps.EdgeInsets
import com.mapbox.maps.MapInitOptions
import com.mapbox.maps.MapSurface
import com.mapbox.maps.MapboxOptions
import com.mapbox.maps.Style
import com.mapbox.maps.extension.style.layers.generated.LineLayer
import com.mapbox.maps.extension.style.layers.generated.lineLayer
import com.mapbox.maps.extension.style.layers.getLayerAs
import com.mapbox.maps.extension.style.sources.generated.GeoJsonSource
import com.mapbox.maps.extension.style.sources.generated.geoJsonSource
import com.mapbox.maps.extension.style.sources.getSourceAs

/**
 * The only file in this feature that names a Mapbox type.
 *
 * Everything Mapbox-shaped is deliberately quarantined here so that
 * [CarMapRenderer] can construct it inside a `catch (t: Throwable)` — see
 * [CarMapSurface]'s header for why that placement is the entire design, and why
 * a `NoClassDefFoundError` inside a car `SurfaceCallback` is so much worse than
 * the same error one frame earlier.
 *
 * WHAT IS UNVERIFIED HERE
 *
 * `MapSurface` is the Maps SDK's renderer for an arbitrary `Surface` and is
 * exactly the right tool for a car display, but nothing in this repository has
 * ever run it: there is no head unit, no DHU and no Android SDK on the machine
 * this was written on, so this file has never been compiled, let alone drawn a
 * frame. ANDROID_AUTO_REFERENCE.md §7 lists it first among the things to verify
 * on real hardware, and §7 exists because this repository has shipped
 * "obviously correct" native code that did not work four separate times.
 *
 * Treat every API name in this file as a claim to check against the version of
 * the Maps SDK the build actually resolves, not as established fact.
 */
class MapboxCarMap(private val context: Context) : CarMapSurface {

    companion object {
        private const val TAG = "DriverseCarMap"
        private const val TRACE_SOURCE = "driverse-trace"
        private const val TRACE_LAYER = "driverse-trace-line"

        /** Matches the phone map's styles so the two look like one product. */
        private const val STYLE_DAY = Style.MAPBOX_STREETS
        private const val STYLE_NIGHT = Style.DARK

        /**
         * The most points drawn on the car map.
         *
         * A two-hour drive is some seven thousand fixes and the trace is
         * redrawn once a second on a head unit's GPU. The phone thins its
         * polyline for the same reason (`simplifyPath`); this thins by a
         * constant index step, which is cruder but is only ever a visual trace
         * — the stored route still comes from the full path.
         */
        private const val MAX_TRACE_POINTS = 1_000
    }

    private var mapSurface: MapSurface? = null
    private var styleLoaded = false
    private var night = false

    override fun attach(surface: Surface, width: Int, height: Int) {
        applyAccessToken()

        val options = MapInitOptions(
            context = context,
            styleUri = if (night) STYLE_NIGHT else STYLE_DAY,
        )
        val created = MapSurface(context, surface, options)
        // The order matters and is not interchangeable: created, then sized,
        // then started. Starting before the surface has dimensions renders a
        // zero-sized map that never recovers.
        created.surfaceCreated()
        created.surfaceChanged(width, height)
        created.onStart()
        mapSurface = created

        created.mapboxMap.loadStyle(if (night) STYLE_NIGHT else STYLE_DAY) { style ->
            styleLoaded = true
            try {
                if (style.getSourceAs<GeoJsonSource>(TRACE_SOURCE) == null) {
                    style.addSource(geoJsonSource(TRACE_SOURCE) {})
                }
                if (style.styleLayerExists(TRACE_LAYER).not()) {
                    style.addLayer(
                        lineLayer(TRACE_LAYER, TRACE_SOURCE) {
                            lineWidth(6.0)
                            lineOpacity(0.9)
                            lineCap(com.mapbox.maps.extension.style.layers.properties.generated.LineCap.ROUND)
                            lineJoin(com.mapbox.maps.extension.style.layers.properties.generated.LineJoin.ROUND)
                        },
                    )
                }
            } catch (t: Throwable) {
                // A style that loaded but would not take our layer still gives
                // the driver a map. Losing the trace is a real regression but
                // not one worth a blank screen over.
                Log.w(TAG, "Could not add the trace layer", t)
            }
        }
    }

    /**
     * Hands Mapbox its token.
     *
     * The SDK reads a `mapbox_access_token` string resource on its own, and
     * `plugins/withAndroidAuto.js` writes one from `EXPO_PUBLIC_MAPBOX_TOKEN`
     * so the car app does not depend on `@rnmapbox/maps`' JS-side
     * `setAccessToken` having run — which it will not have, when the car app
     * was launched with the phone app closed. Setting it explicitly as well is
     * belt and braces for the case where the resource lookup changes shape
     * between SDK versions.
     */
    private fun applyAccessToken() {
        try {
            val id = context.resources.getIdentifier(
                "mapbox_access_token",
                "string",
                context.packageName,
            )
            if (id != 0) {
                val token = context.getString(id)
                if (token.isNotBlank()) MapboxOptions.accessToken = token
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Could not read the Mapbox token resource", t)
        }
    }

    override fun setCamera(
        latitude: Double,
        longitude: Double,
        zoom: Double,
        bearing: Double,
        pitch: Double,
        padding: Rect?,
    ) {
        val map = mapSurface ?: return
        val builder = CameraOptions.Builder()
            .center(Point.fromLngLat(longitude, latitude))
            .zoom(zoom)
            .bearing(bearing)
            .pitch(pitch)

        if (padding != null) {
            // The car reserves the top of the surface for the maneuver card and
            // a side for the action strip. Padding pushes the camera's focal
            // point into what the driver can actually see, so the car is not
            // centred underneath the host's own chrome.
            builder.padding(
                EdgeInsets(
                    padding.top.toDouble(),
                    padding.left.toDouble(),
                    padding.bottom.toDouble(),
                    padding.right.toDouble(),
                ),
            )
        }
        map.mapboxMap.setCamera(builder.build())
    }

    override fun setTrace(points: List<Fix>, colour: Int) {
        val map = mapSurface ?: return
        if (!styleLoaded) return
        if (points.size < 2) return

        val step = maxOf(1, points.size / MAX_TRACE_POINTS)
        val thinned = ArrayList<Point>(minOf(points.size, MAX_TRACE_POINTS) + 1)
        var i = 0
        while (i < points.size) {
            thinned.add(Point.fromLngLat(points[i].longitude, points[i].latitude))
            i += step
        }
        // Always include the newest fix. Dropping it makes the trace lag the
        // car by up to `step` samples, which at speed is a visible gap between
        // the line and the vehicle.
        val last = points.last()
        thinned.add(Point.fromLngLat(last.longitude, last.latitude))

        val style = map.mapboxMap.style ?: return
        style.getSourceAs<GeoJsonSource>(TRACE_SOURCE)
            ?.geometry(LineString.fromLngLats(thinned))
        style.getLayerAs<LineLayer>(TRACE_LAYER)?.lineColor(colour)
    }

    override fun setNightMode(night: Boolean) {
        if (this.night == night) return
        this.night = night
        val map = mapSurface ?: return
        styleLoaded = false
        map.mapboxMap.loadStyle(if (night) STYLE_NIGHT else STYLE_DAY) { style ->
            styleLoaded = true
            try {
                if (style.getSourceAs<GeoJsonSource>(TRACE_SOURCE) == null) {
                    style.addSource(geoJsonSource(TRACE_SOURCE) {})
                }
                if (style.styleLayerExists(TRACE_LAYER).not()) {
                    style.addLayer(lineLayer(TRACE_LAYER, TRACE_SOURCE) { lineWidth(6.0) })
                }
            } catch (t: Throwable) {
                Log.w(TAG, "Could not re-add the trace layer after a style change", t)
            }
        }
    }

    override fun scaleBy(factor: Double) {
        val map = mapSurface ?: return
        val current = map.mapboxMap.cameraState
        // Mapbox zoom is logarithmic; a pinch factor is linear. log2 converts
        // between them, so a two-finger pinch that doubles the gesture scale
        // moves exactly one zoom level.
        val delta = kotlin.math.ln(factor.coerceAtLeast(0.01)) / kotlin.math.ln(2.0)
        map.mapboxMap.setCamera(
            CameraOptions.Builder()
                .zoom((current.zoom + delta).coerceIn(2.0, 20.0))
                .build(),
        )
    }

    override fun scrollBy(dx: Double, dy: Double) {
        val map = mapSurface ?: return
        val current = map.mapboxMap.cameraState
        val screen = map.mapboxMap.pixelForCoordinate(current.center)
        val moved = com.mapbox.maps.ScreenCoordinate(screen.x + dx, screen.y + dy)
        map.mapboxMap.setCamera(
            CameraOptions.Builder()
                .center(map.mapboxMap.coordinateForPixel(moved))
                .build(),
        )
    }

    override fun destroy() {
        val map = mapSurface ?: return
        mapSurface = null
        styleLoaded = false
        try {
            map.onStop()
            map.surfaceDestroyed()
            map.onDestroy()
        } catch (t: Throwable) {
            Log.w(TAG, "Map teardown failed", t)
        }
    }
}
