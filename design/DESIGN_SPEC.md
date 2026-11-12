# Slackboard - design spec for implementation

Slackboard is an independent, open-source alternate client for Tension Board (not affiliated with or endorsed by Tension Climbing). Scope for now: **Tension Board only** (TB1 and TB2). Keep board-specific facts (angles, roles, mirror support, vocabulary) as data, not hard-coded, so other boards can be added later.

Source of truth order: this spec > `tokens.json` > the prototype files in `reference-prototype/`. The prototypes are HTML in a custom template format (`{{holes}}`, `<sc-if>`, `<sc-for>`). Treat them as visual and behavioral reference only. Do not port the markup. Their `renderVals()` functions are the clearest description of each screen's state and logic.

---

## 1. Principles

1. The board is the hero. Dark slate UI, chalk-white type, color reserved for holds and grades.
2. Board context is always visible: which board, which angle.
3. Filter and angle state is always visible and removable. Nothing is applied silently.
4. Logging is quick: pre-filled, 2 taps, undo instead of confirmation.
5. Color is never the only cue (grades carry text, hold roles can use shapes).
6. One word per concept (section 3).

## 2. Brand

- Name: **Slackboard** (lowercase `slackboard` for repo, package, binary). Bundle id suggestion: `app.slackboard.client`.
- Tagline: "Less tension. More sending."
- Do not use "Tension" in the name or logo. Do not use Tension's logos or imagery. Product names such as "Tension Board 2 Mirror" appear only as factual board names.
- Wordmark: lowercase, Caveat Brush, chalk white. Mark: a sagging chalk curve (catenary) ending in two dots. SVG in `assets/slackboard-mark.svg`.
- Required disclaimer (Welcome screen footer, Settings > About, README): "Slackboard is an independent project and is not affiliated with or endorsed by Tension Climbing."

## 3. Vocabulary (use everywhere)

| Concept | Use | Do not use |
|---|---|---|
| A user's physical wall | **Board** | Wall, Custom |
| Benchmark climb | **Classic** | Benchmark |
| A logged completion | **Send** | Ascent |
| Failed tries without a send | **Attempts** | Bids |
| Climb with no grade at the current angle | **Project** | - |
| Recently displayed on LEDs | **Recently lit** (not designed yet) | Exhibits |
| Climb | **Climb** (boulder/route is a type) | Boulder as the generic word |
| Circuit | **Circuit** | Label |

## 4. Design tokens

Full values in `tokens.json`. Summary:

**Surfaces:** ground `#121618`, card `#1A2023`, raised `#232A2E`, board `#0C0F10`. Lines: `#2F383D` default, `#3A454A` strong, `#1E2528` list divider. Sheet scrim `rgba(5,8,9,0.62)`.

**Text:** primary `#EDEBE4`, secondary `#C5CBC9`, muted `#A3ABA9` (lowest allowed for body-size text), caption `#9BA4A2`, placeholder `#8F9896`.

**Primary button:** fill `#EDEBE4`, text `#121618`. Disabled: fill `#2F383D`, text `#A3ABA9` (the label says why, for example "Pick a hold set").

**Hold roles:** start `#34D17D`, middle `#4C8DFF`, finish `#FF5A52`, foot only `#E357D9`. Drawn as rings (3.5px stroke) with a soft glow of the same color. Shape mode (Settings): start = square, middle = circle, finish = triangle, foot = diamond. High contrast: all chalk white, shapes forced on.

**Grade colors** (two grades per band, lower bound inclusive; chip text is always the grade):

| Grades | Fill | Text | Border |
|---|---|---|---|
| VB, V0 | `#F49AC2` | `#101416` | same as fill |
| V1, V2 | `#5AA9FF` | `#101416` | same as fill |
| V3, V4 | `#4FD08A` | `#101416` | same as fill |
| V5, V6 | `#F2F0EA` | `#101416` | same as fill |
| V7, V8 | `#F2554D` | `#101416` | same as fill |
| V9 and up | `#050607` | `#EDEBE4` | `#EDEBE4` 1.5px (fill alone is 1.1:1 on the ground) |

