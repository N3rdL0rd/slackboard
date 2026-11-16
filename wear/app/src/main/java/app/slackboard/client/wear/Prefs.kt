package app.slackboard.client.wear

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/** The watch's own settings, kept on the watch. */
data class PrefsUi(
    /** Ticks on a swipe, a tap and a step. The timer's countdown buzz has its own switch. */
    val ticks: Boolean = true,
    /** The buzz as a timer or a set nears its end. */
    val buzz: Boolean = true,
    /** Strong or light buzz. */
    val strong: Boolean = true,
    /** Keep the screen on while the remote is open. Off lets the watch dim into its always-on view. */
    val bright: Boolean = true,
    /** Seconds the watch asks the phone for when it starts a timer. */
    val timerSeconds: Int = 60,
)

object Prefs {
    private const val FILE = "remote"
    private lateinit var app: Context
    private val _ui = MutableStateFlow(PrefsUi())
    val ui = _ui.asStateFlow()

    fun init(context: Context) {
        if (::app.isInitialized) return
        app = context.applicationContext
        val p = app.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        _ui.value = PrefsUi(
            ticks = p.getBoolean("ticks", true), buzz = p.getBoolean("buzz", true), strong = p.getBoolean("strong", true),
            bright = p.getBoolean("bright", true), timerSeconds = p.getInt("timer", 60),
        )
    }

    fun update(f: (PrefsUi) -> PrefsUi) {
        _ui.update(f)
        val v = _ui.value
        app.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putBoolean("ticks", v.ticks).putBoolean("buzz", v.buzz).putBoolean("strong", v.strong).putBoolean("bright", v.bright).putInt("timer", v.timerSeconds)
            .apply()
    }
}
