# Health data: feasibility and plan

Status: **assessment and plan. Nothing is built.** Facts about Health Connect and the library come from their docs; anything about how a particular watch behaves is marked UNKNOWN until tried on real hardware.

## The idea

Read heart rate and other health data from the user's watch, and attach it to what Slackboard already records: a training session, a send, an attempt. Examples:

- Average and peak heart rate for a session, shown in its summary and in the Log.
- Heart rate during one attempt on one climb, with an estimate of the calories it burned.
- Resting heart rate, heart rate variability and sleep as an optional readiness signal for the planner, next to the existing body notes.

## Verdict

**Feasible on Android, in three sizes.**

| Size | What it gives | Effort | Risk |
|---|---|---|---|
| Session level | Average, peak and a small chart for each training session and each day of climbing | Small | Low |
| Readiness | Resting heart rate, variability and sleep feed the plan's "lighter today" rule | Small to medium | Low to medium |
| Per attempt | Heart rate and calories for one climb attempt | Medium, and needs a new interaction | Medium; depends on the watch |

The last row is the interesting one, and it has one hard constraint: **Health Connect is a store, not a live stream.** It holds records the watch's own app has already synced to the phone. That has three consequences.

1. Data for a window arrives **minutes to hours late**. A screen showing an attempt must handle "not here yet" and fill in later. (UNKNOWN: the real delay for a given watch. This is the first thing to measure.)
2. Density depends on the watch. Many record a heart rate sample every few seconds only while a workout is running and much more sparsely otherwise. (UNKNOWN until tried.) Short windows may have a handful of samples or none.
3. There is no live number during an attempt. A live display needs a different source (see "Live heart rate" below).

## What Slackboard has to offer for the time window

An attempt needs a start and an end, and today the app has neither.

| Record | Timing it has | Verdict |
|---|---|---|
| Training session (runner) | Start time, and each set's duration | Good. A window exists already. |
| A logged send or attempt | One timestamp (`climbed_at`) and an attempt count | Not enough. No duration. |
| Board lighting | When a climb was lit | A weak proxy for "about to climb". |

So per-attempt data needs a **timed attempt**: a Start and End on the climb screen (or Start when the climb is lit, End when it is logged). Without it the only option is an estimate: from the previous log entry to this one, labelled as an estimate. That is wrong whenever the user rested, chatted or climbed something that wasn't logged, so it is a fallback, never the default.

## Technology

- **Library:** `react-native-health-connect` (MIT). It ships its own Expo config plugin, so there is no native code to write. It reads `HeartRate`, `ActiveCaloriesBurned`, `TotalCaloriesBurned`, `RestingHeartRate`, `HeartRateVariabilityRmssd`, `SleepSession` and `ExerciseSession` records by time range, with read-only permission per type.
- **Heart rate records** hold a list of samples (time, beats per minute) between a start and an end, so a window is a filter over samples. Calories arrive as interval records and would be split in proportion to how much of each interval falls inside the window. That is an estimate, and the UI must say so.
- **Android versions:** Health Connect is part of Android 14 and later; older versions need the Health Connect app. The library needs `minSdkVersion` 26, and the app is on 24. Raising it drops Android 7 only.
- **Duplicates:** several apps can write the same minute. Aggregate through the platform's aggregate API, or filter by data origin, so nothing is counted twice.
- **Distribution:** sideloaded builds need no review. A Google Play release needs a Health Connect declaration in the Play Console, which can take days. That only matters if the app is ever published there.
- **iOS:** HealthKit is a separate library with different permissions. Out of scope. iOS support in general is untested.

## Privacy

Health data is the most sensitive thing the app would hold, so these rules are part of the design, not polish.

