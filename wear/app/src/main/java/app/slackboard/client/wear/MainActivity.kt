package app.slackboard.client.wear

import android.Manifest
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.os.SystemClock
import android.text.format.DateFormat
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.wear.ambient.AmbientLifecycleObserver
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Switches for looking at the app on an emulator, which has no phone to talk to. Only honoured by a debuggable build. */
object Debug {
    var linked by mutableStateOf(false)
    var screen by mutableStateOf<String?>(null)
}

/**
 * The one watch app: the remote for the phone's climb screen (or training session) at home, an actions list one swipe up, and under it
 * the heart-rate recorder and the watch's settings. The screen is kept on while it is open (a setting can let it dim to the
 * always-on view instead), and the phone is told the app is open so it only sends state while someone is looking.
 */
class MainActivity : ComponentActivity() {
    private var autostart by mutableStateOf<String?>(null)
    private val ambient = mutableStateOf(false)

    private val ambientCallback = object : AmbientLifecycleObserver.AmbientLifecycleCallback {
        override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) { ambient.value = true }
        override fun onExitAmbient() { ambient.value = false }
    }

    private val debuggable get() = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Uplink.init(this)
        Prefs.init(this)
        lifecycle.addObserver(AmbientLifecycleObserver(this, ambientCallback))
        handle(intent)
        setContent { App(autostart, { autostart = null }, ambient.value) }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    private fun handle(i: android.content.Intent?) {
        i ?: return
        i.getStringExtra(EXTRA_AUTOSTART)?.let { autostart = it }
        if (!debuggable) return
        if (i.getBooleanExtra("debugLinked", false)) Debug.linked = true
        i.getStringExtra("debugState")?.let { RemoteState.onState(it) }
        i.getStringExtra("debugAck")?.let { RemoteState.onAck(it) }
        i.getStringExtra("debugScreen")?.let { Debug.screen = it }
        if (i.getBooleanExtra("debugAmbient", false)) ambient.value = true
        i.getStringExtra("debugSummary")?.let { RemoteState.onSummary(this, it) }
    }

    override fun onResume() {
        super.onResume()
        Uplink.flush()
    }

    companion object {
        const val EXTRA_AUTOSTART = "autostart"
    }
}

