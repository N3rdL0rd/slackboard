# Future plans

Status: **draft for review**. Nothing here is built. This describes how each planned feature should behave, so the logic can be
argued about before any code is written.

## Decisions so far

| Topic | Decision |
|---|---|
| Roped grade systems | YDS and French only |
| Exercise library | Built in (no user-made exercises at first) |
| "Start session" mode | No. Sessions are simply the entries of one day, at one place |
| Mountain Project, theCrag import | No (limited, paid APIs) |
| Projects and ticklists | No (they duplicate existing features) |
| Streaks | Yes, with a one-day gap allowed. Hangboard and other training days count as climbing days. Count the climbing days, with the span beside it |
| Body and recovery notes | Yes, with a gentle rest nudge |
| Motivation | On by default for everyone, with or without goals ("3 more V4s until you have 10!") |
| Goals and milestones | Yes, drafted below |
| Weekly and yearly reviews | Yes |
| Notifications | Yes, local only, opt-in, with strict limits (section 7) |
| Training and workout planner | Yes. It plans finger strength, pulling, core and other training. Technique is up to the user |
| Navigation | A dedicated **Train** tab with a flexed-biceps icon (section 9) |
| Planner and climb suggestions | Separate. Strength never assigns grades or picks climbs. The Suggested screen stays based on the user's own sends |
| Beginners and finger training | No gate. Anyone can start finger training; the starting loads are just gentler |

## Principles

1. **Everything is computed on the phone from the logs.** Streaks, goals, reviews, nudges and plans are pure functions of the data the
   user already has, so they are testable, work offline, and recompute correctly when an old entry is added or edited.
2. **Calendar day means the phone's local day**, taken from the entry's date. A day is "active" when something was logged on it.
3. **Nudges are advice, not rules.** Every nudge can be dismissed, snoozed or switched off. None blocks anything.
4. **No guilt.** Streaks never "reset to zero" with a sad message; a broken streak just shows the longest one. Notifications are opt-in and limited (section 7).
5. **Not medical advice.** Rest and training guidance are rules of thumb from published training practice. Pain handling is
   conservative: stop, rest, and see a professional if it persists. The app never prescribes training through pain.
6. **Private by default.** Body notes, goals and plans stay on the phone and travel only in the user's own backup file.

## What has to exist first

The features below share a few foundations, which I would build before any of them:

- a way to **add local tables** safely as the app evolves (migrations),
- one **activity registry**, so each kind of log (board send, gym or outdoor boulder, roped climb, training exercise) is one entry
  instead of an edit in a dozen files,
