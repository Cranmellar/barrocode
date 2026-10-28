# CLAUDE.md

Operating manual for Claude Code sessions in this repo. Read this in full before making changes.

The owner improves this project **incrementally, favouring the lowest-effort / highest-impact changes**. Prefer small, verifiable commits over refactors. The "Current state" and "Next steps" sections below are the starting point for any session.

---

## What this project is

**BarroCode** (pronounced like *barroco*) — a web app that turns SVG curves into G-code for clay 3D printers. The SVG paths are sampled, modulated by a Lissajous wave (normal + tangent oscillation along arc length, plus optional Z oscillation), stacked into layers, and emitted as G-code with clay-specific behaviour (no retract, soft layer joins, optional dwell/priming, concentric skirt travel, parabolic z-hop at self-intersections).

Audience: a **small community of ceramicists**, shared via GitHub Pages. The whole app runs in the browser. There is no backend, no native shell.

---

## Stack and commands

- **Vite 5** + **React 18** + **TypeScript** (strict mode via `tsc &&` before `vite build`)
- **No UI library**, no state manager, no router. All styles live in `src/index.css`. State is plain React `useState` in `App.tsx`.
- Font: `GSCode` (variable, roman and italic, `public/fonts/`) for all text (`--font-ui`). Section titles use the italic.

| Command | Purpose |
|---|---|
| `npm install` | Install deps |
| `npm run dev` | Vite dev server (typically `http://localhost:5173`) |
| `npm run build` | `tsc` type-check then `vite build` → `dist/` |
| `npm run preview` | Local static preview of `dist/` |
| `npm test` | Vitest, run once (`npm test -- -u` updates reference G-code) |

Tests cover `lib/` only (no DOM, so `svgParser` is untested apart from the pure `splitSubpaths`) and live in `src/lib/__tests__/` and `src/shaper/lib/__tests__/`. There is no linter or formatter config wired into npm scripts. Don't add one without being asked. CI runs `npm test` and `npm run build` on every pull request (`ci.yml`) and again before deploying `main`.

---

## Deployment

GitHub Pages via [.github/workflows/deploy.yml](.github/workflows/deploy.yml). On push to `main`: `npm install`, `npm test`, `npm run build`, upload `dist/` artifact, deploy. A failing test blocks the deploy. [.github/workflows/ci.yml](.github/workflows/ci.yml) runs the same test and build on pull requests, without deploying.

`vite.config.ts` uses `base: './'` so the build also works opened directly from `file://` or a USB sub-path.

There is **no** desktop / Electron / portable distribution. It was removed; don't re-introduce it without explicit request.

---

## Current state (verified 2026-10-28 on branch `claude/nice-edison-frd7w6`, on top of `main` @ `dddc17b`)

- `npm test` (187 tests) and `npm run build` pass (≈127 kB app JS + 141 kB vendor + 37 kB CSS; gzip ≈97 kB).
- Core pipeline is complete: SVG → sampling → Lissajous N/T/Z wave → layers → shared mm toolpath → G-code, with keyframes, centre/scale/rotation pivot, z-hop, skirt travel, soft join, dwell (`G4`) and priming. Preview and G-code draw from the same `buildToolpath` output, and the tests check they agree.
- UI waves UI-1 … UI-5 from `pendientes.md` are done: unified keyframe editing, left panel grouped as Pieza / Trayecto / Máquina, viewer summary (time, size) with view presets and layer range, number fields on every Lissajous slider, keyboard shortcuts and session autosave.
- Performance (Ola 8) is partly done: layers and toolpath memoized in `App.tsx` on the fields each stage reads, LOD stride and skipped overlays while the camera moves (`isInteracting`), cursor-based keyframe sampler, G-code debounced 400 ms. Worker offload remains; see [docs/performance-optimization-spec.md](docs/performance-optimization-spec.md). The measured hot spots, in priority order, are in "Performance — user-side findings" below; that section supersedes the spec where they disagree.
- Drag-and-drop of an SVG onto the upload area works (verified in a browser).
- **Graphical overhaul** ([docs/ui-overhaul-plan.md](docs/ui-overhaul-plan.md)): decisions closed (full-screen 3D with floating containers, Claude-like typography in GSCode, neutrals + one signal colour, desktop only, no dark mode). Done: phase 1 (design tokens, unified controls, canvas palette from CSS, OKLCH layer ramp), phase 3 (full-window 3D view with floating panels, see "Layout and file map"), phase 5 (animated feedback, see "Motion" under CSS), plus the canvas text sizes from phase 2. Open: the rest of phase 2 (duplicates and copy), phase 6 (QA). The interaction study for phase 5 is a Design canvas (six interactive artboards), not in the repo.
- **Seam ramp (soft join).** The layer→layer join used to be a Z-only move in place on closed paths (end = start XY), with no E. Now `buildToolpath` spreads the rise over the last `transitionLength` mm of every closed path, so the climb happens while printing and the preview shows it. Each ramp sits on the one below; only layer 0's tail lifts off the bed by up to one layer height (accepted; flow compensation belongs with NP-0a). Open paths and `alternateDirection` keep the old transition.
- **Machine-safety pass (Oct 2026)** — the G-code can no longer drive the nozzle into the bed or the part:
  - `M82` (absolute E) in the preamble when `generateE` is on.
  - Final lift goes to `max(safeZ, highest printed Z) + 10`; it used to be an absolute `safeZ + 10`, which plunged through parts taller than 30 mm.
  - Skirt travel lifts 2 mm above the highest Z printed so far (z-hop bumps, Z wave) and descends to the next path's real start Z (NP-0b).
  - Z floor in `generateWaveLayers`: layer 0 never dips below its set height; every later point stays ≥ `layerHeight · MIN_LAYER_GAP` (0.5) above the same sample on the layer below. Only acts downward.
  - Priming runs along +X 10 mm beside the first layer's bounding box (below it, or above when below would turn Y negative), not at `origin − 5`.
- **SVG placement and size** — sampled points are shifted so the viewBox's top-left corner is (0, 0) (a centred `viewBox="-100 -100 200 200"` used to print 100 mm off). A physical root `width`/`height` (`mm`, `cm`, `in`, `pt`, `pc`, `Q`) sets `ParsedSVG.mmPerUnit`; loading such a file adopts it as `scaleFactor`, and `PathParams` offers *Usar tamaño real* when they differ. Unitless/px SVGs keep 1 unit = 1 mm. Verified in Chromium; `svgParser` still has no automated test.
- **Critical review (Oct 2026)**, recorded in `pendientes.md` → *Revisión crítica*. Fixed:
  - "Reiniciar" in the Lissajous panel restores only the fields that panel edits (`LISS_PANEL_FIELDS` in `App.tsx`), through `setLissParams`, so with a keyframe selected it resets that keyframe. It is disabled when keyframes exist and none is selected.
  - The layer count is computed once by `layerCount()` (`waveGenerator.ts`), capped at `MAX_LAYERS` (500); use it instead of re-deriving `numLayers` / `totalHeight / layerHeight`.
  - Default G-code filename is `barrocode.gcode`.
  - Soft join only runs when the next layer starts within `transitionLength` in XY; otherwise a normal lift travel. Open paths used to extrude a chord back across the part at every layer change.
  - `parseSVG` skips geometry that is never drawn: under `defs`, `clipPath`, `mask`, `symbol`, `marker`, `pattern`, or with `display:none` on itself or an ancestor. Illustrator's artboard clip rect used to print as an extra square.
  - `parseSVG` no longer uses `innerHTML`: it strips `<script>`, `<foreignObject>`, `on*` attributes and `javascript:` links from the parsed XML and inserts it with `importNode` (an `onerror` in a shared SVG used to run). SVGs without `xmlns` are re-parsed with the SVG namespace.
