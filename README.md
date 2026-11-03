# Signoff EE — electrical design review

**Live:** https://chrismessick-dpd.github.io/ee_design_review/

**User guide:** [docs/guide.md](docs/guide.md), with a customer-shareable overview and an FTE section on architecture and use.

Signoff EE is Dovetail's checklist tool for schematic, layout, assembly, fab and bring-up reviews.
Its sibling [Signoff ME](https://github.com/chrismessick-dpd/me_design_review) does the same for
mechanical design, on the same engine; both sit under the Dovetail Signoff hub.
Each project is a review of one board. Reviewers mark checks Pass / Issue / N/A, discuss them
in comment threads, track issues to Fixed or Waived, and print a review report.
Reviews sync through private GitHub repositories, so everyone works on the same copy.

- **930 checks in 6 checklists:** Schematic, Interfaces, PCB Layout, Assembly & BOM,
  Fabrication & Release, and Bring-up & Validation.
- **Board profile:** tag a project as battery, mains, RF, high-speed, BGA, flex, medical and
  so on. Checks for features the board doesn't have are set aside as N/A. You can still bring
  any of them back.
- **Findings:** each issue has a severity, owner, reference and resolution. You can export
  findings to CSV or print a signed-off review report (Print → Save as PDF).
- **Demo mode:** open `index.html?demo` for a self-contained sample with no sync. Use it to
  show the tool to people outside the team.
  - The whole suite's demo is one made-up product, a Smart Thermostat:
    - two boards here
    - the enclosure and wall bracket in Signoff ME
    - the full product in Signoff PL
  - Demo projects have fixed ids (`pdemo7`, and `mdemo5` in ME), so PL's demo links straight to
    them and to their issues.
  - Each demo project in `config.js` lists the findings and comments it gets.
  - If you change a demo, bump `VERSION` in `demo.js` so browsers rebuild it. Then regenerate
    PL's snapshot (`signoff_pl/tools/demo_designs.html`).

## Using it

Open `index.html` in a browser. Open it straight from a clone, or serve the folder with
`python -m http.server`. The first time, enter your name. Then open **Settings** (the gear,
bottom left), enter a GitHub token, and **Save & sync**.

Which token you need:

- **The account owner** (today `chrismessick-dpd`): a fine-grained token with Repository
  access set to **All repositories**, and **Contents** and **Administration** both set to read
  and write. Sharing a project creates a new repository, and a token limited to *selected*
  repositories can't reach it. The same token works in Signoff ME and Signoff PL, and Add FTE invites people
  across the suite, so it must reach every repository in the table below.
- **Everyone else** (the other FTEs and contractors): a *classic* token with the **repo** scope.
  A fine-grained token can only target repositories owned by its holder or by an organization
  they belong to.

The token is kept in your browser (for the session only, unless you tick *Remember*) and is
sent only to `api.github.com`. It is stored under `signoff.token`, which every Signoff tool
shares, so signing in once covers every Signoff tool on the same origin. Light/dark
mode is shared the same way (`theme` in `signoff.v1.settings`, which Fabcheck and the hub read
too). Everything else lives under this tool's own namespace, `signoff.v1.` (Signoff ME uses
`signoff-me.v1.`).

Because the token is shared, it can change in another tool. Settings keeps a fingerprint of it
(`tokenTag`, from `model.tokenTag`). When the token no longer matches, the tool forgets who was
signed in and their role, and finds both again at the next sync. Until then it shows no
projects ("Checking who's signed in").