- **sessions as a derived idea** (the day's entries at a place), not a stored "started session",
- the **shared load model** (see below), which streaks' companion nudges, the weekly review and the planner all read.

---

## 1. Roped climbing

### What gets logged

| Field | Choices |
|---|---|
| Style | Sport, trad, top rope, autobelay |
| Setting | Indoor or outdoor (gym or crag name, optional link) |
| Grade | YDS or French. The user picks a preferred system; both are shown |
| Result | Onsight, flash, redpoint, fell, hung, project |
| Optional | Length in metres or feet, pitches, attempts, notes, date |

Quick actions:

- **Another at the same grade**: one tap repeats the last route's style, setting and grade.
- **Autobelay quick log**: "x6 at 5.10c" logs a count at one grade, since volume is the point there.

### Grades

- One roped scale, with YDS and French paired. The app already carries paired French and YDS names for its route grades
  (`route_name` in the grade table), so the pairing can reuse that data rather than a new, disputed conversion table.
- Roped grades are **never silently mixed with boulder grades**. Each discipline has its own scale, its own pyramid and its own stats.
- **Optional personal equivalence, off by default**: the user can say "my V4 is about my 5.11c". Only then do roped sends contribute
  to the cross-discipline "working level" used by suggestions and goals. Conversions between bouldering and roping are rough, so this
  is the user's call, not the app's.

### Stats

- Grade pyramid by result (onsight and flash count more than redpoints, listed separately).
- Routes, pitches and metres per week, and a progression line of the hardest redpoint over time.

---

## 2. Training log and the built-in exercise library

### Logging

Per exercise, the form shows only the fields that exercise uses and pre-fills them from last time ("last: 20 mm, +10 kg, 7 s"):

- Fields available: sets, reps, load (kg or lb, added or total), hang or work time, rest, edge depth (mm), grip type, and effort (1 to 10).
- **Copy last set** and plus/minus steppers keep it fast between sets.
- A **session effort rating** (1 to 10) can be added to a day.
- The existing interval timer is used for hangs and rests.

### The library (starter set)

Each entry has a name, a category, equipment, the fields it uses, a short how-to, a safety note, and a suggested level.

| Category | Examples |
|---|---|
| Finger strength | Max hangs (added weight), max hangs (minimum edge), one-arm lock-off progressions |
| Finger endurance | Repeaters (7 on, 3 off), intermittent hangs (10 on, 5 off), density hangs |
| Pulling | Weighted pull-ups, pull-up ladders, lock-offs |
| Power (advanced) | Campus ladders, dynamic pull-ups |
| Core | Hanging leg raises, front lever progressions, planks |
| Antagonist and shoulder health | Push-ups, reverse wrist curls, scapular pull-ups, face pulls |
| Mobility and warm-up | A standard climbing warm-up, hip and thoracic mobility |

The library also stores the **protocol templates** the planner uses (see section 6), so a "max hang" entry knows its sets, hang time,
rest and effort rules. Exercises and templates are data, not code, so they can be corrected as advice improves.

---

## 3. Streaks

### Definition

A **climbing day** is a local day with at least one logged climb or training session: a board send or attempt, a gym or outdoor
boulder, a roped climb, or a training entry such as a hangboard session. Hangboard-only and other training-only days count.
(Lighting a climb over Bluetooth does not count on its own.)

A streak is a chain of climbing days where **consecutive climbing days are at most 2 calendar days apart**. That allows exactly one
rest day between climbs, so one day on and one day off keeps it alive.

```
climbing days:  Mon  Wed  Thu  Sat  Mon       streak = 5, span = 7 days
gap (days):          2    1    2    2          every gap is 2 or less, so it holds
climbing days:  Mon  Thu                        gap = 3, so the streak broke on Wed night
```

### What the number means

- **Streak** = the number of climbing days in the chain, counted as drafted. The **span** (first to last day) is shown beside it, so
  "5 days over a week" is honest about the rest days.
- **Current streak** is alive while `today - lastClimbingDay <= 2`, and it breaks at the end of the day that is two days after the
  last climb. **Longest streak** is the best chain ever, kept even after a break.
- **State** shown to the user: *alive and climbed today*, *alive, rest day today is fine*, *alive, today is the last day to keep it*,
  *broken* (shows the longest streak, no negative message).

### Edge cases

- Computed from the log, so an old entry added later can extend or repair a streak; deleting one can break it.
- A day with only attempts counts. Days are bucketed by the entry's own date, in the phone's current time zone.
- A trip across time zones can shift an entry by a day. The effect is small and the rule is simple, so I would accept it.

---

## 4. Rest nudges and body notes

### The nudge

Example: "You've been climbing 2 days in a row. Consider taking it easy!" Shown as a small dismissible card on the Climb tab or after
logging, once per day.

**Inputs** (all from the logs): the climbing days of the last week, how hard each was, and any body notes.

**A day counts as "hard"** when any of these hold: a send or attempt at or above the user's working grade, a session effort of 7 or
more, a finger-intensive training exercise logged, or an unusually long day (many more entries than the user's median).

| Rule | Trigger | Message idea |
|---|---|---|
| Back to back | 2 climbing days in a row, and either was hard | "2 days in a row. A lighter day or rest day helps you recover." |
| Three in a row | 3 climbing days in a row, hard or not | "3 days in a row. Take a rest day." |
| Big week | This week's load is more than about 1.5 times the average of the last 4 weeks (with a minimum baseline) | "A big week. Keep a light day in." |
| Fingers | Finger pain or soreness noted today | "Rest your fingers. 48 hours before hard finger work." |

- **Sensitivity setting**: *Relaxed* (3 in a row), *Standard* (2 in a row when hard), *Keen* (2 in a row, always). The default is Standard.
- **Streak-friendly wording**: when a streak is alive, the message says a rest day keeps it going, so advice to rest never fights the streak.
- **Cooling off**: "Not today" snoozes for a day; "Don't show these" switches the feature off. A nudge never repeats the same day.

### Body and recovery notes

An optional, quick check-in per day (a card on the Log tab, never required):

| Field | Values |
|---|---|
| Soreness by area | Fingers, elbows, shoulders, other: none, mild, sore |
| Pain flag | None, achy, sharp (per area) |
| Energy or sleep | 1 to 5 |
| Note | Free text |

**What it drives:**

- Soreness or pain feeds the nudges above and the planner (reduced volume, swapped exercises).
- **Sharp pain** on the fingers marks hard finger work as "hold off" for 7 days in the planner and suggests rest. The app does not
  diagnose anything.
- **Repeated pain** (the same area flagged on 3 or more days within 2 weeks) shows a plain note to rest and consider seeing a physio or
  doctor.
- A simple history view shows soreness against training load, so patterns are visible.

---

## 5. Motivation, goals and milestones

### Default motivation: no goals needed

Every user gets motivation from the logs alone. The app keeps a list of **next milestones** it can compute for the user, and picks the
closest one worth mentioning:

| Kind | Example text |
|---|---|
| Count at a grade | "3 more V4s until you have 10!" |
| New grade | "Your first V5 is one send away from your hardest so far" (only for the next grade up) |
| Send count | "12 sends to reach 100" |
| Consistency | "2 more climbing days to beat your longest streak" |
| Week and month | "1 more day this week to match your best week" |
| Personal best | "You're 3 sends from your best month" |
| Discipline firsts | "Log a first roped redpoint" (only for a discipline the user already logs) |

**Which one is shown:**

- A milestone is a candidate when it is **close**: at most 5 left, or at least 70% of the way there. Far-off targets stay quiet.
- Ties go to the most recently relevant one (the grade just logged), then to variety, so the same message does not repeat.
- **At most one is shown per day**, in one place: a small card under the Climb tab widget, and a line in the toast after logging.
- It never compares the user with other people and never says the user is behind.
- It can be turned off in Settings, and shows nothing until there are enough logs to say something true.

**How it is computed:** each milestone kind is a pure function of the logs that returns `{ current, target, label }`. The shared grade
scale, per-discipline stats and the streak code already exist or are drafted above, so this needs no new data.

### Goals (optional)

A goal is a target the user chooses, with a window, evaluated from the logs. Types:

| Type | Example | Measured by |
|---|---|---|
| Grade | "Send a V5 on my board", "Redpoint 5.11c" | Best send in scope, on the shared grade scale |
| Volume | "20 sends a month", "Climb 3 days a week" | Count of sends or climbing days in the window |
| Consistency | "A 10-day streak" | Streak length (section 3) |
| Training | "2 hangboard sessions a week for 8 weeks", "Add 10% to my max hang" | Training logs, or the planner's retest |
| Custom | Free text with a tick box | The user |

A goal has a **scope** (a board, any board, gym, outdoor, roped), a **window** (this week, this month, until a date, no end), a
**target**, and a **status**: active, achieved, missed or paused. Progress is a number from 0 to 1, recomputed whenever the logs change.
A goal marked achieved stays achieved even if the user later edits the entry that completed it. Goals feed the same "next milestone"
line, so a goal that is close to done takes priority over a default one.

### Milestones

Automatic, never set up, never lost. Examples:

- the first send at each grade band, first flash, first outdoor send, first roped send
- 10, 50, 100, 500, 1,000 sends
- a new hardest grade, the best week, the longest streak, anniversaries of the first log

### Celebrating

- A milestone or goal completion reuses the existing confetti and "Congrats!" toast and the share card.
- A weekly progress ring on the Climb tab widget for an active volume goal.
- **Suggested next goal:** when one is achieved, offer a sensible follow-up from the user's trend (the next grade, or doubling the
  consistency target), with one tap to accept.
- **Never:** no loss-aversion pressure, no "you're falling behind" messages.

---

## 6. Weekly and yearly reviews

### Weekly review (Monday to Sunday, local)

Built from that week's logs and compared with the previous four-week average:

- days climbed, sends, attempts, hardest send, new grades or firsts
- volume against the recent average, in plain words ("a bit more than usual")
- training sessions done against the plan, and the streak
- goal progress, and a one-line body-notes summary if any were logged
- one highlight (a personal best, or the most-repeated climb)

Delivered as a screen on the You tab, with an optional local notification on Monday morning (section 7) and a share image.
An empty week says so briefly and offers nothing to feel bad about.

### Yearly review

- Totals: days, sends, attempts, climbs by discipline.
- Grade pyramid for the year, and a progression line of hardest send and working grade.
- A month heatmap of climbing days, the longest streak, and the best week.
- Top climbs, the most-used board or gym, the hardest send and when it happened.
- Milestones reached and goals achieved.
- A shareable year-in-review image.

Both are computed on the device when opened, using the same functions as the stats screen, so they always match it.

---

## 7. Local notifications

Local only: scheduled on the phone, no server, no push service. Off until the user turns them on, with a permission request the first
time one is enabled (explained first, and never repeated if the user says no).

| Type | When | Example |
|---|---|---|
| Today's plan | At a time the user picks, on days with a planned session | "Today: max hangs, then roped volume." |
| Weekly review | Monday morning (time adjustable) | "Your week is ready: 4 days, 11 sends, a new V4." |
| Streak, last day | Late afternoon, only on the last day that keeps a streak alive and only if nothing is logged yet | "Today keeps your 12-day streak going." |
| Rest day | Only after a hard day, once | "Nice session. Tomorrow is a rest day in your plan." |
| Milestone close | At most weekly, only for the single closest milestone | "3 more V4s until you have 10!" |

**Rules:**

- **One notification a day at most**, and **quiet hours** (default 21:00 to 08:00), with each type on its own switch.
- Each is **scheduled ahead** from the plan and the logs, and **rescheduled or cancelled** when a log or plan changes. Logging the
  session earlier cancels that day's reminder, so the user is never reminded about something already done.
- Tapping one opens the relevant screen (the day's plan, the review, the streak).
- **Honest limits:** the phone decides delivery, so a reminder can be late if the system is saving battery. The number of scheduled
  notifications is capped by the platform (iOS keeps about 64 pending), so only the next couple of weeks are scheduled and the rest
  are scheduled again whenever the app opens.
- **Never** a notification for a missed day, a broken streak or an inactive user.

---

## 8. The training and workout planner

### What it is for

The planner helps the user get **stronger**: finger strength, pulling, core, and the supporting work around them (antagonist and
shoulder health, mobility, and endurance work). **Technique is up to the user** to mix in, so the planner never schedules skill
sessions.

It is deliberately **separate from suggestions**. Strength does not assign grades and does not pick climbs: the user might send V5
on slab but only V2 on overhang, and the Suggested screen keeps working from what the user has actually sent. The planner only
answers "what training would help me get stronger?".

### What the research says (and its limits)

This plan rests on published training practice. Sources are listed at the end. In short:

- **Finger strength:** López-Rivera and González-Badillo's research on dead-hangs. Their "max hangs" protocol: 2 to 5 sets of 5 to 15
  second hangs on a load or edge that would allow about 6 to 20 seconds, leaving a 1 to 5 second margin before failure (typically a
  3 second margin on a 10 second hang), with 3 to 5 minutes of rest between sets. Loads are 75 to 103% of a 7-second maximum. Sessions
  twice or three times a week; recovery is about 48 hours; once a week maintains strength.
- **A standard 8-week cycle:** 4 weeks of max hangs on added weight (on about an 18 mm edge), then 4 weeks on the smallest edge with no
  added weight. Reported strength gains were around 20 to 28% in advanced climbers.
- **Endurance:** in a 2019 trial, repeater-style intermittent hangs (4 to 5 reps of 10 seconds on, 5 seconds off) improved grip
  endurance the most (45%), while max hangs also raised endurance (34%).
- **Periodization:** training is organized in phases, typically base, then strength, then power or power-endurance, then a performance
  phase, with deload weeks.
- **Testing:** a 7-second maximum hang on a 20 mm edge is a common way to measure finger strength.

**Limits to respect.** The finger-strength trials are small (about 26 to 38 people) and used advanced climbers (around 7c+ to 8a, or
5.13a). They do not show how beginners respond. The planner does not hold beginners back from finger training, because it is a
sensible thing to start early, but **it starts them gently**: larger edges or assisted hangs, 2 sets, a bigger effort margin, and
slower progression, with the warm-up and pain rules always on. The recovery times (about 48 hours) are minimums, not guarantees.

### Inputs

1. **Profile**: body weight, how long the user has climbed, and any injury history. Current grades come from the logs.
2. **Goal**: "get stronger in general", a grade, a project, or a dated trip. A date shapes the block (see below).
3. **Strengths and weaknesses**, from three sources, combined:
   - **What the user says**: "strong but get pumped", "weak on steep walls", "weak fingers".
   - **What the logs show** (the style profile, below). No test is needed for this.
   - **Optional tests**, when the user wants numbers:

     | Test | Measures |
     |---|---|
     | 7-second maximum hang on a 20 mm edge, with added weight | Finger strength |
     | Hang to failure on a small edge, no added weight | Finger endurance |
     | Maximum pull-ups, and weighted pull-ups if able | Pulling strength |
     | Hanging leg raises or a front lever hold | Core |

4. **Constraints**: days per week, time per session, equipment (hangboard, weights, campus board, gym access) and any pain flags.

### Style profile from the logs

The app already knows enough to spot a pattern without any test. It compares the user's best sends by **wall style** (slab, vertical,
overhang, from gym and outdoor logs) and by **board** (against gym or outdoor grades):

| What the logs show | What it suggests |
|---|---|
| Overhang or steep grades well below slab and vertical grades (for example V5 slab, V2 overhang) | Strength is the limiter: more finger strength, pulling and core |
| Board grades well below gym and outdoor grades (for example V0 on boards) | The board asks for more finger and pulling strength than the user has yet, so strength work helps most |
| Grades similar across styles | No clear weakness: balanced strength work |
| Roped grades far below bouldering grades | More endurance work, such as repeaters, and base volume |

- A gap counts only with enough sends on each side, and the app says what it saw ("Your overhang grade is 3 below your slab grade").
- This **never lowers or raises any grade shown elsewhere**. It only chooses which qualities to emphasise.
- The user can correct it ("I just don't climb steep much"), and what they say outranks the logs.

### Step 1: choose a block

Plans are **blocks of 6 to 12 weeks**, ending with a retest and a deload week:

| Situation | Block |
|---|---|
| New to finger training, or coming back from a break | Starter block: 2 sets on large edges or assisted hangs, a wide margin, light pulling and core. Finger sessions at most twice a week |
| Strength is the limiter | Finger strength (max hangs on added weight, then on the minimum edge), with weighted pulling and core |
| Endurance is the limiter | Repeater or intermittent hangs, with base volume and core |
| Balanced | Alternating strength and endurance blocks |
| A dated goal | The phases are worked backwards from the date, so the strongest phase lands before it |

### Step 2: lay out the week

The planner places session types (finger strength, pulling and core, endurance, mobility, rest) into the days the user can train,
around the climbing the user already does:

- **At least 48 hours between finger-intense sessions**, and at most 2 or 3 per week.
- Finger strength work goes **at the start of a session**, followed by a rest before climbing.
- **Rest days are placed**: at least 1 or 2 a week, a lighter day after a hard day, and a deload week every 3 or 4 weeks.
- It reads the load model and does not stack heavy training on a day after a big climbing day.

### Step 3: generate each session

For each slot the planner picks exercises from the library and fills the numbers from the user's own tests (or a conservative
default when there are none):

