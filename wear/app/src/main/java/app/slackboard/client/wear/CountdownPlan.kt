package app.slackboard.client.wear

import kotlin.math.max

/** The shape of a countdown's buzz, with no Android in it so it can be tested: a tick at 3, 2 and 1 seconds, a long buzz at zero. */
object CountdownPlan {
    const val TICK_MS = 40L
    const val LONG_MS = 700L

    /** The times (ms from now) and lengths of the buzzes for a countdown that ends in `leftMs`. A tick that is already past is left out. */
    fun plan(leftMs: Long): List<Pair<Long, Long>> {
        val out = ArrayList<Pair<Long, Long>>()
        for (s in 3 downTo 1) { val at = leftMs - s * 1000L; if (at >= 0) out.add(at to TICK_MS) }
        if (leftMs >= 0) out.add(leftMs to LONG_MS)
        return out
    }

    /** Timings and amplitudes for `VibrationEffect.createWaveform`: off, on, off, on... starting with the wait before the first buzz. */
    fun waveform(plan: List<Pair<Long, Long>>, strength: Int): Pair<LongArray, IntArray> {
        val t = ArrayList<Long>(); val a = ArrayList<Int>()
        var cursor = 0L
        for ((at, len) in plan) {
            t.add(max(0L, at - cursor)); a.add(0)
            t.add(len); a.add(if (len >= LONG_MS) 255 else strength)
            cursor = at + len
        }
        return t.toLongArray() to a.toIntArray()
    }
}
