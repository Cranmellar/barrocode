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
- Custom variable-weight font `GSCode` loaded from `public/fonts/`.

| Command | Purpose |
|---|---|
| `npm install` | Install deps |
| `npm run dev` | Vite dev server (typically `http://localhost:5173`) |
| `npm run build` | `tsc` type-check then `vite build` → `dist/` |
| `npm run preview` | Local static preview of `dist/` |
| `npm test` | Vitest, run once (`npm test -- -u` updates reference G-code) |

Tests cover `lib/` only (no DOM, so `svgParser` is untested) and live in `src/lib/__tests__/`. There is no linter or formatter config wired into npm scripts. Don't add one without being asked. CI only runs `npm test` and `npm run build` on `main`, so a pull request gets no automated check.

---

## Deployment

GitHub Pages, one workflow only: [.github/workflows/deploy.yml](.github/workflows/deploy.yml). On push to `main`: `npm install`, `npm test`, `npm run build`, upload `dist/` artifact, deploy. A failing test blocks the deploy; pull requests are not built.

`vite.config.ts` uses `base: './'` so the build also works opened directly from `file://` or a USB sub-path.

There is **no** desktop / Electron / portable distribution. It was removed; don't re-introduce it without explicit request.

---

## Current state (verified 2026-10-26 on branch `claude/youthful-edison-ug2j0c`, on top of `main` @ `29ad9a1`)

- `npm test` (116 tests) and `npm run build` pass (≈87 kB app JS + 141 kB vendor; gzip ≈75 kB).
- Core pipeline is complete: SVG → sampling → Lissajous N/T/Z wave → layers → shared mm toolpath → G-code, with keyframes, centre/scale pivot, z-hop, skirt travel, soft join, dwell (`G4`) and priming. Preview and G-code draw from the same `buildToolpath` output, and the tests check they agree.
- UI waves UI-1 … UI-5 from `pendientes.md` are done: unified keyframe editing, left panel grouped as Pieza / Trayecto / Máquina, viewer summary (time, size) with view presets and layer range, number fields on every Lissajous slider, keyboard shortcuts and session autosave.
- Performance (Ola 8) is partly done: layers and toolpath memoized in `App.tsx` on the fields each stage reads, LOD stride and skipped overlays while the camera moves (`isInteracting`), cursor-based keyframe sampler, G-code debounced 400 ms. Worker offload remains; see [docs/performance-optimization-spec.md](docs/performance-optimization-spec.md). The measured hot spots, in priority order, are in "Performance — user-side findings" below; that section supersedes the spec where they disagree.
- Drag-and-drop of an SVG onto the upload area works (verified in a browser).
- **Machine-safety pass (Oct 2026)** — the G-code can no longer drive the nozzle into the bed or the part:
  - `M82` (absolute E) in the preamble when `generateE` is on.
  - Final lift goes to `max(safeZ, highest printed Z) + 10`; it used to be an absolute `safeZ + 10`, which plunged through parts taller than 30 mm.
  - Skirt travel lifts 2 mm above the highest Z printed so far (z-hop bumps, Z wave) and descends to the next path's real start Z (NP-0b).
  - Z floor in `generateWaveLayers`: layer 0 never dips below its set height; every later point stays ≥ `layerHeight · MIN_LAYER_GAP` (0.5) above the same sample on the layer below. Only acts downward.
  - Priming runs along +X 10 mm beside the first layer's bounding box (below it, or above when below would turn Y negative), not at `origin − 5`.
