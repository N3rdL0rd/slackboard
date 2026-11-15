package app.slackboard.client.wear

/**
 * The messages between the watch and the phone. The phone side is
 * modules/slackboard-wear and src/core/wear.ts; keep the three in step.
 * Every payload is a small UTF-8 JSON object.
 */
object Protocol {
    const val PREFIX = "/slackboard"

    /** Phone to watch: begin a session. {"session": id} */
    const val START = "/slackboard/start"

    /** Phone to watch: end the session. */
    const val STOP = "/slackboard/stop"

    /** Phone to watch: are you there? Answered with PONG. */
    const val PING = "/slackboard/ping"

    /** Watch to phone: {"state": "idle" | "running", "session": id?, "startedAt": ms?, "bpm": n?} */
    const val PONG = "/slackboard/pong"

    /** Watch to phone: the session started or ended. Same shape as PONG. */
    const val STATE = "/slackboard/state"

    /** Watch to phone: {"session": id, "t": [ms...], "b": [bpm...]} */
    const val HR = "/slackboard/hr"

    /** Watch to phone, once at the end: {"session", "startedAt", "endedAt", "calories": kcal | null} */
    const val SUMMARY = "/slackboard/summary"
}
