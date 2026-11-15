package app.slackboard.client.wear

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.Looper
import kotlin.math.abs
import kotlin.math.sqrt

/**
 * Motion during a session, reduced to one row a second so it can be streamed and studied: how hard the arm is moving (linear
 * acceleration and rotation, as an average strength and a peak), which way gravity points through the watch (a sign of how the wrist is
 * held), and the air pressure (a second, raw source for height). Raw readings are never kept: at 25 readings a second they would swamp
 * the link. Everything runs on the main thread.
 */
class MotionRecorder(context: Context) : SensorEventListener {
    class Row(
        val at: Long, val accRms: Double?, val accMax: Double?, val gyroRms: Double?, val gyroMax: Double?,
        val pressure: Double?, val gx: Double?, val gy: Double?, val gz: Double?,
    )

    private val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val linear: Sensor? = sm.getDefaultSensor(Sensor.TYPE_LINEAR_ACCELERATION)
    // A watch without a linear-acceleration sensor reports the raw one; its pull of gravity is taken off below.
    private val accel: Sensor? = linear ?: sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyro: Sensor? = sm.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
    private val gravity: Sensor? = sm.getDefaultSensor(Sensor.TYPE_GRAVITY)
    private val pressure: Sensor? = sm.getDefaultSensor(Sensor.TYPE_PRESSURE)

    private val handler = Handler(Looper.getMainLooper())
    private val rows = ArrayList<Row>()
    private var running = false

    private var aN = 0; private var aSq = 0.0; private var aMax = 0.0
    private var gN = 0; private var gSq = 0.0; private var gMax = 0.0
    private var vN = 0; private var vx = 0.0; private var vy = 0.0; private var vz = 0.0
    private var pN = 0; private var pSum = 0.0

    private val tick = object : Runnable {
        override fun run() {
            if (!running) return
            rows.add(
                Row(
                    System.currentTimeMillis(),
                    if (aN > 0) sqrt(aSq / aN) else null, if (aN > 0) aMax else null,
                    if (gN > 0) sqrt(gSq / gN) else null, if (gN > 0) gMax else null,
                    if (pN > 0) pSum / pN else null,
                    if (vN > 0) vx / vN else null, if (vN > 0) vy / vN else null, if (vN > 0) vz / vN else null,
                ),
            )
            aN = 0; aSq = 0.0; aMax = 0.0; gN = 0; gSq = 0.0; gMax = 0.0; vN = 0; vx = 0.0; vy = 0.0; vz = 0.0; pN = 0; pSum = 0.0
            handler.postDelayed(this, 1000)
        }
    }

    fun start() {
        if (running) return
        running = true
        accel?.let { sm.registerListener(this, it, FAST_US) }
        gyro?.let { sm.registerListener(this, it, FAST_US) }
        gravity?.let { sm.registerListener(this, it, SLOW_US) }
        pressure?.let { sm.registerListener(this, it, SLOW_US) }
        handler.postDelayed(tick, 1000)
    }

    fun stop() {
        running = false
        sm.unregisterListener(this)
        handler.removeCallbacks(tick)
    }

    /** The rows since the last call, oldest first. */
    fun take(): List<Row> {
        val out = ArrayList(rows)
        rows.clear()
        return out
    }

    override fun onSensorChanged(e: SensorEvent) {
        val v = e.values
        when (e.sensor.type) {
            Sensor.TYPE_LINEAR_ACCELERATION, Sensor.TYPE_ACCELEROMETER -> {
                val m = sqrt((v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).toDouble())
                val a = if (e.sensor.type == Sensor.TYPE_ACCELEROMETER) abs(m - SensorManager.GRAVITY_EARTH) else m
                aN++; aSq += a * a; if (a > aMax) aMax = a
            }
            Sensor.TYPE_GYROSCOPE -> {
                val m = sqrt((v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).toDouble())
                gN++; gSq += m * m; if (m > gMax) gMax = m
            }
            Sensor.TYPE_GRAVITY -> { vN++; vx += v[0]; vy += v[1]; vz += v[2] }
            Sensor.TYPE_PRESSURE -> { pN++; pSum += v[0] }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    companion object {
        /** 25 readings a second for movement, 5 for the slow signals. */
        private const val FAST_US = 40_000
        private const val SLOW_US = 200_000
    }
}