- **Part centred on the bed.** `svgToMM` puts the centre of the enabled paths' bounding box (`partCentreSVG` in `waveGenerator.ts`) at (`originX`, `originY`), shown as *Posición X / Y* in *Escala y posición*; default 0, 0. Where the SVG placed the part on its artboard no longer matters (Illustrator exports put parts far from the viewBox origin). `centerX/Y` (pivot, params and keyframes) are mm offsets from that centre; *Centrar en la pieza* resets them. The 3D camera orbits around the part's centre (`orbit` in `Preview2D`), not the bed origin, and refits when another SVG is loaded (`partKey`). Disabling a path re-centres the rest.
- **Pivot drag in the 3D viewport is not implemented** (`Preview2D` has no params `onChange`). `pendientes.md` lists it open (Ola 3, KF-C3); it was once ticked by mistake.
- **Keyframe polish (Oct 2026)**: arrow keys jump between keyframes while one is selected, numbers stay stable mid-drag, *Borrar todos* needs a second click, the timeline shows "capa N · H mm", dragged keyframes snap to layer starts, auto-key, smooth keyframes (`smooth`), phase offset/shift held per keyframe, deleting the last keyframe adopts its values, loading another SVG keeps only the keyframes' wave. Open: KF-B2, KF-B3, KF-C2, KF-C3 in `pendientes.md`.
- **Forma workspace (shaper), phase F0** of [docs/shaper-plan.md](docs/shaper-plan.md). The left panel's header switches between *Forma* and *Impresión* (`workspace` in `App.tsx`). *Forma* is `src/shaper/`, loaded lazily as its own chunk; for now it shows a fixed 80 mm circle on a mm grid with its seam marked. *Enviar a impresión* hands `App` an SVG whose user unit is 1 mm (`shapeToSvg`), loaded through `doParse` like a file, so `scaleFactor` becomes 1; *Editar forma* goes back while that SVG is the loaded one (`sentShapeSvg`). Boundary: `App` imports only `ShaperView`; the shaper imports nothing from `src/lib/` or `src/components/`. The print shortcuts are off in *Forma*. Next: F1 (shape families).
- **Icons** (`components/icons.tsx`, one inline-SVG set) on panel tabs, headers, rails and keyframe fields; the export and add-keyframe buttons fill with `--signal-ramp`.
- **Number fields (`NumInput`)**: the wheel refreshes the field even while focused; Shift steps by `fineStep` (default `step / 10`); dragging the row's `<label>` (found with `closest('.param-row, .kf-field')`) changes the value too; each wheel/drag step floats the amount added beside the field. Pivot fields use `step={5} fineStep={1}`.

---

## Next steps — low effort, high impact

Ordered by impact ÷ effort. Each is one small commit. Verify against the code before starting; line numbers drift. Larger planned work (non-planar toolpaths NP-0…NP-3) lives in `pendientes.md`.

### Correctness (G-code that reaches the printer)

