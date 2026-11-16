package app.slackboard.client.wear

import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.text.format.DateFormat
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.launch
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.derivedStateOf
import androidx.compose.animation.core.LinearEasing
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

/**
 * A look at the watch remote with made-up data: a list of dummy climbs to swipe through (it stops at both ends), a clock, the screen
 * kept on, and a tap that runs a 30 second demo timer. The ring shows the place in the list; while a timer runs it becomes the timer
 * and turns red for the last three seconds, with a buzz. Nothing here talks to the phone yet.
 */
class RemoteActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent { RemoteScreen() }
    }
}

private val Ground = Color(0xFF121618)
private val Raised = Color(0xFF232A2E)
private val Chalk = Color(0xFFEDEBE4)
private val Secondary = Color(0xFFC5CBC9)
private val Muted = Color(0xFFA3ABA9)
private val Star = Color(0xFFE8C766)
private val StarOff = Color(0xFF46515A)
private val Danger = Color(0xFFF2554D)

private val Display = FontFamily(Font(R.font.barlow_condensed_bold, FontWeight.Bold))
private val Ui = FontFamily(Font(R.font.barlow_regular, FontWeight.Normal))

/** The numeral takes the band colour; from V9 the band is black, so the numeral takes the ring colour instead, as on the phone. */
private data class Demo(val name: String, val grade: String, val numeral: Color, val ring: Color, val angle: Int, val mirrored: Boolean, val stars: Int)

private val CLIMBS = listOf(
    Demo("Warm Up Slab", "V0", Color(0xFFF49AC2), Color(0xFFF49AC2), 30, false, 2),
    Demo("Pizza Box", "V2", Color(0xFF5AA9FF), Color(0xFF5AA9FF), 40, false, 3),
    Demo("Masquerade", "V4", Color(0xFF4FD08A), Color(0xFF4FD08A), 40, true, 3),
    Demo("Chalk Bag Blues", "V5", Color(0xFFF2F0EA), Color(0xFFF2F0EA), 45, false, 1),
    Demo("Red Eye", "V7", Color(0xFFF2554D), Color(0xFFF2554D), 40, false, 3),
    Demo("Night Shift", "V9", Color(0xFFEDEBE4), Color(0xFF8E9795), 50, true, 2),
    Demo("Violet Hour", "V11", Color(0xFF9A6BFF), Color(0xFF9A6BFF), 40, false, 3),
)
private const val TIMER_MS = 30_000L

private val Ease = CubicBezierEasing(0.2f, 0f, 0f, 1f)
private fun lerp(a: Float, b: Float, t: Float) = a + (b - a) * t