- **Load** for hangs is a percentage of the 7-second maximum scaled for the hang time (about 102% for 5 s, 100% for 7 s, 96% for
  10 s, 94% for 12 s, 90% for 15 s, as published), minus the effort margin, and lower in the first week of a block.
- **Volume** follows the block: sets build across a cycle (for example 3, 4, then 5 sets).
- A short **warm-up** is always included, with ramp-up sets at 50 to 90% of the working load.
- Antagonist, shoulder and core work are added in small doses.

### Step 4: adapt as the user logs

| What happened | Next time |
|---|---|
| Margin well over target (felt easy) | Add a little load or reduce the edge by 1 to 2 mm |
| Margin about right | Hold, and progress on the schedule |
| Margin near zero, effort 9 or more, or a missed rep | Hold or reduce slightly |
| Pain flagged, or soreness high | Swap the exercise, cut volume by 20 to 30%, or rest. Sharp finger pain blocks hard finger work for 7 days |
| Sessions missed | Shift the week, do not cram missed work into fewer days |
| Readiness low (poor sleep or energy) | A lighter version of the same session |

- **Retest** at the end of a block, show the change, and propose the next block from the result.
- If logged climbing already looks heavy (the load model), the plan lightens or moves sessions instead of adding to it.

### How it appears in the app

