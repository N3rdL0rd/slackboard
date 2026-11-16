package app.slackboard.client.wear

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class CountdownPlanTest {
    @Test fun a_long_countdown_ticks_at_three_two_one_and_ends_long() {
        assertEquals(listOf(7000L to 40L, 8000L to 40L, 9000L to 40L, 10000L to 700L), CountdownPlan.plan(10_000))
    }

    @Test fun a_countdown_already_inside_its_last_seconds_skips_the_ticks_that_have_passed() {
        assertEquals(listOf(500L to 40L, 1500L to 40L, 2500L to 700L), CountdownPlan.plan(2_500))
        assertEquals(listOf(0L to 700L), CountdownPlan.plan(0))
    }

    @Test fun a_countdown_that_has_ended_has_no_buzz() {
        assertEquals(emptyList<Pair<Long, Long>>(), CountdownPlan.plan(-1))
    }

    @Test fun the_waveform_is_gaps_and_buzzes_in_turn_and_the_long_buzz_is_always_full_strength() {
        val (t, a) = CountdownPlan.waveform(CountdownPlan.plan(3_000), 110)
        // wait 0, tick; wait 960, tick; wait 960, tick; wait 960, long
        assertArrayEquals(longArrayOf(0, 40, 960, 40, 960, 40, 960, 700), t)
        assertArrayEquals(intArrayOf(0, 110, 0, 110, 0, 110, 0, 255), a)
    }
}
