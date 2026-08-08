package app.rork.driverse.carapp

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * Commands issued from the car display, on their way to whoever is listening.
 *
 * WHY THIS IS NOT JUST A CALL INTO THE SERVICE
 *
 * The car's buttons do two things, and only one of them is the service's job.
 * Starting the recorder is: [DriveScreen] asks [TripRecorderService] directly
 * and the drive begins whether or not the phone app exists. But the phone app,
 * if it IS running, has its own idea of whether a drive is in progress — the
 * map screen's recording HUD, the trip summary sheet, the save-route flow — and
 * none of it learns anything from a service starting.
 *
 * The failure that produces: the driver ends a drive on the head unit, picks up
 * their phone at the destination, and finds it still showing a running drive
 * that will never be saved. This bus is how the phone finds out.
 *
 * `MutableSharedFlow` with `DROP_OLDEST` rather than a queue that grows: a
 * command nobody collected is a command issued while the RN host was dead, and
 * replaying "end drive" ten minutes later when the app finally opens would end
 * a *different* drive. The `replay = 1` keeps exactly the most recent one, so a
 * host that starts a second later still sees the button that was just pressed.
 */
object CarCommandBus {

    /** What the driver pressed on the car screen. */
    enum class Command { START, PAUSE, RESUME, END }

    private val _commands = MutableSharedFlow<Command>(
        replay = 1,
        extraBufferCapacity = 1,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )

    val commands: SharedFlow<Command> = _commands.asSharedFlow()

    fun emit(command: Command) {
        _commands.tryEmit(command)
    }

    /**
     * Forgets any pending command.
     *
     * Called by the React Native bridge once it has delivered what it found, so
     * that a later subscriber — the app being reopened an hour after the drive
     * ended — does not act on a stale button press. Without this, `replay = 1`
     * is a footgun rather than a convenience.
     */
    fun clearReplay() {
        _commands.resetReplayCache()
    }
}