- **Opt-in, off by default,** with a plain explanation before the system permission prompt, like notifications.
- **Read-only.** Slackboard never writes to Health Connect.
- **Local only.** Nothing is uploaded and no server is involved. `PRIVACY.md` gets a Health section before any of this ships.
- **Store the least.** Keep the window's average, minimum, peak and a small downsampled series (at most about 60 points), not the raw samples.
- **Backup:** health values are **excluded from backups unless the user turns on a separate switch**, because a backup file gets shared.
- **Delete:** a single "remove health data" action, and signing out or turning the feature off stops all reading.
- **No judgement.** Show numbers and trends. No heart-rate "zones" with advice, no "you burned X" scoring, and nothing that tells the user they are unfit.

## Data model

One new local table, added through the migration list like the others:

`l_health_windows` : `id`, `ref_kind` (training entry, send, attempt, day), `ref_id`, `start`, `end`, `avg_bpm`, `min_bpm`, `max_bpm`, `kcal` (nullable, estimate), `series_json` (downsampled), `source` (watch or app name when known), `estimated` (the window was inferred), `filled_at`.

A window is created when its record is, with empty values, and **filled lazily** when data arrives. The screens show "Waiting for your watch" or nothing, never a zero.

## Plan, in order

| Step | What | Done when |
|---|---|---|
| H0. Spike | A throwaway dev build that reads the last hour of heart rate on a real phone and watch. Measure how late data arrives and how many samples a 2-minute window holds. | We know the watch's real delay and density (currently UNKNOWN) and can decide on per-attempt. |
| H1. Core | Pure functions: windowing samples, average/min/max, downsampling, proportional calories, an "estimate" flag. Tests against sparse, empty, overlapping and duplicated data. | All edge cases covered. No native code. |
| H2. Plumbing | Library, Expo plugin, `minSdkVersion` 26, the settings switch and explanation, the permission flow, the table and its migration, a "sync now" action. | A session window fills from the watch on a real phone. |
| H3. Sessions | Show average, peak and a small chart on the session summary and the Log day card. | The H0 data shows on a saved session. |
| H4. Attempts | A Start/End attempt control on the climb screen, a window per attempt, the result on the send and on the share card (optional). | Per-attempt heart rate and an estimated calorie figure, labelled as an estimate. |
| H5. Readiness | Resting heart rate, variability and sleep as inputs to `adaptSession`, shown with the reason like the other rules. Default off. | The plan explains a lighter day by the signal that caused it. |
| H6. Backup and privacy | The separate backup switch, the delete action, the `PRIVACY.md` section. | A round-trip test and a deletion test. |

H0 comes first because it decides whether H4 is worth building.

## Live heart rate (optional, later)

For a live number during an attempt, Health Connect cannot help. The better route is **Bluetooth's standard Heart Rate Service** (0x180D): chest straps and many watches in "broadcast heart rate" mode advertise it, and Slackboard already includes a Bluetooth library for the board. Benefits: live, accurate, no sync delay, no Play review. Costs: the user has to enable broadcasting on the watch, and Android must hold two Bluetooth connections (the board and the strap). (UNKNOWN: whether that is reliable on the user's phone.) This would be a second source behind the same window table.

## Risks

| Risk | Handling |
|---|---|
| Sparse or empty data in short windows | Show nothing rather than a misleading number; require a minimum sample count. |
| Sync delay | Fill lazily; never block on it. |
| Calories are estimates, and climbing is a poor fit for most watches' models | Label as estimates; keep it secondary and hidden by default. |
| Permission denied or revoked | The rest of the app is unaffected; the settings screen says how to re-enable it. |
| Health data in a shared backup | Separate switch, off by default. |
| `minSdkVersion` 26 | Drops Android 7 only. |
| Per-attempt control adds a step to logging | Optional and off by default, so the quick log stays quick. |

## Questions for you

1. Is **session-level** data enough to start, with per-attempt only if the spike shows the data is dense enough?
2. Which watch and which phone app does it sync through (Samsung Health, Fitbit, Garmin Connect, Google)? That decides what the spike can answer.
3. Do you want the optional **live Bluetooth** route considered at all?