**One browser, two tokens.** A contractor's token in a browser that holds an FTE's copy is
treated as a contractor: the projects the token can't reach are dropped from the browser, and so
is the People list. Unsynced internal work (an FTE's edits that weren't pushed) is kept out of
sight under `held`, and pushed the next time an FTE syncs in that browser. An FTE whose data
repo can't be opened is still treated as a settings problem, but only if this token opened it
before (or it's the owner); having local projects no longer counts.

**Boards and projects.** Each review is one **board** (one **part** in Signoff ME). A board
belongs to a client **project**, such as one product's boards, set in the board's details with
suggestions from the projects already in use. The sidebar groups boards by project, A–Z, with
boards that have no project last. A group can be folded; the one holding the open board stays
open. In the data the board is still a project document (`projects/<id>.json`), and the
project is `meta.project`.

Edits are saved in your browser straight away. Boards with unsynced changes show an orange
dot. **Sync** (or Ctrl+S) does three things: it pulls, merges, and pushes one commit. It also
runs automatically when the page opens and whenever you post a comment, so comments reach
everyone straight away.

### Keyboard

| Key | Action |
| --- | --- |
| `j` / `k` or ↓ / ↑ | Next / previous check |
| `p` / `i` / `n` / `o` | Pass / Issue / N/A / back to To review |
| `Enter` | Open the selected check |
| `c` | Comment on the selected check |
| `/` | Filter checks |
| `Ctrl+Enter` | Post comment |
| `Ctrl+S` | Sync |
| `Esc` | Close panel / dialog |

## Requirements

**Requirements** is picked like a checklist in the project sheet (New review / Edit profile)
and is on by default. Unlike the checklists, requirements are written for the project rather
than taken from a template. Unticking it hides the tab, the overview card and the report
section, but keeps the requirements, the same way a checklist's review state is kept.

- **Each requirement has:**
  - an ID (REQ-001…, numbered automatically)
  - the requirement text
  - shall or should
  - category and source (the customer spec and section)
  - how it's verified: inspection, analysis, demonstration or test
  - a status: draft, approved, changed or deprecated. Rewording an approved requirement marks
    it *changed* so it gets approved again. A *deprecated* requirement stays in the list and
    the report, lined out for reference, but is left out of the counts and failing flags.
  - a verification result (not verified, pass, fail) with evidence
  - a discipline: system, EE, ME, FW or other. It shows only when it isn't this tool's own.
  - a discussion thread
- **Traceability:** link a requirement to the checks that show it's met. The requirement shows
  how they stand:
  - an open issue on a linked check puts it *at risk*, even if it was verified;
  - a failed verification makes it *failing*;
  - a fixed issue needs re-review;
  - a waived one counts as accepted.

  These are `model.reqState`. Signoff PL uses the same two states.
  Each check's panel shows **Traces to** for the requirements it supports.
- **Import / export:** paste rows from Excel or import a CSV with a *Requirement* (or
  *Description*) column, plus optional ID, Name, Type or Priority, Category or Sub-System,
  Source or Rationale, Verification and Status. A Name leads the requirement text; must-have
  priorities are *shall* and the rest *should*; obsolete rows come in deprecated. New
  requirements carry on the imported numbering (GEN-124 after GEN-123). Rows whose ID exists
  update that requirement. **Export CSV** gives the compliance matrix, which the review report also prints.
- Requirements live in the project document (`reqs`), so they sync, merge and discard like
  everything else.
- **From the project plan.** Signoff PL (FTEs) can allocate its System requirements to a board and
  write a derived requirement into the review, or trace one written here up to a System
  requirement. Such a requirement carries `parent: { tool: 'pl', project, id, ref, text }`.
  - The inspector shows the parent's ref and text read-only, so contractors see where it comes
    from.
  - Rewording it here marks it *changed*, and PL asks the project lead to approve it again.
  - PL writes only requirement records, through `GitHubStore.patchRecords`: the file must
    re-serialize to the original apart from those records, it uses `force: false`, and a record
    changed since PL read it is returned as a conflict, not overwritten.
- **Deep link:** `index.html?project=<id>&req=<requirement id>` opens the requirement.

## Revisions

The **Revisions** tab (after Findings) lists the Fabcheck runs stored with the board, and tags some
of them as revisions: "3.1 · sent for quote", "3.2 · DFM updates, used for builds". The design is in
`pcb_dfm/docs/signoff-revisions.md`; the files Fabcheck stores are in `docs/fabcheck-link.md`.

- **The list** reads `fabcheck/<id>/runs/*.json` from the board's home repo, once per page load
  (**Refresh** reads again). One row per package, newest first, with older runs of the same
  package folded under it. A row shows the date, who sent it, the package and the findings
  counts, and its tag.
- **Expanding a row** shows the files of the run's fab package zip, grouped as in the zip
  (`Fabrication/`, `Assembly/`), the Fabcheck issues the run raised or last updated, and:
  - **Download**: reads the zip with your token, checks it against the run's SHA-256, and saves
    it. A zip that doesn't match is never saved.
  - **Open in Fabcheck**: the hand-off below.
  - **Tag as revision** / **Edit revision**: label (the next one is suggested: 3.1 → 3.2, or the
    board's revision with .1), title, status (**Sent to fab**, **Used for builds**,
    **Withdrawn**), fab house, date sent, order ref and notes. "Superseded by" follows the order of
    the runs; withdrawn revisions supersede nothing.
- **The Overview** shows the latest revision and its status under the progress ring, and a
  Fabcheck issue whose run is tagged says so beside *From Fabcheck* ("from 3.2 · DFM updates").
- **The record** is `revisions` in the project document, merged like everything else
  (`updatedAt` / `updatedBy`, tombstones), so two people tagging at once don't clash:

  ```json
  "revisions": { "v…": { "id": "v…", "label": "3.2", "title": "DFM updates", "status": "built",
    "source": { "tool": "fabcheck", "run": "r…", "at": "<run time>", "package": { "key", "sha256", "name" },
                "zip": { "path", "sha256", "size" } },
    "fab": { "house": "", "sentAt": "2026-10-29", "ref": "" }, "notes": "",
    "createdAt": "…", "updatedAt": "…", "updatedBy": "…", "deleted": false } }
  ```

  `source` is generic (`tool` plus that tool's fields), so Signoff ME and FW can tag their own
  sources later; a review round will add `round` beside these fields. Status goes through
  `model.oneOf`, dates must be dates, and text is cut to size and escaped. Run files are checked
  the same way (`model.cleanRun`): ids, hashes, and a zip path of `packages/<key>/<name>.zip`
  under the board's own folder.
- **Open in Fabcheck** never asks Fabcheck to read a repo. Signoff reads the run and its zip with
  your token, leaves them in IndexedDB `dovetail-handoff` (`S.handoff`), and then opens Fabcheck's
  link. This goes for every Open in Fabcheck: on runs, on issues, their locations, and the board
  picture. In the demo, and without a token, the link opens on its own.
- **Which tools show it:** `config.runs` (`{ tool, dir }`) names the checker whose runs are listed.
  Signoff EE sets it; Signoff ME and FW don't yet, so the tab is hidden there.
- **Older copies of Signoff drop `revisions`** when they merge a board (their `mergeProjects`
  doesn't know it). Re-send contractor packages (`python tools/package.py`) before tagging
  revisions on shared boards. Fabcheck's Send edits the stored copy in place, and Signoff PL
  writes only through `patchRecords`, so neither drops them.

## Repositories, people and access

GitHub grants access to whole repositories, so Signoff keeps each audience in its own:

| Repository | Holds | Who's on it |
| --- | --- | --- |
| `ee_design_review` (tool) | The tool and the checklists | FTEs |
| `ee_design_review_data` (data) | Internal reviews (`projects/<id>.json`) and People (`users.json`) | FTEs |
| `review-ee-<project>` (one per shared project) | That one review | FTEs and that project's contractors |
| `me_design_review`, `me_design_review_data`, `fw_design_review`, `fw_design_review_data`, `signoff`, `pcb_dfm`, `signoff_pl`, `signoff_pl_data` | Signoff ME, Signoff FW, the hub, Fabcheck and Signoff PL | FTEs |

All of these are set in Settings, under **Repositories**. An FTE is anyone whose token can open
the data repo. A contractor's token reaches only their projects' `review-…` repos, so their
copy of Signoff never sees anything else, and neither does GitHub.

**People & access** (FTEs only) lists everyone by GitHub username, with their role.
- **Adding a contractor to a project** moves the project out of the data repo into a new
  private `review-ee-<project>` repo and invites the contractor and the FTEs to it. Later
  contractors on the same project are just invited.
  - The move is safe to repeat. If it's interrupted, running it again picks up where it
    stopped.
  - An FTE's unsynced edits follow the project to its new repo.
- **Removing a contractor** from a project, or from People, always takes away their GitHub
  access to it, including an invitation they haven't accepted; only invitations ask first. Their
  copy of the project disappears at their next sync.
- **Adding an FTE** invites them to this tool's repo, its data repo, every EE shared repo, and
  the rest of the suite: Signoff ME's and Signoff FW's tool and data repos, the hub repo, Fabcheck (`pcb_dfm`) and Signoff PL's tool and data repos. That list is
  `repos.suite` in `assets/config.js`. Signoff ME's shared `review-me-…` repos are granted from
  Signoff ME's own People page, so add FTEs there too (each tool keeps its own People list).
- **A contractor** gets only their projects' `review-ee-…` repos. One working on an ME project
  is added in Signoff ME and gets only that `review-me-…` repo. The prefixes keep the two apart:
  a contractor's copy of each tool lists only repos with its own prefix.
- The **GitHub access** column compares the list with the real collaborators on each repo.
  **Give access** fixes any gaps, and **Remove access** takes a contractor off repos they're
  still on but shouldn't be ("Still on …").
- Project file names are IDs, so they don't give project names away.
- **Other tools link here.** Signoff PL, Fabcheck and the hub show a **People & access** link
  for FTEs that opens `index.html?page=people`. PL shows it once its own sync confirms an FTE.
  Fabcheck and the hub make no request: they show it when `signoff.v1.settings.tokenTag`
  matches the current token and `signoff.v1.dataAccess` is `ok`, as this tool last found.

On a personal account only the owner can create repositories and change access, and every
collaborator can push to the repositories they're on. Other FTEs can edit People, but the
owner applies the access. Moving to the company organization lets FTE admins do it and allows
narrower roles. Change the account in Settings; the app handles organizations already.

**Giving a contractor access**
1. They create a free GitHub account and send you their username.
2. Add them in People and pick their projects. Confirm, and Signoff shares the projects and
   GitHub emails the invitations.
3. Send them the tool: `python tools/package.py` makes `dist/Signoff-EE-<build>.zip`. It holds
   the tool and checklists only, with no data and no token, plus a START HERE note. Its sidebar links to
   the hub, the other Signoff tool and Fabcheck point at the hosted site (`hostedBase` in config).
4. They open it, click the gear, follow *New to GitHub? Set up in four steps*, and click
   Save & sync. Signoff lists their invitations with an **Accept** button. From then on they
   just Sync.

Never put your own token in a copy you send out. Anyone holding the file would get full
access to every review.

### Security

GitHub does all the access control; the pages are a front end. Two things keep that true:

- **Review files are untrusted data.** A contractor can push any JSON to their `review-…` repo,
  with or without Signoff, and an FTE's browser then reads it. So:
  - Status, severity and resolution are taken only from their fixed lists (`model.oneOf`), so
    nothing in a file can reach the page as markup, and every other field is escaped.
  - A project file counts only for the id in its name. An FTE's sync takes from a shared repo
    only the projects the data repo's shared map puts there, so a file planted in one repo
    can't stand in for another project.
  - New `review-…` repos are created with GitHub Actions turned off.
- **The token lives on one origin with every tool**, so each page sends a Content-Security-Policy:
  scripts only from the site itself, data only from `api.github.com`.
- **Without a token nothing real is shown.** Copies stay in the browser until a token comes back.
  **Settings → Sign out** removes the token and every Signoff and Fabcheck copy in this browser
  (it warns first if anything is unsynced). Use it on shared computers.

Owner token: give it an expiry. Contractors need a classic token with the `repo` scope (GitHub's
fine-grained tokens can't reach repos they're only a collaborator on), and that reaches all of
their repos, so ask them to set an expiry too.

## How sync works

Sync commits **directly to `main`, without pull requests.** This is deliberate.

- Every item state, comment and custom check carries `updatedAt` / `updatedBy`. Two copies of
  a project merge key by key, and the newer record wins. Deletions are tombstones.
- One sync builds one commit (Git Data API: tree → commit → ref update with `force: false`).
- If someone else pushed in the meantime, GitHub rejects the ref update. Signoff then pulls,
  merges again and retries.

So two reviewers working on the same project at the same time don't lose each other's work.
Pull requests would only add friction to review data.

**Projects deleted on GitHub leave every browser.** A browser drops its copy of a project at
sync when the project no longer exists:
- its file was deleted from a repo where the last sync saw it, or
- its shared repo left the shared map in People (the project was removed and its repo deleted).

The browser also forgets what it cached about repos it no longer uses. A copy with unsynced
edits is never dropped this way, so no work is lost: a deleted file is pushed back, and a copy
whose repo left the shared map stays in the browser. A project that was never synced is pushed
as usual.

Changes to the **tool or the checklists** should still go through pull requests.

### The project summary

Each project file also carries a `summary` block, so other tools can show where a review stands
without loading this tool's checklists. Signoff PL is the planned reader. Sync writes the block;
nothing edits it. It is rebuilt from the document and the checklists every time the file is
written, and is never merged.

```json
"summary": {
  "v": 1, "tool": "EE", "name": "…", "project": "Smart Thermostat", "client": "…", "number": "DT-1042", "revision": "B",
  "stage": "Layout", "archived": false,
  "total": 412, "reviewed": 260, "pct": 63,
  "checklists": { "pcb": { "name": "Layout", "total": 140, "reviewed": 87, "pct": 62, "issuesOpen": 2 } },
  "issues": { "open": { "critical": 1, "major": 2, "minor": 0 }, "fixed": 3, "waived": 1 },
  "open": [ { "id": "pcb-hc-5", "severity": "major", "text": "…", "checklist": "Layout", "assignee": "J. Chen", "ref": "U2" } ],
  "reqs": { "total": 5, "approved": 3, "pass": 1, "fail": 0, "risk": 1, "open": 4, "unlinked": 1 },
  "reqList": [ { "id": "q…", "ref": "REQ-003", "text": "…", "discipline": "ee", "kind": "shall", "category": "Interfaces",
    "method": "test", "status": "approved", "verify": "open", "state": "risk", "links": 2, "issues": ["usb2"],
    "parent": { "tool": "pl", "project": "pl…", "id": "q…", "ref": "REQ-002" }, "at": "…", "by": "…" } ],
  "recent": [ { "id": "c…", "item": "usb2", "check": "…", "author": "Morgan Lee", "at": "…", "text": "…" } ],
  "revisions": [ { "label": "3.1", "status": "sent", "sentAt": "2026-10-21" }, { "label": "3.2", "status": "built", "sentAt": "" } ],
  "at": "2026-10-24T18:36:53Z", "by": "Sam Patel"
}
```

- **Counts.** They match the project overview. Checks set aside by the board profile aren't
  counted.
- **`project`.** The client project the board belongs to (`meta.project`), or `''`. Signoff PL
  can group or match designs by it.
- **`reqs`.** It is `null` when Requirements is off for the project. `risk` counts the
  requirements at risk.
- **`reqList`.** Every requirement that isn't deleted, with deprecated ones flagged by `status`.
  - `state` is `model.reqState`: deprecated, fail, risk, pass or open.
  - `issues` are the linked checks with an open issue, whose detail is in `open`.
  - `parent` is there only for a Signoff PL link.
  - Text is cut to 500 characters.
  - It's missing when Requirements is off, and in files written by older engines.
  - Signoff PL's Requirements tab reads it.
- **`recent`.** The six latest comments, newest first, as the overview's *Recent discussion*
  shows them: `check` is the commented check's text (cut to 160 characters), `text` is cut to 400.
  Signoff PL's *Recent discussion* reads it. Missing in files written by older engines.
- **`revisions`.** The board's revisions in order (see *Revisions*): label, status (`sent`,
  `built` or `withdrawn`) and the date sent (`''` if not given). It's left out when there are none,
  so boards without revisions keep their bytes. Signoff PL can show what was built for each
  EVT, DVT or PVT build.
- **`at` / `by`.** These are the project's latest edit, not the sync time. An unchanged
  project therefore writes the same bytes and isn't committed again.
- **Existing projects.** Projects synced before the summary existed get one at their next sync,
  as a single commit.
- **Contractor copies.** A contractor's copy computes the summary from the checklists bundled
  with it. If those are older, the counts can differ slightly until the next FTE sync.
- **Copies older than the summary** drop it when they sync. Review data is never affected,
  and the next sync from a current copy puts the summary back. To stop the back and forth,
  re-send contractor packages (`python tools/package.py` here and in Signoff ME).
- **Writers without checklists** (Fabcheck's Send to Signoff) keep the stored summary as it
  is. Merges carry it along too.
- **Checklist changes.** A checklist update changes the counts, so every project file gets a
  new summary at the next FTE sync. Expect one large but harmless commit.
- **`open`** lists the unresolved issues, worst first. The check text is cut to 160
  characters.
- **Readers** must treat a missing summary as "not summarized yet", never as 0%. They must also
  cope with a summary that has no `open` list, because older engines didn't write one.
- **Opening a project from another tool:** `index.html?project=<id>` opens that project. If it
  isn't in this browser yet, it opens after the first sync.

## Layout

| Path | Contents |
| --- | --- |
| `index.html`, `assets/` | The tool (no build step, no dependencies) |
| `assets/config.js` | Everything EE-specific: name, repos, storage namespace, profile tags, stages, default checklists, ID prefixes, demo data |
| `assets/model.js` | Data model: templates, profile rules, progress, merge, legacy import |
| `assets/github.js` | Talks to one GitHub repository: sync, collaborators (injected `fetch`) |
| `assets/workspace.js` | Which repos hold which projects: syncing them all, sharing, invites |
| `assets/app.js` | UI |
| `assets/demo.js` | Builds the demo-mode sample projects from `config.js` |
| `assets/templates.js`, `assets/version.js` | Generated by `tools/build.py` |
| `templates/*.json` | The checklists — see [docs/templates.md](docs/templates.md) |
| `tools/package.py` | Builds the zip you send to a contractor |
| `tests/test.html` | Model and sync tests against a fake GitHub API (open it over http) |
| `docs/roadmap.md` | DFM tool and customer-facing plans |

## The shared engine (Signoff EE and Signoff ME)

Both tools run the same engine. This repository is its source: `assets/model.js`, `github.js`,
`workspace.js`, `app.js`, `demo.js`, `styles.css` and `tools/build.py`, `package.py`,
`validate_templates.py`. Signoff ME vendors them byte for byte with
`python tools/sync_engine.py` (in `me_design_review`), and its `build.py` fails if its copy is
stale, so fixes flow one way and nothing diverges silently. Fix the engine here, then sync
ME. What differs between the tools lives in each one's `assets/config.js`, `index.html`,
`templates/`, `tests/` and docs.

Two other tools copy parts of the engine with their own `tools/sync_vendor.py`:
- **Fabcheck** (`pcb_dfm`) copies `model.js`, `github.js` and `styles.css`.
- **Signoff PL** (`signoff_pl`) copies the same three. PL passes its own merge to
  `GitHubStore` (`cfg.merge`), because its documents aren't reviews.

After an engine change, re-run `sync_vendor.py` in both.

## Changing the tool or the checklists

1. Edit `templates/*.json`, `index.html` or `assets/`.
2. Run `python tools/build.py`. It validates the templates, rebuilds `assets/templates.js`,
   and stamps `assets/version.js` plus the `?v=` cache-busters. Use `--check` in CI.
3. Open `tests/test.html` over http (`python -m http.server`, then
   `http://localhost:8000/tests/test.html`). It should say PASS.
4. Open a pull request.

After a sync, the app compares its own build hash with the tool repo's (FTEs only; contractors use the checklists bundled in their copy). If they differ, it shows
**Newer tool available**.

Checklists pulled from the repo replace the bundled copy unless the bundled one has a higher
`version`. So checklist updates reach everyone at their next sync, even before they update
the tool.

Never reuse or renumber a check ID. Reviews store their state by ID. A removed check is
shown under **Retired checks** in projects that had reviewed it.

## Importing the old checklist

The old single-file `design_review_checklists.html` saved its state as JSON. In Signoff, go to
**⋯ → Import project or old checklist** and pick that JSON file. Checked items become Pass,
N/A stays N/A, and section N/A carries over. Items you had added yourself become project
checks.