- A **Plan** card on the Climb tab: "Today: max hangs and pull-ups", with start, swap and skip.
- Planned sessions open the exercise form pre-filled with the target, and use the existing timer for hangs and rests.
- Completed sessions are ordinary log entries, so streaks, goals and reviews see them.
- The rest nudge reads the plan: on a day the plan deliberately made light, it says so instead of warning.
- Skipping or swapping is always one tap and never counts against the user.

---

## 9. Where it lives in the app

A fifth tab, **Train**, drawn with the flexed-biceps icon (Lucide's `biceps-flexed`, redrawn in the app's own stroke style, not an emoji).
The bar becomes Climb, Discover, Train, Log, You.

| Place | What it holds |
|---|---|
| **Train** tab | Today's plan and the week ahead, the exercise library, training progress and retests, the body check-in |
| **Climb** tab | The streak and the day's one motivation line (they matter on the board too), plus a small "Today" plan card that opens Train |
| **Log** tab | Stays the single timeline, and "+ Log" stays the one place to add anything, training included |
| **You** tab | Goals and milestones, the weekly and yearly reviews, notification settings |

- The tab is on by default, with an empty state that explains it in a line and can be hidden in Settings, so people who only want a
  board logbook are not stuck with it.
- The existing **Workout** shortcut (the server-built list of climbs) shares a word with training. It would be renamed to something
  like "Climb workout" so the two are not confused.

