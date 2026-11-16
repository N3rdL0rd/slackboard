package app.slackboard.client.wear

import android.content.Context
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject

/**
 * Sends messages to the phone, in order. When the phone cannot be reached the messages wait
 * (up to MAX_QUEUE) and go out on the next attempt, so a walk out of Bluetooth range
 * loses nothing.
 */
object Uplink {
    private const val MAX_QUEUE = 1000

    private class Pending(val path: String, val body: ByteArray)

    private val queue = ArrayDeque<Pending>()
    private var busy = false
    private lateinit var app: Context

    fun init(context: Context) {
        app = context.applicationContext
    }

    fun send(path: String, json: JSONObject) {
        synchronized(queue) {
            if (queue.size >= MAX_QUEUE) queue.removeFirst()
            queue.addLast(Pending(path, json.toString().toByteArray()))
        }
        flush()
    }

    /** Try to send everything waiting. Safe to call at any time. */
    fun flush() {
        synchronized(queue) {
            if (busy) return
            busy = true
        }
        Wearable.getNodeClient(app).connectedNodes
            .addOnSuccessListener { nodes ->
                val phone = nodes.firstOrNull { it.isNearby } ?: nodes.firstOrNull()
                WatchState.update { it.copy(linked = phone != null) }
                if (phone == null) done() else drain(phone.id)
            }
            .addOnFailureListener {
                WatchState.update { s -> s.copy(linked = false) }
                done()
            }
    }

    private fun drain(nodeId: String) {
        val next = synchronized(queue) { queue.firstOrNull() }
        if (next == null) return done()
        Wearable.getMessageClient(app).sendMessage(nodeId, next.path, next.body)
            .addOnSuccessListener {
                synchronized(queue) { queue.remove(next) }
                drain(nodeId)
            }
            .addOnFailureListener {
                WatchState.update { s -> s.copy(linked = false) }
                done()
            }
    }

    /** One message now, not queued: a command that is no use late. `onResult` says whether it was sent. */
    fun sendNow(path: String, json: JSONObject, onResult: (Boolean) -> Unit = {}) {
        val bytes = json.toString().toByteArray()
        Wearable.getNodeClient(app).connectedNodes
            .addOnSuccessListener { nodes ->
                val phone = nodes.firstOrNull { it.isNearby } ?: nodes.firstOrNull()
                WatchState.update { it.copy(linked = phone != null) }
                if (phone == null) return@addOnSuccessListener onResult(false)
                Wearable.getMessageClient(app).sendMessage(phone.id, path, bytes)
                    .addOnSuccessListener { onResult(true) }
                    .addOnFailureListener { WatchState.update { s -> s.copy(linked = false) }; onResult(false) }
            }
            .addOnFailureListener { WatchState.update { s -> s.copy(linked = false) }; onResult(false) }
    }

    private fun done() {
        synchronized(queue) { busy = false }
    }
}
