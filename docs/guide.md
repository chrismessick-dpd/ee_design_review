# Signoff EE: user guide

**Part 1** can be shared with customers. **Part 2** is for Dovetail FTEs.

---

## Part 1: Signoff EE at a glance

Signoff EE is Dovetail's electrical design review tool. A project is a review of one board. It
walks reviewers through 931 checks in six checklists and records every decision, comment and
issue. At the end it produces a signed-off review report.

| Checklist | Covers |
| --- | --- |
| Schematic | Power, grounding, decoupling, ratings, protection, clocks, MCU/FPGA, battery, motor, mains |
| Interfaces | 29 interfaces: USB, Ethernet, CAN, I2C, SPI, DDR, PCIe, RF, sensors, audio… |
| PCB Layout | Stackup, placement, routing, high-speed, RF, creepage, thermal, EMC, DFM, test |
| Assembly & BOM | BOM quality, footprints, stencil, soldering, inspection |
| Fab & Release | Fab package, drawing, drill, mask, panels, release control |
| Bring-up | First boards: power-on, rails, clocks, interfaces, thermal, EMC pre-checks |

**How a review works**

1. **Describe the board.** Pick the checklists and the board's profile (battery, mains, RF,
   high-speed, BGA, flex…). Checks for features the board doesn't have are set aside, so the
   list fits the board.
2. **Review.** Mark each check **Pass**, **Issue** or **N/A**. Keyboard: `j`/`k` to move, `p`/`i`/`n`
   to mark, `c` to comment. Each check carries guidance on what to look for.
3. **Track issues.** Every issue has a severity, an owner, a reference, a discussion, and an
   outcome: open, fixed or waived. The **Findings** tab lists them all.
4. **Requirements (optional).** List what the board must do, how each requirement is verified,
   and which checks show it's met. Signoff flags a requirement whose checks have open issues.
   You can paste requirements from Excel and export the compliance matrix.
5. **Report.** Print or save a PDF with the summary, findings and requirements matrix, plus
   sign-off lines.

**Working together.** Several reviewers can work on the same project at once. Their changes
merge record by record, so no one overwrites anyone. Reviews are kept in private, access-controlled
storage. Each person sees only the projects they've been given.

**Try it:** the demo (`?demo`) has two sample reviews and stays entirely in your browser.

---

## Part 2: for Dovetail FTEs

### Where things live

This tool is one part of the Dovetail Signoff suite. For the suite-wide picture (repositories,
people and access, tokens), see the hub's guide: `signoff/docs/guide.md`.

| | |
| --- | --- |
| Tool and checklists | `ee_design_review` (this repo) |
| Internal reviews and People | `ee_design_review_data` (FTEs only) |
| Projects shared with contractors | one private repo each: `review-ee-<project>` |

### Architecture

- **Static web app.** It has no server and no dependencies. Open `index.html` from disk or host the
  folder. All GitHub traffic goes from the browser to `api.github.com`, with the user's own token.
- **One engine, two tools.** `assets/model.js`, `github.js`, `workspace.js`, `app.js`, `demo.js`,
  `styles.css` and the `tools/*.py` scripts are shared with Signoff ME. **Edit them here**, then run
  `python tools/sync_engine.py` in `me_design_review`. Everything EE-specific is in
  `assets/config.js`: names, repos, tags, stages and demo data.
- **Data.** Each project is one JSON document: `meta`, `items` (check states), `sections`,
  `comments`, `custom` (project checks) and `reqs` (requirements).
  - Every record carries `updatedAt` / `updatedBy`, and the newer one wins key by key. Deletes are
    tombstones.
  - Sync is pull → merge → one commit per repo (`force: false`), retried if someone pushed first.
    Review data commits straight to `main`. That is deliberate; don't "fix" it with pull requests.
- **Checklists.** They are JSON in `templates/` (schema and tag list in `docs/templates.md`).
  - Never change or reuse a check ID; reviews store state by ID.
  - Bump `version` when the wording changes.
  - Checklists pulled from the repo override the bundled copy, so updates reach everyone at their
    next sync.
- **Fabcheck link.** Fabcheck's Send to Signoff writes issues into a project, with the run and
  board locations attached. The issue panel's **Open in Fabcheck** reopens that run zoomed to the
  spot. Contract: `docs/fabcheck-link.md`.

### Everyday use

- **Sync** pushes your changes and pulls everyone else's; it also runs when the page opens.
  **Discard** throws away unsynced changes and restores what's on GitHub.
- **People & access:**
  - Adding an **FTE** invites them to every suite repo.
  - Adding a **contractor** to a project moves that project into its own `review-ee-…` repo and
    invites only them.
  - The **GitHub access** column shows any gaps; **Give access** fixes them.
- **Contractor copy:** `python tools/package.py` builds `dist/Signoff-<build>.zip`. It holds the
  tool only, with no data and no token. Never put your own token in a copy you send out.
- **Old checklist exports:** go to **⋯ → Import**.

### Changing the tool

1. Edit `templates/`, `index.html` or `assets/`.
2. Run `python tools/build.py`. It validates the templates, bundles them and stamps the version.
3. Open `tests/test.html` over http. It should say PASS.
4. Sync the engine into Signoff ME, then commit both.

### Troubleshooting

| Symptom | Cause |
| --- | --- |
| "GitHub didn't accept the token…" | The browser holds a stale token. Paste it again in Settings. |
| "Can't open …_data" | The token doesn't cover the data repo, or a Settings typo. Your work is kept. |
| "No access to review-ee-… yet" | Accept the invitation (sidebar card), or ask the owner to invite you. |
| "Newer tool available" | Pull the tool repo (or get a new contractor zip). |
