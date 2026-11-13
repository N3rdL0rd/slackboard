# Backup and restore

**You > Export and backup** makes two kinds of file.

## CSV logbook

One row per send or attempt: board climbs, off-board climbs, roped climbs and training together, newest first. It is meant for spreadsheets and
other tools, and cannot be restored.

| Column | Meaning |
|---|---|
| `date` | Local time, `yyyy-MM-dd HH:mm:ss` |
| `provider` | The board service, empty for off-board climbs |
| `climb`, `climb_uuid` | Name and id (an off-board climb's id is its own) |
| `type` | `send` or `attempts` |
| `angle` | Board angle, or the wall category's representative angle for off-board climbs |
| `mirrored`, `attempts` | |
| `grade_v`, `grade_font` | The grade in both notations |
| `quality` | Stars, 0 to 3, for sends |
| `comment` | |
| `setting`, `venue`, `wall`, `tags`, `link` | Off-board and roped climbs: `gym` or `outdoor` (`indoor` or `outdoor` for roped), the gym or crag, wall category, style tags separated by `;`, and the link |
| `kind` | Which kind of entry the row is: `board`, `offBoard`, `roped` or `training` |
| `style`, `result`, `grade_yds`, `grade_french`, `length_m`, `pitches` | Roped climbs only. Roped grades are not V grades, so they have their own columns and `grade_v` and `grade_font` are empty. For autobelay, `attempts` is the number of laps |
| `detail` | Training only: the exercise, then the number of sets done in `attempts`, and the last set in kilograms ("2 sets: 4 × 7 s · 20 mm · +10 kg"). The CSV does not follow the unit setting |

A text field that begins with `=`, `+`, `-` or `@` gets a leading apostrophe so a spreadsheet does not read it as a formula.

## Full backup (JSON)

Everything on the phone, in one file, which **Restore** can read back.

```jsonc
{
  "app": "slackboard",
  "version": 5,
  "exportedAt": "2026-11-02T12:00:00.000Z",
  "user": { "id": 7, "username": "..." },
  "logbook": [ /* every board entry, with grade_v and grade_font added */ ],
  "circuits": [ /* name, colour, items, timestamps, and where it is published */ ],
  "offBoard": [ /* gym and outdoor climbs */ ],
  "roped": [ /* roped climbs: style, setting, grade label and system, result, tries, length, pitches */ ],
  "training": [ /* one exercise on one day, with its sets: reps, time, load, edge, grip, rest */ ],
  "litHistory": [ /* climbs lit on boards */ ],
  "moon": { "boards": [], "problems": [], "tags": [] },
  "spaces": { "places": [], "names": {}, "lineage": {}, "logSpaces": [] },
  "preferences": { "settings": {}, "angles": {}, "timer": null, "restSec": null },
  "liked": [], "blocked": [], "boards": []
}
```

### What restoring brings back

Data that a service holds comes back by signing in and syncing: board sends, likes, blocks and published circuits on Tension, Decoy
and Grasshopper. A restore brings back only what exists on the phone alone:

- off-board climbs
- roped climbs
- training entries: each exercise with its sets (a set that is not done is not saved)
- **MoonBoard**: the boards (with their old ids), the problems you set, your logs (back in the MoonBoard database, so ticks and send
  counts return), and your likes and blocks. The downloaded problem lists are not in the file; they download again when a board is
  opened.
- circuits that were never published to a service
- lit history
- **spaces**: each board's gym name and location, renamed spaces, and which space each logged entry belongs to
- **settings**: grade display, hold shapes, contrast, Bluetooth and haptics options, the angle each board was last viewed at, and the
  training timer

Not restored: the signed-in accounts (sign in again), filters, and the order boards were last used in.

Restoring never deletes anything. A record with the same id as one already on the phone is replaced by the file's copy, except a
circuit, which is left alone if it already exists. Restoring the same file twice changes nothing. Restored settings overwrite the
ones they name.

### Reading a file safely

A backup is treated as untrusted input. Every record is checked (types, ranges, dates, link scheme, known categories) and one that
fails is skipped and counted, never half-applied. A file with a newer `version` than the app understands is refused.
