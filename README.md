# Signoff — EE design review

Signoff is Dovetail's checklist tool for schematic, layout, assembly, fab and bring-up reviews.
Each project is a review of one board. Reviewers mark checks Pass / Issue / N/A, discuss them
in comment threads, track issues to Fixed or Waived, and print a review report.
Everything syncs through this GitHub repo, so the team works on the same reviews.

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

Which token you need depends on who owns the repository:

- **The repository owner:** a fine-grained personal access token with **Contents: read and
  write** on this repository.
- **Collaborators:** a *classic* token with the **repo** scope. A fine-grained token can only
  target repositories owned by its holder or by an organization they belong to, so it can't
  reach another person's personal repository. If the team grows, move the repository (or
  just its data folder) into an organization, and everyone can use fine-grained tokens.

The token is kept in your browser (for the session only, unless you tick *Remember*) and is
sent only to `api.github.com`.

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

## People and access

There are two levels, set on the **People & access** page (FTEs only):

- **FTE:** sees every project and can create projects, edit People, and archive projects.
- **Contractor:** sees only the projects they're added to. Add them to a project from People
  or from the project's details.

Who you are comes from your GitHub token. The repo owner is always an FTE. While People is
empty, everyone who syncs is treated as an FTE, so add yourself and the other FTEs first.
The list is saved in `data/users.json` and syncs like everything else.

**What this does and doesn't protect.**
- Signoff never shows or downloads a project that a contractor isn't on.
- Project files are named by ID, so file names don't give project names away.
- GitHub grants access to a whole repository. A contractor who browses the repo on
  github.com, or uses their token directly, can still open any project there.
- If that matters for a client, put that client's work in a separate repository. The data
  location is a setting.

**Giving a contractor access**
1. They create a free GitHub account and send you their username.
2. Add them in People. If your token has *Administration: read and write*, the page shows
   whether they have repo access and can send the GitHub invitation. Otherwise invite them
   under *Settings → Collaborators* on GitHub.
   - On a personal account only the owner can invite, and every collaborator can push.
   - After the move to the company organization, FTE admins can invite, and roles can be
     narrower.
3. Send them the tool: `python tools/package.py` makes `dist/Signoff-<build>.zip`. It holds
   the tool and checklists only, with no data and no token, plus a START HERE note.
4. They open it, click the gear, and follow *New to GitHub? Set up in four steps*. They then
   create a classic token with the `repo` scope (the link fills that in) and click
   Save & sync.

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
| `assets/model.js` | Data model: templates, profile rules, progress, merge, legacy import |
| `assets/github.js` | GitHub sync (injected `fetch`, so it can be tested offline) |
| `assets/app.js` | UI |
| `assets/demo.js` | Sample projects for demo mode |
| `assets/templates.js`, `assets/version.js` | Generated by `tools/build.py` |
| `templates/*.json` | The checklists — see [docs/templates.md](docs/templates.md) |
| `data/projects/<id>.json` | One file per review (written by the tool) |
| `data/users.json` | People: FTEs and contractors, and contractors' projects |
| `tools/package.py` | Builds the zip you send to a contractor |
| `tests/test.html` | Model and sync tests against a fake GitHub API (open it over http) |
| `docs/roadmap.md` | DFM tool and customer-facing plans |

The data folder can be moved to another repository in Settings: owner, repo, branch and data
folder are all configurable. Keeping the tool's code and the review data in separate places
means the tool can be published without exposing client reviews.

## Changing the tool or the checklists

1. Edit `templates/*.json`, `index.html` or `assets/`.
2. Run `python tools/build.py`. It validates the templates, rebuilds `assets/templates.js`,
   and stamps `assets/version.js` plus the `?v=` cache-busters. Use `--check` in CI.
3. Open `tests/test.html` over http (`python -m http.server`, then
   `http://localhost:8000/tests/test.html`). It should say PASS.
4. Open a pull request.

After a sync, the app compares its own build hash with the repo's. If they differ, it shows
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
