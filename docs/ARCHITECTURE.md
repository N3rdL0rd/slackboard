# Architecture

Slackboard is a React Native (Expo) app written in strict TypeScript. The design rule is: **logic lives in plain functions that
can be tested without a phone, and the screens are thin.**

```
src/app/ (screens)  ->  src/state/ (stores)  ->  src/core/ (pure logic)
                              |                        ^
                         src/data/ (SQLite)  ----------+   via the small `Db` interface
                         src/providers/ (one entry per service)
```

## Layers

### `src/core/`: pure logic

No React, no native modules, no platform calls. Everything here has unit tests (`*.test.ts`) that run in Node.

- **API and sync** (`api.ts`, `sync.ts`, `outbox.ts`): a small API client; an incremental sync engine; and an outbox that queues
  changes made offline and sends them in order when the network is back.
- **Database** (`db.ts`, `schema.ts`, `repo.ts`): `Db` is a five-method interface (`exec`, `run`, `all`, `batch`, `transaction`). The app
  implements it with `expo-sqlite`; the tests implement it with `node:sqlite` (`nodeDb.ts`). Queries are plain SQL in `repo.ts`.
- **Climbs**: frame codec (`frames.ts`), grade scale (`grades.ts`, `gradeTable.ts`), filters and sorting (`filters.ts`), swipe
  and circuit helpers.
- **Bluetooth** (`led.ts`, `ble.ts`, `moonboard.ts`): packet encoders and the connection state machine, as pure functions.
- **Progress**: stats (`stats.ts`), suggestions (`suggest.ts`), off-board climbs (`outside.ts`), celebrations (`celebrate.ts`).
- **Data portability**: export and backup (`export.ts`, `backup.ts`); see [BACKUP.md](BACKUP.md).

### `src/data/`

The only place that touches the database engine. `sqlite.ts` opens one database per service plus one local database.

### `src/providers/`

A `Provider` describes one service: its host and image host, how its boards advertise over Bluetooth, which features it supports,
and how its grades map to the shared scale. `tension.ts`, `decoy.ts` and `grasshopper.ts` are small wrappers over the shared
Aurora implementation (`aurora.ts`); `moonboard.ts` is a local-only provider with no server. Adding another Aurora-platform brand
is one new file and one line in `index.ts`.

### `src/state/`

Zustand stores: persisted settings and sign-in sessions (tokens in the platform keystore), the in-memory view of the database,
sync progress, suggestions, the Bluetooth connection.

### `src/ui/` and `src/app/`

Components and expo-router screens. Colours, type and sizes come from `src/tokens.json`, which follows `design/DESIGN_SPEC.md`.

## Data and where it lives

| Data | Where | Survives reinstall? |
|---|---|---|
| Climbs, holes, stats, your server-side logs and circuits | A per-service SQLite database, a mirror of the service | Yes, by signing in and syncing |
| Sign-in token | Platform keystore | No |
| Gym and outdoor climbs, MoonBoard logs, unpublished circuits, spaces | The local SQLite database (`l_*` tables) | **No, unless backed up** |
| UI settings, last angle and filters per board | Persisted app state | No |

The local database is never dropped by a version change; tables are only added or altered by migration. That is deliberate:
it is the one place data exists nowhere else.

## Grades

Every service has its own difficulty numbers. They are mapped to a **shared scale**, the V grade plus a fraction (V3.5 is half way
through V3), so grades from different boards compare. Gym and outdoor grades are offset before they are compared with board
grades (outdoor +1 V, gym -0.5 V); the grade stored and shown is always the one the user logged.

## Providers

The Aurora platform is a plain HTTPS service with form-encoded writes and a table-by-table sync. Services that are not Aurora can be added behind
the same `Provider` interface; MoonBoard is the example of one with no server.

## Testing

```sh
npm test            # unit tests, no device needed
npm run typecheck
```

Tests cover the logic in `src/core/` against an in-memory database, including the sync engine, the outbox, the packet encoders,
filters, stats, suggestions and the backup round trip. Screens are checked by running the app. A fake Bluetooth controller
(`scripts/fake-board.py`) and a command-line sync check (`scripts/live-sync.ts`) exist for manual verification.
