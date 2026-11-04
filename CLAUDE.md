# Signoff EE (ee_design_review): notes for Claude

Signoff EE is the electrical design review tool, and this repo is the **source of the shared
Signoff engine**. When the suite folder is checked out, also read `../CLAUDE.md`, which covers the
suite map, hard rules, the demo suite and testing. This repo is public: no client data, tokens or
fab packages, in code, docs or commit messages.

Read next:
- `README.md`: users, tokens, requirements, repos and access, sync, *The project summary*,
  layout, the shared engine
- `docs/guide.md`: architecture
- `docs/templates.md`: the checklist schema and tags
- `docs/fabcheck-link.md`: the Fabcheck contract
- `docs/roadmap.md`

## Rules

- **Engine files**: `assets/model.js`, `github.js`, `workspace.js`, `app.js`, `demo.js`,
  `styles.css`, and `tools/build.py`, `package.py`, `validate_templates.py`. Edit them only
  here. Then copy them to the other tools:

  | Tool | Command |
  | --- | --- |
  | Signoff ME | `python tools/sync_engine.py` in `../me_design_review` |
  | Fabcheck and Signoff PL | `python tools/sync_vendor.py` in `../pcb_dfm` and `../signoff_pl`, for `model.js`, `github.js` and `styles.css` |
  | Hub | `python tools/sync_suite_css.py` in `../signoff`, for `styles.css` |

  Anything specific to one tool goes in its `assets/config.js`, `index.html`, `templates/` or
  `tests/`.
- **Check IDs** are never renumbered or reused. Reviews store their state by ID. Bump a template's
  `version` when its wording changes.
- **Review data** syncs straight to `main` without pull requests. That's deliberate:
  - Every record carries `updatedAt` and `updatedBy`, and the newer one wins.
  - Deletions are tombstones.
  - Each sync is one commit with `force: false`, retried if someone else pushed first.
- **`project.summary`** is derived:
  - `withSummary` replaces it on every write. `mergeProjects` carries it along, but nothing merges
    its fields.
  - Keep it deterministic, with no "now" timestamps, so an unchanged project isn't recommitted.
  - Signoff PL depends on its fields. If you change the format, update the README section and
    PL's reader and tests.
- **Deep links.** `?project=<id>&item=<check id>` is handled by `openWanted` / `openWantedItem` /
  `gotoItem` in `app.js`, and `&req=<requirement id>` by `openWantedItem` / `openReq`. PL's demo and
  live links rely on them.
- **PL writes requirements here (2026-11-01).** Signoff PL writes only `reqs` records into review
  files, with `GitHubStore.patchRecords` (additive proof, `force: false`, conflicts returned). Keep
  `reqParent`, `reqState`, `reqDiscipline` and `summary.reqList` in step with PL's `plreqs.js` and
  `reader.js`. See README *Requirements*.
- **Demo.**
  - Demo projects come from `config.demo`, with fixed ids from `S.demo.id(seed)`.
  - Each project lists its own `findings` and `comments`.
  - After changing a demo, bump `S.demo.VERSION` and regenerate PL's demo snapshot (see
    `../CLAUDE.md`).
  - Tests check that every demo project gets exactly its listed findings and that no demo time
    is in the future.
  - `dropStaleDemo` in `app.js` drops copies of sample projects that have an old id and a sample
    name. Such copies come from a tab still running an older demo. It drops them on load and
    whenever another tab writes, writes the good set back, and restores any sample project that
    went missing.
- **Sidebar rows** are keyed by a project's key in `projects`, not by `doc.slug`. Two projects
  with one name share a slug; the second is stored under `slug-2`.

## Before committing

1. Run `python tools/build.py`. It validates the templates and stamps the version and `?v=`.
   `--check` verifies the stamp.
2. Open `tests/test.html` over http. It should show PASS (192 tests as of 2026-11-03).
3. Sync the engine into ME, and vendor it into Fabcheck and PL where needed, then run their
   checks and tests.

## State (2026-10-25)

- Done:
  - project summary with open-issue list, written at sync
  - `cfg.merge`
  - deep links to projects and checks
  - suite demo (the Smart Thermostat main PCBA and display board)
  - sidebar link to Signoff PL (FTE-only)
  - PL repos in `repos.suite`
- The two real review repos (`review-ee-*`) have summaries. Their `open` lists appear after the
  next EE sync.
- The backlog is in `docs/roadmap.md`.
- Security (2026-11-01): review files are untrusted. Enum fields go through `model.oneOf`, sync
  checks file ids and the shared map, no token shows nothing real, Settings has Sign out, and every
  page sends a CSP. See README *Security*. Keep new fields escaped or allowlisted.
- Revisions (2026-11-03, branch `revisions`, not merged): the Revisions tab lists Fabcheck runs
  stored with the board (`config.runs`; hidden in ME and FW), downloads their package zip
  (SHA-256 checked) and tags revisions (`project.revisions`, `summary.revisions`). Every Open in
  Fabcheck is a hand-off through IndexedDB `dovetail-handoff`; links carry no `repo`. See README
  *Revisions* and `docs/fabcheck-link.md`. Not done: the demo's runs and revision, Signoff PL's
  reader for `summary.revisions`, and re-vendoring into Fabcheck and PL.
- Unsynced list (2026-11-03, merged to `main` and pushed): a list button beside the sync pill
  (`syncDetails` in `app.js`) itemizes the dirty projects with `model.changesSince(project,
  cutoff)`. The cutoff is `lastSync.startedAt` (new, written at sync) or `lastSync.at`; a project
  without `homes[id]` lists everything. Read-only: it never touches `dirty`.
