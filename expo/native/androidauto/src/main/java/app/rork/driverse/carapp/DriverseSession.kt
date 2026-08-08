package app.rork.driverse.carapp

import android.content.Intent
import android.content.res.Configuration
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.Session

/**
 * One connection to a car display.
 *
 * Created when the head unit brings Driverse to the car's foreground and
 * destroyed when it goes away — several times per drive is normal, because the
 * driver switching to the car's radio app tears this down and switching back
 * builds it again. Nothing about the drive in progress lives here; it all lives
 * in [TripStore], which outlives every session.
 *
 * VOICE — WHAT IS AND IS NOT HANDLED HERE
 *
 * [onCreateScreen] and [onNewIntent] receive `CarContext.ACTION_NAVIGATE`,
 * which is what "Navigate to <place> with Driverse" turns into after the
 * Assistant has resolved the place. That is the whole of the voice support in
 * this version and it is the piece that matters: it is the intent Google's own
 * navigation-app documentation requires a Navigation-category app to handle,
 * and refusing it is a review finding rather than a missing nicety.
 *
 * What is NOT here: free-form commands like "start a trip" or "show my route".
 * Those need App Actions — a `shortcuts.xml` declaring built-in intents, and
 * capability definitions Google has to crawl — which is a separate piece of
 * work with its own review cycle. §5 of ANDROID_AUTO_REFERENCE.md records it as
 * the follow-up rather than pretending it is done.
 */
class DriverseSession : Session() {

    private var screen: DriveScreen? = null

    override fun onCreateScreen(intent: Intent): Screen {
        val created = DriveScreen(carContext)
        screen = created
        handleNavigateIntent(intent)
        return created
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleNavigateIntent(intent)
    }

    override fun onCarConfigurationChanged(newConfiguration: Configuration) {
        super.onCarConfigurationChanged(newConfiguration)
        // Day/night is the one that matters: the car tells us when its
        // headlights go on, and a daylight map style at night is genuinely
        // dangerous rather than merely ugly.
        screen?.onCarConfigurationChanged()
    }

    /**
     * Turns a `geo:` intent into a destination the car screen can route to.
     *
     * Two shapes arrive in practice and both must be handled, because the
     * Assistant picks between them depending on whether it resolved coordinates
     * or only a name:
     *
     *   geo:-6.2088,106.8456
     *   geo:0,0?q=Puncak+Pass
     *
     * A `q=` with no coordinates needs geocoding, which needs the network and a
     * Mapbox call. That is deliberately NOT done here — it is handed to the
     * phone side through [CarCommandBus]'s sibling path, because the app
     * already has one geocoder (`lib/mapboxApi.ts`) and a second one in Kotlin
     * would drift from it. When the phone is not running, the car screen says
     * so rather than silently doing nothing.
     */
    private fun handleNavigateIntent(intent: Intent) {
        if (intent.action != CarContext.ACTION_NAVIGATE) return
        val data = intent.data ?: return
        if (data.scheme != "geo") return
        screen?.onNavigateRequested(data.schemeSpecificPart)
    }
}
