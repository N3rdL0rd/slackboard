package app.slackboard.client.wear

import android.content.Context
import android.graphics.Color as AColor
import android.os.SystemClock
import androidx.compose.ui.graphics.Color
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * The watch's picture of the phone's climb screen, and the commands that drive it. The phone (src/core/remote.ts) is the source of
 * truth: a command is sent and the result is whatever state comes back. Keep paths and shapes in step with that file, and change
 * VERSION with any change of shape so a phone and watch on different builds say so.
 */
object Remote {
    const val VERSION = 1
    const val STATE = "/slackboard/remote/state"
    const val ACK = "/slackboard/remote/ack"
    const val SUMMARY = "/slackboard/remote/summary"
    const val CMD = "/slackboard/cmd"
}

data class RClimb(
    val id: String, val name: String, val grade: String?, val alt: String?, val numeral: Color, val ring: Color,
    val angle: Int, val mirrored: Boolean, val canMirror: Boolean, val stars: Int?, val sends: Int?, val setter: String, val classic: Boolean,
    val index: Int, val count: Int,
)

/** `endAt` is on this watch's clock (SystemClock.elapsedRealtime), worked out when the state arrived from the time the phone said was left. */
data class RTimer(val endAt: Long, val length: Int)

data class RRunner(
    val phase: String, val label: String, val name: String, val set: Int, val sets: Int, val target: String, val big: String,
    /** Countdown phases: when it ends (elapsedRealtime). Counting phase: when it started. Otherwise 0. */
    val edge: Long, val paused: Boolean, val next: String?, val color: Color,
)

data class RAck(val id: String, val ok: Boolean, val text: String, val at: Long)

data class RSummary(val streak: Int, val streakState: String, val today: String?, val week: Int)

enum class Link {
    /** Nothing asked yet. */
    Idle,
    /** The phone's app has not answered. */
    Waiting,
    /** Phone and watch speak different versions. */
    Mismatch,
    /** Answers are coming. */
    Live,
}

data class RemoteUi(
    val link: Link = Link.Idle,
    val climb: RClimb? = null,
    val timer: RTimer? = null,
    val runner: RRunner? = null,
    val boardName: String = "",
    val boardConnected: Boolean = false,
    val lengths: List<Int> = listOf(30, 60, 120, 300, 600),
    val lastLength: Int = 60,
    val ack: RAck? = null,
    val summary: RSummary? = null,
    /** When the last state arrived (elapsedRealtime), or 0. */
    val stateAt: Long = 0,
    /** True from sending a command until the next state arrives, so the screen can show it is waiting. */
    val pending: Boolean = false,
)

object RemoteState {
    private val _ui = MutableStateFlow(RemoteUi())
    val ui = _ui.asStateFlow()

    fun update(f: (RemoteUi) -> RemoteUi) = _ui.update(f)

    private fun color(s: String?, fallback: Int = 0xFFEDEBE4.toInt()): Color =
        Color(runCatching { AColor.parseColor(s) }.getOrDefault(fallback))

    private fun JSONObject.strOrNull(k: String): String? = if (isNull(k) || !has(k)) null else getString(k)
    private fun JSONObject.intOrNull(k: String): Int? = if (isNull(k) || !has(k)) null else getInt(k)

    /** Reads a state message. Anything that is not the version this watch speaks is refused whole. */
    fun onState(body: String, now: Long = SystemClock.elapsedRealtime()) {
        val j = runCatching { JSONObject(body) }.getOrNull() ?: return
        if (j.optInt("v", -1) != Remote.VERSION) {
            update { it.copy(link = Link.Mismatch, climb = null, timer = null, runner = null, pending = false) }
            return
        }
        val climb = j.optJSONObject("climb")?.let { c ->
            RClimb(
                id = c.getString("id"), name = c.getString("name"), grade = c.strOrNull("grade"), alt = c.strOrNull("alt"),
                numeral = color(c.optString("numeral")), ring = color(c.optString("ring")),
                angle = c.optInt("angle"), mirrored = c.optBoolean("mirrored"), canMirror = c.optBoolean("canMirror"),
                stars = c.intOrNull("stars"), sends = c.intOrNull("sends"), setter = c.optString("setter"), classic = c.optBoolean("classic"),
                index = c.optInt("index"), count = c.optInt("count"),
            )
        }
        val timer = j.optJSONObject("timer")?.let { RTimer(now + it.getLong("left"), it.getInt("length")) }
        val runner = j.optJSONObject("runner")?.let { r ->
            val phase = r.getString("phase"); val ms = r.optLong("ms")
            RRunner(
                phase = phase, label = r.optString("label"), name = r.optString("name"), set = r.optInt("set"), sets = r.optInt("sets"),
                target = r.optString("target"), big = r.optString("big"),
                edge = when (phase) { "on", "off", "rest" -> now + ms; "work" -> now - ms; else -> 0L },
                paused = r.optBoolean("paused"), next = r.strOrNull("next"), color = color(r.optString("color")),
            )
        }
        val board = j.optJSONObject("board")
        val lengths = j.optJSONArray("lengths")?.let { a -> (0 until a.length()).map { a.getInt(it) } }?.takeIf { it.isNotEmpty() } ?: listOf(30, 60, 120, 300, 600)
        update {
            it.copy(
                link = Link.Live, climb = climb, timer = timer, runner = runner,
                boardName = board?.optString("name") ?: "", boardConnected = board?.optBoolean("connected") ?: false,
                lengths = lengths, lastLength = j.optInt("lastLength", 60), stateAt = now, pending = false,
            )
        }
    }

