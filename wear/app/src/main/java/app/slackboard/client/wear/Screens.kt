package app.slackboard.client.wear

import android.os.SystemClock
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay

enum class Screen { Remote, Actions, TimerLength, LogSend, LogAttempt, Recorder, Settings }

fun parentOf(s: Screen): Screen = if (s == Screen.Actions) Screen.Remote else if (s == Screen.Remote) Screen.Remote else Screen.Actions

/** A full-screen message for a state that is not the happy path: say what is wrong and what to do, nothing else. */
@Composable
fun Notice(title: String, hint: String, clockText: String) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Ring(Ink.Line, -90f, 0f, false)
        Text(clockText, style = ui(13), modifier = Modifier.align(Alignment.TopCenter).padding(top = 16.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 30.dp)) {
            Text(title, style = display(24, Ink.Chalk, 26), textAlign = TextAlign.Center)
            Spacer(Modifier.height(6.dp))
            Text(hint, style = ui(13), textAlign = TextAlign.Center)
        }
    }
}

@Composable
private fun Row(label: String, secondary: String? = null, enabled: Boolean = true, onClick: () -> Unit) {
    val context = LocalContext.current
    Chip(
        onClick = { Buzz.tick(context); onClick() }, enabled = enabled, modifier = Modifier.fillMaxWidth(),
        label = { Text(label, style = display(19, if (enabled) Ink.Chalk else Ink.Muted, 21), maxLines = 1) },
        secondaryLabel = secondary?.let { { Text(it, style = ui(12, Ink.Muted), maxLines = 1) } },
        colors = ChipDefaults.chipColors(backgroundColor = Ink.Raised, disabledBackgroundColor = Ink.Card),
    )
}

@Composable
private fun Title(text: String) {
    Text(text, style = display(20, Ink.Chalk, 22), modifier = Modifier.padding(top = 18.dp, bottom = 4.dp))
}

/** Everything the remote can do, in one list. What is not possible right now (no climb open, no board) says why instead of disappearing. */
@Composable
fun ActionsScreen(
    ui: RemoteUi, watch: WatchUi, prefs: PrefsUi, inAttempt: Boolean, setInAttempt: (Boolean) -> Unit,
    go: (Screen) -> Unit, back: () -> Unit, nowMs: Long,
) {
    val context = LocalContext.current
    ScalingLazyColumn(Modifier.fillMaxSize(), state = rememberScalingLazyListState(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        item { Title(if (ui.runner != null) "Training" else "Actions") }
        val r = ui.runner
        val c = ui.climb
        if (r != null) {
            item { Row(if (r.paused) "Resume" else "Pause", enabled = r.phase != "ready") { Commands.runner(context, if (r.paused) "resume" else "pause"); back() } }
            item { Row("Add 30 seconds", "to the rest", enabled = r.phase == "rest") { Commands.runner(context, "addRest"); back() } }
            item { Row("Skip rest", enabled = r.phase == "rest") { Commands.runner(context, "skipRest"); back() } }
        } else if (c != null) {
            item { Row("Light on board", if (ui.boardConnected) ui.boardName.ifEmpty { "Connected" } else "Not connected") { Commands.light(context) } }
            if (c.canMirror) item { Row("Mirror", if (c.mirrored) "On" else "Off") { Commands.mirror(context) } }
            val t = ui.timer
            item {
                if (t != null) Row("Stop timer", mmss((t.endAt - nowMs + 999) / 1000)) { Commands.timerStop(context); back() }
                else Row("Start timer", lengthLabel(prefs.timerSeconds)) { Commands.timerStart(context, prefs.timerSeconds); back() }
            }
            item { Row("Timer length", lengthLabel(prefs.timerSeconds)) { go(Screen.TimerLength) } }
            item { Row("Log send", "${c.name.take(18)}") { go(Screen.LogSend) } }
            item { Row("Log attempts") { go(Screen.LogAttempt) } }
        } else {
            item { Text("Open a climb on the phone for the climb actions.", style = ui(12), textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) }
        }
        if (watch.running && watch.session != null) {
            item { Title("This recording") }
            item { Row(if (inAttempt) "Attempt ends" else "Attempt starts") { Commands.mark(context, if (inAttempt) "attempt-end" else "attempt-start", watch.session); setInAttempt(!inAttempt); back() } }
            item { Row("Fell") { Commands.mark(context, "fall", watch.session); setInAttempt(false); back() } }
        }
        item { Title("Watch") }
        item { Row("Heart rate", if (watch.running) "Recording" + (watch.bpm?.let { ", $it bpm" } ?: "") else "Not recording") { go(Screen.Recorder) } }
        item { Row("Settings") { go(Screen.Settings) } }
        item { Row("Back") { back() } }
    }
}

@Composable
fun TimerLengthScreen(lengths: List<Int>, current: Int, onPick: (Int) -> Unit, back: () -> Unit) {
    ScalingLazyColumn(Modifier.fillMaxSize(), state = rememberScalingLazyListState(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        item { Title("Timer length") }
        for (s in lengths) item { Row(lengthLabel(s), if (s == current) "Chosen" else null) { onPick(s) } }
        item { Row("Back") { back() } }
    }
}

/** How many tries, then one button. A send with one try is a flash, as on the phone. */
@Composable
fun LogScreen(send: Boolean, onLog: (Int) -> Unit, back: () -> Unit) {
    val context = LocalContext.current
    var tries by remember { mutableIntStateOf(1) }
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(if (send) "Log send" else "Log attempts", style = display(22, Ink.Chalk, 24))
        Text(if (send) (if (tries == 1) "Flash" else "Tries") else "Tries", style = ui(12))
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stepper("\u2212", tries > 1) { tries--; Buzz.tick(context) }
            Text("$tries", style = display(44, Ink.Chalk, 46), modifier = Modifier.width(46.dp), textAlign = TextAlign.Center)
            Stepper("+", tries < 99) { tries++; Buzz.tick(context) }
        }
        Spacer(Modifier.height(6.dp))
        Box(
            Modifier.background(Ink.Chalk, RoundedCornerShape(50)).clickable { Buzz.tick(context); onLog(tries) }.padding(horizontal = 26.dp, vertical = 4.dp),
        ) { Text(if (send) "LOG SEND" else "LOG", style = display(18, Ink.Ground)) }
        Spacer(Modifier.height(2.dp))
        Text("Back", style = ui(12, Ink.Muted), modifier = Modifier.clickable { back() }.padding(8.dp))
    }
}

