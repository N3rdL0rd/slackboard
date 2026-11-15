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

    /** Watch to phone: {"state": "idle" | "running", "session": id?, "startedAt": ms?, "bpm": n?, "mode": "workout" | "heart-rate"?} */
    const val PONG = "/slackboard/pong"

    /** Watch to phone: the session started or ended. Same shape as PONG. */
    const val STATE = "/slackboard/state"

    /** Watch to phone: {"session": id, "t": [ms...], "b": [bpm...]} */
    const val HR = "/slackboard/hr"

    /**
     * Watch to phone: motion, one row a second, arrays of equal length (null where a sensor gave nothing):
     * {"session", "t": [ms], "a": [acceleration strength m/s2], "am": [peak], "g": [rotation strength rad/s], "gm": [peak],
     *  "p": [air pressure hPa], "gx": [], "gy": [], "gz": [] (gravity through the watch, m/s2)}
     */
    const val MOTION = "/slackboard/motion"

    /** Watch to phone: elevation samples from the workout. {"session", "t": [ms], "m": [metres above sea level]} */
    const val ELEVATION = "/slackboard/elevation"

    /** Watch to phone, when it changes: running totals. {"session", "calories", "gain", "hrAvg", "hrMin", "hrMax"} (null when unknown) */
    const val STATS = "/slackboard/stats"

    /** Phone to watch: report what this watch supports. Answered with CAPABILITIES. */
    const val CAPABILITIES_REQUEST = "/slackboard/capabilities-request"

    /** Watch to phone: {"model", "sdk", "workout": [names], "measure": [names], "passive": [names], "sensors": [names], "samsungSensors": bool, "errors": [text]} */
    const val CAPABILITIES = "/slackboard/capabilities"

    /** Watch to phone, once at the end: {"session", "startedAt", "endedAt", "calories": kcal | null, "gain": metres | null, "hrAvg", "hrMin", "hrMax"} */
    const val SUMMARY = "/slackboard/summary"
}
