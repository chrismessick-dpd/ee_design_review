# Signoff from the command line (plan)

2026-11-09. Status: phases 1 (read only) and 2 (push) built; see *Phase 1, as built* and *Phase 2,
as built* at the end. Next is phase 3: the Claude skill, and the first real push.

## Why

The suite was built for the graphical tools. That fits everyone except someone working through
an AI assistant from a terminal, which is most likely in FW: a firmware engineer who asks Claude to
read the code, write the Scribe description, and keep requirements in step with it.

Telling Claude how the repos are laid out isn't enough for that:

- **Reading** almost works from a description of the JSON. But the counts a person sees in the tool
  (untraced sentences, requirements not described, the `@req` inbox, and requirement states) are
  computed by the engine (`specAnalysis`, `reqState`). Re-deriving them in a script drifts.
- **Writing** doesn't. A correct write needs all of these to come out exactly as the browser makes
  them:
  - every record stamped (`updatedAt`, `updatedBy`), and Scribe's `hist`, which conflict copies
    depend on;
  - section ids kept across edits, and `{REQ-004}` and `{#Title}` resolved to stable ids;
  - deletions written as tombstones, never removals, or a browser's local copy brings them back;
  - a merge with whatever the remote holds now;
  - the summary rebuilt from the current checklists, which PL reads;
  - `stableStringify`'s exact bytes, a `force: false` commit with retry, and a read-back.

  Without a tool, every session writes about 200 lines of that again. A slip loses review data or
  leaves PL showing a stale summary.

So the plan is a thin command-line tool that **runs the engine's own code** (`model.js`,
`github.js`), plus a short Claude-facing guide. A Python port of the model is ruled out: it would
drift by next week.

## What makes it cheap

The engine is already headless. `model.js`, `github.js`, and `workspace.js` touch no DOM and no
browser storage. Their only browser globals are `window` (for `window.Signoff` and
`window.SIGNOFF_CONFIG`), `fetch` (already injected, for the tests), `TextEncoder`, `atob`/`btoa`,
and `crypto.subtle`. Node 20 and later has all of them, so `globalThis.window = globalThis` loads the
files unchanged.

The pieces a command-line round trip needs already exist, because the GUI uses them:

| Need | Engine function |
| --- | --- |
| Scribe as one editable text | `specToText`, the Edit all text |
| Text back to section records, keeping ids, tombstoning removed headings | `specSaveAll` |
| Requirements as a table and back, matched by ref | `reqsCsv`, `parseTable`, `importReqs` |
| Gaps, as the tab shows them | `specAnalysis`, `reqStats`, `reqState` |
| Merge with the remote | `mergeProjects` (per record, newer wins; `mergeSpec` conflict copies) |
| Summary, as the GUI writes it | `withSummary(doc, d => projectSummary(d, resolveTemplates(SIGNOFF_TEMPLATES, [])))` (`app.js`, `workspace()`) |
| Commit and retry | `GitHubStore.snapshot`, `blob`, `commit` (`force: false`) |
| Shareable Markdown | `specMarkdown` |

## Runtime

**Decided (Chris, 2026-11-09): Node.** No JavaScript runtime was installed on this machine, so
either way was one install.

- **(a) Node runs everything (chosen).** One file, `tools/signoff.js`, with no npm packages. It
  reuses `GitHubStore` for every GitHub call, and that code is already tested against the fake GitHub
  in `tests/test.html`. Install: `winget install OpenJS.NodeJS.LTS`. The token rule in `../../CLAUDE.md`
  ("only from the command line (Python `urllib`)") would need to also name this tool.
- **(b) Python does the I/O, and V8 runs the model.** `pip install mini-racer` embeds V8. Python does
  every GitHub call with `urllib`, as the rule says now, and calls only the pure, synchronous
  functions in `model.js`. The snapshot, commit, and retry loop (about 80 lines) is written again in
  Python, so it isn't covered by the engine's tests.

Each tool loads in its own context, with that tool's `config.js` and `templates.js`. `model.js`
reads `SIGNOFF_CONFIG` once at load, and Scribe's kinds and link words come from `config.spec`. FW
data analyzed under EE's config would come out wrong.

## Where it lives

`ee_design_review/tools/signoff.js` is an engine file, added to the `ENGINE` lists in ME's and FW's
`sync_engine.py`, so each tool runs it against its own assets: `node fw_design_review/tools/signoff.js`.
The tool repos are public, so:

- The token is read from the environment (`SIGNOFF_TOKEN`), `gh auth token`, or a git-ignored file
  named in a local config. It's never printed and never passed on the command line.
- Checkouts hold client data. The tool refuses to write one inside a tool repo. Dovetail's go under
  the client's own folder.
