package app.slackboard.client.wear

import android.Manifest
import android.os.Bundle
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.Text
import kotlinx.coroutines.delay

private val Ground = Color(0xFF121618)
private val Chalk = Color(0xFFEDEBE4)
private val Muted = Color(0xFFA3ABA9)
private val Gold = Color(0xFFE8C766)
private val Green = Color(0xFF34D17D)
private val Red = Color(0xFFF2554D)

class MainActivity : ComponentActivity() {
    private var autostart: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Uplink.init(this)
        autostart = intent?.getStringExtra(EXTRA_AUTOSTART)
        setContent { Screen(autostart) { autostart = null } }
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
private fun Screen(autostart: String?, clearAutostart: () -> Unit) {
    val ui by WatchState.ui.collectAsState()
    val activity = androidx.compose.ui.platform.LocalContext.current as ComponentActivity
    var now by mutableLongStateOf(System.currentTimeMillis())

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
        if (autostart != null) {
            begin(autostart.ifEmpty { null })
            clearAutostart()
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            if (!WatchState.ui.value.linked) Uplink.flush()
            delay(1000)
        }
    }

    Box(Modifier.fillMaxSize().background(Ground), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center, modifier = Modifier.padding(horizontal = 24.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(if (ui.linked) Green else Red, CircleShape))
                Spacer(Modifier.width(6.dp))
                Text(if (ui.linked) "Phone linked" else "Phone not linked", color = Muted, fontSize = 12.sp)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                ui.bpm?.toString() ?: "--",
                color = if (ui.running) Chalk else Muted,
                fontSize = 44.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                if (ui.running && ui.startedAt != null) clock(now - ui.startedAt!!) else "bpm",
                color = Muted,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = { if (ui.running) ExerciseService.stop(activity) else begin(null) },
                colors = ButtonDefaults.buttonColors(backgroundColor = if (ui.running) Red else Gold, contentColor = Ground),
                modifier = Modifier.height(40.dp),
            ) {
                Text(if (ui.running) "Stop" else "Start", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
            if (ui.message != null) {
                Spacer(Modifier.height(4.dp))
                Text(ui.message!!, color = Red, fontSize = 10.sp, textAlign = TextAlign.Center)
            }
        }
    }
}

private fun clock(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    return "%d:%02d".format(s / 60, s % 60)
}
