package app.slackboard.client.wear

import android.content.Context
import android.os.SystemClock
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs

private val Ease = CubicBezierEasing(0.2f, 0f, 0f, 1f)
private fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t

/** Rounds of time left to show, ticking only while a countdown runs so nothing recomposes ten times a second for nothing. */
@Composable
fun rememberNow(running: Boolean): androidx.compose.runtime.LongState {
    val now = remember { mutableLongStateOf(SystemClock.elapsedRealtime()) }
    LaunchedEffect(running) { while (running) { now.longValue = SystemClock.elapsedRealtime(); delay(100) } }
    return now
}

/**
 * The climb the phone is showing: clock at the top, the grade, the name, a few facts, and a ring that is the place in the list, or the
 * timer while one runs. Swipe sideways (or turn the bezel, or tap the edges) for the next and previous climb; it stops at both ends
 * as the phone does. A tap in the middle shows more about the climb; swiping up opens the actions.
 */
@Composable
fun ClimbFace(
    climb: RClimb, timer: RTimer?, clockText: String, bpm: Int?, pending: Boolean, onOpenActions: () -> Unit, info: Boolean, onInfo: (Boolean) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val running = timer != null
    val nowMs = rememberNow(running)
    val secLeft by remember(timer) { derivedStateOf { if (timer == null) 0L else ((timer.endAt - nowMs.longValue + 999) / 1000).coerceAtLeast(0) } }
    val urgent = running && secLeft <= 3
    val frac = remember { Animatable(0f) }
    LaunchedEffect(timer?.endAt) {
        if (timer != null) {
            val left = (timer.endAt - SystemClock.elapsedRealtime()).coerceAtLeast(0)
            frac.snapTo(left / (timer.length * 1000f))
            if (left > 0) frac.animateTo(0f, tween(left.toInt(), easing = LinearEasing))
            Buzz.countdown(context, timer.endAt)
        } else Buzz.cancelCountdown(context)
    }

    val ringColor by animateColorAsState(if (urgent) Ink.Danger else climb.ring, tween(300), label = "ring")
    val numeralColor by animateColorAsState(if (urgent) Ink.Danger else climb.numeral, tween(300), label = "numeral")
    val mix by animateFloatAsState(if (running) 1f else 0f, tween(450, easing = Ease), label = "mix")
    val count = climb.count.coerceAtLeast(1)
    val place by animateFloatAsState(climb.index.toFloat(), spring(dampingRatio = 0.85f, stiffness = 260f), label = "place")
    val pull = remember { Animatable(0f) }
    val drag = remember { floatArrayOf(0f, 0f) }
    val axis = remember { intArrayOf(0) } // 0 undecided, 1 sideways, 2 up and down
    val canNext = climb.index < climb.count - 1
    val canPrev = climb.index > 0

    fun step(dir: Int) {
        if (dir > 0 && !canNext || dir < 0 && !canPrev) return
        Buzz.tick(context)
        if (dir > 0) Commands.next(context) else Commands.prev(context)
    }
    var acc by remember { mutableStateOf(0f) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }

    // The climb objects of the ids on screen, so a climb that is sliding out is still drawn as it was.
    val seen = remember { HashMap<String, RClimb>() }
    seen[climb.id] = climb

    Box(
        Modifier.fillMaxSize()
            .onRotaryScrollEvent { e ->
                acc += e.verticalScrollPixels
                if (abs(acc) > 90f) { step(if (acc > 0) 1 else -1); acc = 0f }
                true
            }
            .focusRequester(focus).focusable()
            .pointerInput(canNext, canPrev, info) {
                detectTapGestures { o ->
                    val w = size.width
                    when {
                        o.x < w * 0.22f -> step(-1)
                        o.x > w * 0.78f -> step(1)
                        else -> onInfo(!info)
                    }
                }
            }
            .pointerInput(canNext, canPrev) {
                detectDragGestures(
                    onDragStart = { drag[0] = 0f; drag[1] = 0f; axis[0] = 0 },
                    onDrag = { change, d ->
                        change.consume()
                        drag[0] += d.x; drag[1] += d.y
                        if (axis[0] == 0 && (abs(drag[0]) > 12f || abs(drag[1]) > 12f)) axis[0] = if (abs(drag[0]) >= abs(drag[1])) 1 else 2
                        if (axis[0] == 1) {
                            // The content follows the finger a little, and pulls harder against the ends of the list.
                            val atEnd = (drag[0] < 0 && !canNext) || (drag[0] > 0 && !canPrev)
                            scope.launch { pull.snapTo((pull.value + d.x * (if (atEnd) 0.12f else 0.35f)).coerceIn(-70f, 70f)) }
                        }
                    },
                    onDragEnd = {
                        if (axis[0] == 1 && abs(drag[0]) > 70f) step(if (drag[0] < 0) 1 else -1)
                        else if (axis[0] == 2 && drag[1] < -60f) onOpenActions()
                        scope.launch { pull.animateTo(0f, spring(dampingRatio = 0.8f, stiffness = 380f)) }
                    },
                    onDragCancel = { scope.launch { pull.animateTo(0f, spring(dampingRatio = 0.8f, stiffness = 380f)) } },
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        val step = 360f / count
        Ring(
            ringColor,
            startDeg = lerp(-90f + step * place + 1.5f, -90f, mix),
            sweepDeg = lerp((step - 3f).coerceAtLeast(2f), (360f * frac.value).coerceAtLeast(0.5f), mix),
            round = mix > 0.5f,
        )
        Text(clockText, style = ui(13), modifier = Modifier.align(Alignment.TopCenter).padding(top = 16.dp))
        // Edge cues: a faint chevron where a tap steps, only where there is somewhere to go.
        Text("\u2039", style = ui(26, if (canPrev) Ink.StarOff else Color.Transparent), modifier = Modifier.align(Alignment.CenterStart).padding(start = 12.dp))
        Text("\u203A", style = ui(26, if (canNext) Ink.StarOff else Color.Transparent), modifier = Modifier.align(Alignment.CenterEnd).padding(end = 12.dp))

        AnimatedContent(
            targetState = climb.id to info,
            modifier = Modifier.align(Alignment.Center).offset(y = (-6).dp)
                .graphicsLayer { translationX = pull.value; alpha = (1f - abs(pull.value) / 160f) * (if (pending) 0.6f else 1f) },
            transitionSpec = {
                val going = targetState.first != initialState.first
                if (going) {
                    val dir = if (seen[targetState.first]?.let { it.index >= (seen[initialState.first]?.index ?: 0) } != false) 1 else -1
                    (slideInHorizontally(tween(320, easing = Ease)) { it / 3 * dir } + fadeIn(tween(260, delayMillis = 40))) togetherWith
                        (slideOutHorizontally(tween(220, easing = Ease)) { -it / 3 * dir } + fadeOut(tween(140)))
                } else fadeIn(tween(220)) togetherWith fadeOut(tween(160))
            },
            label = "climb",
        ) { (id, showInfo) ->
            val c = seen[id] ?: climb
            if (showInfo) InfoLines(c) else ClimbLines(c, if (id == climb.id) numeralColor else c.numeral, running)
        }

        Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 20.dp)) {
            Crossfade(running, animationSpec = tween(260), label = "bottom") { on ->
                if (on) {
                    Box(Modifier.background(if (urgent) Ink.Danger else Ink.Raised, RoundedCornerShape(50)).padding(horizontal = 14.dp)) {
                        Text(mmss(secLeft), style = display(17, if (urgent) Ink.Ground else Ink.Chalk))
                    }
                } else {
                    Text(
                        (if (bpm != null) "$bpm bpm  \u00B7  " else "") + "${climb.index + 1} of ${climb.count}",
                        style = display(12, Ink.Muted),
                    )
                }
            }
        }
    }
}

