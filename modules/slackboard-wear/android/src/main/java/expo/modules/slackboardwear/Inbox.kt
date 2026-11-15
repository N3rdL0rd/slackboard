package expo.modules.slackboardwear

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * Messages from the watch wait here until the app reads them. The listener can run with the app
 * closed, so they are kept in a file, one JSON object per line, and nothing is lost between
 * a message arriving and JavaScript being awake.
 */
object Inbox {
    private const val FILE = "wear_inbox.jsonl"
    private const val MAX_BYTES = 4L * 1024 * 1024
    private val lock = Any()

    /** Set by the module while JavaScript is listening, so it can be told something arrived. */
    @Volatile
    var onArrival: (() -> Unit)? = null

    fun append(context: Context, path: String, data: String) {
        val line = JSONObject().put("path", path).put("data", data).put("at", System.currentTimeMillis()).toString()
        synchronized(lock) {
            val f = File(context.filesDir, FILE)
            // A phone that never opens the app must not fill its storage.
            if (f.length() > MAX_BYTES) f.delete()
            f.appendText(line + "\n")
        }
        onArrival?.invoke()
    }

    /** Everything waiting, oldest first. The file is emptied. */
    fun drain(context: Context): List<String> = synchronized(lock) {
        val f = File(context.filesDir, FILE)
        if (!f.exists()) return emptyList()
        val lines = f.readLines().filter { it.isNotBlank() }
        f.delete()
        lines
    }
}
