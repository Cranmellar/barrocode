# CLAUDE.md

Operating manual for Claude Code sessions in this repo. Read this in full before making changes.

The owner improves this project **incrementally, favouring the lowest-effort / highest-impact changes**. Prefer small, verifiable commits over refactors. The "Current state" and "Next steps" sections below are the starting point for any session.

---

## What this project is

**barrocode** (pronounced like *barroco*) — a web app that turns SVG curves into G-code for clay 3D printers. The SVG paths are sampled, modulated by a Lissajous wave (normal + tangent oscillation along arc length, plus optional Z oscillation), stacked into layers, and emitted as G-code with clay-specific behaviour (no retract, soft layer joins, optional dwell/priming, concentric skirt travel, parabolic z-hop at self-intersections).

Audience: a **small community of ceramicists**, shared via GitHub Pages. The whole app runs in the browser. There is no backend, no native shell.

---

## Stack and commands

- **Vite 5** + **React 18** + **TypeScript** (strict mode via `tsc &&` before `vite build`)
- **No UI library**, no state manager, no router. All styles live in `src/index.css`. State is plain React `useState` in `App.tsx`.
- Font: `GSCode` (Google Sans Code, SIL OFL 1.1; variable, roman and italic, `public/fonts/*.woff2`) for all text (`--font-ui`). Section titles use the italic. The files are the upstream TTFs converted to WOFF2 with the unused `MONO` axis pinned at its default 1 (what the app always rendered) and the box-drawing glyphs U+2501–257F dropped: 415 → 117 kB, outlines and advances unchanged. Only the regular face is preloaded (`index.html`). To redo it with fontTools: `fonttools varLib.instancer GSCode.ttf MONO=1`, then `pyftsubset` with every codepoint of the cmap but U+2501–257F, `--flavor=woff2 --layout-features='*' --name-IDs='*' --name-languages='*' --notdef-outline`.

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

`vite.config.ts` uses `base: './'` so the build works from any sub-path. It does **not** run from `file://` in Chromium (checked Nov 2026): the module script and stylesheet carry `crossorigin` and are blocked from origin `null`. Use `npm run preview` or any static server.

There is **no** desktop / Electron / portable distribution. It was removed; don't re-introduce it without explicit request.

---

## Current state (2026-11-06)

A summary. How each piece came to be, with measurements and the reasons behind each choice, is in [docs/history.md](docs/history.md); check it before changing an area it covers.

