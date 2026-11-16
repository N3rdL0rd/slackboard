package app.slackboard.client.wear

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

/** Commands from the phone. The system starts this service when a message arrives, even with the app closed. */
class PhoneListener : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        Uplink.init(this)
        when (event.path) {
            Remote.STATE -> RemoteState.onState(String(event.data))
            Remote.ACK -> RemoteState.onAck(String(event.data))
            Remote.SUMMARY -> RemoteState.onSummary(this, String(event.data))
            Protocol.START -> {
                val session = runCatching { JSONObject(String(event.data)).optString("session").ifEmpty { null } }.getOrNull()
                try {
                    ExerciseService.start(this, session)
                } catch (e: Exception) {
                    // Android may refuse to start a foreground service from the background.
                    // Fall back to a notification that opens the app and starts when tapped.
                    Log.w(TAG, "background start refused", e)
                    offerStart(session)
                }
            }
            Protocol.STOP -> ExerciseService.stop(this)
            Protocol.CAPABILITIES_REQUEST -> Capabilities.sendToPhone(this)
            Protocol.PING -> {
                val ui = WatchState.ui.value
                Uplink.send(
                    Protocol.PONG,
                    JSONObject().put("state", if (ui.running) "running" else "idle")
                        .put("session", ui.session ?: JSONObject.NULL)
                        .put("startedAt", ui.startedAt ?: JSONObject.NULL)
                        .put("bpm", ui.bpm ?: JSONObject.NULL),
                )
            }
        }
    }

    private fun offerStart(session: String?) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("offer", "Start requests", NotificationManager.IMPORTANCE_HIGH))
        val open = PendingIntent.getActivity(
            this, 1,
            Intent(this, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_AUTOSTART, session ?: "")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        nm.notify(
            2,
            NotificationCompat.Builder(this, "offer")
                .setSmallIcon(android.R.drawable.ic_menu_compass)
                .setContentTitle("Start climbing session")
                .setContentText("Tap to start recording")
                .setAutoCancel(true)
                .setContentIntent(open)
                .setFullScreenIntent(open, true)
                .build(),
        )
    }

    companion object {
        private const val TAG = "SlackboardWear"
    }
}
