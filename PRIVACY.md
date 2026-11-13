# Privacy

Last updated: 12 November 2026.

Slackboard has no server of its own. There is no Slackboard account, and no analytics, advertising or crash reporting.

## What stays on your phone

Your climbs, logbook, training, plans, goals, circuits, lit history, settings and backups live in a database on your phone. Sign-in tokens are kept in the
phone's secure keystore. Signing out removes that brand's data from the phone, and uninstalling the app removes everything.

## What is sent, and to whom

- **Your board's service** (Tension, Decoy or Grasshopper). When you sign in, your username and password go to that brand's server, and
  the app then syncs your climbs, logs, circuits and profile with it, as the official app does. If "Log climbs I light up" is on, the
  climbs you light up are recorded there too; you can turn it off in Settings. That brand's own privacy policy covers what it does with
  your data.
- **MoonBoard** has no account. Its problem lists are downloaded from public files on GitHub when you add a board.
- **The gym map** loads its map library from unpkg.com and map tiles from OpenStreetMap, so those servers see your IP address and the area
  you look at.
- **Board photos** are downloaded from the brand's image server.
- **Forgot password** opens the brand's own reset page inside the app. That page uses Google reCAPTCHA.
- **Mountain Project** links open in your browser only when you tap them.

Nothing else leaves your phone, and nothing is shared between brands: the combining happens on the phone.

## Permissions

- **Bluetooth / nearby devices**: to find your board's controller and light up climbs. Nothing from it is sent anywhere.
- **Location**: only when you open Find my gym and allow it, to centre the map and sort gyms. It stays on the phone, which also remembers
  where you added a board so boards in the same place can group together. Older Android versions require this permission for
  Bluetooth scanning, but the app does not read your location for that.
- **Notifications**: only if you turn a reminder on in Settings. They are scheduled on your phone, with no server and no push service, and
  the app asks for the permission at that point, not before.
- **Photos and camera**: to pick or take a profile picture, and to save the images you make of climbs. The app does not read your photo
  library otherwise.

## Files you share

Images, exports and backups go only where you send them.

## Questions

Open an issue at <https://github.com/N3rdL0rd/slackboard/issues>. For anything sensitive, use the private reporting described in
[SECURITY.md](SECURITY.md).