- **Health.** `npm test` (285 tests; the G-code matrix runs every invariant on one program per geometry × config) and `npm run build` pass. Loaded at start: ≈197 kB app JS + 141 kB vendor + 57 kB CSS (≈123 kB gzip) and the regular font (54 kB WOFF2). Forma (≈45 kB) and the Máquina panels (≈17 kB) are separate chunks, loaded when first opened.
- **Pipeline complete**: SVG → sampling → Lissajous N/T/Z wave → layers → shared mm toolpath → G-code, with keyframes, centre/scale/rotation pivot, z-hop, skirt travel, soft join, dwell (`G4`), priming and wall passes. Preview and G-code draw from the same `buildToolpath` output, and the tests check they agree.
- **Machine safety.** `M82` when `generateE` is on. Final lift to `max(safeZ, highest printed Z) + 10`, at most `bedZ`. Skirt travel lifts 2 mm above the highest Z printed so far and descends to the next path's real start Z (NP-0b). Z floor in `generateWaveLayers`: layer 0 never dips below its set height, later points stay ≥ `layerHeight · MIN_LAYER_GAP` (0.5) above the same sample below. Priming runs along +X 10 mm beside the first layer's bounding box. E follows the 3D length of each move, Z-only steps included (NP-0a).
- **Seam ramp (soft join).** `buildToolpath` spreads the layer rise over the last `transitionLength` mm of every closed path, only when the next layer starts within `transitionLength` in XY; otherwise a normal lift travel. Open paths and `alternateDirection` keep the old transition. Layer 0's tail lifts off the bed by up to one layer height (accepted).
- **SVG input** (`parseSVG`). The viewBox's top-left corner becomes (0, 0); a physical root `width`/`height` sets `mmPerUnit`, adopted as `scaleFactor` on load (*Usar tamaño real* when they differ). Skips geometry that is never drawn (`defs`, `clipPath`, `mask`, `symbol`, `marker`, `pattern`, `display:none`). Strips `<script>`, `<foreignObject>`, `on*` and `javascript:` links and inserts with `importNode`, never `innerHTML`. Lengths under scale transforms are converted to root units (`lengthScale`); multi-subpath `<path>`s are split (`splitSubpaths`). Only `splitSubpaths` is tested.
- **Placement.** `svgToMM` puts the centre of the enabled paths' bounding box (`partCentreSVG`) at (`originX`, `originY`); `centerX/Y` are the pivot's mm offsets from it. The camera orbits the part's centre and refits on a new SVG (`partKey`). `gcodeOrigin` `'corner'` moves the toolpath inside `generateGcode` (`toCornerOrigin`) so the XY box's corner lands at (`marginX`, `marginY`), skirt arcs clamped to it; the toolpath, preview and `TOOLPATH_PARAMS` never see it.
- **G-code text.** The header opens with `; Version : barrocode <commit> (<build date>)` and `; Project : <part name>` (newlines stripped), then lists every parameter, the Z wave and each keyframe, and the box. Each layer opens with `;LAYER_CHANGE`, `;Z:`, `;HEIGHT:`, `;LAYER:n`; the header ends with `;LAYER_COUNT:` (not yet checked in a real viewer). The download is named `name_1.5mm_2h05m_20261106-1432.gcode` (`gcodeFileName`: layer height, time, date and time of the click); `gcodeFilename` in `App` stays the part's name. With `material === 'filament'`: Orca / Creality Print's `HEADER_BLOCK`, a `THUMBNAIL_BLOCK` (`lib/thumbnail.ts`, `THUMBNAIL_SIZES`, reused while the toolpath and `lineWidth` are the same via `thumbsRef`), Cura's `;TIME:` / `;Filament used:`, and Orca's footer. Not yet checked on a K1: if it ignores the metadata, try the `; generated by` line as Creality Print writes it.
- **Wall passes** (`wallPasses`, `wallSpacing`, `wallSide`; *Muro* in *Pieza*). `wallOffsets` moves each pass along the centerline's outward normal (`signedArea` per contour, `transformNormal` keeps mm under scale/rotation), so crests line up and Z is shared. All passes of a path form one path (back to back at a closed seam, back and forth on an open one). Corners get `wallCornerMargin`. Not yet test printed.
- **Keyframes.** The right panel is the only wave editor; with keyframes and none selected it shows the wave at the extruder and an edit creates or edits the keyframe there (auto-key). Smooth keyframes (`smooth`, `segmentAlpha`), phase per keyframe, `D` duplicates, arrow keys jump between keyframes, drags snap to layer starts, *Borrar todos* needs a second click. Deleting the last one copies its values into `params` (`adoptAsGlobal`); loading another SVG keeps only their wave (`keepWaveOnly`). *Reiniciar* restores only `LISS_PANEL_FIELDS`. Layer count comes from `layerCount()` (capped at `MAX_LAYERS`, 500); don't re-derive it.
- **Workspaces** *Forma › Impresión › Máquina* (`workspace` in `App.tsx`; no step numbers, they aren't steps). Print shortcuts are off in *Forma*; in *Máquina* only `?` and `G` act.
- **Forma** (`src/shaper/`, [docs/shaper-plan.md](docs/shaper-plan.md), phases F0–F6 done, every decision closed). Three families at an exact outer diameter, rotation, seam and direction (`shapePoints`); *Imprimibilidad* against `waveCornerRadius(params, keyframes)`; *Descubrir* (seeded variations within `FAMILY_PARAMS`); *Editar puntos* (`ShapeDoc.path`, `pathModel.ts`, `fit.ts`); several contours; *Abrir en Forma* / *Importar* via `svgOutlines`; *Onda* draws the band the wave sweeps; zoom and pan (`View`). Undo exists only here. *Enviar a impresión* loads an SVG with 1 unit = 1 mm (`shapeToSvg`) through `doParse`. Boundary: `App` imports only `ShaperView` (plus the `ShapeDoc` type); the shaper imports only `wrapHint` from `src/lib/`, and only `NumInput` and `icons` from `src/components/`. Persists under `barrocode.shape`.
- **Máquina** ([docs/maquina-plan.md](docs/maquina-plan.md); G0–G4 built, G-1 measurement and G5 test prints open). `MachineParams` (left), `MachineReview` (right; `checkMachine`, with *Centrar en la cama* and *Adaptar a la boquilla* (`adaptToNozzle`) as one-click fixes). `Preview2D` draws the bed (`bed`, a `BedOverlay`), red and dashed when the part is off it. Machine errors and part warnings (`MachineCheck.part`, e.g. beads lifted past `MAX_LAYER_GAP`) also show as a mark in Impresión's top bar. 19 profiles (`MACHINE_PROFILES`), catalogue figures unverified on a machine except the generic clay ones and those with a `source`; `MACHINE_PROFILES[0]` (clay, centre origin) is what `DEFAULT_PARAMS` and the test `PARAMS` spread. `MACHINE_FIELDS` persist under `barrocode.machine` and survive loading an SVG or restoring a session. Filament speeds show in mm/s; `PrintParams` keeps mm/min.
- **UI overhaul** ([docs/ui-overhaul-plan.md](docs/ui-overhaul-plan.md)): phases 1 (tokens, controls, canvas palette, OKLCH ramp), 3 (full-window 3D with floating panels) and 5 (motion) done, with phase 2's canvas text sizes. Open: the rest of phase 2 (duplicates and copy) and phase 6 (QA). Desktop only, no dark mode.
- **Controls.** Icons (`components/icons.tsx`, 16 px grid, 1.4 px line) on tabs, headers, rails, every section title and the geometric parameters; plain quantities stay text only and an icon never replaces its label. Tooltips are the native `title`, wrapped by `wrapHint` (`HINT_MEASURE` 46; `\n` starts a paragraph, ` ` keeps words together); every hint says what the value does to the part, checked against the code. `NumInput`: wheel (refreshes while focused), Shift for `fineStep`, drag on the row's `<label>`, the step amount floats beside the field; it links the row's label (or a slider's `.slider-label`) as its accessible name.
- **Samples and session.** Eight inline samples, each wrapped by `sizedSample` to print 15 × 15 × 15 cm (`loadSample` sets the height). Drag-and-drop of an SVG works. Session autosave under `barrocode.session` / `barrocode.sessionSvg`.
- **Project file** (`.barrocode.json`, `lib/project.ts`, *Proyecto › Abrir / Guardar* under the file name; a dropped `.json` opens too). Holds the SVG, the design params, keyframes, `PathState`s and Forma's shape; `MACHINE_FIELDS` go in a separate `machine` block that opening doesn't apply (`applyDesign`, shared with session restore, keeps the local machine). `parseProject` is the boundary: it drops wrong-typed fields so `DEFAULT_PARAMS` fills them, skips unreadable keyframes, paths and shapes, and refuses newer versions (`PROJECT_VERSION` 1). A project with only a shape opens in Forma. Each file records `app: { commit, build, saved }` (`ProjectApp`, `null` for older files); opening one from another commit, or without it, adds *puede verse distinto* to the toast (`otherVersion` in `App`).
- **Version stamp** (`lib/build.ts`, [docs/muestras-plan.md](docs/muestras-plan.md) B). `vite.config.ts` defines `__BUILD__`: on `vite build`, `GITHUB_SHA` (or `git rev-parse`) cut to 7 and the build date; in the dev server and tests `{ commit: 'dev', date: '' }`, so the reference G-code doesn't change per commit. Used by the project file, the G-code header and the help dialog's footer.
- **Not built**: pivot drag in the 3D viewport (`Preview2D` has no params `onChange`; `pendientes.md` Ola 3 / KF-C3, once ticked by mistake).

---

## Next steps

Open work, ordered by impact ÷ effort; done steps are recorded in [docs/history.md](docs/history.md). Verify against the code before starting; line numbers drift. Larger planned work (non-planar toolpaths NP-0…NP-3) lives in `pendientes.md`.

### Check on real machines (highest impact)

Built but never printed or opened in the target software. A short test part per item settles it; record the result here and in `docs/fabrication-notes.md`.
- Z-hop at crossings (step 1 below), wall passes, the seam ramp's layer 0 tail.
- Layer markers in PrusaSlicer / Cura / Orca's G-code viewer.
- Filament metadata and thumbnail on a Creality K1.
- Every printer profile but the generic clay ones and those with a `source`.

### Correctness (G-code that reaches the printer)

1. **Z-hop probably stacks clay at crossings** (inferred). Only the later pass hops, so a crossing gets two beads per layer and the next layer's first pass crosses at that double bead's height with no gap. Reduce or zero E inside the hop window.
2. **E ignores the real bead thickness.** With the Z wave the gap to the layer below ranges from 0.5× to ≈ 1.6× `layerHeight`, but E follows only distance. Scale E by the local gap (extends NP-0a).
3. **A bead can lose its support**: warned (`WaveLayer.maxGap`, `MAX_LAYER_GAP`), not capped; capping would flatten the designed wave. The owner hasn't chosen.

### Features and tests

4. **Test `svgParser` in Chromium.** It is untested apart from `splitSubpaths` because Node has no SVG measuring. A few Playwright checks over the samples and tricky fixtures (an Illustrator clip rect, `scale()` transforms, `mm` units, an `onerror` attribute) would pin the October fixes.
5. **KF-C2 remainder**: copy one panel section (N, T, Z, transform) from the previous keyframe.
6. **Pivot drag in the 3D viewport** (see *Not built* above).

### Needs a decision

- Sharp tips lose length to corner rounding (a 30° point, ≈ 15 mm at amplitude 3). Option: fade the amplitude near a tip instead of growing the fillet (`roundCorners`).
- With keyframes that change the amplitude along a layer, a closed path's end has the next layer's amplitude, so the seam steps by ≈ 0.5 mm. Closing it would need the amplitude held over the seam.
- `parseSVG` can't detect `visibility:hidden`: the measuring container is itself `visibility:hidden`.

---

## Performance

Every round of measurements, how each was taken and what it fixed: [docs/performance-log.md](docs/performance-log.md), which supersedes `docs/performance-optimization-spec.md` where they disagree.

**Now** (2026-11-05, production build, headless Chromium, CDP `TaskDuration` and the CPU profiler, sample 4 at 150 layers; run-to-run noise ±10 ms per tick, so compare several runs): a wave-slider tick ≈45–65 ms (`buildToolpath` ≈8–12, drawing ≈12, `copyWave` ≈6, GC ≈4–5); the debounced G-code step after it ≈150–200 ms; idle 0 %; scrub step 11–16 ms.

**Rules that came out of it:**
- Keep `Math.hypot` out of loops over points: V8 runs it ≈10× slower than `Math.sqrt(dx*dx + dy*dy)`.
- Keep every object or array passed to `Preview2D` that feeds the draw effect stable (`useMemo`). A new `insets` on each render redrew the scene and rebuilt the scrub cache on every `App` render.
- A canvas outside the DOM rasterises on the main thread; use one only when it is reused across frames (the scrub cache).
- Nothing animates while idle: `LissajousPreview`'s dot runs one lap and stops (a loop cost ≈12 % of a core).
- The G-code stats come from `generateGcode` itself (`{ text, stats }`); `summarizeGcode` is only the tests' oracle.
- `generateWaveLayers` computes a repeated layer's wave once per direction (`waveCache`) and `buildToolpath` reuses crossings of identical layers; the keyframe sampler writes into one reused `LocalParams` (read it before the next call) and `applyTransformSVG` works in place. Each was checked identical to the old code over hundreds of random configurations; do the same when touching them.

**Open, by impact ÷ effort:**
1. `useDeferredValue` on the pipeline's inputs while dragging a wave slider, so React skips stale values. Low effort, benefit unproven: measure before keeping it.
2. G-code in a worker removes the remaining 150–200 ms after each edit. Chromium refuses `new Worker(url)` from `file://`; use Vite's `?worker&inline` or fall back to the main thread. Medium effort.
3. Keyframe and `CenterPad` drags run the whole pipeline per frame (about a slider tick each). `CenterPad.partBounds` passes every point through `svgToMM` on each change; take the bounds from the shared toolpath.
4. `buildToolpath` could reuse the `svgToMM` XY of identical layers, as it reuses crossings.
5. The whole tree re-renders on each timeline tick, with no `React.memo` (< 3 ms).

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
       • arc-length sampling via getTotalLength + getPointAtLength: one call
         per sample, two more for a tangent measured either side where the
         outline doesn't turn evenly; elsewhere the chord between the
         neighbouring samples (`tangents` false skips tangents entirely)
       • getScreenCTM() for transforms; lengths converted to root units by
         the matrix's scale (lengthScale)
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
  │    • E accumulates: E += 3D dist * ePerMM (clay: extrusionMultiplier;
  │      filament: lineWidth · layerHeight / filament section · flowRatio)
  │    • start/end templates around the program ({nozzleTemp}… TEMPLATE_VARS);
  │      filament: M107, then M106 at fanFromLayer, retraction on skirt travel
  │    • per-layer feed (layerFeeds): firstLayerSpeed, minLayerTime
  │    • final lift to max(safeZ, highest printed Z) + 10, at most bedZ
  │    • shutdown: clay always ends with M400 / M107 / M84 after any end
  │      template; filament with no end template gets M104 S0 / M140 S0 /
  │      M107 / M84; with one, M107 before it if the fan ran (Creality
  │      OS's END_PRINT leaves the part fan on)
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
│ Forma·Impr.·Máq.  │ │ Color, Cotas … summary, G-code,  │ │ Onda · Restablecer │
│ Cargar SVG · ‹ ›  │ │ Descargar (signal), ?            │ │ context line│ fig. │
│ name · Proyecto   │ └──────────────────────────────────┘ │ (square Lissajous) │
│ PathList          │                                  ┌─┐ │ presets, N, T, Z,  │
│ tabs: Pieza │     │        3D canvas (full window)   │L│ │ Delta, Fase        │
│ Trayecto          │   G-code opens as a drawer here  │a│ │                    │
│ (incl. Center-    │                                  │y│ │                    │
│  ScaleParams)     │ ┌ dock ────────────────────────┐ └─┘ │                    │
│                   │ │ keyframe editor (if selected)│     │                    │
│                   │ │ ‹ n › · timeline · % · +KF   │     │                    │
└───────────────────┘ └──────────────────────────────┘     └────────────────────┘
```

In *Máquina* the left panel is `MachineParams`, the right one `MachineReview`, the bed is drawn under the part and the dock (timeline) is hidden.

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
    PathParams.tsx          Left panel: Pieza / Trayecto tabs
    MachineParams.tsx       Máquina, left panel: profile, bed, nozzle, temperatures, motion, templates
    MachineReview.tsx       Máquina, right panel: pre-export review and summary
    PathList.tsx            Per-path overrides + collapse
    CenterScaleParams.tsx   Pivot + scale sections, rendered inside PathParams' Pieza group
    CenterPad.tsx           56×56 canvas pivot picker
    GcodeOutput.tsx         G-code drawer: textarea + copy + close
    HelpDialog.tsx          "?" help modal (native <dialog>): six sections in a side list; diagrams drawn from the wave formula
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
    gcodeGenerator.ts       G-code assembly, machine templates, per-layer feed (≈480 lines)
    machineProfiles.ts      Printer profiles, MACHINE_FIELDS, bed centre
    machineCheck.ts         checkMachine (pre-export review), adaptToNozzle
    gcodeStats.ts           GcodeStats type; summary read back from G-code (test oracle)
    thumbnail.ts            PNG thumbnails of the toolpath for the G-code header (filament)
    wrapHint.ts             Line breaks for native title tooltips
    project.ts              .barrocode.json: serializeProject, parseProject (boundary checks)
    build.ts                BUILD (commit and build date from vite.config's __BUILD__), versionLabel
    hopUtils.ts             Z-hop crossing detection (spatial grid) + parabolic lift
    skirtUtils.ts           Concentric arc travel math
  shaper/                   Forma workspace (docs/shaper-plan.md), its own lazy chunk
    ShaperView.tsx          Only export App uses: left panel, mm grid canvas, send button
    components/FamilyPanel.tsx  Family tabs, family sliders, size / rotation / seam / direction
    lib/families.ts         Lobes, rounded polygon or star, superformula outlines
    components/PrintCheck.tsx   Printability warning, tightest curve, box
    components/DiscoveryGrid.tsx  3×3 seeded variations over the canvas
    components/PathPanel.tsx  Path mode: selected node, symmetry, snap, size, direction, command list
    lib/shape.ts            ShapeDoc, shapePoints (size, rotation, seam, direction), path data, label
    lib/printability.ts     checkShape: stretches tighter than the wave can follow
    lib/discovery.ts        Seeded PRNG and variations within FAMILY_PARAMS ranges
    lib/pathModel.ts        PathNode: move, split, delete, straight/smooth, reverse, seam, symmetry, d
    lib/fit.ts              Family outline → few nodes within 0.2 mm, exact radial symmetry
    lib/toSvg.ts            ShapeDoc → SVG with 1 user unit = 1 mm
    lib/__tests__/          Vitest specs for the shaper's lib
docs/                       usage, architecture, fabrication notes, research notes,
                            perf spec, UI mockup/prompt (design references)
pendientes.md               Prioritised backlog
```

---

## State and types

`PrintParams` is a single **flat** object with ≈75 fields covering sampling, Lissajous wave (N/T/Z), layers, soft-join, SVG→mm transform, shape transform, z-hop, travel, speeds, extrusion, path options, clay-specific behaviour, and the machine (material, firmware, bed, nozzle, filament, temperatures, fan, retraction, pacing, templates; only `generateGcode` and `checkMachine` read those). Defaults are `DEFAULT_PARAMS` in `App.tsx`. **Do not nest it, do not split it into multiple stores.**

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
- `savedSession: SavedSession | null` — last autosaved session (`localStorage` keys `barrocode.session` and, for its SVG, `barrocode.sessionSvg`, written only when the SVG changes; both 1 s after changes), offered for restore while no SVG is loaded

Other `localStorage` keys: `barrocode.machine` (the `MACHINE_FIELDS` of `params`, written 1 s after a change and merged over `DEFAULT_PARAMS` at start; restoring a session keeps the current machine), `barrocode.shape` (Forma's shape and the last SVG it sent, written 1 s after changes and restored at start), `barrocode.leftTab` (active left-panel tab in `PathParams`), `barrocode.panels` (which side panels are open, in `App.tsx`), `barrocode.viewOptions` (the 3D view's *Color por capa* and *Cotas* toggles, kept in `Preview2D`). Every access is wrapped in try/catch; the app must work without storage.

Keyboard shortcuts live in one window `keydown` handler in `App.tsx` (stable-refs pattern): `?`, `K`, `D`, `G`, `←/→`, `Esc`, `Supr`. `D` copies the keyframe before the extruder (or after it) to the extruder. In *Máquina* only `?` and `G` act; in *Forma*, only `?`. `←/→` move the extruder, or jump to the previous/next keyframe while one is selected. They are ignored while typing in text/number fields.

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
   **User docs** (`README.md`, `docs/usage.md`, `docs/architecture.md`, `docs/fabrication-notes.md`) are Spanish too, rewritten in Nov 2026 to the owner's style: short, direct sentences; sentence-case headings; UI names exactly as the app shows them; say what a setting does to the part; no filler intros, no stock phrasing, no em dashes. Update them in the same commit as a user-visible change.
7. **No undo/redo** in Impresión: state changes are permanent until the user changes them again. Forma is the exception (the owner's call, `docs/shaper-plan.md` D-S1): `ShaperView` keeps a stack of `ShapeDoc`.
8. **Default to writing no comments.** Only add a comment when the WHY is non-obvious (a hidden constraint, a workaround, a subtle invariant). Never explain WHAT well-named code already says, and never reference the current task / fix / caller.
9. **Don't add error handling for impossible scenarios.** Trust internal code. Only validate at boundaries (user input, SVG parsing).
10. **No backwards-compat shims.** This project has no public API; just change the code.

---

## Architectural sharp edges and known issues

These are documented hazards. Fix them when you touch the area, but don't go on cleanup sweeps without being asked.

- **`ParsedSVG.raw` duplicates `App.tsx`'s `lastRawRef.current.raw`.** Either could be removed.
- **`CenterPad`'s drag has no window-level handler** — drag stops abruptly at the canvas boundary on fast moves.
- **Z-hop crossing detection** uses a spatial grid; it only `console.warn`s above 3000 points (`WARN_PTS`), never skips.
- **`roundCorners` restarts a loop at a near-tie.** When it fillets a corner on a closed path's seam, it restarts the loop at the fillet sample nearest the old start; on a symmetric fillet two samples are about as near, so a tiny change in the input (a tangent off by 0.1°) can pick the other one and shift the whole wave by one sample (sample 2 at N 3 mm: up to 0.8 mm). Either result is valid; compare geometry, not point by point, when checking a change.

---

## When working on G-code generation

This is the most subtle area. Before changing `lib/gcodeGenerator.ts`:

- Run `npm test`. `src/lib/__tests__/gcodeGenerator.test.ts` checks motion invariants (no long or plunging extrusion, no XY travel at or below anything already printed, G-code matches the preview toolpath) across soft join / priming / alternate-direction combinations, plus reference `.gcode` files in `__snapshots__/`. When output changes on purpose, read the snapshot diff before accepting it with `npm test -- -u`.
- Generate a sample with a 2- or 3-path SVG and read the output. The header comment block lists every parameter, the Z wave and each keyframe — use it to sanity-check.
- Inter-path travel logic depends on `isFirstMove` and `joined` (set when the previous path ended in a soft-join transition). Layer→layer transitions only happen on the **last** path of a layer when `softJoin` is true and the next layer's first point is within `transitionLength` in XY; otherwise the next path arrives by skirt travel (`joined` tracks which).
- Coordinate conversion via `svgToMM()` happens in `buildToolpath`. Never pre-convert `WaveLayer.paths` to mm; downstream code expects SVG units there.
- Path order, Z oscillation and z-hop belong in `lib/toolpath.ts`, not in the emitter: the preview draws the same toolpath, so anything computed only in `gcodeGenerator.ts` makes the two disagree.
- E accumulates (`E += dist * ePerMM(params)`), only going back for a filament retraction that the next move recovers. If you add new motion, account for E unless `params.generateE` is false. Stats count E from its high-water mark (`eHigh`), so a retraction and its recovery consume nothing; `summarizeGcode` does the same.
- Clay never retracts. Filament retracts only around skirt travel (`retractLength`, `buildSkirtTravel`); don't add retraction elsewhere without a reason the review can explain.
- With the clay profile (`MACHINE_PROFILES[0]`, the defaults) the output must stay what it was: the start template is empty, no fan codes before the end (the shutdown block's `M107` is the only one), the feed is `printSpeed`. Machine features key on `material === 'filament'` or on a field the clay profile leaves at 0.

---

## When working on the canvas previews

- `Preview2D` draws `buildToolpath` output, never `WaveLayer.paths` directly, for anything that represents printed motion.
- `Preview2D` keeps state and interaction; all canvas drawing lives in `lib/draw3D.ts` (`drawScene`, `drawTopDown`). Orthographic projection: `project(x, y, z, azimuth, elevation)`. Screen coords are `[offsetX + px*scale, offsetY + py*scale]`.
- While the user drags the camera (`isInteracting`), drawing uses a LOD stride of 4 and skips the keyframe, skirt and join overlays. Keep new expensive overlays behind `!isInteracting`.
- Scene drawing has three bands: backdrop (background, grid, centre axis), `drawGeometry` (layer strokes and the overlays tied to them), and foreground (keyframe markers, extruder, dimensions, empty-state text, gizmo; the last two keep inside `scene.inset`). Anything that follows the timeline must stay out of `drawGeometry`, which is cached during a scrub; its inputs are `GeometryScene`. Canvases outside the DOM rasterise on the main thread, so only use one where it is reused across frames.
- The empty state's text is drawn on the canvas; the four-step row under it (icons with short labels) is HTML (`.stage-empty` in `Preview2D`, `FlowSteps.tsx`), placed 52 px below the inset centre to clear the text.
- `layerAtT(toolpath, t)` (`draw3D.ts`) is the layer under the extruder at timeline position `t`, by the same point index the extruder is drawn at; `layerLabel` turns it into "capa N · H mm" (H = height at the layer's top) for the timeline readout, the keyframe drag label and tooltip, and the keyframe editor. The canvas extruder's own label is "capa N · boquilla Z mm", the nozzle's real Z (with `nozzleHeightOffset`): a different number, so each names what it measures. A dragged keyframe snaps to `layerStartTs` within `KF_SNAP_PX` (Alt drags freely); the readout has a fixed width so the track never resizes mid-drag.
- Layer visibility comes from the layer slider: `drawScene` gets `layerCap` (top visible layer index) and `layerSolo`. New overlays tied to a layer should respect it.
- Canvas colours come from `lib/palette.ts`: `loadPalette()` (called in `main.tsx`) copies the CSS tokens once; its defaults mirror them for tests. Never hardcode a colour in canvas code.
- Layer colors are an OKLCH ramp from electric indigo through magenta to `--signal` (`rampColor` in `palette.ts`, wrapped by `layerColor`); with *Color por capa* off every layer is `--ink-2` and the legend is hidden. *Cotas* draws the bounding box's X/Y lengths and the height (`numLayers · layerHeight`, as in the toolbar) in the foreground band. Clicking a keyframe diamond on the canvas selects it (`keyframeAt`, from the same `keyframeMarkers` the drawing uses). Keyframes are numbered diamonds coloured by `keyframeColor(t)`. The number is the keyframe's index in `keyframes`, which `App` keeps sorted by `t` except during a timeline drag (sorted on release), so a dragged keyframe keeps its number (the ramp hue at their position, at a fixed light tone so the dark number reads on every hue). Number and colour are the same on the timeline lane, the canvas, the keyframe strip and the Lissajous header; the selected one gets a dark outline. The canvas extruder is a dark square, like the slider thumb, so it never reads as a keyframe.
- `LissajousPreview`'s dot runs one lap (`LAP_MS`) after the figure changes and then stops; it doesn't run at all when both `ampN` and `ampT` are ≈0 or under reduced motion. Don't make it loop again: a permanent loop cost ≈12 % of a core while idle. Its static canvas redraws only on change; per-frame work belongs on the dot canvas.
- Canvas text takes `font-variation-settings` from the canvas element's computed style, so `:root`'s `'wght' 450` overrides the weight in `ctx.font`: every in-page canvas draws GSCode at 450. A canvas that isn't in the DOM (e.g. `document.createElement('canvas')` used as an offscreen buffer) draws the real weight instead, so text cached that way looks bolder. Keep text on in-page canvases.
- Auto-fit in `LissajousPreview` keys off `lissAmpN`, `lissAmpT` and the observed canvas size, and always centres the figure. The preview is read-only (no pan/zoom).

---

## CSS

- Design tokens in `:root` at the top of `src/index.css`: colours, type (`--fs-xs…xl` = 11/12/13/15/18 px, `--fw-regular` 450 / `--fw-strong` 600), spacing (`--sp-1…6`), radii, shadows, motion. Use them; don't hardcode values. The overhaul plan and its design direction are in [docs/ui-overhaul-plan.md](docs/ui-overhaul-plan.md).
- Art direction: clean, Claude-like. Neutral greys, white surfaces, dark grey rather than black (`--ink` `#38383E`; `--accent` `#4A4A51` for sliders and primary buttons). **`--signal` (`#FF5A1F`, white text on it) is reserved** for the final export action, adding a keyframe and the keyboard focus ring (`--focus`, a darker `#D9480F` so it reaches 3:1 on `--bg`); don't use it anywhere else. The export and add-keyframe buttons fill with `--signal-ramp` (the layer ramp's hues at lower chroma and lightness, so white text stays ≥ 4.5:1 at every stop; keep it so if you change the stops) instead of flat `--signal`, raised with `--shadow-raised` (`-hi` on hover); keep both to those two buttons. `--shadow-float` only on floating containers and menus.
- Sentence case everywhere: no `text-transform: uppercase`, no letter-spacing. Hierarchy comes from weight and ink (`--ink` / `--ink-2` / `--muted`), not caps.
- Every `font-weight` must be paired with `font-variation-settings: 'wght' N`: `:root` sets the variation, which overrides a plain `font-weight` on GSCode.
- Smallest text size is **11px** (`--fs-xs`), in CSS and on canvas. Don't go below. Canvas text that can cross the layer strokes goes through `haloText` (`draw3D.ts`).
- Contrast (WCAG 2.2 AA): text ≥ 4.5:1 on the surface it sits on (`--muted` `#63636B` is the lightest text token; `--faint` is for rules and decoration only), and whatever identifies a control (field border, slider track, switch off, active tab indicator) ≥ 3:1, which is `--control-edge` (`#8A8A93`). `--border` / `--border-strong` are for hairlines that only separate. Section titles are `--ink`, labels `--ink-2`, units `--muted`; a rule (`.section + .section`) separates sections. Don't convey a state by fading an active control (use a dashed edge, `--muted` or a rotated chevron, as `.path-expand` does) or by colour alone (pair it with an icon).
- Sliders apply a dynamic `linear-gradient` fill inline (see `LissajousParams.Slider`). Keep this pattern when adding new sliders. Wave sliders also take a `def` (default value): a notch marks it, a pointer drag snaps to it within 1.5 % of the range (keyboard steps don't), and a bubble shows the value while dragging.
- On/off options in `.param-check` rows are native checkboxes styled as switches (`appearance: none`).

- Buttons: `.btn-small` (secondary), `.btn-primary` (ink), `.btn-primary.btn-signal` (the export action), `.btn-reset` (ghost), `.btn-link` (an underlined word inside a note, e.g. *abrir Máquina* in Escala). Segmented controls (`.workspace-switch`, `.view-presets`, `.seg` for two-option choices on a param row in Máquina, `aria-pressed` buttons) share one look: a `--surface-3` track with the picked segment raised.
- Both side panels hide from `.panel-handle`, a tab on the panel's inner edge at mid-height (rendered beside the `<aside>` in `App.tsx`; `--right` mirrors it), so their headers hold no hide button. The keyframe editor above the timeline hides from the same tab lying on the dock's top edge (`--dock`, `editorHidden` in `Preview2D`; the timeline stays). It floats as its own container above the timeline row, as wide as its groups and centred (the `.dock` wrapper is transparent and lets clicks through, `pointer-events`), in this order: centre fields and plan pad, position and twist, scale X / Y, transition. Its fields are a fixed 72 px; the keyframe's layer is not repeated there, since the timeline readout under it shows the same. The wave panel's *Restablecer* sits on the title row beside *Onda*, which is why the figure is 96 px. Forma's *Restablecer* sits in Forma's top bar after undo/redo.
- Status notes under a field use `.state-line` with an icon (`.state-ok` tints it `--ok`), not a leading `→`, which reads as an action.
- The top bar compacts itself while the summary doesn't fit between the side panels (`compact` in `Preview2D`, measured in a layout effect, up to `BAR_COMPACT_MAX`): summary on two lines, *Iso* for *Isométrica*, *Descargar* and *G-code* as icons (with `aria-label`), tighter gaps. It starts over when the bar's width or its content changes. Checked at 1280–1920 px with both panels open, with and without the machine mark.
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

The lockfile being gitignored is intentional (it broke cross-platform rollup native binaries in CI) — accept it; don't try to commit it. To keep deploys repeatable anyway, `package.json` pins exact versions of the direct dependencies, and `.npmrc` has `save-exact=true` so `npm install <pkg>` keeps them exact; upgrade on purpose by editing the version and running `npm test` and `npm run build`. Transitive dependencies still float.

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
- [docs/marco-teorico.md](docs/marco-teorico.md) — theoretical framework (Spanish): ornament theory, frieze symmetry, growth and form, ornament machines, material and line, programmed accident; references and the explorations they suggest.
- [pendientes.md](pendientes.md) — **actionable backlog**, prioritized in waves. Read before starting any new ticket; cross-check its checkmarks with "Current state" above.
- [docs/history.md](docs/history.md) — development record: what was built, why, and what was measured on the way. The full text behind "Current state".
- [docs/performance-log.md](docs/performance-log.md) — every round of performance measurements and what each fixed. The full text behind "Performance".
- [docs/performance-optimization-spec.md](docs/performance-optimization-spec.md) — execution spec for preview caching, LOD, G-code debounce, and worker offload (Ola 8).
- [docs/ui-overhaul-plan.md](docs/ui-overhaul-plan.md) — graphical overhaul: diagnosis of the current UI, layout proposal, open decisions (D-1…D-6) and phased plan. Check it before any UI/CSS work.
- [docs/shaper-plan.md](docs/shaper-plan.md) — plan and record of *Forma*, the in-app shape generator and path editor that hands SVGs to the print workspace: references, module boundary, decisions (D-S1…D-S7, only D-S4 open), phases F0–F6 (all done, with what was measured) and possible next steps.
- [docs/maquina-plan.md](docs/maquina-plan.md) — plan and record of the third workspace, *Máquina* (G0–G4 built; G-1 measurement and G5 test prints open): bed and origin, pre-export checks, printer profiles (clay, Creality K1, Ender-3 V3), start/end templates and a filament (FDM) mode; decisions D-G1…D-G8 and phases G-1…G5. Low-fidelity mockups of three layouts in `docs/mockups/maquina/` (static HTML; `node shoot.cjs` re-renders the PNGs), plus `prototipo.html`, a working single-file prototype with 19 printer profiles, live checks and real G-code for a test part.
- [docs/altura-plan.md](docs/altura-plan.md) — proposal, not implemented and not committed to: a plan shape that changes with height (profile curve, Forma families keyed by height, interpolated key contours from several SVGs, distance fields), what the pipeline assumes today (same samples per layer for the Z floor, whole wave cycles per loop, layer reuse), decisions D-A1…D-A6 and phases A0…C1. A0 (an overhang warning per layer) and the pure-JS SVG flattener stand on their own.
- [docs/muestras-plan.md](docs/muestras-plan.md) — proposal, not committed to: the loop from printed samples back to the program (sample folders with a ficha and photos, a version stamp in the project and G-code, a headless analysis script over `.barrocode.json` files, reading sessions, test parts P1–P6); decisions D-M1…D-M5 and phases M0…M4.
- `docs/ui-interactive-mockup.html`, `docs/ui-image-prompt.md` — UI design references, not shipped.
- `docs/img/` — README and guide images: `barrocode.webp` (app screenshot, sample 4, 1440×860 at 2×), `onda.svg` (the N/T wave on a path) and `costura.svg` (seam ramp seen from the side). The SVGs are plain hand-editable files; keep their colours on the app's tokens (`--n-axis`, `--t-axis`, `--ink`) and their white background so they read on GitHub's dark theme.
- [LICENSE](LICENSE) — MIT, © 2026 Cristián Mella.

---

## Commit and review hygiene

- Conventional-commit prefixes are welcome but not enforced. The existing log mixes `feat:`, `fix:`, `chore:`, `ci:`, and plain prose.
- Keep commits scoped to one logical change. If a change spans entangled files (rename + bug fix in the same function, etc.), split it manually — don't lump everything into a "misc" commit.
- Run `npm test` and `npm run build` before committing.
- The GitHub repo is [Cranmellar/barrocode](https://github.com/Cranmellar/barrocode) (formerly `curvabarro`; old clones and links may still use that name).
