# Signoff EE — electrical design review

**Live:** https://chrismessick-dpd.github.io/ee_design_review/

**User guide:** [docs/guide.md](docs/guide.md), with a customer-shareable overview and an FTE section on architecture and use.

Signoff EE is Dovetail's checklist tool for schematic, layout, assembly, fab and bring-up reviews.
Its sibling [Signoff ME](https://github.com/chrismessick-dpd/me_design_review) does the same for
mechanical design, on the same engine; both sit under the Dovetail Signoff hub.
Each project is a review of one board. Reviewers mark checks Pass / Issue / N/A, discuss them
in comment threads, track issues to Fixed or Waived, and print a review report.
Reviews sync through private GitHub repositories, so everyone works on the same copy.

- **931 checks in 6 checklists:** Schematic, Interfaces, PCB Layout, Assembly & BOM,
  Fabrication & Release, and Bring-up & Validation.
- **Board profile:** tag a project as battery, mains, RF, high-speed, BGA, flex, medical and
  so on. Checks for features the board doesn't have are set aside as N/A. You can still bring
  any of them back.
- **Findings:** each issue has a severity, owner, reference and resolution. You can export
  findings to CSV or print a signed-off review report (Print → Save as PDF).
- **Demo mode:** open `index.html?demo` for a self-contained sample with no sync. Use it to
  show the tool to people outside the team.

## Using it

Open `index.html` in a browser. Open it straight from a clone, or serve the folder with
`python -m http.server`. The first time, enter your name. Then open **Settings** (the gear,
bottom left), enter a GitHub token, and **Save & sync**.

Which token you need:

- **The account owner** (today `chrismessick-dpd`): a fine-grained token with Repository
  access set to **All repositories**, and **Contents** and **Administration** both set to read
  and write. Sharing a project creates a new repository, and a token limited to *selected*
  repositories can't reach it. The same token works in Signoff ME, and Add FTE invites people
  across the suite, so it must reach every repository in the table below.
- **Everyone else** (the other FTEs and contractors): a *classic* token with the **repo** scope.
  A fine-grained token can only target repositories owned by its holder or by an organization
  they belong to.

The token is kept in your browser (for the session only, unless you tick *Remember*) and is
sent only to `api.github.com`. It is stored under `signoff.token`, which every Signoff tool
shares, so signing in once covers Signoff EE and Signoff ME on the same origin. Light/dark
mode is shared the same way (`theme` in `signoff.v1.settings`, which Fabcheck and the hub read
too). Everything else lives under this tool's own namespace, `signoff.v1.` (Signoff ME uses
`signoff-me.v1.`).

Edits are saved in your browser straight away. Projects with unsynced changes show an orange
dot. **Sync** (or Ctrl+S) does three things: it pulls, merges, and pushes one commit. It also
pulls automatically when the page opens.

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
  - a status: draft, approved or changed. Rewording an approved requirement marks it
    *changed* so it gets approved again.
  - a verification result (not verified, pass, fail) with evidence
  - a discussion thread
- **Traceability:** link a requirement to the checks that show it's met. The requirement shows
  how they stand:
  - an open issue on a linked check makes it *failing*;
  - a fixed issue needs re-review;
  - a waived one counts as accepted.
  Each check's panel shows **Traces to** for the requirements it supports.
- **Import / export:** paste rows from Excel or import a CSV with a *Requirement* column, plus
  optional ID, Type, Category, Source and Verification. Rows whose ID exists update that
  requirement. **Export CSV** gives the compliance matrix, which the review report also prints.
- Requirements live in the project document (`reqs`), so they sync, merge and discard like
  everything else.

## Repositories, people and access

GitHub grants access to whole repositories, so Signoff keeps each audience in its own:

| Repository | Holds | Who's on it |
| --- | --- | --- |
| `ee_design_review` (tool) | The tool and the checklists | FTEs |
| `ee_design_review_data` (data) | Internal reviews (`projects/<id>.json`) and People (`users.json`) | FTEs |
| `review-ee-<project>` (one per shared project) | That one review | FTEs and that project's contractors |
| `me_design_review`, `me_design_review_data`, `signoff`, `pcb_dfm` | Signoff ME, the hub and Fabcheck | FTEs |

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
- **Removing a contractor** takes away their GitHub access, including an invitation they
  haven't accepted. Their copy of the project disappears at their next sync.
- **Adding an FTE** invites them to this tool's repo, its data repo, every EE shared repo, and
  the rest of the suite: Signoff ME's tool and data repos, the hub repo and Fabcheck (`pcb_dfm`). That list is
  `repos.suite` in `assets/config.js`. Signoff ME's shared `review-me-…` repos are granted from
  Signoff ME's own People page, so add FTEs there too (each tool keeps its own People list).
- **A contractor** gets only their projects' `review-ee-…` repos. One working on an ME project
  is added in Signoff ME and gets only that `review-me-…` repo. The prefixes keep the two apart:
  a contractor's copy of each tool lists only repos with its own prefix.
- The **GitHub access** column compares the list with the real collaborators on each repo,
  and **Give access** fixes any gaps.
- Project file names are IDs, so they don't give project names away.

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

## How sync works

Sync commits **directly to `main`, without pull requests.** This is deliberate.

- Every item state, comment and custom check carries `updatedAt` / `updatedBy`. Two copies of
  a project merge key by key, and the newer record wins. Deletions are tombstones.
- One sync builds one commit (Git Data API: tree → commit → ref update with `force: false`).
- If someone else pushed in the meantime, GitHub rejects the ref update. Signoff then pulls,
  merges again and retries.

So two reviewers working on the same project at the same time don't lose each other's work.
Pull requests would only add friction to review data.

Changes to the **tool or the checklists** should still go through pull requests.

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
