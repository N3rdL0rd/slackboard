# Contributing

Thanks for helping. This is a small project; a short, focused change that explains itself is the easiest to review.

## Set up

```sh
npm install
npm run typecheck
npm test
```

To run the app on a device, see [docs/BUILDING.md](docs/BUILDING.md). Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first if you
are adding a feature: most logic belongs in `src/core/` as a pure function with a test, and the screen stays thin.

## Before you open a pull request

- `npm run typecheck` and `npm test` pass.
- New behaviour has a test, ideally in `src/core/`. Tests should check behaviour a user would notice, not how it is wired.
- UI changes follow `design/DESIGN_SPEC.md` and use the tokens in `src/tokens.json`. Text and controls are readable with a screen
  reader (labels, roles) and at larger font sizes.
- Docs are updated if you changed behaviour, the data format or a build step.
- One topic per pull request, with a one-line subject in the imperative: `Add grade filter to the Discover tab`.

## What not to commit

- **Credentials, tokens, session cookies or captured traffic.** Never put real ones in code, tests, docs or issues.
- **Images or data copied from a board maker's app or servers.** Board photos and hold art belong to their owners and are loaded
  at runtime from the service. The same goes for logos and product names used as branding (see `BRANDING.md`).
- **Generated native projects.** `android/` and `ios/` are produced by `expo prebuild` and are git-ignored.

## Working with the services

Slackboard talks to services run by board makers. Please be a considerate client:

- Test against **your own account** only, and never against other people's data.
- Do not add anything that bypasses a service's access controls or rate limits.
- Keep requests light: the app syncs incrementally and caches; new features should too.

## Adding a board brand

For another Aurora-platform brand, add a provider file in `src/providers/`, register it in `src/providers/index.ts`, and add a test
in `src/providers/providers.test.ts`. Other platforms need their own provider implementation behind the same interface.

## Reporting a bug

Open an issue with what you did, what you expected, what happened, your platform and app version. Please include no credentials.
For security problems, see [SECURITY.md](SECURITY.md) instead.