- No client names in the code, tests, or docs.

A contractor runs it with their own token, which only reaches their `review-fw-*` repos. The CLI
finds reviews the way `workspace.js` does, so it inherits the access model.

## Commands

All of them take `--json` for scripts, and exit non-zero on failure.

| Command | Does |
| --- | --- |
| `signoff whoami` | The GitHub login, the name writes are stamped with, and whether the data repo opens (FTE) |
| `signoff list [--project P]` | Reviews in the data repo and the `review-*` repos: id, slug, name, stage, progress, and Scribe gaps |
| `signoff pull <review> [dir]` | Writes a checkout folder (below) |
| `signoff status [dir]` | Offline: what changed locally, untraced and flagged sentences with their sections, requirements not described, and requirement states |
| `signoff push [dir] --dry-run` | Everything a push does, short of the commit, and a report of what would change |
| `signoff push [dir] --confirm <code>` | Commits the change the dry run showed (see *Push*, and *Phase 2, as built*), and prints the commit and a deep link |
| `signoff open <review> [--req REQ-004]` | Prints the hosted link, for a person to look in the GUI |
| `signoff export <review>` | `specMarkdown` |

A checkout:

```
<slug>/
  review.json   the document as pulled: the base. Never edited.
  scribe.md     specToText: the Edit all text, with {REQ-004} links and * kind headings. Edit freely.
  reqs.csv      ID, Requirement, Type, Discipline, Category, Source, Verification method, Status
  status.md     generated on pull and status: progress, gaps, and the inbox. Read-only.
```

`reqs.csv` has only the columns `importReqs` reads back. A requirement is retired with Status
`deprecated`. A requirement leaving the file doesn't delete it, so deleting needs its own command
(`signoff req delete REQ-012`), and the dry run names it.

## Push

1. **Build the local document** from `review.json`: `importReqs` first, so a new `{REQ-049}` in
   `scribe.md` resolves, then `specSaveAll`. Records are stamped with the configured name.
2. **Read the remote** file at the current head, and merge: `mergeProjects(local, remote)`. Edits
   made in the GUI since the pull merge per record, and a section changed on both sides becomes a
   conflict copy, which the report lists.
3. **Summarize and serialize** with the engine (`withSummary`, `stableStringify`). Only this one file
   is written. `GitHubStore.sync` isn't used, because it rewrites every review whose summary is stale.
4. **Prove the change.** With the touched record ids and `summary` taken out, the new file must equal
   the remote byte for byte. Every touched record must be new, or stamped newer than the remote's.
   This is `patchRecords`' check, extended to several maps. It replaces "prove the change is
   additive" in `../../CLAUDE.md`, because tombstones aren't additive.
5. **Dry run:** print the sections and requirements added, changed, and deleted (each deletion by its
   title), conflict copies, the gap counts before and after, and the summary's changed fields. Then stop.
6. **Commit** with `force: false`. If someone pushed first, go back to step 2, up to four times.
7. **Read the file back.** It must match byte for byte. Then refresh `review.json`.

Chris's browser keeps its own copy of each review. His next sync takes in the CLI's records, newer
wins, just as with another reviewer.

## For Claude

A short guide, `tools/signoff-skill.md`, ships beside the CLI and is installed as a Claude Code skill
wherever the CLI is used: the tools folder's `.claude/skills/`, or a firmware repo's. It covers:

- The loop: pull, edit `scribe.md` and `reqs.csv`, status, push with dry run, then push.
- The Scribe markup: the writing guide's marks (`{std}`, `{REQ-004}`, `{#Title}`, `@req`, `Uses:`,
  `> gist`, and `* kind`).
- The rules:
  - Never edit `review.json` or any data file by hand.
  - Nothing is pushed until a person has seen its dry run, unless they said otherwise.
  - Checkouts stay out of public repos.
  - Hand off with `signoff open`, so a person can check the result in the GUI.

An MCP server isn't needed. A CLI and a skill work with any assistant. One can wrap the CLI later if
typed tools turn out to help.

## Phases

1. **Read only:** `whoami`, `list`, `pull`, `status`, `open`, and `export`. Node tests run against a
   fake GitHub.
2. **Push** for Scribe and requirements, with tests for no change, edits, a deletion, a conflict copy,
   and a retry after someone else's push.
