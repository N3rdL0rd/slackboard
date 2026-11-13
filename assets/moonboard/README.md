# MoonBoard hold art

One transparent layer per setup (`2016`, `2017`, `2019`, `2024`, `mini2020`, `mini2025`), cropped to the board's grid window and
scaled to 560 px wide by `scripts/make-moon-assets.py`. The app stretches a layer over the board's edges (x 0 to 12, y 0 to rows + 1
grid units).

The script reads a folder of full-size source images (5200 px wide transparent PNGs, one per hold set plus an `all-holds`
composite per setup) and writes the layers here. Run `python3 scripts/make-moon-assets.py <full-size-folder> <mini-folder>`.

## Provenance and licence

The source images were supplied to the project as openly licensed hold art. **The licence and origin of these images must be
recorded here before this repository is published**, together with any attribution the licence requires, and the same entry
added to `THIRD_PARTY_NOTICES.md`. If it cannot be confirmed, delete the layers and their lines in `src/data/moonArt.ts`: the app then draws MoonBoard climbs as
role-coloured dots on a plain board.
