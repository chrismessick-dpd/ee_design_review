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

Sending a run to a Signoff EE project stores it in that project's **home repository** first,
then writes the issues, so every issue's `source.run.stored` is already set. The home repo is
the same private repo that holds the project:

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

How Send behaves:

- **Asks first.** Before anything leaves the browser, Fabcheck names the private repo, the files
  and their size. Cancel keeps everything in the browser: nothing is stored or sent.
- **Says where, up front.** The Send panel shows the repo it will store in, or why it can't (no
  token in this tab, no write access). EE keeps its token in its own tab unless "Remember the
  token" is ticked, so a Fabcheck tab opened on its own may have none.
- **Stores first.** If storing fails, no issues are written. The user can try again, or pick
  **Send without storing**: the issues then carry `stored: null`, and Signoff's links ask for the
  package to be dropped in.
- **Store later.** Fabcheck's Recent runs offers **Store in project** on a sent run that isn't
  stored. It stores the run and sets `stored` on the issues in this browser that carry it
  (`markStored`); Signoff's next sync pushes them.
- **Every revision.** The Send panel lists the runs stored with the project (`runs/*.json`,
  newest first), and each one opens through the same deep link.
- **Size.** About 0.2–1.6 MB per board for the first send (the slimmed files, compressed by git).
  A later revision of the same board adds between a few tens of kB (once GitHub repacks the
  repo and stores the changed files as deltas) and the same 1.6 MB again.

## Board previews

Storing a run also writes pictures of the board, for Signoff PL's tiles. They show the latest
stored run, and each store replaces them:

```
fabcheck/<projectId>/preview/index.json
fabcheck/<projectId>/preview/top.webp       (or .png where the browser can't write WebP)
fabcheck/<projectId>/preview/bottom.webp
```

- The images are Fabcheck's realistic look of each outer side: 640 px wide, the board's own aspect
  (160 to 640 px high), transparent around the board, no scale bar. Each is about 10–40 kB.
- `index.json`: `{ "v": 1, "tool": "fabcheck", "runId", "at", "hero": "top", "images": [{ "key",
  "file", "type", "w", "h" }] }`. Readers take the file names from `images`, not from this list.
- Send's confirm mentions the pictures along with the package files.
- Only a run open in the tab can be drawn. **Store in project** for a kept run leaves the previews
  as they were.
- The layout is meant for any tool that stores runs next to a review: a mechanical checker would
  write `<its folder>/<projectId>/preview/` the same way, with one image per part. Image keys and
  file names are lowercase slugs (`a-z`, `0-9`, `-`, up to 32 characters); readers drop others.
- Readers must cope when `preview/` is missing (no run stored yet).

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

"Open in Fabcheck" shows for everyone, not only FTEs. A contractor on a shared board can open
its stored runs, because they're in that board's `review-ee-…` repo.

Fabcheck reads a run only from a repo it trusts: the project's home as Signoff records it, the
EE data repo, or a `review-ee-…` repo of the same owner (`repo.js` `trusted`). A link naming any
other repo opens nothing from GitHub. Stored findings are cleaned before they're shown
(`cleanFinding` in `app.js`): known severities and categories, numbers as numbers.

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
