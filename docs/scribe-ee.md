# Scribe EE: the description tab in Signoff EE, as a schematic block diagram (design)

2026-11-08. Status: built and pushed. Chris: "think of it like a schematic block
diagram, and the markdown describes each subcircuit." The FW tab and its design are in
`../../fw_design_review/docs/scribe.md`; this covers what changes for a board.

## Why it fits a board

EEs already explain a board with a block diagram, and EE requirements belong to blocks: "the 3V3 rail
shall supply 1.5 A at ±3%", "the USB-C port shall survive ±8 kV contact ESD". So each heading is a
subcircuit, its text says what the subcircuit does and how, and its sentences link to the requirements
it meets. Tracing, `@req`, the inbox, Not described, Edit all, the writing guide, conflict copies,
export, and Signoff PL's *What it does* work as they do in FW.

## What's different from FW

| | FW (firmware) | EE (board) |
| --- | --- | --- |
| A section is | a task, module, or driver | a subcircuit |
| Kinds | product, task, module, driver, hardware, interface | power, connector, MCU, digital, analog, driver, protection, other |
| Links | `Uses: Sensor driver` | `Connects: MCU (UART)` and `Supplies: MCU (3V3)`, each with an optional signal or rail name in brackets, and on Connects an optional direction: `MCU (UART, in)`, `MCU (I2C, both ways)` |
| Diagram | layers, top to bottom | signal flow, left to right, with power along the top |
| Also | | `Parts: U7, L1, C1–C3`, the subcircuit's reference designators |

### Kinds and links come from config

`config.spec` gains `kinds` (id, label, and for EE which link a drag from it makes and whether it
sits in the power band), `links` (the link words), and `layout` (`layers` or `flow`). FW's config
spells out what's built in today, so FW is unchanged. Data keys stay as they are (`spec`); only the
words in the text differ by tool.

### The flow layout

- **Signal flow, left to right.** Blocks are placed in columns by their Connects lines: a block
  nothing connects into starts at the left, and each block sits one column right of the furthest
  block connecting into it. So write Connects in the direction signals go, input to output; for a
  two-way bus either direction draws fine. Within a column, blocks follow the text's order, then are
  nudged toward the blocks they connect to so lines cross less.
- **Power along the top.** Power blocks sit in a band above, left to right by their Supplies chain
  (the AC/DC supplies the buck). Each power block drops its rail as a line labeled with the rail name
  ("5V", "3V3") down to every block it supplies.
- *(Superseded by Sections, below: type boxes and the power band.)*
- **Connections are labeled.** A Connects line draws with its signal name ("UART", "I2C", "FFC") at
  its middle. An unlabeled link draws plain.
- **Building it works the same way.** *Add a block* (a chip per kind above the diagram) adds a
  subcircuit, optionally connected from or supplied by a block, with its signal or rail; its column
  follows from its links. Dragging from the dot on a block's top-right corner (its right edge before 2026-11-18) to another adds a Connects link
  (Supplies from a power block). The block panel lists Connects and Supplies with their names (click a
  name to change it), what connects into or supplies the block, and its Parts. Blocks aren't dragged
  between columns (their place comes from their links); change a kind in the panel.

### Parts

A `Parts:` line names the subcircuit's reference designators, with ranges (`C1–C3`). It shows as
chips under the section and in the block panel. It isn't traced and isn't checked yet; later it can
tie a block to Fabcheck's BOM (part numbers and values) and to Loom's *From a board* connectors.

## The demo

The thermostat's Main PCBA (`pdemo7`), matching Fabcheck's made-up package
(`pcb_dfm/tools/make_demo_boards.py`):

- Mains input (connector): J1, F1, RV1. Connects to the isolated supply.
- Isolated supply (power): PS1, 5 V from 100–240 V AC, the reinforced barrier (REQ-001, REQ-002).
  Supplies the relays and the buck.
- 3V3 buck (power): U7, L1, C1–C3, C12. Supplies the MCU, the Wi-Fi module, and the display board.
- MCU (mcu): U4, C4–C7, C41, R12, R13. Connects to the relay drivers, the Wi-Fi module (UART),
  the display connector (I2C), and the status LEDs.
