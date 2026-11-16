package app.slackboard.client.wear

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import kotlin.math.max

/**
 * Everything the watch feels. A countdown is one waveform built when the end time is known and handed to the system in a single call, so
 * its ticks land on the second whatever the screen is doing, instead of one vibration asked for each second.
 */
object Buzz {
    private val main = Handler(Looper.getMainLooper())
    private var pending: Runnable? = null
    /** When the long buzz of the countdown that is running ends (SystemClock.elapsedRealtime), so a new one waits its turn. */
    private var busyUntil = 0L
    private var alarm: VibrationAttributes? = null
    private var touch: VibrationAttributes? = null

    private fun vibrator(c: Context) = c.getSystemService(Vibrator::class.java)

    private fun amplitude(): Int = if (Prefs.ui.value.strong) 255 else 110

    /** Countdown buzzes are alarms, so a tick from a swipe cannot cut one short; ticks are touch feedback and give way to them. */
    private fun play(c: Context, e: VibrationEffect, isAlarm: Boolean) {
        val v = vibrator(c)
        val a = if (isAlarm) alarm ?: VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM).also { alarm = it }
        else touch ?: VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH).also { touch = it }
        v.vibrate(e, a)
    }

    /** A light tick for a swipe, a tap or a step. */
    fun tick(c: Context) {
        if (!Prefs.ui.value.ticks) return
        play(c, VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK), false)
    }

    /** Something worked (a log saved, a light sent). */
    fun ok(c: Context) {
        if (!Prefs.ui.value.ticks) return
        play(c, VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK), false)
    }

    /** Something did not work. */
    fun no(c: Context) {
        if (!Prefs.ui.value.ticks) return
        play(c, VibrationEffect.createPredefined(VibrationEffect.EFFECT_DOUBLE_CLICK), false)
    }

    /**
     * Buzz as the timer ending at `endAt` (elapsedRealtime) runs out. Replaces any countdown already set. Nothing is handed to the system
     * until three seconds before the end, so ordinary ticks work all through a long timer; then one waveform carries the three ticks and
     * the long buzz. A countdown set while the long buzz of the last one is still going waits for it, so a timer that restarts itself
     * does not cut its own buzz short.
     */
    fun countdown(c: Context, endAt: Long) {
        cancelPending()
        if (!Prefs.ui.value.buzz) return
        val app = c.applicationContext
        val run = Runnable {
            val left = endAt - SystemClock.elapsedRealtime()
            if (left < -200) return@Runnable
            val (t, a) = CountdownPlan.waveform(CountdownPlan.plan(max(left, 0L)), amplitude())
            if (t.isEmpty()) return@Runnable
            play(app, VibrationEffect.createWaveform(t, a, -1), true)
            busyUntil = endAt + 700
        }
        pending = run
        val delay = max(endAt - 3050L - SystemClock.elapsedRealtime(), busyUntil - SystemClock.elapsedRealtime())
        if (delay > 0) main.postDelayed(run, delay) else run.run()
    }

    /** No countdown is running any more. Does not cut a long buzz already under way. */
    fun cancelCountdown(c: Context) {
        cancelPending()
        if (SystemClock.elapsedRealtime() >= busyUntil) vibrator(c).cancel()
    }

    private fun cancelPending() {
        pending?.let { main.removeCallbacks(it) }
        pending = null
    }
}