    fun onAck(body: String, now: Long = SystemClock.elapsedRealtime()) {
        val j = runCatching { JSONObject(body) }.getOrNull() ?: return
        update { it.copy(ack = RAck(j.optString("id"), j.optBoolean("ok"), j.optString("text"), now), pending = false) }
    }

    fun clearAck(at: Long) = update { if (it.ack?.at == at) it.copy(ack = null) else it }

    fun onSummary(c: Context, body: String) {
        val j = runCatching { JSONObject(body) }.getOrNull() ?: return
        if (j.optInt("v", -1) != Remote.VERSION) return
        val s = RSummary(j.optInt("streak"), j.optString("streakState"), j.strOrNull("today"), j.optInt("week"))
        update { it.copy(summary = s) }
        SummaryStore.save(c, s)
    }
}

/** Today's figures kept on the watch for the tile and the complication, which run without the app. */
object SummaryStore {
    private const val FILE = "summary"
    fun save(c: Context, s: RSummary) {
        c.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
            .putInt("streak", s.streak).putString("state", s.streakState).putString("today", s.today).putInt("week", s.week).putLong("at", System.currentTimeMillis()).apply()
        Surfaces.refresh(c)
    }

    fun load(c: Context): RSummary? {
        val p = c.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        if (p.getLong("at", 0) == 0L) return null
        return RSummary(p.getInt("streak", 0), p.getString("state", "none") ?: "none", p.getString("today", null), p.getInt("week", 0))
    }
}

/** What the watch asks of the phone. Each is one message that is not queued: a swipe from a minute ago must not run when the phone returns. */
object Commands {
    fun send(c: Context, cmd: String, args: JSONObject.() -> Unit = {}) {
        val id = UUID.randomUUID().toString().replace("-", "").take(16)
        val body = JSONObject().put("v", Remote.VERSION).put("id", id).put("cmd", cmd).apply(args)
        // Moving things show as pending until the phone answers with the next state.
        if (cmd != "hello" && cmd != "bye" && cmd != "mark") RemoteState.update { it.copy(pending = true) }
        val quiet = cmd == "hello" || cmd == "bye" || cmd == "mark"
        Uplink.sendNow(Remote.CMD, body) { ok ->
            // Presence messages fail silently; a swipe or a log that cannot get through says so.
            if (!ok && !quiet) RemoteState.update { it.copy(pending = false, ack = RAck(id, false, "Phone not reachable", SystemClock.elapsedRealtime())) }
        }
    }

    fun hello(c: Context) = send(c, "hello")
    fun bye(c: Context) = send(c, "bye")
    fun next(c: Context) = send(c, "next")
    fun prev(c: Context) = send(c, "prev")
    fun mirror(c: Context) = send(c, "mirror")
    fun light(c: Context) = send(c, "light")
    fun timerStart(c: Context, seconds: Int) = send(c, "timer-start") { put("length", seconds) }
    fun timerStop(c: Context) = send(c, "timer-stop")
    fun log(c: Context, send: Boolean, tries: Int) = send(c, "log") { put("send", send); put("tries", tries) }
    fun runner(c: Context, op: String) = send(c, "runner") { put("op", op) }
    fun mark(c: Context, kind: String, session: String) = send(c, "mark") { put("kind", kind); put("session", session); put("at", System.currentTimeMillis()) }
}
