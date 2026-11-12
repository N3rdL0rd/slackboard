# Security policy

## Reporting a vulnerability

Please report security problems **privately**, not in a public issue. Use GitHub's private vulnerability reporting
("Report a vulnerability" under the repository's Security tab). Include what you found, how to reproduce it, and what you think
the impact is. You will get a reply as soon as a maintainer can read it.

## What counts

- Anything in the app that exposes sign-in tokens or personal data, or sends them somewhere unintended.
- Unsafe handling of files or links the app opens (for example the backup restore, shared links, the gym map page).
- A way for a malicious backup file, link or Bluetooth device to make the app do something harmful.

## Out of scope

- Behaviour of a board maker's own service or app. Please report those to the board maker.
- Findings that need a rooted or already-compromised device.

## Good practice for users

- Keep a backup of your data (**You > Export and backup**); some of it exists only on your phone.
- Install the app from this project's releases or build it yourself. Treat a build from anywhere else as untrusted.
- Never post a session token or a backup file in a public place; both contain personal data.
