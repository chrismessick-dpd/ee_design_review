# Fabcheck ↔ Signoff EE link

How a Fabcheck run is kept, stored, listed, and reopened from Signoff EE. Fabcheck
(`pcb_dfm`) and Signoff EE (`ee_design_review`) both follow this; change it here first.

Since 2026-11-03 **Fabcheck only writes** to a review's repo, once, at Send. Signoff reads
everything back: it lists the runs, tags revisions, downloads packages, and hands a run to Fabcheck
in the browser. The design and Chris's decisions are in `pcb_dfm/docs/signoff-revisions.md`.

Pincheck sends schematic findings the same way (Schematic Review checklist, `pincheck/<projectId>/`, Open in
Pincheck through the same hand-off, no revisions): see `pincheck/docs/send-to-signoff-ee.md`.

A run is reproducible: the same package, fab profile, board thickness (and variant), and
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
    "size": 1671680,
    "zip": {
      "path": "fabcheck/<projectId>/packages/<key>/PCB-1042-04_manufacturing.zip",
      "name": "PCB-1042-04_manufacturing.zip",
      "sha256": "<sha256 of the stored zip>",
      "size": 412160,
      "root": "PCB-1042-04_manufacturing",
      "files": [ { "path": "<path in the original upload>", "to": "PCB-1042-04_manufacturing/Fabrication/…", "sha256": "…", "size": 0 } ]
    }
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