1. **Negative coordinates on corner-origin beds.** Since the part is centred at (`originX`, `originY`) = (0, 0) by default, half of every part sits at negative X/Y. Centre-origin beds (most deltas) are fine; on a corner-origin Cartesian printer the move is clipped or rejected, and the hint under *Posición X / Y* is easy to miss, and the priming line goes negative too (`primingStart`). Cheapest fix, no bed parameter needed: when the toolpath's minimum X or Y is below 0, show a warning in the viewer summary ("coordenadas negativas: en una impresora con origen en esquina, ajusta *Posición X / Y*"), and write the min/max X/Y/Z box into the G-code header. A full bed-size check (item 9) can come later.
2. **E ignores Z.** `pathToGcode` and `buildTransition` accumulate E from XY distance, and a Z-only move is dropped (`d < 1e-6`). Already wrong with `lissAmpZ > 0` and on the seam ramp. Use `Math.hypot(dx, dy, dz)` in both and keep Z-only moves (`pendientes.md` NP-0a). Snapshot diff expected; read it before `-u`.
3. **G-code header misses fields.** `buildHeader` omits `lissAmpZ` / `lissWlZ` / `lissPhaseZ` (NP-0c), the number of keyframes (with keyframes the listed wave isn't what prints), `dwellAtStart`, priming, `safeZ` and `alternateDirection`. Header-only snapshot change.
4. **A bead can lose its support.** The Z floor only acts downward. With `phaseShiftPerLayer`, a crest over the trough of the layer below leaves a gap up to `layerHeight + 2·lissAmpZ`, so the bead prints in the air. Warn in the viewer, or cap the gap upward the same way the floor works (`waveGenerator.ts`, next to `MIN_LAYER_GAP`).
5. **Arc length ignores scaling transforms.** `getPointAtLength` works in **element-local** length, so under `<g transform="scale(2)">` sample spacing and wavelengths come out 2× in root units. Accumulate arc length from the transformed points (`svgParser.ts`). No automated test possible (DOM); verify in Chromium.
6. **Z-hop probably stacks clay at crossings** (inferred, confirm with a test print). Only the later pass hops, so a crossing gets two beads per layer and the next layer's first pass crosses at the height of that double bead with no gap. Reduce or zero E inside the hop window.

### UX quick wins

7. **Duplicate a keyframe** at the extruder (`D`) and copy a panel section from the previous keyframe (`pendientes.md` KF-C2).
8. **Show what changes from the previous keyframe** in the editor ("N 2 → 6 mm", KF-B3).
9. Warn when the part leaves the bed; needs a bed-size parameter (and centre vs corner origin) first (UI-3 leftover). Item 1 covers the commonest case without it.

### Hygiene (only when touching the area)

10. Unused files: `src/assets/` entirely (`logo.svg`, `sample1..4.svg`; the eight samples are inlined in `App.tsx`), `public/icon.png`, `public/icon.ico`, `public/favicon.ico` and `make_ico.py` (only referenced by each other; the page uses `favicon.black.ico` / `favicon.white.ico`), `public/isotype.png` and `public/sample.svg` (only referenced by README/docs). `public/logo-43n-editable.svg` is a source asset — keep. Ask before deleting.

### Lower priority / needs a decision

- Sharp tips lose length to corner rounding (a 30° point, ≈ 15 mm at amplitude 3). Option: fade the amplitude near a tip instead of growing the fillet (`roundCorners` in `waveGenerator.ts`). The owner hasn't chosen yet.
- With keyframes that change the amplitude along a layer, a closed path's end has the next layer's amplitude, so the seam steps by ≈ 0.5 mm. It continues smoothly into the layer above; closing it would need the amplitude held over the seam.

- E ignores the real bead thickness: with the Z wave the gap to the layer below ranges from 0.5× to ≈ 1.6× `layerHeight`, but E only follows XY distance. Scale E by the local gap (extends NP-0a).
- `parseSVG` can't detect `visibility:hidden`: the measuring container is itself `visibility:hidden`.

---

## Performance — user-side findings

### Re-measured 2026-10-28 on `main` @ `dddc17b` (supersedes the older numbers below where they disagree)

Same setup as below (production build, headless Chromium, CDP `TaskDuration`, sample 4, defaults). Stage times come from temporary `performance.now()` wrappers in the browser build; pure-JS times from `vite-node` on the 750-point flower.

| Main thread | 60 layers | 150 layers |
|---|---|---|
| Idle, sample loaded or not (before → after #3) | ≈12 % → 0 % of a core | same |
| Scale slider drag, per tick (before → after the `insets` fix) | ≈180 → ≈115 ms | ≈1065 → ≈480 ms |
| One scale slider tick incl. the debounced G-code | ≈370 ms | ≈825 ms |
| Long tasks after a print-speed edit (before → after #2) | ≈105 → ≈77 ms | ≈310 → ≈155 ms |
| Print-speed wheel tick incl. G-code | ≈320 ms | ≈520 ms |
| Full 3D redraw, no pipeline (*Color* toggle) | ≈30 ms | ≈35 ms |
| Timeline scrub step / camera rotate step | ≈15 / ≈20 ms | ≈25 / ≈12 ms |

Per scale slider tick at 150 layers (it reruns the whole pipeline, as a wave slider does): `generateWaveLayers` ≈60 ms, `buildToolpath` ≈47 ms, `flattenPoints` ≈13 ms, drawing ≈25 ms, the rest is GC and React. When the 400 ms debounce fired (before #2): `generateGcode` ≈160 ms then `summarizeGcode` ≈225 ms, so every edit ended in a ≈0.4 s freeze, and the stats cost more than the G-code itself. Pure JS (flower, 150 layers): wave 40–60, toolpath 35–95, G-code 75–145, stats 135–215 ms.

Findings, by impact ÷ effort:

1. ~~**`insets` was a new object on every `App` render.**~~ **Done.** It is in the draw effect's dependencies, so any `App` re-render (`setGcodeBusy`, `setGcode`, toasts…) redrew the scene, and because the geometry was unchanged it also built the scrub cache on a detached canvas, rasterised on the main thread (`drawImage` was the top entry of the profile). Now `useMemo` on `shown.left/right`. Keep every object or array passed to `Preview2D` that feeds the draw effect stable.
2. ~~**Compute the G-code stats while emitting.**~~ **Done.** `generateGcode` returns `{ text, stats }`; every `G1`/`G4` line goes through `move` / `dwell`, which track the summary from the rounded values they write. `summarizeGcode` is now only the tests' oracle (`gcodeGenerator.test.ts`, *summary*, over the invariant matrix plus no-E and dwell). The end-of-edit freeze halved at 150 layers; what is left is the G-code text itself, mostly `toFixed`.
3. ~~**The Lissajous dot loop was the whole idle cost.**~~ **Done.** The dot now runs one lap (`LAP_MS`, 5 s) when the figure appears or changes, then rests; under `prefers-reduced-motion` it doesn't move. Idle main thread ≈12 % → 0 %.
4. **Identical layers are recomputed.** Without keyframes and with `phaseShiftPerLayer = 0` (the defaults) every layer's XY is the same (every other one with `alternateDirection`); only the Z floor differs, and only when `lissAmpZ > 0`. Compute the transformed wave once per direction and run just the floor per layer: `generateWaveLayers` ≈60 → a few ms at 150 layers. `buildToolpath` can reuse the `svgToMM` XY the same way it reuses crossings. Snapshots pin exactness. *Effort: low–medium.*
5. ~~**Allocation churn.**~~ **Done.** Per point and edit the pipeline built 5–7 objects where 2 are needed. Now `applyTransformSVG` transforms the fresh `lissajousPoint` result in place; the keyframe sampler (`createKeyframeSampler`) writes into one reused `LocalParams` (read it before the next call); the per-point `[wN, wT, wZ]` array is gone; `buildToolpath` inlines `svgToMM`; `arcLengths` (`hopUtils.ts`) returns a `Float64Array` in place of `{x, y, arc}` objects and `findCrossings` takes the points plus those arcs; `flattenPoints` returns the toolpath's own points, and `keyframeMarkers` gets each keyframe's layer from `layerOfPoint` (so `MarkerScene` includes `toolpath`). Output identical to the old code in 1,000 random configurations (layers, toolpath, flattened points, `layerAtT`, keyframe markers, `getParamsAtT`, G-code). Browser, sample 4, per slider tick: 150 layers ≈263 → ≈225 ms (GC ≈46 → ≈13 ms), 60 layers ≈145 → ≈125 ms. Pure JS, flower at 150 layers, wave + toolpath + flatten: −25 to −42 % (keyframes the most), `flattenPoints` 7–25 → ≈2 ms. Typed arrays for the whole toolpath were not needed.
6. **Coalesce pipeline runs while dragging a wave slider.** Each `input` event runs the whole pipeline synchronously; at 150 layers ticks arrive faster than they finish. `useDeferredValue` on the pipeline's inputs (params, keyframes) lets React skip stale intermediate values; measure before keeping it. *Effort: low, benefit unproven.*
7. **G-code in a worker** (old #6) removes what is left of the freeze after #2. Mind `file://`: Chromium refuses `new Worker(url)` from a `file://` page, so use Vite's inline worker (`?worker&inline`, a blob URL) or fall back to the main thread. *Effort: medium.*

### Measured 2026-10-26 on `main` @ `29ad9a1`

**Setup:** `npm run build && npx vite preview`, headless Chromium driven by Playwright. Main-thread time comes from CDP `Performance.getMetrics` (`TaskDuration`). Inputs: sample 4, default params (z-hop is **on** by default), 60 and 150 layers. At 60 layers that is 68,160 points, 180 hop crossings and 1.6 MB of G-code. Headless Chromium rasterises canvas in software, so treat canvas numbers as relative. The pure-JS numbers come from `vite-node` on a 750-point flower curve and match what the browser shows.

| What the user does | 60 layers | 150 layers |
|---|---|---|
| Opens the G-code tab | **1.0–2.4 s freeze** | **≈5.7 s freeze** |
| Edits any param while the G-code tab is open | ≈1.4 s | — |
| Moves a Lissajous slider one tick | ≈210 ms main thread | ≈450 ms |
| Changes print speed (geometry unchanged) | ≈540 ms | ≈1.1 s |
| Scrubs the timeline one step | ≈60 ms wall | ≈200 ms |
| Rotates the camera one step (LOD on) | ≈50 ms wall | ≈110 ms |
| Leaves the app idle, even with no SVG loaded | ≈20 % of a core, all the time | same |

Proposed fixes, ordered by impact ÷ effort. Each is one or two small commits. G-code output must not change; the snapshot tests pin it.

1. ~~**G-code textarea (biggest freeze).**~~ **Done.** `GcodeOutput` now shows only the first 1500 lines plus a comment line saying how many are hidden; copy and download use the full string, and the line count and size are memoized. Opening the tab now takes ≈0.1–0.2 s at 60 and 150 layers. An edit made with the tab open cost ≈0.7 s at 60 layers before #2 and #3, ≈0.5 s after; #6 addresses the rest.
2. ~~**Z-hop crossing detection runs on every edit.**~~ **Done.** It took ≈80 % of a slider tick's JS. `buildToolpath` now reuses the crossings of either of the two previous layers when the ordered XY is identical. With the defaults (no keyframes, `phaseShiftPerLayer = 0`) every layer is identical; with `alternateDirection`, every other one is. `findCrossings` uses integer grid keys and an `Int32Array` stamp in place of string keys and a pair Set, and returns crossings sorted, so `hopAtArc` / `hopSampleArcs` binary-search them. 1,600 random configurations gave toolpaths identical to the old code. `buildToolpath` at 60 layers: 49 → 12 ms (defaults), 41 → 22 ms (per-layer phase shift, no reuse), 220 → 31 ms (many loops). In the browser at 60 layers a slider tick fell from ≈210 to ≈100 ms and a print-speed change from ≈540 to ≈330 ms; at 150 layers, ≈450 to ≈200 ms per tick.
3. ~~**The whole pipeline re-runs for params that don't change geometry.**~~ **Done.** `App.tsx` derives `layers` and `toolpath` with `useMemo`, keyed on `WAVE_PARAMS` (`waveGenerator.ts`) and `TOOLPATH_PARAMS` (`toolpath.ts`). `paramDeps.test.ts` fails if a stage reads a field its list lacks, or if a listed field has no effect. `generateGcode(toolpath, params)` takes the toolpath that `Preview2D` draws instead of building its own. A print-speed change no longer runs `generateWaveLayers`, `buildToolpath` or `findCrossings`. At 60 layers it costs ≈300 ms, mostly `summarizeGcode` and the G-code text (#6); a slider tick costs ≈85 ms. At 150 layers: ≈430 ms and ≈190 ms.
4. ~~**`LissajousPreview` runs constantly.**~~ **Done.** It now uses two stacked canvases. The figure, axes and caption are drawn once per change of figure, framing, size or font load; each animation frame only clears and redraws the dot on a transparent canvas on top. Canvas sizes come from a `ResizeObserver`. Idle main-thread time fell from ≈20 % to ≈4 % of a core at 1× and from ≈28 % to ≈12 % at 2×; with the animation stopped it is 0. Output is pixel-identical apart from the dot, and resizing the panel with the amplitudes at 0 no longer leaves a stretched image. Clearing only the dot's surroundings was tried and gave no gain beyond noise.
5. **Per-frame waste in the 3D preview.**
   - ~~Projection trig and canvas reallocation.~~ **Done.** `makeProjector(az, el)` in `draw3D.ts` computes the camera trig once per draw; `project` wraps it. `Preview2D` takes its canvas size from a `ResizeObserver` and reallocates the buffer only when the size changes; each draw runs inside `save`/`restore`. Main-thread time per step at 60 layers: camera rotate 13 → 6.5 ms, timeline scrub 21 → 10 ms; at 150 layers, 18 → 10 ms and 37 → 17 ms. Output is pixel-identical in 24 preview states (1× and 2×). This also fixes two old bugs: the 3D view came back blank after visiting the G-code tab, and didn't redraw when a side panel was dragged. `CenterPad` was left alone: its 56 px canvas costs nothing to reallocate.
   - ~~The timeline scrub redraws every layer at full quality.~~ **Done.** `draw3D.ts` splits the layer strokes and their overlays (skirt travel, soft-join lines) into `drawGeometry`, which reads only `GeometryScene` (no timeline, no text). When a redraw leaves those inputs unchanged, `Preview2D` builds a cached copy once and `drawScene` copies it in, so a scrub redraws only the backdrop, centre axis, extruder and markers. Scrub wall time per step: ≈50 → ≈17 ms at 60 layers, ≈190 → ≈22 ms at 150. Building the cache on every geometry change was tried and dropped: a detached canvas rasterises on the main thread, so camera rotation went from 6 to 41 ms of main thread per step. Output is pixel-identical except the scrubbed states, which differ by ≤ 3/255 from compositing.
6. **G-code generation still runs on the main thread** (stats: done, 2026-10-28 #2; worker: #7 there). When the 400 ms debounce fires, `generateGcode` (≈70 ms at 60 layers, ≈350 ms on a wave with many loops) and `summarizeGcode` (50–150 ms: `split`, a regex and an object per line) block the UI mid-interaction. Now that #2 and #3 are done, move both into a worker (perf spec Phase 5), or compute the stats in the same pass that emits the G-code. *Effort: medium.*
7. **Keyframe drag and `CenterPad` drag** call `setKeyframes` on every `mousemove`, so each move runs the full pipeline, about the cost of a slider tick. The timeline keyframe drag now applies moves once per animation frame, but in Chromium that measured within noise (60 moves at 60 layers: ≈5.4–6.7 s of main thread before, ≈5.1–5.9 s after): Chromium already delivers at most one `mousemove` per frame and React batches updates within a task. The real cost is the pipeline itself, ≈85 ms per frame at 60 layers. `CenterPad` drag is unchanged. `CenterPad.partBounds` also passes every point through `svgToMM` each time the layers or params change; take the bounds from the shared toolpath instead.

Lower priority:
- Editing `sampleSpacing` re-parses the SVG on every keystroke or wheel tick, with three `getPointAtLength` calls per sample. Debounce it by ≈300 ms.
- Autosave runs `JSON.stringify` on the raw SVG 1 s after every change. Store the raw SVG under its own key, and only when it changes.
- The whole tree re-renders on each timeline tick, with no `React.memo`. This costs less than 3 ms, small next to the canvas.

`docs/performance-optimization-spec.md` is partly stale. §4.2 (the draw effect no longer recomputes geometry) and §4.4 (there is no `MAX_PTS` guard any more; the grid exists) describe old code.

---

## Data pipeline

```
SVG string
  └─ parseSVG()            [lib/svgParser.ts]
       • DOMParser to validate; viewBox read from the attribute (no viewBox →
         physical width/height converted to CSS px)
       • mmPerUnit from a physical width/height (mm, cm, in, pt…), else null
       • strips scripts, foreignObject, on* and javascript: links; imports
         the parsed doc into a hidden 1000×1000 DOM div
       • queries path / polyline / polygon / line / circle / ellipse / rect,
         skipping defs/clipPath/mask/symbol/marker/pattern and display:none
       • a <path> with several subpaths (a contour with a hole) is split by
         splitSubpaths() into one SampledPath per subpath (id-1, id-2…);
         sampled whole, the jump between them printed as a bead
       • arc-length sampling via getTotalLength + getPointAtLength
       • finite-difference tangent/normal per sample
       • getScreenCTM() for transforms
       • points shifted by −viewBox.x/y so the viewBox corner is (0, 0)
     → ParsedSVG { paths: SampledPath[], viewBox, mmPerUnit, raw }

SampledPath[] + PrintParams + WaveKeyframe[]
  └─ generateWaveLayers()  [lib/waveGenerator.ts]
       • filters enabled paths; roundCorners() fillets every stretch of the
         centerline (chord turn or sample-tangent jump) tighter than
         cornerRadius(ampN, ampT, wlT) = 1.25 · max(ampN / (1 − ampT·2π/wlT),
         ampT), the denominator clamped to [0.5, 1]; max over keyframes.
         Fillets start and end on the path with its tangents (a cubic
         between them), grow until they reach the radius when the legs bend
         inward, and shrink when two corners leave no room. Closed paths are
         cut open at their smoothest point so a corner on the seam is
         rounded too. Unrounded, the wave folded into loops (which got
         z-hops) on the inside of corners and jumped on the outside. Paths
         with nothing that tight pass through untouched.
       • closed paths: both seam samples get one tangent, along the chord
         between their neighbours (joinSeamFrame); the parser's one-sided
         ones differ on a corner or after a `Z` that closes a tiny gap
       • per layer: phaseBase = lissPhaseOffset + li * phaseShiftPerLayer; with
         keyframes, offset(t_li) + Σ_{j<li} shift(t_j), both sampled at the
         layer's start, so a layer keeps one phase and closes at its seam
       • per point: createKeyframeSampler() lerps between keyframes
         (cursor-based, t must increase monotonically)
       • phase integrated per path: cycX += 2π·ds/wlX (no chirp when wl varies)
       • closed paths: each cycX scaled so the path holds a whole number of
         cycles (pre-pass, works with keyframed wl), so the wave meets itself
         at the seam; it used to end up to 2·amp to the side
       • lissajousPoint(): offsetN = ampN*sin(cycN + δ + phase)
                           offsetT = ampT*sin(cycT + phase)
                           zOffset = ampZ*sin(cycZ + phaseZ + phase)   (mm)
       • Z floor: layer 0 ≥ its base Z; later points ≥ same sample on the
         layer below + layerHeight·MIN_LAYER_GAP (0.5)
       • applyTransformSVG: scale, then rotate, around pivot in SVG space;
         pivot = bounding-box centre of the enabled paths + (centerX, centerY)
       • alternateDirection: reverse every other layer
       • closePath: append first point if not closed
     → WaveLayer[] { index, z (mm), paths: WavePoint[][] (SVG units + zOffset mm) }

WaveLayer[] + PrintParams + part centre (partCentreSVG)
  └─ buildToolpath()       [lib/toolpath.ts]
       • svgToMM() here (NOT before): the part centre (partCentreSVG)
         goes to (originX, originY)
       • nearest-neighbour path order O(n²) per layer, each layer starting
         where the previous one ended
       • arcLengths + findCrossings (inter-path gaps excluded, reused when
         a layer's XY matches one of the two before it) + hopAtArc;
         hopSampleArcs inserts points across each hop window so the parabola
         is resolved even when hopRadius < sample spacing
       • z = layer.z + zOffset + hop per point; centroid per layer
       • softJoin seam ramp: each closed path (WaveLayer.closed) rises one
         layer step over its last transitionLength mm (smoothstep), so it
         ends at the next layer's start; off with alternateDirection or
         a single layer
     → ToolpathLayer[] { index, z, paths: {x,y,z}[][] (mm), centroid, crossings }

ToolpathLayer[] consumed by BOTH:
  ├─ generateGcode()       [lib/gcodeGenerator.ts]
  │    • preamble G21/G90/M82 (M82 only with E)/G92 E0; priming beside the
  │      first layer's bounding box
  │    • skirtArcPoints for inter-path travel: lift to highest printed Z + 2,
  │      descend to the path's real start Z
  │    • buildTransition for softJoin: smoothstep XY + linear Z, no retract;
  │      skipped when the seam ramp already reached the next start
  │    • E accumulates: E += dist * extrusionMultiplier
  │    • final lift to max(safeZ, highest printed Z) + 10
  │    • move() / dwell() write each line and keep the time / length / E
  │      summary from the rounded values written
  │  → { text, stats }    (stats feed the viewer summary)
  └─ Preview2D             — so the preview always draws what gets printed

summarizeGcode() [lib/gcodeStats.ts] reads a program back; only tests use it,
to check the emitted stats.
```

Regeneration in `App.tsx`: `layers` and `toolpath` are `useMemo`s keyed on `parsedSVG`, `keyframes` and the fields in `WAVE_PARAMS` / `TOOLPATH_PARAMS`, so they recompute during render only when geometry can change. When a stage starts reading a new param, add it to that list; `paramDeps.test.ts` fails otherwise. G-code is an effect on `[toolpath, params]`, debounced 400 ms (via `gcodeTimerRef`) to avoid freezing the UI during slider/keyframe edits. Re-sampling (re-parsing the raw SVG) only happens when `params.sampleSpacing` changes.

---

## Layout and file map

Screen layout: the 3D canvas fills the window (`.app-stage`); everything else floats on it. `App.tsx` computes `insets` (screen space taken by the side panels and the top bar) and passes them to `Preview2D`, which frames the part and places its overlays inside them (`Scene.inset`). Both side panels collapse to a 44 px rail (`barrocode.panels`); under 1280 px wide only one stays open.

```
┌ left panel (300) ─┐ ┌ top bar: fit, Iso/Planta/Frente, ┐ ┌ right panel (296) ─┐
│ Forma · Impresión │ │ Color, Cotas … summary, G-code,  │ │ Onda · Restablecer │
│ Cargar SVG · ‹ ›  │ │ Descargar (signal), ?            │ │ small Lissajous    │
│ file name         │ └──────────────────────────────────┘ │ context line       │
│ PathList          │                                  ┌─┐ │ presets, N, T, Z,  │
│ tabs: Pieza │     │        3D canvas (full window)   │L│ │ Delta, Fase        │
│ Trayecto │Máquina │   G-code opens as a drawer here  │a│ │                    │
│ (incl. Center-    │                                  │y│ │                    │
│  ScaleParams)     │ ┌ dock ────────────────────────┐ └─┘ │                    │
│                   │ │ keyframe editor (if selected)│     │                    │
│                   │ │ ‹ n › · timeline · % · +KF   │     │                    │
└───────────────────┘ └──────────────────────────────┘     └────────────────────┘
```

```
src/
  main.tsx                  React root, StrictMode
  App.tsx                   Master state, floating panels, inline samples, keyframe dock controls, shortcuts, session (≈980 lines)
  index.css                 All styles (≈1620 lines, design tokens in :root)
  types/index.ts            All shared types
  components/
    Preview2D.tsx           Full-window 3D canvas, interaction, top bar, layer slider, timeline dock, G-code drawer (≈910 lines)
    LissajousParams.tsx     Right panel: wave sliders + presets; edits the selected keyframe
    LissajousPreview.tsx    Small animated Lissajous strip under the wave panel header
    PathParams.tsx          Left panel: Pieza / Trayecto / Máquina tabs
    PathList.tsx            Per-path overrides + collapse
    CenterScaleParams.tsx   Pivot + scale sections, rendered inside PathParams' Pieza group
    CenterPad.tsx           56×56 canvas pivot picker
    GcodeOutput.tsx         G-code drawer: textarea + copy + close
    HelpDialog.tsx          "?" quick-start modal (native <dialog>)
    NumInput.tsx            Controlled number input: wheel, Shift fine step, label drag
    FlowSteps.tsx           Four-step icon row in the empty 3D view
    icons.tsx               Inline-SVG icon set (`Icon`, `IconName`)
  lib/
    __tests__/              Vitest specs, fixtures, reference .gcode snapshots
    svgParser.ts            DOM-based SVG sampling
    waveGenerator.ts        Lissajous math + keyframe interp + scale
    toolpath.ts             Final mm trajectory shared by G-code + preview
    draw3D.ts               Canvas drawing for Preview2D (projection, scene, top-down) (≈670 lines)
    palette.ts              CSS tokens copied for canvas code + OKLCH layer ramp
    gcodeGenerator.ts       G-code assembly (≈330 lines)
    gcodeStats.ts           GcodeStats type; summary read back from G-code (test oracle)
    hopUtils.ts             Z-hop crossing detection (spatial grid) + parabolic lift
    skirtUtils.ts           Concentric arc travel math
  shaper/                   Forma workspace (docs/shaper-plan.md), its own lazy chunk
    ShaperView.tsx          Only export App uses: left panel, mm grid canvas, send button
    lib/shape.ts            ShapeDoc (F0: circle), path data in mm, seam, label
    lib/toSvg.ts            ShapeDoc → SVG with 1 user unit = 1 mm
    lib/__tests__/          Vitest specs for the shaper's lib
docs/                       usage, architecture, fabrication notes, research notes,
                            perf spec, UI mockup/prompt (design references)
pendientes.md               Prioritised backlog (some checkmarks stale — see "Current state")
```

---

## State and types

`PrintParams` is a single **flat** object with ≈50 fields covering sampling, Lissajous wave (N/T/Z), layers, soft-join, SVG→mm transform, shape transform, z-hop, travel, speeds, extrusion, path options, and clay-specific behaviour. Defaults are `DEFAULT_PARAMS` in `App.tsx`. **Do not nest it, do not split it into multiple stores.**

Keyframes (`WaveKeyframe[]`) override Lissajous (phase included) and pivot/scale/rotation fields at given `t ∈ [0,1]` (fraction of all flattened points across all layers). Optional keyframe fields fall back to `PrintParams`; new keyframes snapshot every field from the wave shown at that `t`. Between keyframes, all fields are interpolated by `segmentAlpha`: straight, except that a keyframe with `smooth` is reached and left with zero slope (cubic Hermite; smooth at both ends is smoothstep). Smooth keyframes are drawn round instead of as diamonds (`wlN/wlT/wlZ` floor-clamped at 0.1; `rotation` is not wrapped, so 0° → 360° is a full twist). When `keyframes.length > 0`, the per-path overrides (`ampNOverride` etc. on `SampledPath`) are **silently ignored by `waveGenerator`** — the UI disables them in this case (see `PathList.tsx`).

`App.tsx` state:
- `params: PrintParams` — the print config
- `parsedSVG: ParsedSVG | null` — sampled SVG
- `layers`, `toolpath` — memoized `generateWaveLayers` / `buildToolpath` output (not state); `toolpath` goes to both `Preview2D` and `generateGcode`
- `gcode: string` — output of `generateGcode`
- `error: string | null` — SVG parse error shown in the UI
- `keyframes: WaveKeyframe[]`
- `timelineProgress: number ∈ [0,1]` — scrubber on `Preview2D`
- `gcodeFilename: string` — derived from uploaded SVG filename
- `lastRawRef: { raw, spacing } | null` — kept for re-parse on spacing change
- `gcodeTimerRef` — debounce handle for G-code regeneration (400 ms)
- `centerTab: 'preview' | 'gcode'` — whether the G-code drawer is open over the 3D view
- `sampleIndex: number` — which inline sample SVG is shown in the sample navigator
- `selectedKfId: string | null` — id of the currently selected keyframe. While set, the Lissajous panel edits that keyframe and the timeline sits on it; moving the extruder off it by hand (timeline slider or a click on the lane, `onScrub`) clears it, as does `Esc`; `Supr` deletes it. With keyframes and none selected (`autoKey`), the panel shows the wave interpolated at the extruder, and `setLissParams` turns an edit of a wave field into a keyframe there (or edits the one under the extruder) and selects it. Deleting the last keyframe copies its values into `params` (`adoptAsGlobal`), so the part keeps its shape. Loading another SVG or sample keeps the keyframes' wave but drops their centre, scale and rotation (`keepWaveOnly`), which were set for the previous part
- `helpOpen: boolean` — help dialog visibility; opens automatically on first visit (`localStorage` key `barrocode.helpSeen`), via the `?` button in the banner, or the `?` key
- `savedSession: SavedSession | null` — last autosaved session (`localStorage` key `barrocode.session`, written 1 s after changes), offered for restore while no SVG is loaded

Other `localStorage` keys: `barrocode.leftTab` (active left-panel tab in `PathParams`), `barrocode.panels` (which side panels are open, in `App.tsx`), `barrocode.viewOptions` (the 3D view's *Color por capa* and *Cotas* toggles, kept in `Preview2D`). Every access is wrapped in try/catch; the app must work without storage.

Keyboard shortcuts live in one window `keydown` handler in `App.tsx` (stable-refs pattern): `?`, `K`, `G`, `←/→`, `Esc`, `Supr`. `←/→` move the extruder, or jump to the previous/next keyframe while one is selected. They are ignored while typing in text/number fields.

---

## Coordinate / unit conventions

- `WaveLayer.paths` stores XY in **SVG user units**, measured from the viewBox's top-left corner (only `svgToMM` re-centres them); `WavePoint.zOffset` is already in **mm**.
- `svgToMM()` (in `waveGenerator.ts`) converts XY to **mm** only in `buildToolpath`.
- `lissAmpN/T` and `lissWlN/T/Z` are in **mm** and divided by `scaleFactor` inside the wave math (so the visual amplitude tracks the real-world mm regardless of SVG unit scale); `lissAmpZ` is not (Z is always mm).
- `svgToMM(pt, sf, originX, originY, flipY, centre)` maps the part centre (`partCentreSVG`, SVG units) to (`originX`, `originY`) mm. `buildToolpath`, `CenterPad` and `draw3D` take that centre; tests that place parts by hand pass `CENTRE` (0, 0) from `fixtures.ts`.
- `centerX/Y` are offsets in mm from the part's centre, so the pivot sits at (`originX + centerX`, `originY + centerY`) on the bed.
- Transform order: `scaleFactor` (SVG→mm) is separate from `scaleX/Y` (shape scale around pivot) and `rotation` (degrees, counter-clockwise seen from above, around the same pivot). `applyTransformSVG` scales and then rotates in SVG space before `svgToMM` converts; with `flipY` the angle's sign flips there so the bed always sees counter-clockwise. `rotation.test.ts` pins this.
- Twisting a part shifts each layer by `r · Δθ` at distance `r` from the pivot, so steep twists overhang. That is the user's call; the app doesn't warn or limit it.
- `flipY`: most printers want Y growing upward; SVG Y grows downward.
- Preview projection is right-handed: at azimuth 0 the camera looks along +Y (X right, Z up), and the top view shows Y up. `src/lib/__tests__/draw3D.test.ts` pins this; the preview once drew the part mirrored.

---

## Conventions to follow

1. **All print params live in one flat `PrintParams`.** No nested objects. No context, no zustand, no redux.
2. **Panels receive `params` + `onChange`.** Update with the spread pattern: `onChange({ ...params, [k]: v })`.
3. **Component-local helpers.** `Num`, `Slider`, `Check`, `Sec` are defined inside each panel file. Don't extract them into a shared module.
4. **Canvas rendering** lives inside `useEffect` with the full dependency array — the canvas redraws on every relevant change. Expensive *geometry* may be memoized (`layers` and `toolpath` in `App.tsx`, `flatPoints` in `Preview2D`); the drawing itself is not.
5. **Stable-refs pattern for window-level handlers.** Refs are updated in a separate `useEffect([dep])`, then read inside a `useEffect([])` that attaches `window` listeners once. See `Preview2D.tsx` keyframe drag code for the canonical example.
6. **Spanish UI throughout.** Labels, tooltips, section titles, error messages — all Spanish. Code, identifiers, and comments — English. (Existing files mix in some Spanish comments; keep new comments English.)
7. **No undo/redo.** State changes are permanent until the user changes them again.
8. **Default to writing no comments.** Only add a comment when the WHY is non-obvious (a hidden constraint, a workaround, a subtle invariant). Never explain WHAT well-named code already says, and never reference the current task / fix / caller.
9. **Don't add error handling for impossible scenarios.** Trust internal code. Only validate at boundaries (user input, SVG parsing).
10. **No backwards-compat shims.** This project has no public API; just change the code.

---

## Architectural sharp edges and known issues

These are documented hazards. Fix them when you touch the area, but don't go on cleanup sweeps without being asked.

- **`ParsedSVG.raw` duplicates `App.tsx`'s `lastRawRef.current.raw`.** Either could be removed.
- **`CenterPad`'s drag has no window-level handler** — drag stops abruptly at the canvas boundary on fast moves.
- **Z-hop crossing detection** uses a spatial grid; it only `console.warn`s above 3000 points (`WARN_PTS`), never skips.

---

## When working on G-code generation

This is the most subtle area. Before changing `lib/gcodeGenerator.ts`:

- Run `npm test`. `src/lib/__tests__/gcodeGenerator.test.ts` checks motion invariants (no long or plunging extrusion, no XY travel at or below anything already printed, G-code matches the preview toolpath) across soft join / priming / alternate-direction combinations, plus reference `.gcode` files in `__snapshots__/`. When output changes on purpose, read the snapshot diff before accepting it with `npm test -- -u`.
- Generate a sample with a 2- or 3-path SVG and read the output. The header comment block lists every parameter — use it to sanity-check. (It doesn't list the Z oscillation fields yet; see `pendientes.md` NP-0c.)
- Inter-path travel logic depends on `isFirstMove` and `joined` (set when the previous path ended in a soft-join transition). Layer→layer transitions only happen on the **last** path of a layer when `softJoin` is true and the next layer's first point is within `transitionLength` in XY; otherwise the next path arrives by skirt travel (`joined` tracks which).
- Coordinate conversion via `svgToMM()` happens in `buildToolpath`. Never pre-convert `WaveLayer.paths` to mm; downstream code expects SVG units there.
- Path order, Z oscillation and z-hop belong in `lib/toolpath.ts`, not in the emitter: the preview draws the same toolpath, so anything computed only in `gcodeGenerator.ts` makes the two disagree.
- E accumulates monotonically (`E += dist * extrusionMultiplier`). If you add new motion, account for E unless `params.generateE` is false.
- Clay printers don't retract. Don't introduce retraction moves.

---

## When working on the canvas previews

- `Preview2D` draws `buildToolpath` output, never `WaveLayer.paths` directly, for anything that represents printed motion.
- `Preview2D` keeps state and interaction; all canvas drawing lives in `lib/draw3D.ts` (`drawScene`, `drawTopDown`). Orthographic projection: `project(x, y, z, azimuth, elevation)`. Screen coords are `[offsetX + px*scale, offsetY + py*scale]`.
- While the user drags the camera (`isInteracting`), drawing uses a LOD stride of 4 and skips the keyframe, skirt and join overlays. Keep new expensive overlays behind `!isInteracting`.
- Scene drawing has three bands: backdrop (background, grid, centre axis), `drawGeometry` (layer strokes and the overlays tied to them), and foreground (keyframe markers, extruder, dimensions, empty-state text, gizmo; the last two keep inside `scene.inset`). Anything that follows the timeline must stay out of `drawGeometry`, which is cached during a scrub; its inputs are `GeometryScene`. Canvases outside the DOM rasterise on the main thread, so only use one where it is reused across frames.
- The empty state's text is drawn on the canvas; the four-step row under it (icons with short labels) is HTML (`.stage-empty` in `Preview2D`, `FlowSteps.tsx`), placed 52 px below the inset centre to clear the text.
- `layerAtT(toolpath, t)` (`draw3D.ts`) is the layer under the extruder at timeline position `t`, by the same point index the extruder is drawn at; `layerLabel` turns it into "capa N · H mm" (H = height at the layer's top) for the timeline readout, the keyframe drag label and tooltip, and the keyframe editor. A dragged keyframe snaps to `layerStartTs` within `KF_SNAP_PX` (Alt drags freely); the readout has a fixed width so the track never resizes mid-drag.
- Layer visibility comes from the layer slider: `drawScene` gets `layerCap` (top visible layer index) and `layerSolo`. New overlays tied to a layer should respect it.
- Canvas colours come from `lib/palette.ts`: `loadPalette()` (called in `main.tsx`) copies the CSS tokens once; its defaults mirror them for tests. Never hardcode a colour in canvas code.
- Layer colors are an OKLCH ramp from electric indigo through magenta to `--signal` (`rampColor` in `palette.ts`, wrapped by `layerColor`); with *Color por capa* off every layer is `--ink-2` and the legend is hidden. *Cotas* draws the bounding box's X/Y lengths and the height (`numLayers · layerHeight`, as in the toolbar) in the foreground band. Clicking a keyframe diamond on the canvas selects it (`keyframeAt`, from the same `keyframeMarkers` the drawing uses). Keyframes are numbered diamonds coloured by `keyframeColor(t)`. The number is the keyframe's index in `keyframes`, which `App` keeps sorted by `t` except during a timeline drag (sorted on release), so a dragged keyframe keeps its number (the ramp hue at their position, at a fixed light tone so the dark number reads on every hue). Number and colour are the same on the timeline lane, the canvas, the keyframe strip and the Lissajous header; the selected one gets a dark outline. The canvas extruder is a dark square, like the slider thumb, so it never reads as a keyframe.
- `LissajousPreview`'s dot runs one lap (`LAP_MS`) after the figure changes and then stops; it doesn't run at all when both `ampN` and `ampT` are ≈0 or under reduced motion. Don't make it loop again: a permanent loop cost ≈12 % of a core while idle. Its static canvas redraws only on change; per-frame work belongs on the dot canvas.
- Canvas text takes `font-variation-settings` from the canvas element's computed style, so `:root`'s `'wght' 450` overrides the weight in `ctx.font`: every in-page canvas draws GSCode at 450. A canvas that isn't in the DOM (e.g. `document.createElement('canvas')` used as an offscreen buffer) draws the real weight instead, so text cached that way looks bolder. Keep text on in-page canvases.
- Auto-fit in `LissajousPreview` keys off `lissAmpN`, `lissAmpT` and the observed canvas size, and always centres the figure. The preview is read-only (no pan/zoom).

---

## CSS

- Design tokens in `:root` at the top of `src/index.css`: colours, type (`--fs-xs…xl` = 10/11/12/14/18 px, `--fw-regular` 450 / `--fw-strong` 600), spacing (`--sp-1…6`), radii, shadows, motion. Use them; don't hardcode values. The overhaul plan and its design direction are in [docs/ui-overhaul-plan.md](docs/ui-overhaul-plan.md).
- Art direction: clean, Claude-like. Neutral greys, white surfaces, dark grey rather than black (`--ink` `#38383E`; `--accent` `#4A4A51` for sliders and primary buttons). **`--signal` (`#FF5A1F`, white text on it) is reserved** for the final export action, adding a keyframe and the keyboard focus ring (`--focus`); don't use it anywhere else. The export and add-keyframe buttons fill with `--signal-ramp` (the layer ramp's hues at lower chroma) instead of flat `--signal`, raised with `--shadow-raised` (`-hi` on hover); keep both to those two buttons. `--shadow-float` only on floating containers and menus.
- Sentence case everywhere: no `text-transform: uppercase`, no letter-spacing. Hierarchy comes from weight and ink (`--ink` / `--ink-2` / `--muted`), not caps.
- Every `font-weight` must be paired with `font-variation-settings: 'wght' N`: `:root` sets the variation, which overrides a plain `font-weight` on GSCode.
- Smallest text size in CSS is **10px** (`--fs-xs`). Don't go below. (Some canvas captions are still 7–9 px; overhaul phase 2 removes or enlarges them.)
- Sliders apply a dynamic `linear-gradient` fill inline (see `LissajousParams.Slider`). Keep this pattern when adding new sliders. Wave sliders also take a `def` (default value): a notch marks it, a pointer drag snaps to it within 1.5 % of the range (keyboard steps don't), and a bubble shows the value while dragging.
- On/off options in `.param-check` rows are native checkboxes styled as switches (`appearance: none`).

- Buttons: `.btn-small` (secondary), `.btn-primary` (ink), `.btn-primary.btn-signal` (the export action), `.btn-reset` (ghost). Segmented controls (`.seg-switch`, `.view-presets`) share one pill style.
- Floating containers (`.float-panel`, top bar groups, `.layer-slider`, `.dock`, `.gcode-drawer`) share one surface: white, `--border`, `--radius-lg`, `--shadow-float`. Opaque on purpose: a translucent or blurred panel would make the browser recomposite it on every canvas frame.


### Motion

Phase 5 of the overhaul. Durations and easing come from `--dur-fast` / `--dur` / `--dur-slow` / `--ease`; everything collapses under `prefers-reduced-motion` (a global rule at the end of `index.css`, and JS animations check `matchMedia` and jump to the end). Nothing loops, on the 3D canvas or elsewhere, except while something is actually moving.
- **Entrances are CSS animations on mount**; exits keep the element mounted for the exit animation: closing a side panel (`leaving` in `App.tsx`, `PANEL_LEAVE_MS`), removed keyframes on the timeline (`leavingKfs` in `Preview2D`), the keyframe editor (`closingEditor`). Keep the JS timeouts and the CSS durations in step.
- To replay a CSS animation on every change, remount with a new `key` (toasts, `NumInput` step readout) or alternate two identical keyframes (`num-flash-a/-b`).
- **Sliding highlights**: the Pieza/Trayecto/Máquina tab and Iso/Planta/Frente share one moving element (`.panel-tabs-ind`, `.view-presets-ind`); the view one fades out when the camera matches no preset.
- **Camera** (`Preview2D`): `animateView` tweens presets, Encuadrar and panel reframes over `VIEW_TWEEN_MS` with the part's centre moving straight on screen; a rotation drag coasts on release (`coast`). Both keep `isInteracting` on, so they draw with LOD; any mouse-down or wheel cancels them. `showAngles` shows az/el only while turning.
- **Wave presets**: `LissajousParams.onChange(p, true)` bumps `lissMorph` in `App`; `LissajousPreview` morphs its figure over 250 ms and the changed numbers flash. Slider edits don't morph.
- **Keyframes**: new ones pop (timeline CSS, canvas via `Scene.kfPop`); selecting one glides the timeline (`glideTimeline` in `App`, cancelled by any direct `setTimeline`).
- **G-code**: `gcodeBusy` (App) is true from an edit until its debounced G-code lands; it drives the indeterminate bar (`.gcode-progress`, 150 ms delay), the dimmed summary and G-code text. The time in the summary counts to its new value (`useCountUp`). Toasts (`showToast` in `App`, rendered by `Preview2D` above the dock) confirm download and session restore; Copiar confirms in its own button.

---

## What's gitignored (and why it matters)

`.gitignore` excludes `node_modules/`, **`package-lock.json`**, `dist/`, `release/`, `.vite/`, env files, editor settings, OS junk, and logs.

The lockfile being gitignored is intentional (it broke cross-platform rollup native binaries in CI) — accept it; don't try to commit it.

`release/` was the Electron build output and is gitignored for legacy reasons; nothing writes to it any more.

---

## Documentation map

When you need context, this is where to look:

- [README.md](README.md) — public overview with mermaid diagrams.
- [CLAUDE.md](CLAUDE.md) — this file. Operating manual for Claude sessions.
- [docs/usage.md](docs/usage.md) — user-facing flow and parameter reference.
- [docs/architecture.md](docs/architecture.md) — pipeline detail (more technical than this file's diagram).
- [docs/fabrication-notes.md](docs/fabrication-notes.md) — clay-printer criteria informing the design.
- [docs/research-notes.md](docs/research-notes.md) — **open research notes**, unpriorized ideas. Read before suggesting any new feature.
- [pendientes.md](pendientes.md) — **actionable backlog**, prioritized in waves. Read before starting any new ticket; cross-check its checkmarks with "Current state" above.
- [docs/performance-optimization-spec.md](docs/performance-optimization-spec.md) — execution spec for preview caching, LOD, G-code debounce, and worker offload (Ola 8).
- [docs/ui-overhaul-plan.md](docs/ui-overhaul-plan.md) — graphical overhaul: diagnosis of the current UI, layout proposal, open decisions (D-1…D-6) and phased plan. Check it before any UI/CSS work.
- [docs/shaper-plan.md](docs/shaper-plan.md) — proposal for *Forma*, an in-app shape generator and path editor that hands SVGs to the print workspace: references, module boundary, open decisions (D-S1…D-S7) and phases F0–F6. F0 done.
- `docs/ui-interactive-mockup.html`, `docs/ui-image-prompt.md` — UI design references, not shipped.

---

## Commit and review hygiene

- Conventional-commit prefixes are welcome but not enforced. The existing log mixes `feat:`, `fix:`, `chore:`, `ci:`, and plain prose.
- Keep commits scoped to one logical change. If a change spans entangled files (rename + bug fix in the same function, etc.), split it manually — don't lump everything into a "misc" commit.
- Run `npm test` and `npm run build` before committing.
- The GitHub repo is [Cranmellar/barrocode](https://github.com/Cranmellar/barrocode) (formerly `curvabarro`; old clones and links may still use that name).
