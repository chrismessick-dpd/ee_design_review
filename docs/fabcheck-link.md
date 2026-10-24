# Fabcheck ↔ Signoff EE link

How a Fabcheck run is kept, stored and reopened from a Signoff EE issue. Fabcheck
(`pcb_dfm`) and Signoff EE (`ee_design_review`) both follow this; change it here first.

A run is reproducible: the same package, fab profile, board thickness (and variant) and
Fabcheck version always give the same findings. So a run is identified by a small record,
and the package is what's worth keeping.

## Run record

```json
{
  "id": "r<base36 time><random>",
  "at": "2026-10-24T17:00:00.000Z",
  "by": "Chris Messick",
  "tool": { "name": "Fabcheck", "version": "<Fabcheck build hash>" },
  "package": {
    "key": "<first 16 hex digits of sha256>",
    "sha256": "<sha256 of the original upload: the zip's bytes, or for a dropped folder the sorted 'path\\tsha256' lines>",
    "name": "PCB-1042-04_fabrication.zip",
    "size": 1671680
  },
  "settings": {
    "profile": "standard",
    "profileName": "Standard (quick-turn)",
    "rules": { "minTrace": 0.127, "minSpace": 0.127, "minDrill": 0.2, "…": "every rule value used, in mm" },
    "thickness": 1.6,
    "variant": null
  },
  "summary": { "error": 12, "warn": 32, "info": 37 },
  "stored": { "repo": "chrismessick-dpd/review-ee-sensor-hub", "dir": "fabcheck/<projectId>/" }
}
```

`stored` is `null` while the run only exists in the browser that made it.

`settings.rules` is a full copy of the fab rules the run used. Profiles can be edited (a
fab house's capabilities change, or someone tweaks a limit), so re-running or reopening a
run always uses this copy, never the profile as it is now. `profile` and `profileName` are
only for display; the profile may since have been changed or deleted, or may not exist on
the computer reopening the run. Runs made before this field existed fall back to the
built-in profile named by `profile`.

## Stage 1: in the browser

Fabcheck keeps every run in IndexedDB (database `fabcheck`, keyed by run id): the run record,
the package files it needs, and its findings. It opens on a **Recent runs** list instead of a
blank page.

## Stage 2: in the project's repository

When a run is sent to a Signoff EE project, Fabcheck also stores it in that project's **home
repository**, the same private repo that holds the project:

- the shared repo from People & access (`users.json` → `shared[projectId].repo`) if the
  project is shared;
- otherwise the FTE data repo (`settings.owner` / `settings.dataRepo`), under
  `settings.dataPath` (empty by default).

Fabcheck reads these from Signoff's localStorage (`signoff.v1.roster`, `signoff.v1.homes`,
`signoff.v1.settings`). It uses the same token (`signoff.token` in sessionStorage, else
localStorage) and the shared engine's `assets/github.js`, vendored from `ee_design_review`.

Layout inside the home repo (on `main`, under the data path):

```
fabcheck/<projectId>/packages/<key>/manifest.json
fabcheck/<projectId>/packages/<key>/files/<path inside the package>
fabcheck/<projectId>/runs/<runId>.json          { "run": {…}, "findings": [ … compact … ] }
```

- **Slimmed:** only the files Fabcheck reads are stored (Gerbers, drill, pick-and-place, BOM,
  IPC-356, ODB++ data it uses). PDFs and duplicate nested archives are listed in the manifest
  with `stored: false`, name, size and sha256, so a re-run from stored files still knows they
  were in the package and gives the same findings.
- **Unzipped**, so git stores later revisions of the text files as deltas.
- **By key:** re-sending the same package uploads nothing new; files whose blob sha already
  matches are skipped.
- `manifest.json`: `{ "key", "sha256", "name", "size", "files": [{ "path", "size", "sha256", "stored", "reason" }] }`.
  Nested archives that are stored expanded use `<archive path>.d/<inner path>`.
- Signoff's sync never reads `fabcheck/`, so packages never slow down syncing.
- **Sharing moves them too:** when a project moves from the data repo to its own repo, Signoff
  copies `fabcheck/<projectId>/` across and then deletes it from the data repo.
- Git keeps history, so deleting a package stops growth but doesn't shrink the repo.

Writing goes through `GitHubStore.putFiles(files, opts)`: binary blobs first, then one commit
with `force: false`, retried on a non-fast-forward like sync.

## In the Signoff issue

Send to Signoff puts the run on each Fabcheck custom check:

```json
"source": {
  "tool": "fabcheck", "check": "spacing", "gone": false,
  "run": { …run record… },
  "locations": [ { "x": 0.83, "y": 7.15, "layer": "Top copper", "label": "9 µm hairline" } ]
}
```

At most 50 locations per check; the rest stay in the comment text.

## Opening a run from Signoff

Signoff EE links to (relative to its own `index.html`):

```
../pcb_dfm/index.html#/board?run=<runId>&project=<projectId>&repo=<owner/repo>&check=<check>&x=<mm>&y=<mm>&layer=<layer name>
```

Every parameter after `run` is optional. `repo` is the project's home repo **now**, which
Signoff works out when it builds the link. A run stored before the project was shared still
says the old repo in `run.stored`; Signoff moves the files when it shares the project, so
always try `repo` first and `run.stored.repo` only as a fallback.

Both tools open each other in a named window, so
switching reuses one tab per tool: Fabcheck as `dovetail-fabcheck`, Signoff EE as
`dovetail-signoff-ee`.

Fabcheck resolves `run` in this order:

1. IndexedDB on this computer.
2. `<repo>`/`fabcheck/<project>/runs/<run>.json` and its package files, with the Signoff
   token. Then cached in IndexedDB.
3. Otherwise it says which package made the run (name, sha256) and asks for it to be dropped
   in. It checks the fingerprint, re-runs with the run's settings, and notes it if the
   current Fabcheck version finds anything different.

Then it opens the Board view zoomed to `x`, `y` on `layer`, with that check's findings
highlighted.
