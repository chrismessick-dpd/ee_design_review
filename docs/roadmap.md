# Roadmap

## 1. Signoff (this repo) — next steps

- **Template editor:** edit checklists in the tool. The tool would open a pull request
  against `templates/` rather than committing directly.
- **Review rounds:** snapshot a review at a milestone (e.g. "Rev B schematic"), then start the
  next revision from it. Carry open issues forward and reset passes.
- **Attachments:** screenshots on findings, stored in the repo under `data/attachments/`.
- **Mentions and notifications:** `@name` in comments, and a "waiting on me" filter.
- **Auto-sync:** sync on a timer and when the tab regains focus. Show other reviewers'
  presence.

## 2. DFM / fab package analyser (separate tool, own session)

The goal is to load a complete Altium fab package (.zip) in the browser and check it:

1. **Package audit:** classify every file (Gerber X2/RS-274X layers, Excellon drill,
   pick-and-place, BOM, IPC-356, drawings) and flag anything missing or inconsistent (units,
   origin, layer count vs. stackup).
2. **Cross-checks:** compare the pick-and-place against the BOM (designators, DNP,
   quantities) and against the Gerbers (each placement sits on pads, on the correct side,
   inside the outline). Also compare the drill extents with the outline.
3. **BOM audit:** missing MPNs, duplicate designators, inconsistent values or footprints per
   MPN, single-source parts.
4. **Interactive DFM:** render the Gerbers in the browser and run vendor-style checks: trace
   and space, annular ring, drill sizes and aspect ratio, copper-to-edge, mask slivers and
   dams, silk over pads, acid traps, starved thermals, copper balance. Thresholds come from
   selectable fab capability profiles. Every finding zooms to its location.

Everything runs client-side, so customer files never leave the machine. The
earlier by-hand BOM and fab package audits are the starting point.
DFM findings could later be pushed into a Signoff review as issues on the Fab & Release
checklist.

## 3. Customer-facing tools

Management wants to show off internal tools and offer useful free tools, as PCB vendors do.
The plan is to build for that from the start rather than fork later.

**Already in place**
- **Tool/data separation:** the data location is a setting. The tool can be hosted publicly
  (GitHub Pages or the Dovetail website) while review data stays in a private repo.
- **Demo mode** (`?demo`): sample data only, no network, nothing leaves the browser.
  "Reset demo" restores it. It is safe to link from the website.
- **No server, no build, no third-party scripts:** easy to host, and nothing for a security
  review to object to.

**Options, roughly in order of effort**

| Option | Who it's for | What's needed |
| --- | --- | --- |
| Public demo page | Prospects and marketing | Host `index.html?demo` on Pages or the website. Optionally add a "Talk to us" link in the banner. |
| Free checklist (local only) | Engineers anywhere | Demo mode without the sample data: the person's own reviews, kept in their browser. Export to JSON and PDF. Lead capture is optional. |
| Free DFM checker | Engineers anywhere | The DFM tool, client-side only. The strongest "useful tool" story, because files never leave their machine. |
| Client portal | Dovetail's clients | Clients see (and comment on) the reviews of their own boards. This needs a real backend with auth (e.g. a small API with per-client access), behind the same storage interface as `GitHubStore`. |

**Before anything goes public**
- Branding pass (name, logo use, copy) and a short legal line on liability for the checks.
- Checklist content review. The checks avoid invented standard clauses and thresholds, but
  a senior EE should read every hint before external use.
- Analytics, if wanted (privacy-friendly, no file contents).