@Composable
private fun ClimbLines(c: RClimb, numeral: Color, running: Boolean) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 20.dp)) {
        Text(c.grade ?: "Project", style = display(if (c.grade == null) 36 else 52, if (c.grade == null) Ink.Muted else numeral, if (c.grade == null) 52 else 52))
        Text(c.name, style = display(if (c.name.length > 18) 18 else 22, Ink.Chalk, if (c.name.length > 18) 20 else 24), maxLines = 2, textAlign = TextAlign.Center)
        Text("${c.angle}\u00B0" + if (c.mirrored) "  \u00B7  Mirrored" else "", style = ui(12))
        AnimatedVisibility(
            !running, enter = fadeIn(tween(300)) + expandVertically(tween(300, easing = Ease)),
            exit = fadeOut(tween(160)) + shrinkVertically(tween(260, easing = Ease)),
        ) { Stars(c.stars) }
    }
}

/** The second page of a climb: what the phone's climb screen would say, in the same words. */
@Composable
private fun InfoLines(c: RClimb) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 24.dp)) {
        Text(c.name, style = display(18, Ink.Chalk, 20), maxLines = 2, textAlign = TextAlign.Center)
        Text(listOfNotNull(c.grade, c.alt).joinToString("  \u00B7  ").ifEmpty { "Project" }, style = display(26, c.numeral, 30))
        Text("${c.angle}\u00B0" + if (c.canMirror) (if (c.mirrored) "  \u00B7  Mirrored" else "  \u00B7  Original") else "", style = ui(12))
        Stars(c.stars)
        Text(
            listOfNotNull(c.sends?.let { "$it ${if (it == 1) "send" else "sends"}" }, if (c.classic) "Classic" else null).joinToString("  \u00B7  ").ifEmpty { "No sends yet" },
            style = ui(12),
        )
        if (c.setter.isNotEmpty()) Text("Set by ${c.setter}", style = ui(12, Ink.Muted), maxLines = 1)
    }
}

@Composable
fun Stars(on: Int?) {
    if (on == null) return
    Text(buildStars(on), style = ui(13).copy(letterSpacing = 2.sp))
}

private fun buildStars(on: Int): AnnotatedString = buildAnnotatedString {
    for (i in 0 until 3) {
        pushStyle(SpanStyle(color = if (i < on) Ink.Star else Ink.StarOff))
        append("\u2605")
        pop()
    }
}

/** The always-on view: no colour fills, no motion, nothing that updates faster than the watch redraws in ambient mode. */
@Composable
fun AmbientFace(clockText: String, climb: RClimb?, runner: RRunner?) {
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 28.dp)) {
            Text(clockText, style = ui(30, Color.White))
            when {
                runner != null -> { Text(runner.label, style = display(34, Color.White)); Text(runner.name, style = ui(14, Color.White), maxLines = 2, textAlign = TextAlign.Center) }
                climb != null -> { Text(climb.grade ?: "Project", style = display(40, Color.White)); Text(climb.name, style = ui(14, Color.White), maxLines = 2, textAlign = TextAlign.Center) }
            }
        }
    }
}
