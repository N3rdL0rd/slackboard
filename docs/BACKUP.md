# Backup and restore

**You > Export and backup** makes two kinds of file.

## CSV logbook

One row per send or attempt, board climbs and off-board climbs together, newest first. It is meant for spreadsheets and other
tools, and cannot be restored.

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
| `setting`, `venue`, `wall`, `tags`, `link` | Off-board climbs only: `gym` or `outdoor`, the gym or crag, wall category, style tags separated by `;`, and the link |

A text field that begins with `=`, `+`, `-` or `@` gets a leading apostrophe so a spreadsheet does not read it as a formula.

## Full backup (JSON)

Everything on the phone, in one file, which **Restore** can read back.

```jsonc
{
  "app": "slackboard",
  "version": 2,
  "exportedAt": "2026-11-02T12:00:00.000Z",
  "user": { "id": 7, "username": "..." },
  "logbook": [ /* every board entry, with grade_v and grade_font added */ ],
  "circuits": [ /* name, colour, items, timestamps, and where it is published */ ],
  "offBoard": [ /* gym and outdoor climbs */ ],
  "liked": [], "blocked": [], "boards": []
}
```

### What restoring brings back

Data that a service holds comes back by signing in and syncing. A restore brings back only what exists on the phone alone:

- off-board climbs
- logbook entries for boards that have no service (MoonBoard)
- circuits that were never published to a service

Restoring never deletes anything. A record with the same id as one already on the phone is replaced by the file's copy, except a
circuit, which is left alone if it already exists. Restoring the same file twice changes nothing.

### Reading a file safely

A backup is treated as untrusted input. Every record is checked (types, ranges, dates, link scheme, known categories) and one that
fails is skipped and counted, never half-applied. A file with a newer `version` than the app understands is refused.