@Composable
private fun Stepper(text: String, enabled: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick, enabled = enabled, modifier = Modifier.size(40.dp),
        colors = ButtonDefaults.buttonColors(backgroundColor = Ink.Raised, contentColor = Ink.Chalk, disabledBackgroundColor = Ink.Card),
    ) { Text(text, style = display(22, if (enabled) Ink.Chalk else Ink.Muted, 24)) }
}

@Composable
fun SettingsScreen(prefs: PrefsUi, lengths: List<Int>, back: () -> Unit) {
    ScalingLazyColumn(Modifier.fillMaxSize(), state = rememberScalingLazyListState(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        item { Title("Settings") }
        item { Row("Buzz at the end", if (prefs.buzz) "On" else "Off") { Prefs.update { it.copy(buzz = !it.buzz) } } }
        item { Row("Buzz strength", if (prefs.strong) "Strong" else "Light", enabled = prefs.buzz) { Prefs.update { it.copy(strong = !it.strong) } } }
        item { Row("Ticks", if (prefs.ticks) "On" else "Off") { Prefs.update { it.copy(ticks = !it.ticks) } } }
        item { Row("Screen", if (prefs.bright) "Stay on" else "Dim when idle") { Prefs.update { it.copy(bright = !it.bright) } } }
        item {
            Row("Timer length", lengthLabel(prefs.timerSeconds)) {
                val i = lengths.indexOf(prefs.timerSeconds)
                Prefs.update { it.copy(timerSeconds = lengths[(i + 1).mod(lengths.size)]) }
            }
        }
        item { Text("Remote version ${Remote.VERSION}", style = ui(11, Ink.Muted), modifier = Modifier.padding(top = 4.dp)) }
        item { Row("Back") { back() } }
    }
}

/** The recorder: heart rate while you climb, sent to the phone. Starting and stopping here or from the phone are the same session. */
@Composable
fun RecorderScreen(ui: WatchUi, nowWall: Long, onStart: () -> Unit, onStop: () -> Unit, onAsk: () -> Unit, back: () -> Unit) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center, modifier = Modifier.padding(horizontal = 24.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(if (ui.linked) Ink.Good else Ink.Danger, CircleShape))
                Spacer(Modifier.width(6.dp))
                Text(if (ui.linked) "Phone linked" else "Phone not linked", style = ui(12, Ink.Muted))
            }
            Spacer(Modifier.height(4.dp))
            Text(ui.bpm?.toString() ?: "--", style = display(46, if (ui.running) Ink.Chalk else Ink.Muted, 48))
            Text(
                if (ui.running && ui.startedAt != null) mmss((nowWall - ui.startedAt) / 1000) + (if (ui.mode == ExerciseService.MODE_HEART_RATE) " \u00B7 heart rate only" else "") else "Not recording",
                style = ui(14, Ink.Muted),
            )
            Spacer(Modifier.height(6.dp))
            Box(
                Modifier.background(if (ui.running) Ink.Danger else Ink.Star, RoundedCornerShape(50)).clickable { if (ui.running) onStop() else onStart() }.padding(horizontal = 26.dp, vertical = 4.dp),
            ) { Text(if (ui.running) "STOP" else "START", style = display(18, Ink.Ground)) }
            if (!ui.running) {
                Text("What can this watch do?", style = ui(11, Ink.Muted), modifier = Modifier.clickable { onAsk() }.padding(8.dp), textAlign = TextAlign.Center)
                if (ui.info != null) Text(ui.info, style = ui(10, Ink.Muted), textAlign = TextAlign.Center)
            }
            if (ui.message != null) Text(ui.message, style = ui(10, Ink.Danger), textAlign = TextAlign.Center)
            Text("Back", style = ui(12, Ink.Muted), modifier = Modifier.clickable { back() }.padding(6.dp))
        }
    }
}

/** What a command came back with, shown for a moment over whatever is on screen. */
@Composable
fun AckToast(ack: RAck?) {
    val context = LocalContext.current
    LaunchedEffect(ack?.at) {
        if (ack == null) return@LaunchedEffect
        if (ack.ok) Buzz.ok(context) else Buzz.no(context)
        delay(2600)
        RemoteState.clearAck(ack.at)
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(ack != null, enter = fadeIn(), exit = fadeOut()) {
            Box(
                Modifier.padding(bottom = 14.dp).background(if (ack?.ok == false) Ink.Danger else Ink.Raised, RoundedCornerShape(50)).padding(horizontal = 16.dp, vertical = 5.dp),
            ) { Text(ack?.text ?: "", style = ui(13, if (ack?.ok == false) Ink.Ground else Ink.Chalk).copy(fontWeight = FontWeight.Normal), maxLines = 1) }
        }
    }
}