---

## Shared: the load model

A deliberately simple, explainable number used by the nudges, the weekly review and the planner:

- **Day load** = a weighted count of the day's climbing entries (sends count more than attempts, harder grades more than easy ones,
  relative to the user's working grade) plus finger-intense training, scaled by the session effort when given.
- **Week load** = the sum of day loads. **Recent baseline** = the average of the previous 4 weeks, with a floor so a quiet month does
  not make a normal week look huge.
- **Spike** = week load above about 1.5 times the baseline. **Back to back** = hard days on consecutive days.
- The model is intentionally rough. It exists to give gentle advice, and its constants are tunable and covered by tests.

## Data to keep (sketch)

- Roped climbs: style, setting, grade (YDS or French), result, length, pitches, link, notes, date.
- Training entries: exercise id, date, sets with reps, load, time, edge, grip, and effort.
- Daily body notes: soreness and pain by area, energy, note.
- Goals: type, scope, window, target, status, dates achieved.
- Milestones: derived from the logs, not stored (only "seen" state is stored).
- Plans: the profile, the active block, planned sessions, and the retest results.
- All of it local, all of it in the full backup (a new section and a new backup version).

## Order I would build it in

1. Foundations (migrations, the activity registry, the load model).
2. Roped logging and stats.
3. Streaks, the body notes with the rest nudges, and default motivation.
4. Training log with the exercise library.
5. Goals and milestones.
6. Weekly and yearly reviews, with local notifications.
7. The planner, last, since it needs the training log, the load model and body notes to exist.

