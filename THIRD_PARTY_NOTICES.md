# Third-party notices

Slackboard is released under the [MIT license](LICENSE). It builds on the work below.

## Fonts

Bundled in the app and on the landing page.

| Font | Designer | License |
|---|---|---|
| Barlow | Jeremy Tribby | SIL Open Font License 1.1 |
| Barlow Condensed | Jeremy Tribby | SIL Open Font License 1.1 |
| Caveat Brush | Impallari Type | SIL Open Font License 1.1 (the landing page uses it only as outlined vector shapes) |

The license text is at <https://openfontlicense.org/>. The fonts reach the app through the `@expo-google-fonts` packages (MIT).

## Icons

The Train tab's `muscle` icon is Lucide's `biceps-flexed`: ISC License, Copyright (c) 2026 Lucide Icons and Contributors, taken from
`lucide-static` 1.72.0. The license text is at <https://github.com/lucide-icons/lucide/blob/main/LICENSE>.

## Grade scales

Roped grades are placed on the IRCRA scale proposed by the International Rock Climbing Research Association (Draper et al., 2015,
"Comparative grading scales, statistical analyses, climber descriptors and ability grouping"). Slackboard uses the scale's idea, a
single number for each grade step, and pairs YDS and French grades by that number. The pairs were checked against the ones the
board makers' apps show.

## Map

The gym map is drawn with [Leaflet](https://leafletjs.com/) (BSD 2-Clause), loaded when the map opens, on map tiles from
[OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap contributors, available under the Open Database License.
The map shows its attribution. If you distribute a build that many people use, read the
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/) and consider a tile provider of your own.

## Libraries

Runtime dependencies are listed in `package.json`; each carries its own license, and the exact versions are pinned in
`package-lock.json`. The main ones are React Native and React (MIT), Expo and its modules (MIT), expo-router, Zustand,
react-native-svg, react-native-ble-plx and react-native-view-shot (MIT or Apache-2.0).

## Services and interoperability

Slackboard talks to services run by board makers, using their publicly reachable endpoints with an account you sign in to. The
notes on how those services behave were assembled from the makers' own apps and from the open-source
[BoardLib](https://github.com/lemeryfertitta/BoardLib) project (MIT), which documents the same platform. Slackboard contains no code
from those apps, and does not bundle their images, logos or data.