`package.zip` is on runs stored since 2026-11-03: the one fab package zip Send stored with the run
(below). `path` is the full path in the repo at the time; `files` lists every file in the zip
except the README, with its original path and its path in the zip. Signoff needs nothing else to
list a run's contents or to check a download. Runs stored earlier, and runs kept only in the
browser, have no `zip`.

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
fabcheck/<projectId>/runs/<runId>.json             { "run": {…, "package": {…, "zip"}}, "findings": [ … compact … ] }
fabcheck/<projectId>/packages/<key>/<root>.zip     the fab package (package.zip.path)
fabcheck/<projectId>/preview/…                     board pictures (below)
```

- **One commit per Send** holds exactly these files: the run record, the zip, and the pictures.
- **The zip** is the structured fab package, as Fabcheck's Files tab exports it: `<PN>-<REV>_manufacturing/`
  with `Fabrication/` (Gerber, NC drill, netlist, fab drawing) and `Assembly/` (BOM, pick and place,
  assembly drawing), and one `README.txt` listing each file's SHA-256 (`pcb_dfm/docs/fab-package.md`).
  Part number, revision, and the files to keep are picked under Send's Details.
- **By key:** the zip sits under the package's key, so re-sending the same package with the same
  picks writes nothing new.
- **Gone:** the per-file storage (`packages/<key>/manifest.json` and `files/…`) stops for new runs;
  runs stored before keep theirs, and Signoff offers them as Open in Fabcheck only. Fabcheck's
  `releases/<id>.json` records and `source.release` on issues (briefly on its `release-tags`
  branch) are gone too: revisions are Signoff's (below).
- Signoff's sync never reads `fabcheck/`, so packages never slow down syncing. The Revisions tab
  reads it on its own.
- **Sharing moves them too:** when a project moves from the data repo to its own repo, Signoff
  copies `fabcheck/<projectId>/` across and then deletes it from the data repo. So a stored
  `package.zip.path` (or `stored.dir`) can name the old place: readers take the zip's place
  relative to the run's folder, as `packages/<key>/<name>.zip`, and reject any other path.
- Git keeps history, so deleting a package stops growth but doesn't shrink the repo.

Writing goes through `GitHubStore.putFiles(files, opts)`: binary blobs first, then one commit
with `force: false`, retried on a non-fast-forward like sync.

How Send behaves:

- **Asks first.** Before anything leaves the browser, Fabcheck names the private repo, the files
  and their size. Cancel keeps everything in the browser: nothing is stored or sent.
- **Says where, up front.** The Send panel shows the repo it will store in, or why it can't (no
  token in this tab, no write access), and asks for GitHub sign-in on first use.
- **Stores first.** If storing fails, no issues are written. The user can try again, or pick
  **Send without storing**: the issues then carry `stored: null`, and Signoff's links ask for the
  package to be dropped in.
- **Writes only.** Fabcheck no longer reads runs or packages back from a review's repo. The
  commit reads the branch's tree and the access check asks GitHub whether the token can push;
  both are part of writing. Team fab profiles are the one read left.

## Board previews

Storing a run also writes pictures of the board. Signoff PL shows them on its tiles, and Signoff
EE's overview shows one beside the progress ring (`config.previews.dir`; clicking it opens the run
in Fabcheck). They show the latest
stored run, and each store replaces them:

```
fabcheck/<projectId>/preview/index.json
fabcheck/<projectId>/preview/top.webp       (or .png where the browser can't write WebP)
fabcheck/<projectId>/preview/bottom.webp
```

- The images are Fabcheck's realistic look of each outer side: 640 px wide, the board's own aspect
  (160 to 640 px high), transparent around the board, no scale bar. Each is about 10–40 kB.
- `index.json`: `{ "v": 1, "tool": "fabcheck", "runId", "at", "hero": "top", "images": [{ "key",
  "file", "type", "w", "h" }], "board": { "w", "h", "t" } }`. Readers take the file names from
  `images`, not from this list.
- `board` (since 2026-11-01) is the board's size in mm: the outline's width and height, and the
  run's board thickness. Signoff PL uses it to draw the board to scale in its 3D Exploded view,
  cropping each picture to its opaque area. Older stores don't have it; readers must cope.
- Send's confirm mentions the pictures along with the package files.
- Only a run open in the tab can be drawn.
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

### Waived findings (reference rows, 2026-11-07)

Findings waived in Fabcheck (`pcb_dfm/assets/waivers.js`) are sent only when the Send panel's
**Waived, for reference** box is ticked (it starts unticked). They go as their own custom check per
Fabcheck check and severity (id from `waived:<check>`), titled "Waived in Fabcheck: …", with
`reference: true` on the custom record and the item at `status: 'issue'`, `resolution: 'waived'`.
The engine (`model.row`) marks such a row `reference`: `countStatuses`, the project summary
(counts, `open`, `recent`), and the requirement tallies leave it out, the checklist's Issues and To
review filters skip it, and Signoff EE shows it with an "i" and "Reference, not counted", in its own
*Waived in Fabcheck* section under Findings, with no Status or Severity controls. Only
`reference === true` counts; any other value leaves the row an ordinary check. A later Send whose
run no longer has those findings waived tombstones the row (`deleted: true`). An open Fabcheck issue
whose check's findings are all waived now gets a comment saying so ("Mark it Waived if that is
expected"); the reviewer's status is never changed.

## Revisions (Signoff)

Signoff EE's **Revisions** tab lists the runs stored with the board and tags some as revisions.
The records and the UI are described in the README (*Revisions*); in short:

- **Reading:** `GitHubStore.listRuns('<dir>fabcheck/<projectId>/')` reads `runs/*.json` (direct
  children only), and `model.cleanRun` checks each: the run id, hashes, and the zip's place.
  A file counts only for the run its name says. `model.groupRuns` makes one row per package key.
- **Download:** `GitHubStore.readVerified(path, package.zip.sha256)` reads the zip and refuses it
  unless its SHA-256 matches; then it's saved as `package.zip.name`.
- **Tags** are `revisions` records in the project document (`source: { tool: 'fabcheck', run, at,
  package, zip }`), merged like every other record. Fabcheck doesn't know a run's tag when it
  sends, so its comments name the package; Signoff shows the tag beside *From Fabcheck* on an
  issue whose `source.run.id` is a tagged run.
- **Summary:** `project.summary.revisions` (`[{ label, status, sentAt }]`) for Signoff PL.

## Opening a run from Signoff

Signoff EE links to (relative to its own `index.html`):

```
../pcb_dfm/index.html#/board?run=<runId>&project=<projectId>&check=<check>&x=<mm>&y=<mm>&layer=<layer name>
```

Every parameter after `run` is optional. The run plays on Overview and then shows the board. A link
to another view with no `check` or place (`#/overview?run=<runId>`, the suite's demo tour) stays on
that view (2026-11-08). There is no `repo` parameter any more: Fabcheck never
reads a review's repo. Instead Signoff hands the run over in the browser. Both tools are served
from one origin, so they share IndexedDB:

1. Signoff opens Fabcheck's named window at once (a window opened after an `await` would be
   blocked).
2. It reads `fabcheck/<projectId>/runs/<runId>.json` and the run's zip with its own token, and
   checks the zip's SHA-256.
3. It writes `{ id, run, findings, zip: Uint8Array, at }` to IndexedDB database
   `dovetail-handoff` (`dovetail-handoff-demo` in demo mode), store `runs`, keyPath `id`
   (`S.handoff.put` in `github.js`).
4. It sends the window to the link.

Every Open in Fabcheck goes this way: on a run in Revisions, on an issue, on its locations, and
on the board picture. When there's nothing to hand over (no token, the demo, a run stored without
a zip, or a read that failed) Signoff opens the link anyway and says why.

Fabcheck resolves `run` in this order:

1. Its own runs kept in IndexedDB on this computer.
2. The demo boards' fixed runs (demo mode).
3. The hand-off: it opens the zip, shows the stored findings, and places the parts, then deletes
   the entry (`store.js` `takeHandoff`). An entry is taken when it's read, so a failed open needs
   another click in Signoff. Entries older than a day are cleared whenever Fabcheck starts.
4. Otherwise it says which package made the run (name, sha256) and asks for it to be dropped
   in. It checks the fingerprint, re-runs with the run's settings, and notes it if the
   current Fabcheck version finds anything different.

Then it opens the Board view zoomed to `x`, `y` on `layer`, with that check's findings
highlighted. Stored findings are cleaned before they're shown (`cleanFinding` in Fabcheck's
`app.js`): known severities and categories, numbers as numbers.

"Open in Fabcheck" shows for everyone, not only FTEs. A contractor on a shared board reads the
run with their own token from that board's `review-ee-…` repo.

The suite's tools open each other in the same tab (2026-11-04). Open in Fabcheck shows a card
with what Signoff is reading (the run, then the package zip) while it hands the run off, then the
tab goes to Fabcheck; if the run can't be handed over, the card says why and offers to stay.
Fabcheck's "Back to Signoff EE" and Send's "Open in Signoff EE" go back the same way, and the
browser's Back button works both ways. Signoff PL's and Partcheck's links to reviews do too.
Open in Fabcheck leaves a return point in Signoff's storage (`fabReturn`: project id, tab, open
check, scroll). Fabcheck's "Back to Signoff EE" opens that tab (`signoff.js` `openFindings`), and
Signoff puts back the check and the scroll (`returnFromFabcheck`), once and within the hour.
Without one (after a Send, say) it opens the board's Findings tab.
