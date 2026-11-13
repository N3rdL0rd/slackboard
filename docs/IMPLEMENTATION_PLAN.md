# Implementation plan: roped, training, streaks, goals, reviews, notifications

Status: **draft for review**. Nothing here is built. It turns [FUTURE_PLANS.md](FUTURE_PLANS.md) (what each feature does) into the
changes the code needs. The screens and flows are in [../design/TRAIN_UX.md](../design/TRAIN_UX.md).

Decisions already made: a **Train** tab on by default with a flexed-biceps icon, hideable in Settings; the existing **Workout** shortcut
is renamed **Climb workout**; roped is YDS and French only; the exercise library is built in; no "start session" mode (sessions are the
day's entries); training-only days count as climbing days; local notifications, opt-in.

## 1. How the current app is built (what this has to fit)

| Area | Today | Consequence |
|---|---|---|
| Local data | One SQLite file (`slackboard-local.db`) with additive `l_*` tables created by `ensureLocalSchema`, versioned by a single `LOCAL_SCHEMA_VERSION` number that never migrates anything | Needs a real migration list before adding more tables |
| Logs | Board sends are `LogEntry`. Gym and outdoor climbs are `OutsideLog`, shown on their own screen, and mapped into fake `LogEntry`s (`OUTSIDE_PROVIDER`) for stats | A fourth and fifth kind of entry (roped, training) would mean editing about a dozen files again. Needs one activity model |
| Log tab | Reads only board `LogEntry`s, grouped into sessions by day and space (`groupLogSessions`). Gym and outdoor climbs are a link to another list | The unified timeline needs the activity model |
| Stats | `overview(entries)` over `LogEntry`s with one shared V-grade scale | Roped needs its own scale and its own stats, never mixed in |
| State | zustand store `slackboard-v2` (version 1) persisted to AsyncStorage; `useData` loads provider data | New settings need a store version bump and defaults |
| Navigation | Four tabs (`index`, `discover`, `log`, `you`) in `(tabs)/_layout.tsx` | Add `train`, and a setting to hide it |
| Background | `expo-background-task` already runs the sync | Reuse it to reschedule notifications |
| Timer | `core/timer.ts` (pure schedule and clock) and `app/timer.tsx` | The session runner builds on it |
| Haptics, confetti, celebrate | `ui/haptics.ts`, `ui/Confetti.tsx`, `core/celebrate.ts` | Reused for milestones |
| Notifications | None. `expo-notifications` is not installed | New dependency and config plugin |
| Backup | Version 3 (JSON) | Version 4 with the new sections |

## 2. Foundations (build first, in this order)

### F1. Real local migrations

- `src/core/localMigrations.ts`: an ordered list `{ version, up(db) }`. `ensureLocalSchema` reads `l_meta.schema_version`, runs the
  missing migrations in one transaction each, then records the new version. A fresh install runs them all.
- Every new table below is a migration. Version 1 is the existing schema, unchanged.
- The list of local tables is **derived from the migrations**: each table declares whether it is cleared when the user removes their data, and which section of the backup file carries it (or `"none"` with a reason). A test checks every table names a real backup section, so `clearLocalData` and the backup cannot forget one.
- Tests: a database snapshot at version 1 migrates to the latest with no data lost; running twice changes nothing; a failed migration
  leaves the old version in place.

### F2. One activity model

`src/core/activity.ts`:

```ts
type ActivityKind = "board" | "offBoard" | "roped" | "training";
interface Activity {
  id: string;            // globally unique, prefixed by kind
  kind: ActivityKind;
  at: string;            // local "yyyy-MM-dd HH:mm:ss"
  day: string;           // local "yyyy-MM-dd" (see F3)
  title: string;
  counts: { climbing: boolean; hard?: boolean };   // for streaks and the load model
  ref: unknown;          // the underlying record, for opening and editing
}
```

- A **registry** `ACTIVITY_KINDS` holds, per kind: label, icon, how to describe an entry in a list, how to open or edit it, whether it
  counts as climbing, and how it appears in the CSV.
- **Adapters** turn existing records into `Activity`s without changing them: `LogEntry` (board), `OutsideLog`, and the new roped and
  training records.
- `groupLogSessions` is generalised to take `Activity[]`, so the Log tab, stats and reviews all group by day and space the same way.
- **Stats stay per discipline.** The boulder pyramid and working grade keep reading board plus off-board entries on the V scale; roped
  gets its own pyramid on its own scale. Nothing roped is converted to V unless the user turns on the personal equivalence setting.
- Migration of call sites: Log tab, `stats.ts`, `export.ts` CSV, `spaces.ts` sessions, and the share-card helpers. Old special cases
  (`OUTSIDE_PROVIDER` fakes) are removed once the adapters cover them.

### F3. One day model

`src/core/days.ts`: `dayOf(stamp)`, `addDays`, `daysBetween`, `weekStart` (Monday), `monthStart`, and formatting. Calendar arithmetic uses
date parts, never 24-hour millisecond maths, so daylight-saving changes cannot shift a day. Replaces the several private copies
(`at`, `dayKey`, `weekStart` in `stats.ts`, `spaces.ts`, `export.ts`, `litHistory.ts`, and the screens). Tests cover DST changes,
month and year boundaries, and a phone in a different time zone from the entry.

### F4. The load model

`src/core/load.ts` (see FUTURE_PLANS "the load model"): `dayLoad`, `weekLoad`, `baseline`, `isSpike`, `isHardDay`, with every constant
exported and named. Inputs are `Activity[]`, the user's working grade, and optional effort ratings. Used by the rest nudge, the weekly
review and the planner, so all three agree. Tests cover quiet months, the baseline floor, and hard-day rules.

### F5. Settings, units and the store

- New settings, with defaults: `trainTab` (true), `units` (`{ weight: "kg" | "lb", length: "m" | "ft" }`), `motivation` (true),
  `nudges` (`"relaxed" | "standard" | "keen" | "off"`), and `notifications` (per-type switches, time of day, quiet hours).
- The persisted store version goes from 1 to 2, with a migration, and a `merge` step so any setting the stored copy lacks always comes from
  the defaults. `Settings` now lives in `core/settings.ts` (types, defaults, and a safe parser) and is shared by the store, `prefsBackup.ts` and
  the future notification scheduler. A new install gets pounds and feet in the US, Liberia and Myanmar, and kilograms and metres elsewhere.
- Units are used only at the edges: values are stored in kg and metres and converted for display and entry.

### F6. Navigation, icon and the rename

- **Icon:** add `muscle` to `ui/Icon.tsx`, taken from Lucide's `biceps-flexed` (ISC licence) **from the package at implementation time**,
  not from memory, drawn with the app's stroke style. Add Lucide to `THIRD_PARTY_NOTICES.md`.
- **Tabs:** `(tabs)/train.tsx` between Discover and Log. When `settings.trainTab` is false the tab is hidden (`href: null`) and its
  screens stay reachable from the Plan card and deep links.
- **Rename Workout to Climb workout:** labels in the Climb tab quick action and the You shortcuts; the routes `/workouts` to
  `/climb-workouts` and `/workout/[name]` to `/climb-workout/[name]` (files, every `router.push`, and the notification and deep-link
  tables); the sheet and screen titles; README and design docs. The server's own `/workouts` endpoint and the `capabilities.workouts`
  flag keep their names, because they describe the server, not the screen.

## 3. Data model

All tables are `l_*`, local, in the full backup, and cleared by "remove my data".

| Table | Purpose | Key columns |
|---|---|---|
| `l_roped_logs` | Roped climbs | `id`, `style`, `setting`, `name`, `venue`, `link`, `grade_system` (`yds` or `french`), `grade_label`, `grade_value`, `result`, `attempts`, `length_m`, `pitches`, `note`, `climbed_at` |
| `l_training_entries` | One exercise on one day | `id`, `exercise_id`, `performed_at`, `effort`, `note`, `plan_session_id` (null for ad hoc) |
| `l_training_sets` | Sets of an entry | `entry_id`, `position`, `reps`, `load_kg`, `time_s`, `edge_mm`, `grip`, `rest_s`, `margin_s`, `done` |
| `l_day_notes` | Per-day body check-in and session effort | `day` (key), `effort`, `energy`, soreness and pain per area (fingers, elbows, shoulders, other), `note` |
| `l_goals` | Goals | `id`, `type`, `scope`, `window`, `target`, `status`, `title`, `created_at`, `achieved_at` (the three structured columns are validated JSON) |
| `l_nudge_state` | Rotation and snoozes | `key`, `shown_at`, `snoozed_until`, `dismissed` (so one line a day, and no repeats) |
| `l_profile` | Training profile, one row | body weight (kg), start year, equipment, injury note, units, test results history |
| `l_plans` | Plans | `id`, `goal`, `block` (phases and dates), `status`, `created_at` |
| `l_plan_sessions` | Planned sessions | `id`, `plan_id`, `day`, `slot` (finger, pull and core, endurance, mobility, rest), `items` (exercises with targets), `status` (planned, done, skipped, moved), `moved_from` |
| `l_tests` | Test results | `id`, `test`, `value`, `taken_at` |

Static data lives in code, not the database: `src/data/exercises.ts` (the library, stable string ids), `src/data/protocols.ts` (hang
templates, the load-by-time table, progression rules) and `src/data/ropedGrades.ts` (the YDS and French list and pairing).

**Roped grade list.** The pairing is built from the published IRCRA scale (Draper et al. 2015) and **checked against** the paired
names the app already holds in `gradeTable.ts` wherever they overlap. The table there only covers the Aurora boulder range, so easier
and harder roped grades come from the IRCRA list. Any disagreement is flagged in a test, not silently resolved.

**Backup version 4** adds `roped`, `training` (entries and sets), `dayNotes`, `goals`, `plans`, `profile`, `tests` and the new
preferences. Each record is validated with the same untrusted-input rules as today (types, ranges, known ids, dates), and an unknown
exercise id or grade label is skipped and counted. Old files still read. Restoring twice changes nothing.

**CSV** gains rows for roped climbs and training entries, with the activity kind in a new column.

## 4. Core modules (all pure, all tested)

| Module | Responsibility |
|---|---|
| `days.ts`, `load.ts`, `activity.ts` | Foundations above |
| `ropedGrades.ts`, `roped.ts`, `ropedLocal.ts` | Roped types, validation, the quick-repeat helper, per-discipline stats (pyramid, routes and metres per week, hardest redpoint), storage |
| `exercises.ts`, `protocols.ts` | The library and templates (data only) |
| `training.ts`, `trainingLocal.ts` | Training entry validation, last-time prefill, copy-last-set, per-exercise history (best load, volume), storage |
| `streak.ts` | Climbing days, the chain rule (gap of at most 2), current and longest, state (alive, last day, broken), span |
| `body.ts` | Day notes, pain rules (sharp pain blocks hard finger work for 7 days; repeated pain shows the physio note) |
| `nudge.ts` | The rest-nudge rules and sensitivity; reads the plan so planned light days suppress a warning |
| `milestones.ts` | Candidates (count at a grade, new grade, send counts, consistency, best week and month, discipline firsts), the closeness test, ordering, one per day |
| `goals.ts`, `goalsLocal.ts` | Goal types, progress 0 to 1, status changes, "achieved stays achieved" |
| `review.ts` | Weekly and yearly aggregates, comparisons with the four-week average, highlights |
| `styleProfile.ts` | Best send by wall style and by board against gym and outdoor, with sample-size rules and the plain-language reason |
| `planner.ts` | Profile, then block, then week layout (48-hour finger spacing, rest days, deload), then per-session generation from the library and the user's tests |
| `adapt.ts` | Next-session adjustment from what was logged (margin, effort, pain, readiness, missed sessions), retest and next-block proposal |
| `notifications.ts` | Pure scheduler (below) |

Planner determinism: the same inputs always give the same plan (no randomness), so a plan can be explained and tested.

## 5. State and screens' data

- `state/activity.ts`: loads every local list once, builds `Activity[]` through the registry, and refreshes after any write (same pattern
  as `useData` and `refreshUserData`). The Log tab, Climb tab line, reviews and the planner all read from it.
- `state/train.ts`: active plan, today's session, week, and the session runner state (current exercise, set, timer start timestamps).
- `state/goals.ts`, `state/body.ts`, `state/notifications.ts` (permission, preferences, last reconcile).
- All derived values (streak, milestones, nudge, load) are computed with `useMemo` from `Activity[]` and the settings, never stored,
  so an edited or deleted entry corrects them.

## 6. Local notifications

- **Dependency:** `expo-notifications`, with its config plugin; Android 13 `POST_NOTIFICATIONS` permission and one channel ("Plans and
  reviews"); iOS needs no extra string beyond the permission request. The privacy note and notices are updated.
- **Pure scheduler** (`core/notifications.ts`): given the plan, the logs, the settings and `now`, it returns the **desired** list of
  notifications for the next 14 days: `{ id: "kind:day", fireAt, title, body, route }`. It applies the rules in one place: one a day at
  most, quiet hours, per-type switches, no reminder for a day that already has the session logged, and none for missed days or broken
  streaks. This is the part that gets the thorough tests.
- **Reconcile** (`state/notifications.ts`): reads what is already scheduled, then cancels and schedules the difference. Identifiers are
  deterministic, so running it twice does nothing. It runs on app open, after any log or plan change, after settings change, and in
  the existing background task once a day.
- **Rest-end alert** during a session: if the runner is backgrounded mid-rest, one exact local notification at the end of the rest.
  Cancelled when the app returns to the foreground.
- **Deep links:** a tapped notification opens the day's plan, the review, or the streak screen through the router.
- **Limits handled:** iOS keeps about 64 pending, so only 14 days are scheduled; delivery can be late under battery saving, and the
  settings screen says so.
- **Permission flow:** an explanation screen first, then the system prompt, only when the user turns a type on; a "no" is remembered and
  the settings screen shows how to enable it in the system settings.

## 7. Screens and routes

New: `(tabs)/train`, `train/session`, `train/plan-setup`, `train/test`, `train/week`, `train/library`, `train/exercise/[id]`,
`train/progress`, `roped` (the log form), `body` (sheet), `goals`, `goals/new`, `review/week`, `review/year`,
`settings/notifications`. Changed: `(tabs)/index` (Today strip and motivation line), `(tabs)/log` (unified timeline and the "+ Log"
picker), `(tabs)/you` (goals, reviews, notifications), `settings`, `export`, `stats`. The full flows, layouts and copy are in
`design/TRAIN_UX.md`.

Shared pieces extracted from `outside.tsx` so roped and gym logging use the same controls: the wall and style chips, the grade strip
(already exists), the result picker, the stepper and the effort picker.

## 8. Testing

- Unit tests per core module, as above, including the edge cases listed in FUTURE_PLANS (streak gaps, time zones, edits that repair or
  break a streak, deleted entries, quiet months).
- **Migration** fixtures, **backup round trips** for every new table, and the untrusted-file tests (damaged records skipped and counted).
- **Planner**: golden plans for a handful of profiles, plus invariants checked on many generated profiles (never two finger-intense
  sessions within 48 hours, always a rest day, never more than the cap per week, loads within the published ranges, deterministic).
- **Notifications**: the scheduler's output for crafted weeks, and reconcile idempotence against a fake scheduler.
- **On devices**: the emulator for layout and flows; the phone for notifications, haptics and the timer. Notification delivery and
  background rescheduling can only be confirmed on a real phone.

## 9. Order of work

| # | Milestone | Done when |
|---|---|---|
| M0 | F1 to F5: migrations, activity model, days, load model, settings and store version | Existing screens behave identically; all existing tests pass; new foundations tested. **Built.** The activity model has adapters but the Log tab still reads the old lists; it moves to it in M3 |
| M1 | Rename to Climb workout, `muscle` icon, Train tab shell | The tab is there, hideable, and empty states render. **Built.** The shell holds one working action, the interval timer, which is also under You. The Climb tab's top block and Timer entry changed in the same pass: a round **+** menu, one summary line, and the rest timer moved to the climb screen's top bar |
| M2 | Roped: grades, log form, quick repeat, stats, backup and CSV | A roped climb can be logged, edited, backed up and restored. **Built.** Tables: `l_roped_logs` (migration 2). Screens: `/roped` (the form, with "Save and another" and an "Again" row of recent combinations) and `/roped-climbs` (the list, "Another at 5.10c", the pyramid by result, and the last 12 weeks), entered from the **+** menu and You. Backup is version 4, and the CSV gained a `kind` column and roped columns. Roped sends can count toward the boulder working grade through an opt-in setting (Settings > Working grade: one roped and boulder pair the user states, half a V per roped step; `ropedEquivalence.ts`). Not in M2: roped climbs in the Log tab timeline (M3), and the "+ Log" picker (M3). The roped grades below IRCRA 5 (YDS 5.4, French 3) are not offered |
| M3 | Unified Log timeline, streak, default motivation, day notes and nudge | The Log tab shows every kind; streak and the motivation line appear on the Climb tab. **Built.** Pure modules: `streak`, `milestones`, `body`, `nudge`, `logTimeline`, each tested. Table `l_day_notes` and `l_nudge_state` (migration 3), carried in backup version 4 as `dayNotes`. Screens: the Log tab is one timeline of day cards with kind filter chips, the "+ Log" picker, and a body check-in per day; the Climb tab has the Today row (streak, motivation line, rest nudge, "Why?" sheet); the send toast adds a milestone line when one is close. Settings has motivation and rest nudge levels. Not in M3: weekly and yearly reviews (M6), goals (M5). |
| M4 | Training log and the exercise library, the session runner (manual, without a plan) | A hangboard session can be run with the timer and logged. **Built.** Data: `src/data/exercises.ts` (19 exercises with templates). Tables `l_training_entries` and `l_training_sets` (migration 4), backup version 5 (`training`), a `detail` CSV column. Core: `training.ts` (validation, last-time prefill, bests, history), `sessionRunner.ts` (the state machine: hangs and repeaters count down, counted sets wait for Done, rest, skip, add a set, pause, finish early), `reportPain` in `body.ts`. Screens: the Train tab, `/exercises`, `/exercise/[id]`, `/session` (pick, run, summary), `/training/[id]`. Training is an activity, so it counts toward the streak and shows in the Log with a Training filter. Not in M4: resuming a session after the app is closed (the sets already done are saved and shown in the Log), per-set Easy, Right and Hard feedback and the background rest notification (M8 and M6), editing a saved entry (delete and log again), Progress charts beyond each exercise's own, and the protocol tables (M7). |
| M5 | Goals and milestones, celebrations | Goals can be set and complete; milestone toasts fire. **Built.** Table `l_goals` (migration 5, columns `scope_json`, `window_json`, `target_json`), backup version 6 (`goals`). Core: `goals.ts` (types, window rules, `measure`, `resolveGoals`, `suggestNext`, `retryDraft`, templates, validation) and `goalsLocal.ts`. Goal types: grade, volume (sends or days), streak, training (days, optionally finger work only), custom. Windows: this week, this month, until a date (chosen from a few offsets), no end. A goal counts only what is logged from the day it was made (or the start of its week or month). A reached goal is saved as achieved and stays so; an unreached one whose window passed becomes "ended", with a Try again action and no warning. Screens: `/goals`, `/goal-new`, a Goals row on You. The celebration (confetti, "Congrats!", one suggested follow-up) is mounted at the root and shows once per goal; the Climb tab's line prefers a close goal to a default milestone, an active weekly or monthly volume goal draws a ring on the Today row, and the send toast says a close goal when there is no milestone about the grade just sent. Not in M5: recurring goals (a new window each week without setting it again), a test-based "add 10% to my max hang" goal (needs the planner's retests, M8), goal reminders (M6) and goal-based milestones for roped and training sends in their own toasts. |
| M6 | Reviews and the notification system | Weekly and yearly reviews render; reminders schedule and cancel correctly on a phone |
| M7 | Planner: profile, tests, style profile, blocks, week layout, session generation | A plan can be created and followed; the Plan card works |
| M8 | Adaptation, retests, next-block proposal | Logged sessions change the next one as specified |
| M9 | Polish: accessibility pass, copy pass, performance on a large log, docs, privacy note, release | Checklist in the UX plan passes |

Each milestone ends with the full test suite, a typecheck, and a build installed on the emulator (and the phone where it matters),
and is committed on its own.

## 10. Risks

| Risk | Mitigation |
|---|---|
| The activity-model refactor breaks existing logging | It lands first (M0) behind adapters, with every old test passing and new tests on the adapters |
| Streak and goal numbers drift after edits | Always derived, never stored |
| Notifications do not fire when expected | Pure scheduler tested heavily; only the phone can confirm delivery, so M6 includes a device checklist |
| The planner gives poor or unsafe advice | Deterministic, conservative defaults, invariants tested, every decision explained in the UI, pain always overrides |
| Scope growth | Each milestone ships on its own; M7 and M8 can slip without blocking M0 to M6 |
| A 5th tab crowds small phones | Labels stay short; checked on a small emulator profile |

## 11. Not in this plan

Technique sessions in the planner, importing from other apps, any server, social comparison, and strength-based climb suggestions.
