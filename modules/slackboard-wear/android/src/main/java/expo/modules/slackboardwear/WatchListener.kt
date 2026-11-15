package expo.modules.slackboardwear

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService

class WatchListener : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        if (!event.path.startsWith(PREFIX)) return
        Inbox.append(applicationContext, event.path, String(event.data))
    }

    companion object {
        const val PREFIX = "/slackboard"
    }
}
