package app.slackboard.client.wear

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/**
 * Records one climbing session with Health Services and streams the heart rate to the phone.
 * It runs as a foreground service so it keeps going with the screen off.
 */
class ExerciseService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val times = ArrayList<Long>()
    private val bpms = ArrayList<Int>()
    private var session: String? = null
    private var startedAt = 0L
    private var calories: Double? = null
    private var running = false
    private var wake: PowerManager.WakeLock? = null

    private val client by lazy { HealthServices.getClient(this).exerciseClient }

    private val flusher = object : Runnable {
        override fun run() {
            sendBatch()
            Uplink.flush()
            if (running) handler.postDelayed(this, BATCH_MS)
        }
    }

    private val callback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val boot = Instant.ofEpochMilli(System.currentTimeMillis() - SystemClock.elapsedRealtime())
            for (p in update.latestMetrics.getData(DataType.HEART_RATE_BPM)) {
                val bpm = p.value.toInt()
                times.add(p.getTimeInstant(boot).toEpochMilli())
                bpms.add(bpm)
                WatchState.update { it.copy(bpm = bpm) }
            }
            update.latestMetrics.getData(DataType.CALORIES_TOTAL)?.let { calories = it.total }
            if (update.exerciseStateInfo.state.isEnded) finish()
        }

        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
        override fun onRegistered() {}
        override fun onRegistrationFailed(throwable: Throwable) {
            fail("Could not read the sensors.")
        }

        override fun onAvailabilityChanged(dataType: androidx.health.services.client.data.DataType<*, *>, availability: Availability) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Uplink.init(this)
        when (intent?.action) {
            ACTION_STOP -> stopSession()
            else -> startSession(intent?.getStringExtra(EXTRA_SESSION))
        }
        return START_NOT_STICKY
    }

    private fun startSession(id: String?) {
        if (running) return
        goForeground()
        val missing = listOf(Manifest.permission.BODY_SENSORS, Manifest.permission.ACTIVITY_RECOGNITION)
            .any { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (missing) return fail("Open Slackboard on the watch once and allow sensors.")

        session = id ?: UUID.randomUUID().toString()
        startedAt = System.currentTimeMillis()
        calories = null
        running = true
        wake = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "slackboard:session").apply { acquire(MAX_SESSION_MS) }

        val config = ExerciseConfig.builder(ExerciseType.ROCK_CLIMBING)
            .setDataTypes(setOf(DataType.HEART_RATE_BPM, DataType.CALORIES_TOTAL))
            .setIsAutoPauseAndResumeEnabled(false)
            .setIsGpsEnabled(false)
            .build()
        client.setUpdateCallback(callback)
        val f = client.startExerciseAsync(config)
        f.addListener({
            try {
                f.get()
                WatchState.update { it.copy(running = true, session = session, startedAt = startedAt, bpm = null, message = null) }
                Uplink.send(Protocol.STATE, stateJson("running"))
                handler.postDelayed(flusher, BATCH_MS)
            } catch (e: Exception) {
                Log.w(TAG, "start failed", e)
                running = false
                fail("Could not start the workout. Another workout may be running.")
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun stopSession() {
        if (!running) return stopSelf()
        val f = client.endExerciseAsync()
        f.addListener({ finish() }, ContextCompat.getMainExecutor(this))
    }

    /** The exercise has ended: send what is left, then the summary, then stop. */
    private fun finish() {
        if (!running) return
        running = false
        handler.removeCallbacks(flusher)
        sendBatch()
        val ended = System.currentTimeMillis()
        Uplink.send(
            Protocol.SUMMARY,
            JSONObject().put("session", session).put("startedAt", startedAt).put("endedAt", ended)
                .put("calories", calories ?: JSONObject.NULL),
        )
        Uplink.send(Protocol.STATE, stateJson("idle"))
        WatchState.update { it.copy(running = false, session = null, startedAt = null, bpm = null) }
        wake?.takeIf { it.isHeld }?.release()
        try {
            client.clearUpdateCallbackAsync(callback)
        } catch (_: Exception) {
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun fail(text: String) {
        WatchState.update { it.copy(running = false, message = text) }
        Uplink.send(Protocol.STATE, stateJson("idle").put("error", text))
        wake?.takeIf { it.isHeld }?.release()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun sendBatch() {
        if (times.isEmpty()) return
        Uplink.send(
            Protocol.HR,
            JSONObject().put("session", session).put("t", JSONArray(times)).put("b", JSONArray(bpms)),
        )
        times.clear()
        bpms.clear()
    }

    private fun stateJson(state: String) =
        JSONObject().put("state", state).put("session", session ?: JSONObject.NULL).put("startedAt", if (running) startedAt else JSONObject.NULL)

    private fun goForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Climbing session", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val n: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentTitle("Climbing session")
            .setContentText("Recording heart rate")
            .setOngoing(true)
            .setContentIntent(open)
            .build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
        else startForeground(NOTIF_ID, n)
    }

    override fun onDestroy() {
        handler.removeCallbacks(flusher)
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "app.slackboard.client.wear.STOP"
        const val EXTRA_SESSION = "session"
        private const val TAG = "SlackboardWear"
        private const val CHANNEL = "session"
        private const val NOTIF_ID = 1
        private const val BATCH_MS = 3000L
        private const val MAX_SESSION_MS = 6L * 60 * 60 * 1000

        fun start(context: Context, session: String?) {
            val i = Intent(context, ExerciseService::class.java).putExtra(EXTRA_SESSION, session)
            ContextCompat.startForegroundService(context, i)
        }

        fun stop(context: Context) {
            context.startService(Intent(context, ExerciseService::class.java).setAction(ACTION_STOP))
        }
    }
}
