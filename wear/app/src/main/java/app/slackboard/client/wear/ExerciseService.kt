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
import androidx.health.services.client.MeasureCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataPointContainer
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DeltaDataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseTrackedStatus
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Records one climbing session and streams the heart rate to the phone. It runs as a foreground service so it keeps going with the
 * screen off.
 *
 * It prefers a real workout (Health Services ExerciseClient), which also gives calories and shows up in Samsung Health. A watch can
 * run only one workout at a time, so when another is running (Samsung Health's own, or an automatic one) it falls back to reading the
 * heart rate alone (MeasureClient), which never conflicts with anything. A workout left behind by an earlier run of this app is ended
 * first.
 */
class ExerciseService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private val worker = Executors.newSingleThreadExecutor()
    private val times = ArrayList<Long>()
    private val bpms = ArrayList<Int>()
    private var session: String? = null
    private var startedAt = 0L
    private var calories: Double? = null
    private var running = false
    private var mode = MODE_WORKOUT
    private var wake: PowerManager.WakeLock? = null

    private val exerciseClient by lazy { HealthServices.getClient(this).exerciseClient }
    private val measureClient by lazy { HealthServices.getClient(this).measureClient }

    private val flusher = object : Runnable {
        override fun run() {
            sendBatch()
            Uplink.flush()
            if (running) handler.postDelayed(this, BATCH_MS)
        }
    }

    private fun addSample(atMs: Long, bpm: Int) {
        synchronized(times) {
            times.add(atMs)
            bpms.add(bpm)
        }
        WatchState.update { it.copy(bpm = bpm) }
    }

    private fun bootInstant() = Instant.ofEpochMilli(System.currentTimeMillis() - SystemClock.elapsedRealtime())

    private val exerciseCallback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val boot = bootInstant()
            for (p in update.latestMetrics.getData(DataType.HEART_RATE_BPM)) addSample(p.getTimeInstant(boot).toEpochMilli(), p.value.toInt())
            update.latestMetrics.getData(DataType.CALORIES_TOTAL)?.let { calories = it.total }
            if (update.exerciseStateInfo.state.isEnded) handler.post { finish() }
        }

        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
        override fun onRegistered() {}
        override fun onRegistrationFailed(throwable: Throwable) {
            handler.post { fail("Could not read the sensors.") }
        }

        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
    }

    private val measureCallback = object : MeasureCallback {
        override fun onAvailabilityChanged(dataType: DeltaDataType<*, *>, availability: Availability) {}
        override fun onDataReceived(data: DataPointContainer) {
            val boot = bootInstant()
            for (p in data.getData(DataType.HEART_RATE_BPM)) addSample(p.getTimeInstant(boot).toEpochMilli(), p.value.toInt())
        }
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
        synchronized(times) { times.clear(); bpms.clear() }
        wake = (getSystemService(Context.POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "slackboard:session").apply { acquire(MAX_SESSION_MS) }

        // The blocking calls to Health Services happen off the main thread.
        worker.execute {
            val picked = beginRecording()
            handler.post {
                if (picked == null) {
                    running = false
                    fail("Could not read the sensors. Is the watch on your wrist?")
                } else {
                    mode = picked
                    WatchState.update { it.copy(running = true, session = session, startedAt = startedAt, bpm = null, mode = mode, message = null) }
                    Uplink.send(Protocol.STATE, stateJson("running"))
                    handler.postDelayed(flusher, BATCH_MS)
                }
            }
        }
    }

    /** Starts a workout if the watch is free to, otherwise heart rate alone. Returns the mode that started, or null if neither did. */
    private fun beginRecording(): String? {
        var tracked = try {
            exerciseClient.getCurrentExerciseInfoAsync().get().exerciseTrackedStatus
        } catch (e: Exception) {
            Log.w(TAG, "could not read the exercise status", e)
            ExerciseTrackedStatus.NO_EXERCISE_IN_PROGRESS
        }
        // A workout of ours that an earlier run left behind would block a new one: end it.
        if (tracked == ExerciseTrackedStatus.OWNED_EXERCISE_IN_PROGRESS) {
            runCatching { exerciseClient.endExerciseAsync().get() }
            tracked = ExerciseTrackedStatus.NO_EXERCISE_IN_PROGRESS
        }
        if (tracked != ExerciseTrackedStatus.OTHER_APP_IN_PROGRESS) {
            try {
                val config = ExerciseConfig.builder(ExerciseType.ROCK_CLIMBING)
                    .setDataTypes(setOf(DataType.HEART_RATE_BPM, DataType.CALORIES_TOTAL))
                    .setIsAutoPauseAndResumeEnabled(false)
                    .setIsGpsEnabled(false)
                    .build()
                exerciseClient.setUpdateCallback(exerciseCallback)
                exerciseClient.startExerciseAsync(config).get()
                return MODE_WORKOUT
            } catch (e: Exception) {
                Log.w(TAG, "workout refused, reading heart rate only", e)
                runCatching { exerciseClient.clearUpdateCallbackAsync(exerciseCallback).get() }
            }
        }
        return try {
            measureClient.registerMeasureCallback(DataType.HEART_RATE_BPM, measureCallback)
            MODE_HEART_RATE
        } catch (e: Exception) {
            Log.w(TAG, "heart rate refused", e)
            null
        }
    }

    private fun stopSession() {
        if (!running) return stopSelf()
        if (mode == MODE_WORKOUT) {
            val f = exerciseClient.endExerciseAsync()
            f.addListener({ finish() }, ContextCompat.getMainExecutor(this))
        } else {
            val f = measureClient.unregisterMeasureCallbackAsync(DataType.HEART_RATE_BPM, measureCallback)
            f.addListener({ finish() }, ContextCompat.getMainExecutor(this))
        }
    }

    /** The recording has ended: send what is left, then the summary, then stop. */
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
        if (mode == MODE_WORKOUT) runCatching { exerciseClient.clearUpdateCallbackAsync(exerciseCallback) }
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
        val t: List<Long>
        val b: List<Int>
        synchronized(times) {
            if (times.isEmpty()) return
            t = ArrayList(times)
            b = ArrayList(bpms)
            times.clear()
            bpms.clear()
        }
        Uplink.send(Protocol.HR, JSONObject().put("session", session).put("t", JSONArray(t)).put("b", JSONArray(b)))
    }

    private fun stateJson(state: String) =
        JSONObject().put("state", state).put("session", session ?: JSONObject.NULL).put("startedAt", if (running) startedAt else JSONObject.NULL)
            .put("mode", if (running) mode else JSONObject.NULL)

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
        worker.shutdown()
        super.onDestroy()
    }

    companion object {
        const val ACTION_STOP = "app.slackboard.client.wear.STOP"
        const val EXTRA_SESSION = "session"
        /** A real workout: heart rate and calories, and it appears in Samsung Health. */
        const val MODE_WORKOUT = "workout"
        /** Heart rate only, used when the watch is already running another workout. */
        const val MODE_HEART_RATE = "heart-rate"
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