@Composable
private fun App(autostart: String?, clearAutostart: () -> Unit, ambient: Boolean) {
    val activity = LocalContext.current as ComponentActivity
    val remote by RemoteState.ui.collectAsState()
    val watch by WatchState.ui.collectAsState()
    val prefs by Prefs.ui.collectAsState()
    var screen by remember { mutableStateOf(Screen.Remote) }
    var info by remember { mutableStateOf(false) }
    var inAttempt by remember { mutableStateOf(false) }
    var now by remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    var wall by remember { mutableLongStateOf(System.currentTimeMillis()) }
    val is24 = remember { DateFormat.is24HourFormat(activity) }
    val fmt = remember { SimpleDateFormat(if (is24) "HH:mm" else "h:mm", Locale.getDefault()) }
    var clockText by remember { mutableStateOf(fmt.format(Date())) }

    // Screen on while the remote is open, unless the user chose to let it dim into the always-on view.
    LaunchedEffect(prefs.bright) {
        if (prefs.bright) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
    LaunchedEffect(Debug.screen) { Debug.screen?.let { s -> runCatching { Screen.valueOf(s) }.getOrNull()?.let { screen = it } } }

    // One tick a second: the clock, and the staleness of what the phone last said.
    LaunchedEffect(Unit) {
        while (true) {
            now = SystemClock.elapsedRealtime(); wall = System.currentTimeMillis()
            val t = fmt.format(Date(wall))
            if (t != clockText) clockText = t
            if (!WatchState.ui.value.linked) Uplink.flush()
            delay(1000)
        }
    }

    // Tell the phone the app is open (it only sends state while someone is looking), and ask again soon while nothing answers.
    LaunchedEffect(activity) {
        activity.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            try {
                while (true) {
                    Commands.hello(activity)
                    val live = RemoteState.ui.value.link == Link.Live && SystemClock.elapsedRealtime() - RemoteState.ui.value.stateAt < 45_000
                    delay(if (live) 30_000 else 5_000)
                }
            } finally {
                Commands.bye(activity)
            }
        }
    }

    // The recorder: permissions, then the foreground service.
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.all { it }) ExerciseService.start(activity, null)
        else WatchState.update { it.copy(message = "Sensors are needed to record heart rate.") }
    }
    fun begin(session: String?) {
        val need = arrayOf(Manifest.permission.BODY_SENSORS, Manifest.permission.ACTIVITY_RECOGNITION, Manifest.permission.POST_NOTIFICATIONS)
        val missing = need.filter { activity.checkSelfPermission(it) != android.content.pm.PackageManager.PERMISSION_GRANTED }
        if (missing.isEmpty()) ExerciseService.start(activity, session) else ask.launch(missing.toTypedArray())
    }
    LaunchedEffect(autostart) {
        if (autostart != null) { begin(autostart.ifEmpty { null }); clearAutostart() }
    }

    BackHandler(enabled = screen != Screen.Remote) { screen = parentOf(screen) }
    BackHandler(enabled = screen == Screen.Remote && info) { info = false }

    val linked = watch.linked || Debug.linked
    val live = remote.link == Link.Live && now - remote.stateAt < 45_000

    Box(Modifier.fillMaxSize().background(Ink.Ground)) {
        if (ambient) {
            AmbientFace(clockText, remote.climb, remote.runner)
        } else when (screen) {
            Screen.Remote -> when {
                !linked -> Notice("Phone not connected", "Check that the watch is paired with the phone and Bluetooth is on.", clockText)
                remote.link == Link.Mismatch -> Notice("Update needed", "Slackboard on the phone and on the watch are different versions.", clockText)
                !live -> Notice("Open Slackboard on the phone", "The remote shows what the phone shows.", clockText)
                remote.runner != null -> RunnerFace(remote.runner!!, clockText, watch.bpm.takeIf { watch.running }) { screen = Screen.Actions }
                remote.climb == null -> Notice("Open a climb on the phone", "Then it appears here.", clockText)
                remote.climb!!.count == 0 -> Notice("No climbs in this list", "Change the filters on the phone.", clockText)
                else -> ClimbFace(remote.climb!!, remote.timer, clockText, watch.bpm.takeIf { watch.running }, remote.pending, { screen = Screen.Actions }, info) { info = it }
            }
            Screen.Actions -> ActionsScreen(remote, watch, prefs, inAttempt, { inAttempt = it }, { screen = it }, { screen = Screen.Remote }, now)
            Screen.TimerLength -> TimerLengthScreen(remote.lengths, prefs.timerSeconds, { s -> Prefs.update { it.copy(timerSeconds = s) }; screen = Screen.Actions }, { screen = Screen.Actions })
            Screen.LogSend -> LogScreen(true, { n -> Commands.log(activity, true, n); screen = Screen.Remote }, { screen = Screen.Actions })
            Screen.LogAttempt -> LogScreen(false, { n -> Commands.log(activity, false, n); screen = Screen.Remote }, { screen = Screen.Actions })
            Screen.Recorder -> RecorderScreen(watch, wall, { begin(null) }, { ExerciseService.stop(activity) }, {
                WatchState.update { it.copy(info = "Sending to the phone...") }
                Capabilities.sendToPhone(activity) { WatchState.update { it.copy(info = "Sent to the phone.") } }
            }, { screen = Screen.Actions })
            Screen.Settings -> SettingsScreen(prefs, remote.lengths) { screen = Screen.Actions }
        }
        if (!ambient) AckToast(remote.ack)
    }
}