- **SVG placement and size** — sampled points are shifted so the viewBox's top-left corner is (0, 0) (a centred `viewBox="-100 -100 200 200"` used to print 100 mm off). A physical root `width`/`height` (`mm`, `cm`, `in`, `pt`, `pc`, `Q`) sets `ParsedSVG.mmPerUnit`; loading such a file adopts it as `scaleFactor`, and `PathParams` offers *Usar tamaño real* when they differ. Unitless/px SVGs keep 1 unit = 1 mm. Verified in Chromium; `svgParser` still has no automated test.
- **Some `pendientes.md` tickets are ticked `[x]` but not implemented** — treat them as open:
  - NumInput refresh while focused during wheel (`NumInput.tsx` still guards `setRaw` with `!focusedRef.current`).
  - Shift = fine adjust on wheel (no `shiftKey` handling anywhere).
  - Coarser step for pivot fields (`CenterScaleParams.tsx` centre inputs are still `step={1}`).
  - Pivot drag in the 3D viewport (`Preview2D` has no params `onChange`; nothing draggable for the pivot).

---

## Next steps — low effort, high impact

Ordered by impact ÷ effort. Each is one small commit. Verify against the code before starting; line numbers drift. Larger planned work (non-planar toolpaths NP-0…NP-3) lives in `pendientes.md`.

### Correctness (G-code that reaches the printer)

1. **E ignores Z.** `pathToGcode` and `buildTransition` accumulate E from XY distance, and a Z-only move is dropped (`d < 1e-6`). Already wrong with `lissAmpZ > 0`. (`pendientes.md` NP-0a.)
2. **A bead can lose its support.** The Z floor only acts downward. With `phaseShiftPerLayer`, a crest over the trough of the layer below leaves a gap up to `layerHeight + 2·lissAmpZ`, so the bead prints in the air. Warn in the viewer, or cap the gap upward the same way the floor works (`waveGenerator.ts`, next to `MIN_LAYER_GAP`).
3. **"Reiniciar" in the Lissajous panel resets *all* params** (`onReset={() => setParams(DEFAULT_PARAMS)}` in `App.tsx`), wiping layers, speeds and scale, while keeping keyframes. Reset only the Lissajous fields.

### UX quick wins