@Composable
private fun RemoteScreen() {
    val context = LocalContext.current
    val vibrator = remember { context.getSystemService(Vibrator::class.java) }
    val is24 = remember { DateFormat.is24HourFormat(context) }
    val scope = rememberCoroutineScope()
    var index by remember { mutableIntStateOf(2) }
    var timerEnd by remember { mutableLongStateOf(0L) }
    val nowMs = remember { mutableLongStateOf(System.currentTimeMillis()) }
    var clockText by remember { mutableStateOf("") }
    var lastBuzz by remember { mutableIntStateOf(-1) }
    val running = timerEnd > 0
    var drag = remember { floatArrayOf(0f) }
    val pull = remember { Animatable(0f) }

    val fmt = remember { SimpleDateFormat(if (is24) "HH:mm" else "h:mm", Locale.getDefault()) }
    LaunchedEffect(Unit) { while (true) { val t = fmt.format(Date()); if (t != clockText) clockText = t; delay(1000) } }
    // The clock reading moves every 100 ms while a timer runs, but only the whole second left is read while composing, so the screen
    // recomposes once a second and not ten times. The ring is driven by its own animation and read only while drawing.
    LaunchedEffect(running) { while (running) { nowMs.longValue = System.currentTimeMillis(); delay(100) } }
    val secLeft by remember { derivedStateOf { if (timerEnd > 0) ((timerEnd - nowMs.longValue + 999) / 1000).coerceAtLeast(0) else 0L } }
    val frac = remember { Animatable(0f) }
    LaunchedEffect(timerEnd) {
        if (timerEnd > 0) {
            val total = timerEnd - System.currentTimeMillis()
            frac.snapTo(total / TIMER_MS.toFloat())
            frac.animateTo(0f, tween(total.toInt().coerceAtLeast(1), easing = LinearEasing))
        }
    }
    // Buzz once for each of the last three seconds, and a long one at zero; each second only once.
    LaunchedEffect(secLeft, running) {
        if (!running) { lastBuzz = -1; return@LaunchedEffect }
        if (secLeft == 0L) {
            vibrator.vibrate(VibrationEffect.createOneShot(700, VibrationEffect.DEFAULT_AMPLITUDE))
            delay(900); timerEnd = 0L
        } else if (secLeft in 1..3 && secLeft.toInt() != lastBuzz) {
            lastBuzz = secLeft.toInt()
            vibrator.vibrate(VibrationEffect.createOneShot(40, 120))
        }
    }

    val climb = CLIMBS[index]
    val urgent = running && secLeft <= 3
    val ringColor = animateColorAsState(if (urgent) Danger else climb.ring, tween(300), label = "ring")
    val numeralColor by animateColorAsState(if (urgent) Danger else climb.numeral, tween(300), label = "numeral")
    // 0 is the place in the list, 1 is the timer; the same arc morphs between them rather than one blinking out for the other.
    val mix = animateFloatAsState(if (running) 1f else 0f, tween(450, easing = Ease), label = "mix")
    val place = animateFloatAsState(index.toFloat(), spring(dampingRatio = 0.85f, stiffness = 260f), label = "place")
    Box(
        Modifier.fillMaxSize().background(Ground)
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragStart = { drag[0] = 0f },
                    onHorizontalDrag = { _, dx ->
                        drag[0] += dx
                        // The content follows the finger at a fraction of the distance, and pulls harder against the ends of the list.
                        val atEnd = (drag[0] < 0 && index == CLIMBS.lastIndex) || (drag[0] > 0 && index == 0)
                        scope.launch { pull.snapTo((pull.value + dx * (if (atEnd) 0.12f else 0.35f)).coerceIn(-70f, 70f)) }
                    },
                    onDragEnd = {
                        // Swiping left shows the next climb, right the previous; it stops at both ends.
                        if (abs(drag[0]) > 70f) {
                            val next = (index + if (drag[0] < 0) 1 else -1).coerceIn(0, CLIMBS.lastIndex)
                            if (next != index) { index = next; vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)) }
                        }
                        drag[0] = 0f
                        scope.launch { pull.animateTo(0f, spring(dampingRatio = 0.8f, stiffness = 380f)) }
                    },
                    onDragCancel = { scope.launch { pull.animateTo(0f, spring(dampingRatio = 0.8f, stiffness = 380f)) } },
                )
            }
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {
                timerEnd = if (running) 0L else System.currentTimeMillis() + TIMER_MS
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize().padding(2.dp)) {
            val w = 6.dp.toPx()
            val size = Size(this.size.width - w, this.size.height - w)
            val topLeft = Offset(w / 2, w / 2)
            drawArc(Raised, 0f, 360f, false, topLeft, size, style = Stroke(w))
            val step = 360f / CLIMBS.size
            val m = mix.value
            val start = lerp(-90f + step * place.value + 1.5f, -90f, m)
            val sweep = lerp(step - 3f, (360f * frac.value).coerceAtLeast(0.5f), m)
            drawArc(ringColor.value, start, sweep, false, topLeft, size, style = Stroke(w, cap = if (m > 0.5f) StrokeCap.Round else StrokeCap.Butt))
        }
        // Three anchored parts, so no gap is left over: the clock at the top, the climb centred in the circle, the position or timer at the bottom.
        Text(clockText, style = TextStyle(fontFamily = Ui, fontSize = 13.sp, color = Secondary), modifier = Modifier.align(Alignment.TopCenter).padding(top = 16.dp))
        AnimatedContent(
            targetState = index,
            modifier = Modifier.align(Alignment.Center).offset(y = (-6).dp).graphicsLayer { translationX = pull.value; alpha = 1f - abs(pull.value) / 160f },
            transitionSpec = {
                val dir = if (targetState > initialState) 1 else -1
                (slideInHorizontally(tween(320, easing = Ease)) { it / 3 * dir } + fadeIn(tween(260, delayMillis = 40))) togetherWith
                    (slideOutHorizontally(tween(220, easing = Ease)) { -it / 3 * dir } + fadeOut(tween(140)))
            },
            label = "climb",
        ) { i ->
            val c = CLIMBS[i]
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(c.grade, style = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 52.sp, color = if (i == index) numeralColor else c.numeral, lineHeight = 52.sp))
                Text(c.name, style = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 22.sp, color = Chalk, lineHeight = 24.sp), maxLines = 1)
                Text("${c.angle}\u00B0" + if (c.mirrored) "  \u00B7  Mirrored" else "", style = TextStyle(fontFamily = Ui, fontSize = 12.sp, color = Secondary))
                AnimatedVisibility(!running, enter = fadeIn(tween(300)) + expandVertically(tween(300, easing = Ease)), exit = fadeOut(tween(160)) + shrinkVertically(tween(260, easing = Ease))) { Stars(c.stars) }
            }
        }
        Box(Modifier.align(Alignment.BottomCenter).padding(bottom = 20.dp)) {
            Crossfade(running, animationSpec = tween(260), label = "bottom") { on ->
                if (on) {
                    Box(Modifier.background(if (urgent) Danger else Raised, RoundedCornerShape(50)).padding(horizontal = 14.dp)) {
                        Text(clock(secLeft), style = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 17.sp, color = if (urgent) Ground else Chalk))
                    }
                } else {
                    Text("${index + 1} of ${CLIMBS.size}", style = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Muted))
                }
            }
        }
    }
}

@Composable
private fun Stars(on: Int) {
    Text(
        buildStars(on),
        style = TextStyle(fontSize = 13.sp, letterSpacing = 2.sp),
    )
}

private fun buildStars(on: Int) = androidx.compose.ui.text.buildAnnotatedString {
    for (i in 0 until 3) {
        pushStyle(androidx.compose.ui.text.SpanStyle(color = if (i < on) Star else StarOff))
        append("\u2605")
        pop()
    }
}

private fun clock(s: Long) = "%d:%02d".format(s / 60, s % 60)
