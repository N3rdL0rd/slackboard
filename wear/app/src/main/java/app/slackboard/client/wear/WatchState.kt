package app.slackboard.client.wear

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class WatchUi(
    val running: Boolean = false,
    val session: String? = null,
    val startedAt: Long? = null,
    val bpm: Int? = null,
    /** "workout" or "heart-rate" (heart rate only), while recording. */
    val mode: String? = null,
    val linked: Boolean = false,
    val message: String? = null,
    /** A neutral line under the button, such as "Sent to the phone". */
    val info: String? = null,
)

/** What the screen shows. The service and the listener write it; the screen only reads it. */
object WatchState {
    private val _ui = MutableStateFlow(WatchUi())
    val ui = _ui.asStateFlow()

    fun update(f: (WatchUi) -> WatchUi) = _ui.update(f)
}