4. Fix the NumInput-while-focused wheel refresh and add Shift = fine step (both in `NumInput.tsx`, one handler; covers every numeric field).
5. Coarser wheel step for the pivot fields in `CenterScaleParams.tsx` (5 or 10 mm; Shift keeps it fine once #4 lands).
6. Translate parser errors in `lib/svgParser.ts` to Spanish (convention #6); they are still English.
7. Default G-code filename is still `curva.de.barro.gcode` (`App.tsx`) — rename to `barrocode.gcode`.
8. Warn when the part leaves the bed; needs a bed-size parameter first (UI-3 leftover).

### Hygiene (only when touching the area)

9. `lib/draw3D.ts` and `CenterPad.tsx` still hardcode colours in canvas code; canvas can't read CSS variables directly, so read them once with `getComputedStyle` or keep a small palette constant.
10. Unused files: `src/assets/sample1..4.svg` (samples are inlined in `App.tsx`), `public/icon.png`, `public/icon.ico`, `public/favicon.ico` and `make_ico.py` (only referenced by each other), `public/isotype.png` and `public/sample.svg` (only referenced by README/docs). `public/logo-43n-editable.svg` is a source asset — keep. Ask before deleting.
11. `.claude/settings.local.json` is committed and holds stale Windows paths from the old `svg-clay-wave` folder; it is normally a per-user file. `.claude/worktrees/*` are committed leftovers of local worktrees (gitlinks) and should not be in the repo either.
12. Fix the stale `pendientes.md` checkmarks listed in "Current state".

### Lower priority / needs a decision

- `parseSVG` inserts the raw uploaded SVG with `container.innerHTML`. Event-handler attributes (`onload`, etc.) in a shared SVG could run. Cheap hardening: strip `<script>` and `on*` attributes from the already-parsed `doc` and insert it with `importNode`.
- `getPointAtLength` works in **element-local** length. For elements under a scaling `transform`, `arcLength`/`totalLength` are not in root SVG units, so wavelengths come out wrong. Fix by accumulating arc length from the transformed points.

---

## Performance — user-side findings (measured 2026-10-26 on `main` @ `29ad9a1`)

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
4. **`LissajousPreview` runs constantly.** Every animation frame it resets `canvas.width`, which reallocates the canvas, recomputes the 1000-point figure and makes 1000 separate `stroke()` calls, one per alpha step. That costs battery and fan noise, and it competes with the 3D preview. Draw the figure once per param or size change into an offscreen canvas (or ≈16 alpha-bucketed `Path2D`s), and each frame only blit it and draw the moving dot. Resize from a `ResizeObserver`. Keep the rAF cancel when the amplitudes are ≈0. *Effort: small, one file.*
5. **Per-frame waste in the 3D preview.**
   - `project()` recomputes `cos`/`sin` of azimuth and elevation for every point, ≈8 ms per frame at 68k points and the largest JS cost while scrubbing. Add a `makeProjector(az, el)` that computes the trig once per draw, and keep `project` for the tests.
   - `canvas.width/height` is assigned on every draw, which reallocates the canvas. The same happens in `LissajousPreview` and `CenterPad`. Assign them only when the size or `devicePixelRatio` changes.
   - The timeline scrub redraws every layer at full quality. Cache the layer strokes in an offscreen canvas, keyed on view, toolpath, `layerCap`, `layerSolo` and selected keyframe, and on scrub redraw only the extruder, the centre axis and the keyframe markers. *Medium.*
6. **G-code generation and stats still run on the main thread.** When the 400 ms debounce fires, `generateGcode` (≈70 ms at 60 layers, ≈350 ms on a wave with many loops) and `summarizeGcode` (50–150 ms: `split`, a regex and an object per line) block the UI mid-interaction. Now that #2 and #3 are done, move both into a worker (perf spec Phase 5), or compute the stats in the same pass that emits the G-code. *Effort: medium.*
7. **Keyframe drag and `CenterPad` drag** call `setKeyframes` on every `mousemove`, so each move runs the full pipeline, about the cost of a slider tick. Coalesce the moves with `requestAnimationFrame`; #2 and #3 removed most of the cost. `CenterPad.partBounds` also passes every point through `svgToMM` each time the layers or params change; take the bounds from the shared toolpath instead.

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
       • inserts raw SVG into a hidden 1000×1000 DOM div
       • queries path / polyline / polygon / line / circle / ellipse / rect
       • arc-length sampling via getTotalLength + getPointAtLength
       • finite-difference tangent/normal per sample
       • getScreenCTM() for transforms
       • points shifted by −viewBox.x/y so the viewBox corner is (0, 0)
     → ParsedSVG { paths: SampledPath[], viewBox, mmPerUnit, raw }

SampledPath[] + PrintParams + WaveKeyframe[]
  └─ generateWaveLayers()  [lib/waveGenerator.ts]
       • filters enabled paths
       • per layer: phaseBase = lissPhaseOffset + li * phaseShiftPerLayer
       • per point: createKeyframeSampler() lerps between keyframes
         (cursor-based, t must increase monotonically)
       • phase integrated per path: cycX += 2π·ds/wlX (no chirp when wl varies)
       • lissajousPoint(): offsetN = ampN*sin(cycN + δ + phase)
                           offsetT = ampT*sin(cycT + phase)
                           zOffset = ampZ*sin(cycZ + phaseZ + phase)   (mm)
       • Z floor: layer 0 ≥ its base Z; later points ≥ same sample on the
         layer below + layerHeight·MIN_LAYER_GAP (0.5)
       • applyScaleSVG: scale around pivot in SVG space
       • alternateDirection: reverse every other layer
       • closePath: append first point if not closed
     → WaveLayer[] { index, z (mm), paths: WavePoint[][] (SVG units + zOffset mm) }

WaveLayer[] + PrintParams + svgH
  └─ buildToolpath()       [lib/toolpath.ts]
       • svgToMM() here (NOT before)
       • nearest-neighbour path order O(n²) per layer, each layer starting
         where the previous one ended
       • buildArcPath + findCrossings (inter-path gaps excluded, reused when
         a layer's XY matches one of the two before it) + hopAtArc;
         hopSampleArcs inserts points across each hop window so the parabola
         is resolved even when hopRadius < sample spacing
       • z = layer.z + zOffset + hop per point; centroid per layer
     → ToolpathLayer[] { index, z, paths: {x,y,z}[][] (mm), centroid, crossings }

ToolpathLayer[] consumed by BOTH:
  ├─ generateGcode()       [lib/gcodeGenerator.ts]
  │    • preamble G21/G90/M82 (M82 only with E)/G92 E0; priming beside the
  │      first layer's bounding box
  │    • skirtArcPoints for inter-path travel: lift to highest printed Z + 2,
  │      descend to the path's real start Z
  │    • buildTransition for softJoin: smoothstep XY + linear Z, no retract
  │    • E accumulates: E += dist * extrusionMultiplier
  │    • final lift to max(safeZ, highest printed Z) + 10
  │  → string
  ├─ Preview2D             — so the preview always draws what gets printed
  └─ summarizeGcode()      [lib/gcodeStats.ts] reads the G-code back for the
                           viewer's time / length / E summary
```

Regeneration in `App.tsx`: `layers` and `toolpath` are `useMemo`s keyed on `parsedSVG`, `keyframes` and the fields in `WAVE_PARAMS` / `TOOLPATH_PARAMS`, so they recompute during render only when geometry can change. When a stage starts reading a new param, add it to that list; `paramDeps.test.ts` fails otherwise. G-code is an effect on `[toolpath, params]`, debounced 400 ms (via `gcodeTimerRef`) to avoid freezing the UI during slider/keyframe edits. Re-sampling (re-parsing the raw SVG) only happens when `params.sampleSpacing` changes.

---

## Layout and file map

Screen layout (all panels resizable via `useResize` in `App.tsx`):

```
┌ left sidebar ───────┬ center ──────────────────────────────┬ right sidebar ───────┐
│ logo + ?            │ Preview2D toolbar: Ajustar,          │ LissajousPreview     │
│ session banner      │  Iso/Planta/Frente, summary, tabs    │ ─── drag ───         │
│ upload, samples     │ 3D canvas + layer slider (right)     │ LissajousParams:     │
│ PathList            │ timeline: KF lane + slider           │  context header      │
│ PathParams groups:  │ ─── drag ───                         │  (global / KF / lock)│
│  Pieza (incl.       │ Keyframe strip (in App.tsx):         │  presets, N, T, Z,   │
│  CenterScaleParams),│  ‹ › nav, Añadir/OK, delete;         │  Delta, Fase         │
│  Trayecto, Máquina  │  position, scale, CenterPad          │                      │
└─────────────────────┴──────────────────────────────────────┴──────────────────────┘
```

```
src/
  main.tsx                  React root, StrictMode
  App.tsx                   Master state, layout, inline samples, keyframe strip, shortcuts, session (≈765 lines)
  index.css                 All styles (≈1570 lines, design tokens in :root)
  types/index.ts            All shared types
  components/
    Preview2D.tsx           3D preview state, interaction, toolbar, layer slider, timeline (≈450 lines)
    LissajousParams.tsx     Right panel: wave sliders + presets; edits the selected keyframe
    LissajousPreview.tsx    Right panel top: animated Lissajous in the extruder frame
    PathParams.tsx          Left panel: collapsible Pieza / Trayecto / Máquina groups
    PathList.tsx            Per-path overrides + collapse
    CenterScaleParams.tsx   Pivot + scale sections, rendered inside PathParams' Pieza group
    CenterPad.tsx           56×56 canvas pivot picker
    GcodeOutput.tsx         G-code textarea + copy + download
    HelpDialog.tsx          "?" quick-start modal (native <dialog>)
    NumInput.tsx            Controlled number input with wheel-to-change
  lib/
    __tests__/              Vitest specs, fixtures, reference .gcode snapshots
    svgParser.ts            DOM-based SVG sampling
    waveGenerator.ts        Lissajous math + keyframe interp + scale
    toolpath.ts             Final mm trajectory shared by G-code + preview
    draw3D.ts               Canvas drawing for Preview2D (projection, scene, top-down) (≈585 lines)
    gcodeGenerator.ts       G-code assembly (≈320 lines)
    gcodeStats.ts           Time / length / E summary read back from the G-code
    hopUtils.ts             Z-hop crossing detection (spatial grid) + parabolic lift
    skirtUtils.ts           Concentric arc travel math
docs/                       usage, architecture, fabrication notes, research notes,
                            perf spec, UI mockup/prompt (design references)
pendientes.md               Prioritised backlog (some checkmarks stale — see "Current state")
```

---

## State and types

`PrintParams` is a single **flat** object with ≈50 fields covering sampling, Lissajous wave (N/T/Z), layers, soft-join, SVG→mm transform, shape transform, z-hop, travel, speeds, extrusion, path options, and clay-specific behaviour. Defaults are `DEFAULT_PARAMS` in `App.tsx`. **Do not nest it, do not split it into multiple stores.**

Keyframes (`WaveKeyframe[]`) override Lissajous and pivot/scale fields at given `t ∈ [0,1]` (fraction of all flattened points across all layers). Optional keyframe fields fall back to `PrintParams`; new keyframes snapshot every field from the wave shown at that `t`. Between keyframes, all fields are linearly interpolated (`wlN/wlT/wlZ` floor-clamped at 0.1). When `keyframes.length > 0`, the per-path overrides (`ampNOverride` etc. on `SampledPath`) are **silently ignored by `waveGenerator`** — the UI disables them in this case (see `PathList.tsx`).

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
- `centerTab: 'preview' | 'gcode'` — which tab is active in the center panel
- `sampleIndex: number` — which inline sample SVG is shown in the sample navigator
- `selectedKfId: string | null` — id of the currently selected keyframe. While set, the Lissajous panel edits that keyframe and the timeline sits on it; `Esc` clears it, `Supr` deletes it
- `helpOpen: boolean` — help dialog visibility; opens automatically on first visit (`localStorage` key `barrocode.helpSeen`), via the `?` button in the banner, or the `?` key
- `savedSession: SavedSession | null` — last autosaved session (`localStorage` key `barrocode.session`, written 1 s after changes), offered for restore while no SVG is loaded

Other `localStorage` keys: `barrocode.leftGroups` (open state of the left-panel groups in `PathParams`). Every access is wrapped in try/catch; the app must work without storage.

Keyboard shortcuts live in one window `keydown` handler in `App.tsx` (stable-refs pattern): `?`, `K`, `G`, `←/→`, `Esc`, `Supr`. They are ignored while typing in text/number fields.

---

## Coordinate / unit conventions

- `WaveLayer.paths` stores XY in **SVG user units**, measured from the viewBox's top-left corner; `WavePoint.zOffset` is already in **mm**.
- `svgToMM()` (in `waveGenerator.ts`) converts XY to **mm** only in `buildToolpath`.
- `lissAmpN/T` and `lissWlN/T/Z` are in **mm** and divided by `scaleFactor` inside the wave math (so the visual amplitude tracks the real-world mm regardless of SVG unit scale); `lissAmpZ` is not (Z is always mm).
- Transform order: `scaleFactor` (SVG→mm) is separate from `scaleX/Y` (shape scale around pivot). `applyScaleSVG` handles `scaleX/Y` in SVG space before `svgToMM` converts.
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
- **`resampleSVG` in `lib/svgParser.ts`** is dead code.
- **`CenterPad`'s drag has no window-level handler** — drag stops abruptly at the canvas boundary on fast moves.
- **Z-hop crossing detection** uses a spatial grid; it only `console.warn`s above 3000 points (`WARN_PTS`), never skips.

---

## When working on G-code generation

This is the most subtle area. Before changing `lib/gcodeGenerator.ts`:

- Run `npm test`. `src/lib/__tests__/gcodeGenerator.test.ts` checks motion invariants (no long or plunging extrusion, no XY travel at or below anything already printed, G-code matches the preview toolpath) across soft join / priming / alternate-direction combinations, plus reference `.gcode` files in `__snapshots__/`. When output changes on purpose, read the snapshot diff before accepting it with `npm test -- -u`.
- Generate a sample with a 2- or 3-path SVG and read the output. The header comment block lists every parameter — use it to sanity-check. (It doesn't list the Z oscillation fields yet; see `pendientes.md` NP-0c.)
- Inter-path travel logic depends on three conditions: `isFirstMove`, `params.softJoin`, and `pi > 0` (path index within the layer). Layer→layer transitions only happen on the **last** path of a layer when `softJoin` is true.
- Coordinate conversion via `svgToMM()` happens in `buildToolpath`. Never pre-convert `WaveLayer.paths` to mm; downstream code expects SVG units there.
- Path order, Z oscillation and z-hop belong in `lib/toolpath.ts`, not in the emitter: the preview draws the same toolpath, so anything computed only in `gcodeGenerator.ts` makes the two disagree.
- E accumulates monotonically (`E += dist * extrusionMultiplier`). If you add new motion, account for E unless `params.generateE` is false.
- Clay printers don't retract. Don't introduce retraction moves.

---

## When working on the canvas previews

- `Preview2D` draws `buildToolpath` output, never `WaveLayer.paths` directly, for anything that represents printed motion.
- `Preview2D` keeps state and interaction; all canvas drawing lives in `lib/draw3D.ts` (`drawScene`, `drawTopDown`). Orthographic projection: `project(x, y, z, azimuth, elevation)`. Screen coords are `[offsetX + px*scale, offsetY + py*scale]`.
- While the user drags the camera (`isInteracting`), drawing uses a LOD stride of 4 and skips the keyframe, skirt and join overlays. Keep new expensive overlays behind `!isInteracting`.
- Layer visibility comes from the layer slider: `drawScene` gets `layerCap` (top visible layer index) and `layerSolo`. New overlays tied to a layer should respect it.
- Layer colors are an HSL gradient from cobalt to terracotta: `hsl(218→20, 72%→88%, 50%→62%)` (`layerColor`). Keyframes are numbered diamonds coloured by `keyframeColor(t)` (the layer hue at their position, fixed 62 % lightness so the dark number reads on every hue). Number and colour are the same on the timeline lane, the canvas, the keyframe strip and the Lissajous header; the selected one gets a dark outline. The canvas extruder is a dark square, like the slider thumb, so it never reads as a keyframe.
- `LissajousPreview` cancels its `requestAnimationFrame` when both `ampN` and `ampT` are ≈0. Don't remove this — it's a battery and CPU optimization.
- Auto-fit triggers in `LissajousPreview` are explicit and key off specific param changes (currently `lissAmpN`, `lissAmpT`). Pan/zoom are user-only.

---

## CSS

- Design tokens in `:root` at the top of `src/index.css`. Use them; don't hardcode colours.
- Smallest text size is **9px**. Don't go below.
- `--muted` is `#6A6A6A`. `--accent` is `#4A4E8C` (desaturated indigo). The art direction is Swiss neutral — restrained, untinted grey surfaces, single accent.
- Sliders apply a dynamic `linear-gradient` fill inline (see `LissajousParams.Slider`). Keep this pattern when adding new sliders.
- `body.dragging-h` / `body.dragging-v` are added during resize drags to override the cursor globally.

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
- `docs/ui-interactive-mockup.html`, `docs/ui-image-prompt.md` — UI design references, not shipped.

---

## Commit and review hygiene

- Conventional-commit prefixes are welcome but not enforced. The existing log mixes `feat:`, `fix:`, `chore:`, `ci:`, and plain prose.
- Keep commits scoped to one logical change. If a change spans entangled files (rename + bug fix in the same function, etc.), split it manually — don't lump everything into a "misc" commit.
- Run `npm test` and `npm run build` before committing.
- The GitHub repo is [Cranmellar/barrocode](https://github.com/Cranmellar/barrocode) (formerly `curvabarro`; old clones and links may still use that name).
