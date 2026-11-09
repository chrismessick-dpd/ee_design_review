# Signoff EE: the Description tab as a schematic block diagram (design)

2026-11-08. Status: built on branch `ee-blocks` (EE, ME, FW, PL, and the hub; worktrees in `_ee/`,
preview `signoff-ee-blocks` on port 8794), not merged. Chris: "think of it like a schematic block
diagram, and the markdown describes each subcircuit." The FW tab and its design are in
`../../fw_design_review/docs/description-tab.md`; this covers what changes for a board.

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
| Links | `Uses: Sensor driver` | `Connects: MCU (UART)` and `Supplies: MCU (3V3)`, each with an optional signal or rail name in brackets |
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
  follows from its links. Dragging from the dot on a block's right edge to another adds a Connects link
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