- Wi-Fi module (digital): U1 (REQ-004).
- Relay outputs (driver): Q1, Q2, D1, D2, R1, R2, K1, K2, J4 (REQ-005).
- USB-C service port (connector): J3, R14, R15, D5 (REQ-003). Connects to the MCU (USB).
- Display connector (connector): J2, the 24-pin FFC to the display board.
- Status LEDs (driver): D3, D4, R16, R17.

With one untraced sentence and one `@req` note (the 3V3 ripple at the Wi-Fi module). This changes the
EE demo, so demo `VERSION` goes up and PL's snapshot is regenerated.

## The guide

EE gets its own steps in the same guide (`assets/specguide.js`), picked by layout: subcircuits,
Connects and Supplies, the power band, Parts, and building a block (an ESD protection block on the
USB-C port, connected and given its requirement).

## Sections, not kinds (2026-11-08, Chris)

Kinds were taken out of EE ("that's going to get really messy trying to add all the block types we
need"): there's one **+ Add block**, and the diagram is organized by **sections** instead.

- **The outline is the hierarchy.** A heading with headings under it is a section, drawn as a box
  around its blocks; sections nest. The board's own level-1 heading isn't drawn. Power is just a
  section; a `Supplies:` line on any block still puts a power flag on each block it feeds (or an arrow
  between neighbors in one section).
- **Making sections.** Write headings under a heading, or drag on empty diagram space to draw a box
  around blocks: you name it, and it becomes a heading with those blocks moved under it
  (`model.specGroup`). The section panel has Add a block here, Edit its text, and Ungroup
  (`specUngroup`: its blocks move up a level; the heading goes unless it has text).
- **Dragging in the diagram only arranges** (Chris: dropping a block outside a box left it unclear
  whether it was still in the section). A section's box always wraps its blocks, so a dragged block
  takes its box along. A section moves with everything in it.
- **The hierarchy under the diagram** (after Signoff PL's Map) is where membership changes: the
  board as trunk, sections as branches (nested sections branch again), blocks as tiles, each with its
  requirements and gaps. Drag a tile or section onto a section to move it in, onto a block to put it
  just before (`specNest` with `beforeId`), or onto the board to take it out. **+** on a section adds a
  block inside; **+ Section** names a section and picks the blocks to put in it.
- **Sections carry requirements.** A section is a heading with text of its own, for what belongs to the
  whole section (the demo's power budget on Power, flagged `@req`). Its box, its branch, and its panel
  (*Requirements on the whole section*) show what's tied to it. Once anything is dragged, every block's
  place is kept (`pos` on each section record, merged like any field); boxes fit their blocks.
  **Auto layout** forgets the places. Laid out automatically, each section is a row of its blocks in
  signal order, sections stacked, with loose blocks sharing rows.
- **Add block** has *In section* as well as *Connected from, or supplied by* and a signal; a new block
  lands on the diagram (beside its section's blocks once places are kept), selected and flashing.
- **Sections** (above the diagram) hides the boxes.
- The demo is three sections, Power, Control, and Outputs, around the nine blocks; the guide has steps
  for the hierarchy and a section's own requirement (23 steps).
- Conflict copies need history on both sides: a section built (the demo) or never edited merges
  newer-wins, so an older demo copy from a tab still open never makes copies.

## As built

- A block added from the diagram stays on the diagram: it's selected, scrolled into view, and flashed;
  its panel opens when you click it (Chris: the panel hid where it landed). *Other* is a kind for
  anything that fits none.
- Engine: `config.spec.kinds` (`id`, `label`, `plural`, `band`, `link`), `.links`, `.layout`, and
  `.parts`, read on every call (`model.specKinds`, `specKindInfo`, `specLinkWords`, `specKindLink`).
  Link lines keep a signal per name (`specLinkItems`, `specUsesItems`, `specLinkText`); analysis gives
  each section `edges` (`{ id, word, label }`) and `parts`. Renames follow into every link word and keep
  the signal. FW's config is unchanged; the defaults are its kinds and Uses.
- The flow diagram is `specFlowHtml` in `app.js`. Power reaches its blocks as power flags, not wires:
  one per rail on the block's top edge, clickable to the supply.
- The guide has an EE set of 21 steps (`EE_CHAPTERS` in `specguide.js`), picked when the layout is
  flow; it runs on `pdemo7` (`config.spec.guide`: 7).
- Demo `VERSION` 17; PL's snapshot regenerated. Tests: EE 313 (27 for EE's vocabulary and sections; the earlier
  description tests run under FW's vocabulary), ME 62, FW 66, PL 215.
- Not synced yet: Fabcheck, Loom, and Partcheck's `me-send` (at merge).

## Open questions

- Should Parts be checked against Fabcheck's BOM (a designator in two blocks, or in none)?
- Should a block link to its schematic sheet?
- Does the Display & Sensor Board get a demo description too?
- Interfaces between boards (the FFC) could be shared with the display board's review.

## Tickets from first use (2026-11-13)

From a co-worker's first EE description (`signoff_tickets` 3 to 8; Chris approved each fix):

- **`@req` right after a full stop** (`designs.@req Uses …`) belongs to the sentence before it, which
  ends after the tag (`specSentences`). With a space it starts the next sentence, as before.
- **A block added to an arranged diagram** (one where blocks have saved places) goes right of the last
  block in its section, then further right or down until it covers no block (`specFlowHtml`). It used
  to take the automatic layout's place, which could sit under a moved block.
- **One line per pair of blocks.** A connection both blocks name (MCU `Connects: LIN Tcvr (UART)` and
  LIN Tcvr `Connects: MCU (UART)`) draws once, with arrows at both ends; different signal names show as
  "UART / TBD". The line's panel says so, and Delete removes both entries with one Undo.
- **Direction.** A Connects item may end its brackets with `in`, `out`, or `both ways` (`model.specLinkDir`;
  `dir` on link items and edges). Out, the default, is the arrow from the block whose line it is. The
  line's panel has a Direction pick that writes it. Commas inside brackets no longer split items.
- **Labels** sit at the middle of their line, or the nearest place along it that covers no block or
  power flag; a line too short for its label (blocks side by side) puts it just below or above them, with
  a dashed arrow back to the line. Chris then asked for them to drag: a label slides along its line
  when dropped within 16 units of it, and anywhere else stays where it's dropped, with the arrow back to
  its place on the line. The place is kept on the block whose link line it is, as
  `labels['<other section id>|<link word>'] = { t, x, y }` (t along the line, 0 to 1; x, y the offset off
  it), so it follows when blocks move (`model.specLabels`). Auto layout forgets them with the arrangement.
  Then (Chris, 2026-11-13) the arrow back became a small dot on the line, which drags along the line (the
  label stays put), and the dashed leader follows live while either the label or its dot drags. A label
  dragged off its line keeps its dot where it last sat on the line.
- **Lines and rails** (Chris, 2026-11-13: lines fanning out of one connector came in at odd angles, and the
  arrowheads were big). Every line leaves and enters square to the block's side on a 12-unit straight stub
  (`SPEC_STUB`), with the curve between the stubs, so its head always sits on a straight run; labels ride
  the curve (`specRoute`'s `cd`). Heads are slim and notched, 9 units long, a fixed size however thick the
  line. A power flag is a stem up to a bar, the rail symbol, not an arrow.
- **Moving sections** shows: a grip beside a heading on pointing, a title on the heading, a "Drag a
  heading to move its section" hint in the page's subline (pointers only), and a sentence in the guide.

## Expanding and exporting the diagram (Chris, 2026-11-13)

- **Expand** (the arrows at the card's top right, in EE's flow diagram and FW's layered map) fills the
  window, on a phone too. There the wheel or a trackpad pinch zooms about the pointer, a middle or right
  drag pans (Chris chose it: a plain drag on empty space still draws a section), and on a touch screen a
  pinch zooms and one finger on empty space pans. Everything else works as on the page: a click opens the
  block or line panel over the diagram, and its buttons step left of the panel. Fit shows the whole
  diagram; Esc closes the panel first, then the expanded view. Closed, the card shows the whole diagram
  as before. The view (`specZoom`, a viewBox) lives only while expanded.
- **Export** (the down arrow beside it) saves the whole diagram, whatever the zoom, in light colors and
  without handles, hit areas, beads, or selection: a PNG at twice size, an SVG with its styles inline, or a
  landscape sheet in the print view (Print or save as PDF) with a title block at the bottom right: the
  review's name, project, client, number, revision, stage, date, who made it, and sheet 1 of 1. The
  review's name is the Title across the top, and "Signoff EE block diagram" the Page beside Rev (Chris
  swapped them, 2026-11-13), and the block is half its first size, its bottom right corner kept.

## Section sizes and routed lines (Chris, 2026-11-18)

- **Section boxes resize** by grips on their edges and corners (`specGrips`, `flowResize`). A section keeps
  `grow: { l, t, r, b }`, how far each edge reaches past the fit around its blocks (never under 0,
  `model.specGrow`). A resize freezes the arrangement as a move does; Auto layout forgets it.
- **Lines route as Loom's wires** (Chris: Loom owns the engine). `assets/vendor/route.js` and `connect.js` are
  Loom's, copied unchanged by `tools/sync_routing.py` (`build.py` fails while they're stale; ME and FW get them
  through `sync_engine.py`). Change the engine in Loom, check its `tests/golden.js`, then sync. Only EE's flow
  diagram uses it; FW's layered map keeps its curves (Chris).
  - **Ports.** Each end of a drawn line (connections and supply arrows; power flags stay flags, Chris) has a port
    on its block's edge. Unmoved, it sits on the side facing the other block, spread along that side in the order
    of the blocks the ports go to; dragged, it slides round the edge on a 10-unit grid and is kept on its block,
    `ports['<other id>|<word>'] = { side: 'l' | 'r' | 't' | 'b', t }`. A port on the top or bottom runs out to a lead
    point past the edge, then turns either way (Loom's `termsRect`). A moved port routes its line afresh.
  - **Shapes.** A drag on a line's straight run moves it (Shift breaks it at the grab, Ctrl is off the grid, it
    snaps straight within one grid step, 10 units: Loom's 5 steps left no room between two straight lines under
    100 apart, Chris, 2026-11-19), a double-click adds a bend, and the shape is kept on the line's from-block as
    Loom's record, `routes['<to id>|<word>'] = { v, a, b, mode }`. A click without moving still opens the line's
    panel, which has **Reset route** once a line is shaped or a port moved. A shape whose blocks moved apart so it
    no longer fits routes afresh (not written; the record stays until Reset or Auto layout).
  - **Moves.** While a block or section drags, its lines re-route live (`flowLive`, the engine's fast mode); a
    shaped line with both blocks moving carries its shape along, and the drop writes it shifted.
  - **Nothing derived is written**: auto ports and routes stay in memory (`specFlowLast`), so an unedited tab never
    looks edited. `model.cleanSection` keeps `ports` and `routes` only when there are any (`specPorts`,
    `specRoutes`, bounded and allowlisted).
  - **Labels** ride the routed line: a kept label's `t` is now a share of the line's length (it was the old
    curve's parameter), so labels dragged before 2026-11-18 sit a little off where they were.
  - The connect dot moved to each block's top-right corner, clear of the ports (Chris).

## Everything on the grid, and lines straight out of their ports (Chris, 2026-11-19)

Chris: lines met their ports far from the dots, a line jogging aside under a port couldn't be dragged back under
it, and "snap ports to a grid and expand parts to accommodate, so everything snaps on a grid".
- **The grid** is the routing grid, 10 units (`SPEC_GRID`). Blocks are 160 × 60 (`SPEC_BW`, `SPEC_BH`), section
  padding and heading 20, block gaps 40, and the lead out of a top or bottom port 20 (`SPEC_LSTUB`), all whole steps.
  A kept place is drawn on the grid (`specSnap`; places kept before sit up to 5 units off until that block is
  dragged, and a drag of another block doesn't rewrite them), and so is the power tree's, whose pins are a step
  apart from 40 down (`specPtPinY`).
- **Ports** take grid points: a side has one every step in from its corners (`specSlots`, `specSlot`, `specPortPt`).
  Auto ports spread over the free points in the order of the blocks they go to; a dragged one snaps to the nearest.
- **Blocks grow** so each line on a side has its own point (`specGrow`, before the sections fit round them): a side
  with more lines than points widens or deepens the block, its top-left corner kept; a kept port counts once per
  point it holds (a power tree rail's pin serves all its loads). Nothing is written. Layout and kept places still
  use the base size, so a grown block can run into its neighbor.
- **Straight out of a top or bottom port.** The engine's ends are level, so a line from a top or bottom port ran out
  to its lead point and stepped aside before heading on. Now an auto line drops straight out of the port when that
  clears every block and lies along no other line (`specDrop`); otherwise it keeps the step. A line's vertical run
  dragged near the port snaps under it (Loom's snap-straight), and a shape so is kept (`specFits`: `route.js` fits,
  or an end's vertical run in line with its lead-in, heading away from the block). The drag accepts any of the
  line's end pairs, so the run also crosses under the port to its other side. Loom's engine is unchanged.

## Side by side, the outline fold, and quieter tooltips (Chris, 2026-11-20)

- **Side by side** is a third view beside Document and Diagram (`ui.specView = 'side'`, `specPage`): the document on
  the left and the diagram (with the hierarchy and power tree under it) on the right, which stays in view while the
  text scrolls (`.spec-side-map`, sticky, its own scroll). The page widens to 1800 px for it. Editing, adding, and
  jumping to text keep it (`specTextView`); Diagram still goes to Document. At 860 px or less (Chris's choice) the
  tab is hidden and the page shows Document; a resize across that line draws the page again (`specNarrow`,
  `specDrawnNarrow`). Works the same in FW over its layered map.
- **Expanded in Side by side** (Chris, 2026-11-20: "still side by side but full screen"): the expand button fills the
  window with the whole view (`.spec-side.expanded`), the text scrolling on its own on the left and the expanded
  diagram or power tree, with zoom, pan, and Fit, on the right; the notes and hierarchy under it step aside until Esc
  or the collapse button. Diagram's expand is as before.
- **Sync and Discard full screen** (Chris, 2026-11-20): the expanded diagram's bar (Diagram, power tree, and Side by
  side alike) carries the toolbar's Sync, with its count of unsynced reviews, and Discard while there's anything to
  discard (`syncButtons` in `specCard`, `.spec-view-sync`), left of Fit. None in the demo, which never syncs.
- **The split drags** (Chris, 2026-11-20): the gutter between the columns (`.spec-side-split`) sets the text column's
  share, 25% to 75%, in the page and expanded alike, kept in this browser (`specSideSplit`, `specSplit`); a double-click
  goes back to half and half.
- **The outline folds**: an Outline toggle at its top leaves a narrow rail (`specOlToggle`, `spec-outline-toggle`).
  Until it's used, the outline folds itself below 1200 px and always in Side by side (`.ol-auto`); a choice is kept
  for the session, one for Document (`ui.specOutline`) and one for Side by side (`ui.specOutlineSide`). At 860 px
  or less there's no outline (it was a row of section names above the text). Edit all keeps its live outline.
- **The Requirements inbox** is left out of Diagram (`specNeedsHtml`'s `noInbox`); Document and Side by side keep it,
  and conflict-copy cards show everywhere as before.
- **Tooltips** on diagram blocks, section boxes, and power tree blocks are the name, gist, and gaps (or rails) only;
  the drag instructions are gone (an SVG title can't be styled smaller). The note under the diagram still says how
  to drag.

## Within, in a block's panel (Chris, 2026-11-20)

A block's panel has **Within**, above Power: the section the block is in, or "The board (no section)", and a list of
every section (indented by depth) to move it to (`specWithinField`). A change moves it as the hierarchy's drag does
(`M.specNest`; the text follows), with Undo in the toast and on Back. Back's label names the section that moved
furthest (`specHistLabel`), so a move reads "moving Status LEDs", not a neighbor it renumbered. EE's flow diagram
only (FW's layered map has no sections).

## Hierarchy folding, and no loop under a port (Chris, 2026-11-20)

- **Folding the hierarchy.** The Board at its top has a chevron that folds the whole hierarchy to that one block, its
  line then reading "N sections · M blocks" (`SPEC_TREE_BOARD`, kept in `ui.specClosed`). **Collapse all** in the
  header folds every section; it reads **Expand all** when everything is folded, and opens it all, the board too
  (`spec-tree-all`). Each section still folds by its own chevron. Kept for the session, as before.
- **A loop under a port.** The engine's ends leave level, so a line that wanted to drop straight out of a bottom port
  sometimes stepped aside, back up between the block and its lead point, and over again before heading down: a
  small loop. `specDrop` now also drops the runs up to a later vertical run under the port (the fewest that fit, clear
  every block, and lie along no other line), not only moves the first one. Found on a real board with 15 ports on
  one block; no line loops there now at any of the 15 bottom positions.

## Power, and Supplies folded into Connects (Chris, 2026-11-19)

- **Power** is its own line: `Power: 16.4V (sink), 3V0 (source)`, the rails a block uses (sink) and makes
  (source); a rail without a role is a sink (`model.specPowerItems`, `specPowerOf`; on the analysis as `power`).
  Config: `config.spec.power` (EE only). The diagram draws a bar over the block for each sink rail and a circle
  (the source convention) for each source rail, each named. The block panel's **Power** lists the rails with
  Source | Sink | N/A (N/A takes it off) and a box to add one (`specPowerField`, `specPowerSet`).
- **Supplies is now Connects.** EE offers only Connects (`config.spec.legacyLinks: ["Supplies"]`,
  `model.specOfferWords`); old Supplies lines still read and draw as before. A Connects link is a **power link**
  when its signal is a rail the far block sinks or this block sources: like a supply, a line within one section
  and only the flags across sections. Other connections are lines as always.
- **Converting** (`model.specPowerConvert`): each `Supplies: B (rail)` on A becomes `B (rail)` on A's Connects
  line, B sinks the rail, and A sources it unless A also sinks it (a block passing a rail on); a supply without a
  rail uses A's title, as its flag did; a name no block has stays on Connects. Kept shapes, ports, and labels move
  from `<id>|supplies` to `<id>|connects`; the stored records are copied, every other field kept. The demo's Main
  PCBA was converted (demo `VERSION` 21). The real reviews that used Supplies were converted the same way
  (2026-11-19), each proven to keep the same bars and the same power lines, plus circles on the rails made.

## Power tree (Chris, 2026-11-19)

- **The flag.** Each row of a block's Power panel has a **Power tree** box. It's written into the Power line beside the
  role, `Power: 5V (sink, tree), 3V3 (source, tree)` (`tree: true` on the item, `specPowerItems`, `specPowerText`).
  Unticked rows read and write as before, so existing lines don't change.
- **The rows** are a grid (`.spec-power-rows`): the rail column is as wide as the longest rail, Source | Sink | N/A
  fills the middle, and the box sits at the right, spanning the field.
- **The diagram** (`specPtreeHtml` in `app.js`, under the Hierarchy, EE only through `config.spec.power`). A block is in
  it when any of its rows is ticked; its ticked sink rails are pins on its left edge and its ticked source rails on its
  right. A block that makes a tree rail feeds every tree block that uses it, by rail name (Chris's choice, not the
  Connects lines), one line per rail, named once where it fans out. Laid out left to right from sources to loads, each
  load a column right of what feeds it (loops bounded). Blocks with no ticked rows, such as the demo's Status LEDs, stay
  out. No section boxes: a power tree has none, and drawing one would edit the outline.
- **Its own arrangement.** Everything the block diagram does by drag works here (blocks, a line's runs, bends, ports,
  labels, Auto layout, Expand, Export), but kept apart under each section's `ptree: { pos, ports, routes, labels }`
  (`model.specTreeLayout`, written only when there is one; keys are `<other id>|<rail, lowercased>`). The drag code takes a
  view from the svg's `data-view` (`specLay`, `specWithLay`, `specLastOf`); `specExpanded` names the expanded card
  (`'map'` or `'ptree'`), and Export saves the card it was clicked on ("… power tree.png").
- **Legend.** The block diagram shows the two power symbols at its bottom right, circle "Source" and bar "Sink"
  (`.spec-legend`), whenever a block has a Power line; it goes out with Export too.
- **A line's panel** is read-only (`specpt|` selection): which block powers which, on what rail, and Reset route.
- Demo: the Main PCBA's rails are ticked except Status LEDs and AC line (demo `VERSION` 22). Tests: EE 639.

## draw.io (Chris, 2026-11-20)

The block diagram goes out to draw.io and comes back, as one file (feasibility: `../../signoff/docs/drawio.md`).

- **Export.** The diagram card's Export › *SVG drawing, editable in draw.io* saves `<review> block diagram.drawio.svg`: Scribe's
  own picture (what the SVG export always saved), with the diagram as a draw.io file in the svg's `content` attribute, its page
  compressed. Anything reads it as a picture; draw.io (desktop, app.diagrams.net, the VS Code extension) opens it as the
  diagram. The power tree and FW's layered map still export plain SVGs.
- **What's in the draw.io diagram.** Sections are containers, blocks are boxes inside them (title, then up to four
  designators), lines are edges with their ports (`exitX`/`exitY`, `entryX`/`entryY`), corners, arrows, and signal label. Each
  carries its Scribe data (*Edit Data* in draw.io): `scribeId`, and on a block `title`, `gist`, `parts`, `power`, and
  `requirements`. The file's root names the review (`scribeFormat: scribe-drawio/1`, `scribeReview`).
- **Rails as pictures** (Chris: keep the power flags and legend). Each rail on a block's Power line is a small picture over the
  block, a child of it so it moves with it: a bar for a rail it uses (sink), a circle for one it makes (source), named for the
  rail, with `scribeType: power`, `role`, and `tree`. The legend is the same two pictures. In draw.io, renaming a picture renames
  the rail, deleting it takes the rail off, and a copy (from a block or the legend, renamed for its rail) dropped on a block's
  top edge adds it. A rail is only ever read from these pictures, so rails drawn in draw.io need a diagram that came from Scribe.
- **Import.** ☰ › *Import from draw.io…* reads a `.drawio.svg` or `.drawio` (pages plain or compressed) and lists what it will
  change before anything does: renames, moves, sections, new blocks and sections, connections with their signals and arrows,
  where lines meet blocks, Parts, and rails. Removals (a block, section, or connection not in the file) start unticked. The
  ticked ones are one step: Back undoes "importing from draw.io", and it waits for Sync like any Scribe edit.
- **The rules** (`SignoffDrawio.scribePlan` in `assets/drawio.js`, pure; applied by `specDrawioApply` in `app.js`):
  - Nothing derived is written: it compares the file with what the diagram draws now (`specDrawioSnap`), so an unchanged
    export imports as nothing (the auto layout's places aren't kept, and nothing is restamped).
  - A block is matched by `scribeId`; a copy pasted in draw.io (same id) is a new block, and a file from another review matches
    by name, with a warning. A box with no Scribe data is a new block; a container a new section around what's in it.
  - A block's size is never read. A move snaps to the 10-unit grid and keeps every block's place from then on, as a drag does.
    A section drawn bigger than its blocks grows (`grow`).
  - Line shapes aren't kept: a shaped line that changed in draw.io, or whose block moved (draw.io keeps the old waypoints),
    routes afresh (its `routes` entry goes). A moved line end becomes a kept port (`specPortAt`).
  - Text shapes, pictures, loose lines, and rail pictures on no block are left out and listed.
- **Tests:** the *draw.io* block in `tests/test.html` (20). Tried in the demo, and through the real draw.io editor: draw.io keeps
  the UserObject data, custom ids, and positions relative to sections, and reads the SVG's `content`.

## Pins: an MCU block's pin plan (Chris, 2026-11-20)

Chris: "a CubeMX type functionality in the MCU block": know that an I2C connection has an I2C on the MCU, which
one, and on which pins. The plan, his decisions, and the lab are in `../../pincheck/docs/pin-planner.md`; the
planner is the engine file `assets/pinmap.js` (`window.SignoffPinmap`). EE only (`config.spec.pins`).

- **`Part: STM32G0B1CBT6`** on a block names its part (beside `Parts: U4`). Parsed only with `config.spec.pins`
  (`specPinsOn`, block type `part`, `x.part` in the analysis), drawn as a chip, exported, and badged by the editor.
- **The block panel** has a Part field (an FTE gets the part library's MCUs as suggestions) and, once a part is named,
  a **Pins** section: *Start a pin plan* when the part is in Pincheck's library in this browser (`../pincheck/assets/
  library.js`, IndexedDB `pincheck`, or `pincheck-demo` in the demo; EE loads Pincheck's `params.js` and `library.js`).
  Starting copies the part file onto the section (`pins.part`, `model.specPinPart`: only what the planner reads, and
  `from` with the library's blob sha), so everyone the review is shared with plans from the same pins (Chris: copy
  into the review). The section then lists each connection's peripheral, pins, and problems, and offers the
  planner's fix ("Write it as DAC1 OUT2"), written into whichever block's Connects line holds the label, with Undo.
  A newer library file, or a Part line naming another part, is noted with a button to refresh the copy.
- **The connections** are `model.specMcuConns(analysis, id)`: Connects lines between the block and another, from
  either end (the other block's line points the other way), not power links (a rail either block's Power line
  names). Ids come from section ids (`<from>><to>#<n>`), so renames keep picks.
- **Stored:** `pins: { part, map }` on the section record, kept by `cleanSection` (`specPins`: known keys only,
  capped), merged like the rest of the section (newer wins).
- **The pin map** (*Open pin map* under the list; Escape closes) fills the window with the engine file
  `assets/pinview.js` (`window.SignoffPinView.mount`), the same views Pincheck's lab draws: the connection list, and
  Package (QFP and QFN on four sides with an exposed pad under the body, SO on two, BGA as a grid), Block, Ports,
  Matrix, and Table (`ui.pinView` remembers which). A connection lights the pins it could use, free or taken; a pin
  opens its functions, and a click is a pick, written to `pins.map` by pad as one Scribe edit (Back undoes it), and
  the plan moves around it. A pick whose connection is gone shows as "not in Scribe" with Remove. Read only while
  comparing versions. The map draws again on every render (the plan is memoized).
- **Marks on the diagram's lines:** a connection the plan covers shows its peripheral and pins after its label
  ("I2C · I2C1 PB6/PB9", `specPinTags`), with ✕ and a red outline when the part can't do it ("USB · ✕ not on
  STM32G071KBU6") and ▲ and a dashed outline when it needs a look; the reason is in the label's tooltip. Only the
  drawing changes: the label keeps its plain text in `data-text`, which the draw.io export reads, so the marks never
  go out to draw.io or come back as label edits. Plans are memoized per block (`pinCache`).
- **New part… and Edit part…** (FTEs): Pincheck's own part window (`../pincheck/assets/editor.js`, its styles
  `editor.css`, and `cubemx.js` for Import from CubeMX…), loaded by EE's `index.html`. New part… starts a file for the
  Part line's number and opens on Pins; Save puts it in the shared library in this browser and syncs it to
  `pincheck_data` on EE's sign-in (`PK.tokenSource`), so it's in Pincheck at once. *Sync the part library* pulls parts
  made elsewhere. EE's Sign out doesn't delete the library database, as Pincheck's doesn't (it may hold unsynced parts).
- **Labels:** a net name (`USB_LDO_EN`, `SPI_CS`) is one GPIO, not the interface a word in it names (Chris, 2026-11-20:
  an LDO's enable was read as a second USB port).
- Tests: EE 697 (the planner, the Part line, the copy, cleaning, merge, the connections, the pin map), CLI 40 (a pin plan
  survives a pull, an edit to the section's text, and the merge).
