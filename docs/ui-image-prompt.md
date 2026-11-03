# barrocode High-Fidelity UI Image Prompt

Use case: ui-mockup refinement

Asset type: high-fidelity desktop UI reference for barrocode before
implementation.

Primary request: create a polished, screenshot-like desktop app mockup for
barrocode, a browser tool that converts SVG curves into clay-printer G-code.
The mockup must clearly show the exact UI elements, hierarchy, spacing and
technical detail needed for implementation.

The visual target is a warm-paper CAD/control surface, not a terminal emulator
and not a SaaS dashboard.

---

## Core Design Priorities

1. **Concrete app shell:** full top bar, three-column workspace, bottom panels,
   right control stack and footer status strip.
2. **Canvas dominance:** the central trajectory preview is the main event.
3. **Precise controls:** every panel shows buildable UI controls: drop zone,
   rows, toggles, sliders, pickers, icon buttons, code preview and export.
4. **Measurement feel:** thin dividers, tabular numbers, axis ticks, grid,
   metric bars and compact labels.
5. **N/T axis clarity:** blue for Normal `N`, terracotta for Tangent `T`.
6. **ASCII marks as graphics:** use `#`, `|`, `o`, `+`, `...`, `>`, `[x]` as
   small UI marks in headers and rows, not as terminal prompt text.
7. **Progressive disclosure:** advanced sections appear as collapsed rows.

---

## Composition

Full 16:9 desktop app screen, straight-on, screenshot-like. No perspective
tilt. No browser chrome. Light warm background.

### Global Top Bar

Spans the full width.

- Left: `barrocode` wordmark.
- Under wordmark: `SVG > PATH > WAVE > G-CODE`.
- Center status cluster: green dot, `READY`, vertical rule, `sample.svg`,
  vertical rule, `6 layers`, vertical rule, `1240 pts`.
- Right side can show minimal window glyphs or blank balancing space.

### Main Grid

Three columns:

- left sidebar about 15-18% width;
- central workspace, largest area;
- right sidebar about 17-20% width.

### Left Sidebar

Module 1: `# SVG o`

- compact drop zone;
- upload icon;
- `LOAD SVG`;
- `or drop file here`;
- outline button `USE SAMPLE` with `sample.svg` aligned right.

Module 2: `| PATHS o + ...`

- selected row with indigo focus outline;
- `o` / filled dot active markers;
- `01 outline` and `02 support-ellipse`;
- eye icon on the right of each row;
- `+ Add path` muted row.

Module 3: `# PRINT`

- key/value rows:
  - `Layer height 1.20 mm`
  - `Total height 60.00 mm`
  - `Scale factor 1.00 mm/mm`
  - `Origin X 0.00 mm`
  - `Origin Y 0.00 mm`
  - `[x] soft join yes` with small gear
  - `[x] z-hop 1.20` with small gear
  - `Feed rate 1200 mm/min`
  - `Travel rate 3000 mm/min`
  - `Extruder mult. 1.00`

Collapsed rows:

- `o MACHINE / TOOLS >`
- `o FLOW >`
- `o ADVANCED >`

### Central Workspace

Toolbar above canvas:

- icon buttons: cursor, hand, zoom-in, zoom-out, fit, grid, layers;
- one active/focused icon has indigo outline;
- right picker/dropdown `FIT`.

Canvas:

- label centered near top: `. TRAJECTORY .`;
- warm off-white plotting surface;
- fine grid;
- X and Y axes with numeric ticks from about `-90` to `90`;
- layered vessel/toolpath made of many horizontal contours;
- contour color ramp from cobalt/blue at bottom to terracotta at top;
- subtle grey dashed envelope outline behind the path;
- selected keyframe diamond in indigo;
- center cross `+`;
- top-left overlay card: green dot, `READY`, `6 layers`, `1240 pts`;
- bottom-right XYZ cube/gizmo.

Timeline below canvas:

- thin track;
- diamond markers;
- current position diamond at `50%`;
- labels `0%`, `25%`, `50%`, `75%`, `100%`;
- small start/end buttons.

### Bottom Row

Three panels under the central canvas.

Panel 1: `# CENTER / SCALE`

- `origin` group with X/Y/Z values;
- `scale` group with X/Y/Z values;
- square coordinate pad with a crosshair marker.

Panel 2: `| LOCAL WAVE (N vs T)`

- Lissajous preview canvas;
- blue and terracotta crossing curves;
- small N/T axes;
- right-side metric list:
  - `N Amp 3.00 mm`
  - `N Wave 20.00 mm`
  - `T Amp 2.50 mm`
  - `T Wave 18.00 mm`
  - `Delta 90.0 deg`
  - `Freq 8.00 Hz`

Panel 3: `# G-CODE`

- light green code block;
- line numbers `0001`, `0002`, etc.;
- readable snippets such as `G21 ; units in mm`, `G90`, `M82`, `G1 X...`;
- no large editor chrome.

### Right Sidebar

Module 1: `# N AXIS`

- picker `Wave` set to `Lissajous`;
- blue sliders for `Amp`, `Wave`, `Phase`;
- numeric values and units on the right.

Module 2: `# T AXIS`

- picker `Wave` set to `Lissajous`;
- terracotta sliders for `Amp`, `Wave`, `Phase`;
- numeric values and units on the right.

Module 3: `| PHASE`

- picker `Mode` set to `Relative`;
- slider `Offset`.

Then:

- `o ADVANCED >`
- `# PRESETS + ...` with four mini buttons: circle, figure-8, spiral, lattice.
- `o DIAGNOSTICS` with rows and horizontal bars:
  - `points 1240`
  - `paths 2`
  - `crossings 14`
  - `self intersections 2`
  - `travel 8.24 m`
  - `status ready`
- full-width `EXPORT` button with download icon.

### Footer

Low global strip:

- left: gear icon, `UNITS`, separators, `MODE: ABSOLUTE`, `PLANE: XY`;
- right: green dot, `READY`, small symbolic status marks.

---

## Style

Palette:

- warm paper background `#EDEBE4`;
- ivory panels `#F7F5F0`;
- right panel `#F2F0EB`;
- near-black ink `#100E09`;
- muted gray `#6A6762`;
- indigo `#4F46E5`;
- normal axis blue `#1D64B4`;
- tangent axis terracotta `#B84F22`;
- success green `#1C6E45`;
- error red `#AA2A2A` only for error/destructive.

Typography:

- crisp technical UI type;
- tabular numerals;
- small uppercase module labels;
- no negative letter spacing;
- smallest text still readable.

Surfaces:

- thin structural rules;
- small radii;
- no heavy shadows;
- no glassmorphism;
- no gradients except slider fills and plotted trajectory color ramp;
- no decorative blobs;
- no nested cards.

---

## Text To Include

`barrocode`, `SVG > PATH > WAVE > G-CODE`, `READY`, `sample.svg`,
`6 layers`, `1240 pts`, `LOAD SVG`, `or drop file here`, `USE SAMPLE`,
`PATHS`, `PRINT`, `MACHINE / TOOLS`, `FLOW`, `ADVANCED`, `TRAJECTORY`,
`CENTER / SCALE`, `LOCAL WAVE (N vs T)`, `G-CODE`, `EXPORT`, `N AXIS`,
`T AXIS`, `PHASE`, `PRESETS`, `DIAGNOSTICS`, `soft join`, `z-hop`, `scale`,
`origin`, `Amp`, `Wave`, `Phase`, `Offset`, `status ready`.

---

## Negative Constraints

No landing page. No hero section. No dark terminal. No terminal emulator skin.
No generic SaaS dashboard. No big rounded cards. No stock images. No decorative
orbs/blobs. No heavy shadows. No decorative gradients. Inputs, sliders, buttons
and pickers must look like graphical controls, not command-line text.
