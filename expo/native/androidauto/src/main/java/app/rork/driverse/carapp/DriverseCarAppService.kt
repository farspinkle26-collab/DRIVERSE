package app.rork.driverse.carapp

import android.content.Intent
import android.content.pm.ApplicationInfo
import androidx.car.app.CarAppService
import androidx.car.app.Session
import androidx.car.app.validation.HostValidator

/**
 * The entry point Android Auto and Android Automotive OS use to launch
 * Driverse on the car display.
 *
 * Declared in the manifest with the intent filter
 * `androidx.car.app.CarAppService` and the category
 * `androidx.car.app.category.NAVIGATION` — the category is what makes this a
 * Navigation-category app, and an app gets exactly one. Every template this app
 * may use follows from that choice; see ANDROID_AUTO_REFERENCE.md §2.
 *
 * The host starts this service on its own schedule. It can and does happen with
 * the phone app never having been opened, which is the whole reason the
 * recorder is a service and [TripStore] is a process-wide singleton rather than
 * React state.
 */
class DriverseCarAppService : CarAppService() {

    /**
     * Which hosts may drive this app.
     *
     * `ALLOW_ALL_HOSTS_VALIDATOR` in a debuggable build so the Desktop Head
     * Unit — which is not a signed Google host — can connect at all. In release
     * builds, only hosts in the library's own allowlist: without this, any app
     * on the phone could bind to this service and drive the car UI.
     *
     * Getting this backwards is a specific, quiet failure: `ALLOW_ALL` shipped
     * to production passes every test you can run locally and is a security
     * finding in review, while the allowlist in a debug build means the DHU
     * silently refuses to connect and looks like a manifest problem.
     */
    override fun createHostValidator(): HostValidator =
        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            HostValidator.ALLOW_ALL_HOSTS_VALIDATOR
        } else {
            HostValidator.Builder(applicationContext)
                .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
                .build()
        }

    override fun onCreateSession(): Session = DriverseSession()

    /**
     * The host may deliver a new intent to a session that already exists —
     * "Navigate to X with Driverse" spoken while the app is already open on
     * the car screen. Forwarded to the session, which owns the response.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
    }
}
