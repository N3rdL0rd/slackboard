package expo.modules.slackboardwear

import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

/** The phone's end of the Data Layer link to the watch app. See wear/ for the other end. */
class SlackboardWearModule : Module() {
    private val context get() = appContext.reactContext ?: throw IllegalStateException("No context")

    /** The watch to talk to: the one that has the app, else any connected watch. Null when none. */
    private fun watchNodeId(): String? {
        val caps = Tasks.await(
            Wearable.getCapabilityClient(context).getCapability(WATCH_CAPABILITY, CapabilityClient.FILTER_REACHABLE),
        )
        val withApp = caps.nodes.firstOrNull { it.isNearby } ?: caps.nodes.firstOrNull()
        return withApp?.id
    }

    private fun send(path: String, body: JSONObject): Boolean {
        val id = watchNodeId() ?: return false
        Tasks.await(Wearable.getMessageClient(context).sendMessage(id, path, body.toString().toByteArray()))
        return true
    }

    override fun definition() = ModuleDefinition {
        Name("SlackboardWear")
        Events("onWatchMessage")

        OnStartObserving {
            Inbox.onArrival = { sendEvent("onWatchMessage", mapOf<String, Any>()) }
        }
        OnStopObserving {
            Inbox.onArrival = null
        }

        /** True when a watch that has the Slackboard app is connected. */
        AsyncFunction("isWatchReachable") {
            runCatching { watchNodeId() != null }.getOrDefault(false)
        }

        /** Ask the watch to report in. The answer arrives in the inbox as /slackboard/pong. */
        AsyncFunction("ping") {
            runCatching { send(PING, JSONObject()) }.getOrDefault(false)
        }

        AsyncFunction("startSession") { session: String ->
            runCatching { send(START, JSONObject().put("session", session)) }.getOrDefault(false)
        }

        AsyncFunction("stopSession") {
            runCatching { send(STOP, JSONObject()) }.getOrDefault(false)
        }

        /** Messages that arrived from the watch, oldest first, as JSON lines. Empties the inbox. */
        AsyncFunction("drainInbox") {
            Inbox.drain(context)
        }
    }

    companion object {
        const val WATCH_CAPABILITY = "slackboard_watch"
        const val START = "/slackboard/start"
        const val STOP = "/slackboard/stop"
        const val PING = "/slackboard/ping"
    }
}