Text contrast on fill: 9.0, 7.5, 9.5, 16.3, 5.5, 17.0 (all pass). Red must use dark text.

**Stars:** on `#E8C766`, off `#46515A`. Classic tag: text `#E8C766`, 1px border `#6B5D2E`, 10.5px bold uppercase.

**Typography:** Barlow Condensed (600/700) for headings, climb names, grades and numerals. Barlow (400/500/600) for UI text. Caveat Brush only for the wordmark and friendly empty-state headlines.
Scale: screen title 34-36; sheet title 28; climb name in list 22; climb name in view 32; grade chip 26 (list) / 44 (view); body 16-17; secondary 13.5-14.5; section label 13 uppercase, letter-spacing 0.8, weight 600; nav label 12.

**Shape and size:** minimum touch target 44. Buttons 48-56 tall. Chips 36-44. Radius: thumbnails 8-10, cards 14-16, inputs 12-14, pills fully round, sheets 24 on top corners, board 14. Bottom nav 76 (4 equal tabs). Screen padding 16-20. Board view: full width minus 32 padding, square.

**Do not use:** emoji, gradients as decoration, left-border accent cards, fake status bars or keyboards.

## 5. Navigation

Bottom tabs: **Climb**, **Discover**, **Log**, **You**.
- Climb: board switcher (sheet), angle (sheet), filters (sheet), climb list > Climb view > Log send (sheet). "Set a climb" and "Add a board" are pushed screens.
- Discover: search with scopes; News; Leaderboards; bell opens **Activity** (pushed).
- Log: the user's sessions.
- You: profile, boards, shortcuts; gear opens **Settings** (pushed). Sign out is in Settings.
Each tab keeps its own back stack; tapping the active tab pops to root. Remember last selected tab.

---

## 6. Screens

Each section lists: purpose, layout, states, and what data and behavior it needs. "File" is the prototype in `reference-prototype/`.

### 6.1 Welcome / sign in (`Main.dc.html`)
Entry when there is no session. Sign in is the default (the official app defaulted to sign up). Fields: username, password; "Sign in"; "Forgot password?" (opens the external reset URL, no in-app flow); "Create an account". Footer: "Sign in with your existing Tension Board account." plus the disclaimer.
Not designed: sign-up form (username, password, email; mailing-list opt-in must default **off**), inline field errors, "too many requests" message, first-run sync screen (needs progress, not just a spinner).

### 6.2 Climbs (`Climbs.dc.html`) - the home screen
Layout, top to bottom:
1. Board chip (board thumbnail, name, "12x12 - adjustable" or "10x8 - fixed 35 deg") opens the Board sheet. LED button on the right with a status dot (grey = disconnected).
2. Row: **angle pill** (caption ANGLE, or FIXED for non-adjustable boards, then the number), **search field** (climb name), **filter button** with a badge showing the count of active filters (sort does not count).
3. Chips row: one removable chip per active filter, then a "Sort: X" chip (opens the filter sheet), then "Reset" when anything is active.
4. Count line: "N climbs at A deg".
5. List rows. Empty state when no climbs match: "Nothing on the board" with a "Reset filters" button.
6. Floating "Set a climb" button, only if the user has the `set_boulder` or `set_route` permission.

Row anatomy: 64px board thumbnail with role dots; climb name; "setter - N sends"; stars; Classic tag; right side: grade chip (band color), the second grade scale in muted text, status text ("Sent" or "Tried"). Whole row links to the Climb view, which pages through this same filtered list.
Not designed: row variants for Project (no grade at this angle), Draft, Blocked, Liked, mirrored-send checkmark, circuit chips.

**Filter sheet** (bottom sheet, up to 86% height, sticky footer button "Show N climbs", which reads "No climbs match" and is disabled at zero):
- Grade: horizontal strip V0-V10, tap a start grade then an end grade; each button is outlined in its band color and fills when in range.
- My progress: segmented Any / Not tried / Tried / Sent.
- Climb: toggle chips Classic only, Liked, Has beta video, Tall, Side climbs, Boulders (Routes needs a matching chip when route support is added).
- Also show: Open projects, My drafts, Blocked.
- Rows: Setter (opens a searchable picker), Circuits (any/all/none picker). Both are shown as plain rows in the prototype but their pickers are not designed.
- Sort: Best, Newest, Hardest, Easiest, Most repeats, Random. (The app also has Oldest and Least repeats; add them if wanted.)
- "Reset" in the header.

