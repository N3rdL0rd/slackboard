package app.slackboard.client.wear

import android.os.SystemClock
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.wear.compose.material.Text
import kotlin.math.abs

/**
 * The training set the phone's session screen is on: what it is, how long is left (or how long it has been), and one big button for what
 * comes next. The ring is the time left in the phase. The phone runs the session; every press is a command and the next state is the answer.
 */
@Composable
fun RunnerFace(r: RRunner, clockText: String, bpm: Int?, onOpenActions: () -> Unit) {
    val context = LocalContext.current
    val timed = r.phase == "on" || r.phase == "off" || r.phase == "rest"
    val counting = r.phase == "work"
    val nowMs = rememberNow((timed || counting) && !r.paused)
    val left = if (timed) ((r.edge - nowMs.longValue + 999) / 1000).coerceAtLeast(0) else 0L
    val spent = if (counting) ((nowMs.longValue - r.edge) / 1000).coerceAtLeast(0) else 0L
    val urgent = timed && !r.paused && left in 1..3

    // The time the phase started with, to turn the time left into a share of the ring. A rest that gets +30 s simply runs past full.
    val total = remember(r.phase, r.set, r.label) { (r.edge - SystemClock.elapsedRealtime()).coerceAtLeast(1000L) }
    val frac = remember { Animatable(0f) }
    LaunchedEffect(r.edge, r.phase, r.paused) {
        if (timed && !r.paused) {
            val ms = (r.edge - SystemClock.elapsedRealtime()).coerceAtLeast(0)
            frac.snapTo((ms / total.toFloat()).coerceIn(0f, 1f))
            if (ms > 0) frac.animateTo(0f, tween(ms.toInt(), easing = LinearEasing))
            Buzz.countdown(context, r.edge)
        } else {
            if (!timed) frac.snapTo(if (r.phase == "work") 1f else 0f)
            Buzz.cancelCountdown(context)
        }
    }
    val color by animateColorAsState(if (urgent) Ink.Danger else r.color, tween(300), label = "runner")
    val big = when {
        timed -> mmss(left)
        counting -> mmss(spent)
        else -> r.big.ifEmpty { "-" }
    }
    val action = when (r.phase) { "ready" -> "Start" ; "rest" -> "Skip rest"; "finished" -> "" ; else -> "Done" }
    val op = when (r.phase) { "ready" -> "start"; "rest" -> "skipRest"; else -> "done" }

    Box(
        Modifier.fillMaxSize().pointerInput(Unit) {
            var dy = 0f
            detectDragGestures(onDragStart = { dy = 0f }, onDrag = { c, d -> c.consume(); dy += d.y }, onDragEnd = { if (dy < -60f && abs(dy) > 0) onOpenActions() })
        },
        contentAlignment = Alignment.Center,
    ) {
        Ring(color, -90f, if (timed || counting || r.phase == "ready") (if (r.paused) 360f else 360f * (if (timed) frac.value else 1f)).coerceAtLeast(1f) else 0f, round = true)
        Text(clockText, style = ui(13), modifier = Modifier.align(Alignment.TopCenter).padding(top = 16.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.align(Alignment.Center).offset(y = (-6).dp).padding(horizontal = 24.dp)) {
            Text(if (r.paused) "Paused" else r.label, style = display(19, if (r.paused) Ink.Muted else color, 20))
            Text(big, style = display(46, if (urgent) Ink.Danger else Ink.Chalk, 50))
            Text(r.name, style = display(17, Ink.Chalk, 19), maxLines = 1, textAlign = TextAlign.Center)
            Text("Set ${r.set} of ${r.sets}  \u00B7  ${r.target}", style = ui(10), maxLines = 1)
        }
        if (action.isNotEmpty()) {
            Box(
                Modifier.align(Alignment.BottomCenter).padding(bottom = 16.dp)
                    .background(if (r.phase == "rest") Ink.Raised else color, RoundedCornerShape(50))
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { Buzz.tick(context); Commands.runner(context, op) }
                    .padding(horizontal = 18.dp, vertical = 0.dp),
            ) { Text(action.uppercase(), style = display(17, if (r.phase == "rest") Ink.Chalk else Ink.Ground)) }
        }
        if (bpm != null) Text("$bpm bpm", style = display(11, Ink.Muted), modifier = Modifier.align(Alignment.TopCenter).padding(top = 34.dp))
    }
}
