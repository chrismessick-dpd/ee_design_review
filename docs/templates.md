# Checklist templates

Each checklist is one JSON file in `templates/`. `tools/build.py` bundles them into
`assets/templates.js` so the tool works when opened from disk. After a Git Sync, the
templates pulled from the repo are used instead of the bundled copy.

## Shape

```json
{
  "id": "schematic",
  "title": "Schematic Review",
  "short": "Schematic",
  "version": 1,
  "description": "One sentence on what this checklist covers.",
  "sections": [
    {
      "id": "s-pwr",
      "title": "Power & Grounding",
      "tags": [],
      "items": [
        {
          "id": "sp1",
          "text": "All power nets are named consistently across sheets",
          "hint": "How to check it, or why it matters. One to three sentences.",
          "tags": [],
          "severity": "major"
        }
      ]
    }
  ]
}
```

- `id` (template, section, item): lowercase letters, digits and `-`. Unique across **all**
  templates. Never reuse or renumber an ID: reviews store their state by item ID.
  If an item is removed, its ID is retired; reviews keep its state and show it as retired.
- `text`: the check, phrased as the condition that should be true. Required.
- `hint`: optional guidance. Say how to check it or what goes wrong if missed.
- `severity`: `critical` (board won't work, is unsafe, or must be respun), `major`
  (likely defect or field issue), or `minor` (quality, documentation, cosmetic).
- `tags`: when the item applies. An untagged item applies to every board. A tagged item
  (or section) applies only when the project profile has **at least one** of its tags.
  Items that don't apply count as N/A, and the reviewer can still bring them back.
- Bump `version` when the content of a template changes.

## Tags

Use only these. `tools/validate_templates.py` rejects anything else.

| Tag | Applies when the board… |
| --- | --- |
| `battery` | runs from or charges a battery |
| `low-power` | has a sleep / ultra-low-power budget |
| `mains` | connects to AC mains or has voltages above 60 V DC; needs isolation / creepage |
| `high-current` | carries more than ~5 A on any rail, or has power stages |
| `motor` | drives motors, solenoids or other inductive actuators |
| `rf` | has a radio, antenna or RF front end |
| `high-speed` | has multi-Gb/s serial links or edge rates needing controlled impedance |
| `ddr` | has external DRAM (DDR3/4/5, LPDDR) |
| `fpga` | has an FPGA or a large application processor / SoC |
| `bga` | uses BGA or other fine-pitch area-array packages |
| `hdi` | uses microvias, via-in-pad or sequential lamination |
| `flex` | is flex or rigid-flex |
| `precision-analog` | has precision measurement, low-noise analog or sensors |
| `audio` | has audio inputs or outputs |
| `display` | drives a display or touch panel |
| `harsh-env` | is industrial / outdoor: wide temperature, vibration, moisture, conformal coat |
| `automotive` | is automotive (AEC-Q parts, load dump, ISO 7637 / 16750 style transients) |
| `medical` | is medical (IEC 60601 style requirements) |
| `regulatory` | must pass EMC / radio certification (FCC, CE, UKCA, etc.) |
| `production` | is going to volume production (test fixtures, cost, panelization) |

## Writing guidance

- Metric first: mm, with mil in parentheses where the industry habitually uses mil.
- Don't invent standard clause numbers or precise thresholds. Name a standard only when
  you're sure it is the right one (IPC-2221, IPC-7351, IPC-A-610, IPC-6012 are fine),
  and phrase numeric limits as "per datasheet", "per fab capability", or as a clearly
  labelled rule of thumb.
- One check per item. Avoid "and also…" items that can half pass.
