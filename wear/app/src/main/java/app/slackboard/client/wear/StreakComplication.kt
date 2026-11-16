package app.slackboard.client.wear

import android.app.PendingIntent
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService

/** The streak as a short text on the watch face: "3d" with the word "Streak". Tapping it opens the remote. */
class StreakComplication : SuspendingComplicationDataSourceService() {
    private fun data(days: Int, label: String): ComplicationData {
        val open = PendingIntent.getActivity(this, 3, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return ShortTextComplicationData.Builder(
            PlainComplicationText.Builder("${days}d").build(),
            PlainComplicationText.Builder(label).build(),
        ).setTitle(PlainComplicationText.Builder("Streak").build()).setTapAction(open).build()
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        if (type == ComplicationType.SHORT_TEXT) data(3, "Streak, 3 days") else null

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        if (request.complicationType != ComplicationType.SHORT_TEXT) return null
        val s = SummaryStore.load(this) ?: return data(0, "Streak, open Slackboard on the phone")
        return data(s.streak, "Streak, ${s.streak} ${if (s.streak == 1) "day" else "days"}. ${streakWord(s)}")
    }
}
