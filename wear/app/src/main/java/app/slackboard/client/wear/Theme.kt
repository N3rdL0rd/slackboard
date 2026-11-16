package app.slackboard.client.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** The app's own colours and type (src/tokens.json), so the watch looks like the phone. */
object Ink {
    val Ground = Color(0xFF121618)
    val Raised = Color(0xFF232A2E)
    val Card = Color(0xFF1A2023)
    val Line = Color(0xFF2F383D)
    val Chalk = Color(0xFFEDEBE4)
    val Secondary = Color(0xFFC5CBC9)
    val Muted = Color(0xFFA3ABA9)
    val Star = Color(0xFFE8C766)
    val StarOff = Color(0xFF46515A)
    val Danger = Color(0xFFF2554D)
    val Good = Color(0xFF34D17D)
}

val Display = FontFamily(Font(R.font.barlow_condensed_bold, FontWeight.Bold))
val Ui = FontFamily(Font(R.font.barlow_regular, FontWeight.Normal))

fun display(size: Int, color: Color = Ink.Chalk, line: Int = size + 2) =
    TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = size.sp, color = color, lineHeight = line.sp)

fun ui(size: Int, color: Color = Ink.Secondary) = TextStyle(fontFamily = Ui, fontSize = size.sp, color = color)

/** The ring round the screen's edge: a dim track and one lit arc. Angles in degrees from 3 o'clock; -90 is the top. */
@Composable
fun Ring(color: Color, startDeg: Float, sweepDeg: Float, round: Boolean, track: Color = Ink.Raised) {
    Canvas(Modifier.fillMaxSize().padding(2.dp)) {
        val w = 6.dp.toPx()
        val size = Size(this.size.width - w, this.size.height - w)
        val topLeft = Offset(w / 2, w / 2)
        drawArc(track, 0f, 360f, false, topLeft, size, style = Stroke(w))
        if (sweepDeg > 0f) drawArc(color, startDeg, sweepDeg, false, topLeft, size, style = Stroke(w, cap = if (round) StrokeCap.Round else StrokeCap.Butt))
    }
}

fun mmss(seconds: Long): String {
    val s = seconds.coerceAtLeast(0)
    return "%d:%02d".format(s / 60, s % 60)
}

/** "30 sec" or "2 min", the same words as the phone's timer sheet. */
fun lengthLabel(s: Int) = if (s < 60) "$s sec" else "${s / 60} min"
