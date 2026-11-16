package app.slackboard.client.wear

import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester

/** The tile and complication read the figures the phone last sent; this tells the system to draw them again. */
object Surfaces {
    fun refresh(c: Context) {
        val app = c.applicationContext
        runCatching { TileService.getUpdater(app).requestUpdate(SlackboardTile::class.java) }
        runCatching { ComplicationDataSourceUpdateRequester.create(app, ComponentName(app, StreakComplication::class.java)).requestUpdateAll() }
    }
}

/** The words for a streak, as the phone writes them. */
fun streakWord(s: RSummary): String = when (s.streakState) {
    "today" -> "Climbed today"
    "rest" -> "Rest day is fine"
    "last" -> "Climb today to keep it"
    "broken" -> "Start a new one"
    else -> "Log a climb to start"
}
