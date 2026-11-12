# slackboard

**Less tension. More sending.**

An open-source climbing logbook and board companion for [Aurora-platform](docs/ARCHITECTURE.md#providers) training boards
(Tension, Decoy, Grasshopper) and MoonBoard. It keeps your climbs on your phone, works offline, lights up boards over Bluetooth,
and tracks climbs that never touch a board.

> Slackboard is an independent project. It is not affiliated with, endorsed by, or sponsored by Tension Climbing, Aurora Climbing,
> Moon Climbing, or any other board maker. Product and brand names belong to their owners and are used only to say what the app works with.

## What it does

**One logbook for every board.** Tension, Decoy, Grasshopper and MoonBoard sit side by side in one app. Grades from every board are
mapped onto one scale, so your stats, working grade and suggestions add up across boards; circuits can hold climbs from any board;
and boards at the same place group together so switching at the gym is one tap. Each brand keeps its own account, and the
combining happens on your phone.

**Boards and climbs**
- Browse every climb for your board with the board drawn properly: real hold art, role colours, mirrored boards, multi-frame routes
  with playback, and a pinch-to-zoom view.
- Filter by grade range, progress, classics, likes, setter, circuits, beta videos and more. Sort by best, newest, hardest and others.
- Swipe between climbs in a list, a circuit, a workout or search results.
- An angle dial for adjustable boards.
- Set your own climbs (boulders and routes), save drafts, publish, edit and delete.

**Logging and progress**
- Log sends and attempts with grade, stars, angle and notes. Offline logs queue on the phone and upload when you are back online.
- Stats: progression of your working grade, weekly volume, grade pyramid, flash rate, streaks.
- Circuits, likes and blocked climbs. A training timer with intervals and vibration cues.

**Beyond the boards**
- Log gym problems and outdoor boulders as sends, flashes or attempts, with wall angle, V or Font grade, style tags, and for
  outdoor boulders a crag and a link (for example Mountain Project). They count in your stats.
- Suggested climbs from your own history: finish what you tried, warm up, work at your level, push a little past your best,
  climb your main wall angle, or try its opposite. A gym card suggests what style of problem to try next.

**Sharing and data**
- Save or share any climb, or a send, as a single clean image.
- Export your logbook as CSV, or make a full backup file and restore it later.

**Everywhere**
- Bluetooth lighting for boards that use the common Nordic UART controllers.
- Spaces: boards that are close together group automatically, so switching boards at a gym is one tap.
- Haptics, high-contrast and shape-coded holds, screen reader labels, and a dark theme throughout.

## Boards

| Board | Status |
|---|---|
| Tension Board (1 and 2) | Full: sign in, sync, browse, log, set climbs, circuits, social |
| Decoy, Grasshopper | Same platform and endpoints as Tension, checked against their apps; account flows are not verified with real accounts |
| MoonBoard | Local only: no account. Problems come from public problem dumps; logging works on the phone and Bluetooth lighting is confirmed on a 2016 MoonBoard |
| Kilter | Not supported: its current app uses a different platform and sign-in |

## Your data

See [PRIVACY.md](PRIVACY.md) for what stays on your phone and what is sent where.

- Climbs, stats and logs live in a database on your phone. Sign-in tokens are kept in the platform keystore.
- The app talks to the service of the board brand you sign in to, and to nothing else, with two exceptions: the gym map loads
  its library and map tiles from the internet, and board photos load from the brand's image server.
- There is no analytics, no advertising, and no account with Slackboard itself.
- Gym and outdoor climbs, MoonBoard logs and unpublished circuits exist only on your phone. Use **You > Export and backup**
  to keep a copy. See [docs/BACKUP.md](docs/BACKUP.md).

## Known limitations

- Bluetooth lighting has been used on a Tension Board 2 and a 2016 MoonBoard. Decoy and Grasshopper use the same protocol but have not been
  tried on hardware. A fake controller for testing is in `scripts/fake-board.py`.
- iOS background tasks are opportunistic, so background sync on iOS runs when the system allows it.
- Real-world behaviour of the Aurora-platform service is inferred from the official app and live checks, so it can change without notice.

## Getting started

Android and iOS builds are on the [releases page](https://github.com/N3rdL0rd/slackboard/releases). To build it yourself, follow the steps below.

```sh
npm install
npm test
npm run typecheck
```

Running the app needs a development build because Bluetooth, secure storage and background sync use native modules.
[docs/BUILDING.md](docs/BUILDING.md) covers Android and iOS builds, signing and CI.

## Project layout

| Path | What is in it |
|---|---|
| `src/core/` | Pure logic with no UI and no platform code: sync engine, API client, frames and LED codecs, grades, filters, stats, suggestions, backup |
| `src/data/` | Database adapter (SQLite on the phone) |
| `src/providers/` | One entry per board service: hosts, Bluetooth names, grade tables |
| `src/state/` | Persisted app state, in-memory data, sign-in sessions |
| `src/ui/`, `src/app/` | Components and screens (file-based routing) |
| `docs/` | Architecture, building, backup format |
| `design/` | Design spec, tokens and reference prototypes |
| `site/` | The landing page, published with GitHub Pages |

More in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Contributing

Bug reports, fixes and new features are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Security issues: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Third-party fonts, libraries and data sources are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Climbs you light up on a board are kept in a local **Lit history** (You > Lit history), by day, for every board, and included in the backup. Gym climbs can be logged from the Climb tab with a one-tap repeat of recent combinations and a grade strip in each grade's colour.