## Open questions

1. **Nudge default**: is "2 days in a row, when either was hard" the right default, or should it fire on any 2 days as in your
   example? (Training-only days now count as climbing days, so this matters a little more.)
2. **Notification defaults**: which types should be on once notifications are enabled? I'd default to today's plan and the weekly
   review, and leave the streak and milestone reminders off.
3. **Style profile thresholds**: how big a gap (for example 2 grades) and how many sends on each side before the app says
   "strength looks like the limiter"?
4. **Units**: kg or lb, mm, and metres or feet; likely a single Units setting.
5. **Milestone wording**: should "Your first V5 is one send away" ever appear, or only counts of what you already do?

## Sources

- López-Rivera, E. and González-Badillo, J.J. (2019). *Comparison of the Effects of Three Hangboard Strength and Endurance Training
  Programs on Grip Endurance in Sport Climbers.* Journal of Human Kinetics 66, 183 to 195. <https://pmc.ncbi.nlm.nih.gov/articles/PMC6458579/>
- López-Rivera, E. and González-Badillo, J.J. (2012). The effects of two maximum grip strength training methods using the same effort
  duration and different edge depth on grip endurance in elite climbers. (Cited in the 2019 paper above.)
- Banaszczyk, J. *Eva López MaxHangs hangboard routine* (a summary of the protocol parameters, load formula and recovery guidance).
  <https://strengthclimbing.com/eva-lopez-maxhangs/>
- Lattice Training. *Finger strength for climbers increases in relation to grade* (the 7-second test protocol).
  <https://latticetraining.com/blog/lattice_data_finger_strength_grades>
- Draper, N. et al. (2015). *Comparative grading scales, statistical analyses, climber descriptors and ability grouping: International
  Rock Climbing Research Association position statement.* Sport Technology 8(3-4), 88 to 94. (An open common scale for comparing grades.)
- Summaries of climbing periodization (base, strength, power, deload) used only for the phase structure:
  <https://boulder-trainer.com/blog/bouldering-training-plan/>, <https://nextgrade.app/blog/climbing-periodization>.

The protocol numbers above come from the papers and the summaries of them. Before any are built into the app they should be checked
against the primary sources again, and the app's wording should always present them as general guidance.
