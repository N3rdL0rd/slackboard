package app.slackboard.client.wear

import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

/**
 * One glance from the watch face: the streak, today's plan and the week. It shows what the phone last sent and opens the remote when
 * tapped. Fonts are the system's (a tile cannot carry the app's), so it uses the app's colours and weights only.
 */
class SlackboardTile : TileService() {
    private val version = "1"

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val s = SummaryStore.load(this)
        val open = ModifiersBuilders.Clickable.Builder()
            .setId("open")
            .setOnClick(
                ActionBuilders.LaunchAction.Builder().setAndroidActivity(
                    ActionBuilders.AndroidActivity.Builder().setPackageName(packageName).setClassName("app.slackboard.client.wear.MainActivity").build(),
                ).build(),
            ).build()

        fun text(t: String, size: Float, color: Int, bold: Boolean = false) = LayoutElementBuilders.Text.Builder()
            .setText(t)
            .setMaxLines(2)
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder().setSize(sp(size)).setColor(argb(color))
                    .setWeight(if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD else LayoutElementBuilders.FONT_WEIGHT_NORMAL).build(),
            ).build()

        val col = LayoutElementBuilders.Column.Builder().setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
        if (s == null) {
            col.addContent(text("Slackboard", 20f, 0xFFEDEBE4.toInt(), true))
            col.addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(6f)).build())
            col.addContent(text("Open it on your phone once to fill this in.", 13f, 0xFFC5CBC9.toInt()))
        } else {
            val color = when (s.streakState) { "today", "rest" -> 0xFF4FD08A.toInt(); "last" -> 0xFFE8C766.toInt(); else -> 0xFFA3ABA9.toInt() }
            col.addContent(text(s.streak.toString(), 44f, color, true))
            col.addContent(text(if (s.streak == 1) "day streak" else "day streak", 13f, 0xFFC5CBC9.toInt()))
            col.addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(4f)).build())
            col.addContent(text(s.today ?: streakWord(s), 13f, 0xFFEDEBE4.toInt()))
            col.addContent(text("${s.week} ${if (s.week == 1) "send" else "sends"} this week", 12f, 0xFFA3ABA9.toInt()))
        }
        val root = LayoutElementBuilders.Box.Builder()
            .setWidth(androidx.wear.protolayout.DimensionBuilders.expand()).setHeight(androidx.wear.protolayout.DimensionBuilders.expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER).setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder().setClickable(open)
                    .setBackground(ModifiersBuilders.Background.Builder().setColor(argb(0xFF121618.toInt())).build())
                    .setPadding(ModifiersBuilders.Padding.Builder().setAll(dp(14f)).build()).build(),
            )
            .addContent(col.build()).build()
        return Futures.immediateFuture(
            TileBuilders.Tile.Builder()
                .setResourcesVersion(version)
                .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(root))
                .build(),
        )
    }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        Futures.immediateFuture(ResourceBuilders.Resources.Builder().setVersion(version).build())
}