**Board sheet:** your boards (name, full product/size/angle line, "Current" marker), "Add a board", then "Gyms near you" (placeholder rows) and "Find more on the map". Selecting a board switches context and closes the sheet.
**Angle sheet:** 4-column grid of angles 0-65 in steps of 5 (TB2). Explainer: grades, stars and sends are tracked per angle; climbs nobody has sent at this angle show as projects. Not shown when the board is fixed-angle.

State (per board, device-local, persisted per user + board, restored on launch):
`board, angle, gradeMin, gradeMax, progress, classic, sort, toggles{liked,beta,tall,side,projects,drafts,blocked,boulders}, searchText`.

### 6.3 Climb view (`ClimbView.dc.html`)
Top bar: back, like (toggle, filled when liked), share (system share of the climb link), more (report, block, edit/publish for own drafts, delete for own climbs, timer, resize board; keep them out of the main bar).
Header: climb name, "Set by user - N sends at A deg", stars, Classic tag, grade chip (band color) with the second scale under it.
Board: square render. Overlays: previous/next arrows (page through the list), Mirror toggle (only if the layout supports mirroring), "N of total" label.
Below the board: **angle strip** (chips for 30-55 deg; each shows the climb's grade at that angle plus a band-color bar; "Project" when no grade; tapping changes the viewed angle), role legend (Start, Middle, Finish, Foot only), chips: Beta (count), Circuits, Info.
Bottom bar: LED "light up" button, **Attempt**, **Log send** (becomes "Sent - Edit" after saving).
**Log sheet:** segmented "Log send" / "Attempts only". Shows climb, angle, side (Original/Mirrored, with a toggle). Attempts stepper (1-100; with 1 under Log send it means a flash). Send mode adds: "How hard did it feel?" three grade options around the community grade (default = community grade), Quality 1-3 stars (default = community quality), Notes (max 255, show a counter), When (default now, Change opens date and time pickers). Save button label: "Save send" / "Save attempts". After saving: toast "Flash logged" or "Send logged - N attempts" with **Undo**; the Log send button shows the sent state.
Rules from the official app to preserve: notes over 255 characters must be blocked in the UI, not fail on save; mirror state is saved with the send (`is_mirror`) and must be visible in the sheet; attempts = `bid_count`; "Attempts only" creates a bid, not a send; do not seed grade or stars silently from other users' data unless the community has enough sends (the app uses more than 99). Show what will be saved.
Not designed: route (multi-frame) playback toolbar, timer picker, beta videos list, info/logbook/comments tabs, report flow, block confirmation.

State: `currentClimbIndex, viewAngle, mirror, liked, sheet, mode(send|attempt), attempts, stars, gradeDelta, logged, toast`.

### 6.4 Set a climb (`SetClimb.dc.html`)
Close (discard; confirm if anything is placed), title "Set a boulder", "At 40 deg" chip (setter's angle, stored with the climb), LED button. The board shows tappable holes. Role palette: Start / Middle / Finish / Foot only, each with its live count. **Pick a role, then tap holes**; tapping a hole that already has the selected role removes it; tapping a hole with another role replaces it. Status chips: "1-2 start", "1-2 finish", "N / 35 holds" (met = chalk with filled dot).
Below: Name field, "Save as draft" switch with help text that changes with the switch (draft: can be edited and published later, published climbs cannot be changed; off: publishes right away). Bottom: one line naming the first unmet requirement, then the button ("Save draft" or "Publish boulder"), disabled until valid.
Validation to enforce (from the official app): boulder = exactly 1 frame; 2 to 35 holds (product min/max); 1 to 2 start; 1 to 2 finish; name not blank, no profanity, not already used, at most 100 UTF-8 bytes (the prototype caps at 50 characters; use the server rule); description at most 255 bytes. Block adding past the max with a visible message, not silently.
Not designed: routes (frames, duplicate/delete frame, pace, 5-100 frames), description and "No matching" fields (add them to a details step or a collapsed section), discard confirmation, publish confirmation, color-blind shapes on this screen (should follow the Settings choice).

### 6.5 Add a board (`AddBoard.dc.html`)
Three steps, no auto-advance, explicit Continue/Back, progress bars on top.
1. Which board is it? Cards with a picture: Tension Board 2 Mirror, Tension Board 2 Spray, Tension Board (original). Product is derived from the choice. Pictures here are placeholders; use real layout images.
2. Size and setup: size cards drawn to proportion (TB2: 12x16, 12x12, 10x12, 12x8, 10x8, high x wide); hold sets as toggle chips (Wood, Plastic; plus Wood expansion and Plastic expansion for 12x16); Adjustable/Fixed segmented control; angle chips 0-65. Continue is disabled until at least one hold set is chosen, and the label says so.
3. Name it: board name (required), controller serial (optional, with explanation that it enables Recently lit), summary card. Button "Create board".
Data comes from the synced layout/size/set tables; valid combinations come from `product_sizes_layouts_sets`. Skip a step when it has exactly one option. Locked layouts ask for a password. Original-board sizes use different names (Full Wall, Half Kickboard, and so on); the prototype only shows TB2 sizes.
Idea, not in the official app and not confirmed feasible: fill the serial automatically after the first LED connection (it is parsed from the Bluetooth device name after `#`).

### 6.6 Discover (`Discover.dc.html`)
Title, bell (badge = unread activity, links to Activity). Search field, scope chips: All, Climbs, Climbers, Circuits. With a query: grouped results (climbs with thumbnail and grade chip, climbers with avatar/verified/Follow, circuits as colored chips with owner and count) and an empty state. Without a query: Leaderboards row and News cards (image-only cards from the news feed; image links open a climb or circuit if the URL matches, otherwise the browser). Search is debounced (600 ms query, 200 ms scope change in the official app). Server search; the prototype filters local mock data.

### 6.7 Activity (`Activity.dc.html`)
Filter chips with labels: All, Sends, New climbs, Likes, Follows. The selected filter is visible and persisted. Rows: avatar, "user action", relative time, optional detail and comment, unread dot. Follow requests have inline **Accept / Decline**; after acting the row shows the outcome. Fix from the official app: no raw debug text for unknown states, and times must be parsed as 24-hour UTC (the official app uses a 12-hour pattern by mistake). Missing: pagination, pull to refresh, a no-network state.

### 6.8 Log (`Log.dc.html`)
Range tabs Day / Week / Month / Year / All (persist per user; default Month in the prototype, the official default is All). Three stats: Sessions (distinct days), Sends, Climbs (distinct). "Sends by grade" bars colored by grade band. Entries grouped by day with a readable heading ("Sat, Oct 31", never the raw date) and a subline ("2 sends - 1 failed attempt"). Entry: time, name, meta (angle, Mirrored, attempts), Flash tag, grade chip and stars; attempt-only entries have no chip. Per-entry menu: Edit (reopens the log sheet), Delete (a confirmation dialog, not a full screen; support undo). Viewing another user's log hides the menu. Empty state included.
Not designed: tapping an entry (opens the climb view at that entry), filters by board or grade.

### 6.9 You (`Me.dc.html`)
Avatar, username, name, verified badge, follower and following **counts** (the official app never shows them), Edit profile, Instagram. Banner "N follow requests" (links to Activity). My boards cards (open that board in Climb) + Add a board. Shortcut list: Log, Circuits, Drafts you set, Beta videos, Leaderboards, with counts. Circuit chips preview. Private-account label for other users' private profiles. Not designed: Edit profile form, followers/following lists, other users' profile variant (Follow button states: Follow, Follow back, Requested, Following), gym profile variant.

### 6.10 Settings (`Settings.dc.html`)
- Grades: display V and Font, V only, or Font only (new; the app has no such setting). Legend of grade-band colors.
- Reading the board: live preview of the four role markers. Switches: "Shapes as well as colors"; "High contrast" (forces shapes on and draws holds chalk white); "Auto connect".
- Auto disconnect: Off / 30 sec / 1 min / 5 min (the official app has 17 steps; fewer shown here, extend if needed).
- Account: signed-in username, Sign out, Delete account (bottom sheet: password, "I understand" switch, destructive button enabled only when both are set; this is a stricter flow than the official one).
- About: mark, wordmark, disclaimer, Source code, Licenses.
Settings are stored per user on the device.

### 6.11 Grade colors (`GradeColors.dc.html`)
Reference board for section 4.

---

## 7. Data and behavior notes (from the reverse-engineered app)

- **Entities used:** Board (the app's "wall": uuid, name, layout, product size, hold sets, angle, is_adjustable, optional controller serial), Climb, ClimbStat per angle (ascent count, community grade, benchmark grade, quality), Ascent, Bid, Circuit, Profile, Follow, Notification.
- **Angle:** per-board local preference, otherwise the board's default angle. Non-adjustable boards are fixed. Climb stats exist per (climb, angle); show "Project" when there is no stat at the viewed angle, and still show the nearest-angle grade in the angle strip.
- **Grades:** internal difficulty ids 10-33 are listed (4a/V0 to 8c+/V16). Boulders show the boulder name; routes show the route name. The new Settings option only changes which name or names are displayed.
- **Offline-first:** climbs and filters run against the local database; logs save locally then sync. Show a pending/synced state for logs (not designed).
- **Quick-log replacement:** the official app's "Quick Log Ascent" is replaced by the pre-filled sheet. A one-tap "log the prefilled send" could be added as a long-press or swipe if wanted, but it must still show what it saved and offer Undo.
- **Deep links:** the official app declares `https://tensionboardapp2.com/climbs/<uuid>` and `/circuits/<uuid>` but never opens them. Slackboard should: open the climb or circuit if signed in, and keep the target through sign-in.
- **Permissions:** gate Set a climb, Classic marking and similar actions by the user's permissions; hide them if absent.
- **Hold geometry:** the prototype board is a placeholder 12x12 grid. Real hole positions, hold images and mirror groups come from the app's data (`holes`, `placements`, `placement_roles`, product size edges and images). Until that is available, build the board view against an interface (hole id, x, y, mirror group, default role), not against a grid.

## 8. Accessibility requirements

- Real buttons and links for everything tappable. Icon-only buttons need labels.
- Text contrast at least 4.5:1 (3:1 at 24px and above). The palette above already meets this.
- Hold roles and grades are never conveyed by color alone (grade text in chips; role shapes setting).
- Switches expose on/off state. Chips that toggle expose pressed state.
- Support system text scaling at least to 130% in lists and sheets.

## 9. Not designed yet / open decisions

Real hold assets and geometry (needed for Set a climb and Climb view); route support (frames, playback, pace); circuits (create, edit, reorder, add climb to circuits); climb Info/Logbook/Comments tabs; Beta videos; Workouts ("Workout AI") and its Options sheet; Recently lit (exhibits); LED connect dialog and permission flows; Resize board / choose board for a climb; profile edit; followers lists; setter and circuit pickers for filters; report and block flows; onboarding/sync; error and offline states; light theme; tablet layout; the exact implementation stack.

## 10. Prototype index

| File | Screen |
|---|---|
| `Main.dc.html` | Welcome / sign in |
| `Climbs.dc.html` | Climb list, filters, board and angle sheets (interactive) |
| `ClimbView.dc.html` | Climb view, log send/attempts (interactive) |
| `SetClimb.dc.html` | Set a boulder (interactive) |
| `AddBoard.dc.html` | Add a board, 3 steps (interactive) |
| `Discover.dc.html` | Search, News, Leaderboards (interactive) |
| `Activity.dc.html` | Activity and follow requests (interactive) |
| `Log.dc.html` | Log with ranges and chart (interactive) |
| `Me.dc.html` | You |
| `Settings.dc.html` | Settings (interactive) |
| `GradeColors.dc.html` | Grade color reference |
| `canvas.json` | Artboard layout on the canvas |

All mock data (climb names, setters, counts, "[Gym name]", "[News image]") is placeholder and must not ship.