3. **The skill**, and the first real use (below).
4. **Later, as needed:**
   - check statuses and comments (`signoff check`, `signoff comment`);
   - Verified and Evidence in `reqs.csv` (`importReqs` doesn't read them yet);
   - a Markdown requirements file, if CSV turns out clumsy, and the same text in the GUI as an Edit all
     for requirements;
   - a mode that loads the engine from the hosted tool, for engineers without a checkout.

**Acceptance.**

- `pull`, then `push --dry-run` with no edits, reports no change.
- After a real push:
  - the GUI's Scribe tab, its diagram, and the Requirements tab look as they would after the same
    edit made by hand;
  - PL's *What it does* shows the new gists;
  - Chris's next GUI sync writes nothing new.

## First use

The first real use is backfilling three firmware targets' descriptions from their code. The audits
don't need to wait for the CLI. Each one can write `scribe.md` and `reqs.csv` in the formats above
into a local folder now, and push once phase 2 works.

## Decisions (Chris, 2026-11-09)

1. **Runtime:** Node.
2. **The name on CLI writes:** his own, "Chris Messick", in each record. The commit message says it
   came through the command line. A separate "(Claude)" name would show up as another person in the
   tools' reviewer lists. `~/.signoff/config.json` holds the name.
3. **Approval:** every push needs a dry run first. `push --dry-run` prints a code for the exact change,
   and `push --confirm <code>` commits only that change.
4. **Checkouts:** `C:/Dovetail/signoff-checkouts/<tool>/<review slug>` (`checkouts` in
   `~/.signoff/config.json`), outside the tools folder and every repo.

## Phase 1, as built (2026-11-09)

`tools/signoff.js` and `tools/signoff_test.js` are engine files: edited here, copied into ME and FW
by their `sync_engine.py`. `build.py` doesn't hash `tools/`, so they don't change a tool's version.

```
node tools/signoff.js whoami
node tools/signoff.js list [--project P] [--all]
node tools/signoff.js pull <review> [dir] [--force]
node tools/signoff.js status [dir]
node tools/signoff.js open [dir|review] [--req REQ-004] [--item <check id>]
node tools/signoff.js export [dir|review] [--out file.md]
```

Each takes `--json`. `<review>` is an id, slug, or name, or enough of one to be unique.

- **Engine.** It loads the tool's `config.js`, `templates.js`, `model.js`, `github.js`, and
  `workspace.js` into Node's global scope with `window = globalThis`, unchanged. Node's `fetch` gets
  the engine's requests without the browser-only `cache` option.
- **Finding reviews** is `workspace.js`'s logic, read only. An FTE reads the data repo and the
  shared map. A contractor reads the repos with the tool's prefix. A file whose id doesn't match its
  name is skipped.
- **Token.** It's read from `SIGNOFF_TOKEN`, then `--token-file`, then `tokenFile` in the config,
  then `ee_tools_token.txt` beside the tool folders, then `gh auth token`. It's never printed.
- **Checkouts.** `pull` writes `review.json` (the stored bytes), `scribe.md` (`specToText`), `reqs.csv`
  (the eight columns `importReqs` reads), `status.md`, and `.signoff.json`. `pull` refuses:
  - a folder inside a tool folder, inside the folder the tools sit in, or inside a git repo whose
    remote is a Signoff tool repo;
  - a folder that isn't empty;
  - a checkout with local edits, unless `--force`.
- **`status`** works offline. It compares the files with ones regenerated from `review.json`, so
  line endings and a trailing newline don't count as edits. It builds the edited document as push
  will (`buildLocal`): `importReqs`, then `specSaveAll`. It reports:
  - the records that would change;
  - untraced and `@req` sentences, broken links, and Uses names with no section;
  - requirements not described, and the same ID used twice;
  - check progress.

  It rewrites `status.md`.
- **Requirements.** A row whose cells match the stored requirement changes nothing. importReqs
  fills in defaults for blank cells, so a blank cell over a blank field stays blank. Editing an
  approved requirement's words makes it Changed. A requirement missing from the file is kept, and
  the report names it.
- **Section order.** `specSaveAll` numbers sections 1, 2, 3…, so every section whose stored order
  was anything else came back changed, which would also make needless conflict copies.
  `keepOrders` keeps each stored order the sequence allows (the longest increasing run), gives the
  rest orders between their neighbors, and drops records that end up unchanged. A move changes only
  the section that moved. Edit all in the browser has the same renumbering; moving this into
  `specSaveAll` itself is a candidate engine change.
- **A missing file** counts as unedited, never as "delete everything".
- **`review.json` is checked.** Its git blob sha must match the `blob` in `.signoff.json`, or
  `status`, `open`, and `export` refuse, since every comparison starts from it. `pull --force` starts
  over.
- **Round-trip warning.** `status` also builds the files as pulled. If they would already change a
  record, the text forms can't hold the review exactly, and `status` says not to push it. Two
  requirements with one ID cause it: `importReqs` matches rows by ID, so the second row would rewrite
  the first requirement. Push (phase 2) must refuse in that case.
- **`export`** from a checkout includes its local edits (`specMarkdown`).
- **Tests** (`node tools/signoff_test.js`; 21 in each of EE, ME, and FW then, 34 with phase 2). They run against a fake
  GitHub holding the tool's demo reviews and a made-up fixture with fractional section orders. They
  check:
  - every demo review round-trips with no change;
  - pull writes the exact stored bytes;
  - status reports edits, deletions, moves, and broken links;
  - pull refuses where it should;
  - contractor listing, `open`, and `export` work;
  - nothing but GETs reaches GitHub.
- **Tried live, read only,** on the three FW reviews in `fw_design_review_data`. Each pulled
  checkout builds back to zero changed records, and each stored file re-serializes byte for byte.
  Nothing was written.

## Phase 2, as built (2026-11-09)

```
node tools/signoff.js push [dir] --dry-run           what would change, and a code
node tools/signoff.js push [dir] --confirm <code>    commits exactly that
```

- **The plan** is made the same way for both. The steps:
  1. The checkout must round-trip; if it doesn't, push refuses, as `status` warns.
  2. `buildLocal` stamps the edits with the configured name, or the GitHub profile's name.
  3. Read the file on GitHub now. Refuse if it's gone, if it isn't this review, if it wasn't written
     by `stableStringify`, or, in the data repo, if the shared map has moved the review to its own
     repo.
  4. Merge with `mergeProjects(local, remote)`, the browser's merge.
  5. Rebuild the summary with the tool repo's checklists over the bundled ones (as `app.js` does),
     then `stableStringify`.
- **The proof.** Every record and top-level field must equal GitHub's, except:
  - the records this push writes;
  - the conflict copies the merge makes;
  - the summary.

  A map that's empty on one side and missing on the other counts as equal. The proof catches a field
  this copy of the tool doesn't know (`mergeProjects` would drop it). It also catches a record that
  went backward on GitHub, which newer-wins would roll back. Either way nothing is pushed.
- **Two more refusals.**
  - **A requirement this push changes must still be as pulled on GitHub.** The changed record is
    the whole requirement as pulled, stamped now, so newer-wins would undo a browser edit made to it
    since the pull. That includes fields the CSV doesn't hold, such as Verified and evidence. Sections
    get a conflict copy, but requirements don't. This is `patchRecords`' bases check. Merging field by
    field could come later.
  - **The merged result must round-trip** through the text files. A requirement added here and
    another added on GitHub with the same ID fail that test, and the next checkout couldn't be
    pushed.
- **The code** is a hash of:
  - the repo and path;
  - the blob the checkout was pulled from, and the blob on GitHub now;
  - `scribe.md` and `reqs.csv`;
  - the stamped name.

  Timestamps stay out of it, so a second plan of the same change gives the same code. A code from an
  older dry run stops matching once anything it covers changes.
- **The dry run** lists:
  - requirements added and changed, and sections added, changed, and deleted (each by title);
  - whether GitHub changed since the pull;
  - conflict copies, and records that lost to a newer edit on GitHub;
  - the summary before and after.
- **The commit** is one commit with `force: false`. If someone pushed first, it retries on top of
  their commit, up to four times, but only while this file's blob is still the one the dry run read;
  otherwise it stops, and nothing is pushed. The message reads
  `Signoff FW (command line): <review>: 1 requirement added, …` and names who pushed it.
- **Read back.** The file must match byte for byte. Then the checkout is refreshed from what was
  pushed (`review.json`, regenerated `scribe.md` and `reqs.csv`, `.signoff.json`'s blob and head,
  `status.md`), so it also carries other people's merged edits.
- **Not in push yet:** deleting a requirement. A requirement left out of `reqs.csv` is kept. Retire
  one with Status `deprecated`, or delete it in the browser.
- **Tests:** 34 in each of EE, ME, and FW. The fake GitHub takes trees, commits, and ref updates that
  refuse a non-fast-forward, and can push first. The tests cover:
  - no push without a dry run, and a wrong code;
  - an exact commit: tombstones, untouched records, a summary the browser would leave alone, and the
    message;
  - a retry after someone's commit to another file;
  - a stale code after someone's edit, then a merge that keeps it;
  - a conflict copy;
  - refusals:
    - a rollback;
    - a requirement edited on GitHub since the pull;
    - one ID left on two requirements by the merge;
    - a review that doesn't round-trip;
    - a field the tool doesn't know;
    - a review shared away.
- **Tried live, dry run only,** on Handle Firmware, which another session had backfilled with its own
  script (38 sections, 78 requirements). It round-trips with no warning. A throwaway added section
  passed the proof: only that section and the summary would change. The checkout was deleted, and
  nothing was pushed. All three FW reviews' stored summaries match the engine's, so a browser sync
  won't recommit them.
