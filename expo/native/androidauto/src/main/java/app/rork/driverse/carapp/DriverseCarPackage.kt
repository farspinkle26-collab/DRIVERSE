package app.rork.driverse.carapp

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

/**
 * Registers [TripRecorderModule] with the React Native host.
 *
 * Added to `MainApplication.kt`'s package list by `plugins/withAndroidAuto.js`
 * during prebuild — see that file for why nothing here is edited into
 * `android/` by hand.
 *
 * This is a legacy-architecture `ReactPackage` rather than a TurboModule spec,
 * even though this app has `newArchEnabled: true`. The bridge still supports it
 * under the New Architecture through the interop layer, and a codegen'd
 * TurboModule would mean a `.ts` spec, a codegen step in the build, and a
 * generated C++ shim — all to expose six methods that are already
 * promise-based. Recorded as a follow-up in ANDROID_AUTO_REFERENCE.md §8.
 */
class DriverseCarPackage : ReactPackage {

    override fun createNativeModules(
        reactContext: ReactApplicationContext,
    ): List<NativeModule> = listOf(TripRecorderModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<View, ReactShadowNode<*>>> = emptyList()
}
