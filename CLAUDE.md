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

There is **no** test runner, no linter config, no formatter config wired into npm scripts. Don't add one without being asked. `npm run build` is the only automated check — run it before every commit.

---

## Deployment

GitHub Pages, one workflow only: [.github/workflows/deploy.yml](.github/workflows/deploy.yml). On push to `main`: `npm install`, `npm run build`, upload `dist/` artifact, deploy.

`vite.config.ts` uses `base: './'` so the build also works opened directly from `file://` or a USB sub-path.

There is **no** desktop / Electron / portable distribution. It was removed; don't re-introduce it without explicit request.

---

## Current state (verified 2026-10-24 against `main` @ `cc56729`)

- `npm run build` passes cleanly (≈69 kB app JS + 141 kB vendor, gzip ≈68 kB total).
- Core pipeline is complete and working: SVG → sampling → Lissajous N/T/Z wave → layers → G-code, with keyframes, center/scale pivot, z-hop, skirt travel, soft join, dwell (`G4`) and priming.
- Ola 8 performance work is **partly done**: per-layer geometry cached with `useMemo` in `Preview2D`, LOD stride + skipped overlays while the user is dragging (`isInteracting`), keyframe sampler (`createKeyframeSampler`), G-code debounced 400 ms. See [docs/performance-optimization-spec.md](docs/performance-optimization-spec.md) for what remains (worker offload).
- **`pendientes.md` is out of sync with the code.** These tickets are ticked `[x]` but are **not implemented** — treat them as open:
  - NumInput refresh while focused during wheel (`NumInput.tsx` still guards `setRaw` with `!focusedRef.current`).
  - Shift = fine adjust on wheel (no `shiftKey` handling anywhere).
  - Coarser step for pivot fields (`CenterScaleParams.tsx` center inputs still `step={1}`).
  - "Añadir keyframe" → "OK" when a KF is selected (button label is static, `App.tsx` / `Preview2D.tsx`).
  - Pivot drag in the 3D viewport (`Preview2D` has no params `onChange`; nothing draggable for the pivot).
  - Drag-and-drop SVG: wiring in `App.tsx` looks correct; not verified in a browser.

---

## Next steps — low effort, high impact

Ordered by impact ÷ effort. Each is one small commit. Verify against the code before starting; line numbers drift.

### Correctness (G-code that reaches the printer)

1. **Soft join + multi-path layers can extrude across the print.** `generateGcode` builds the layer→layer transition toward `nextLayer.paths[0][0]`, but the next iteration reorders that layer with `reorderPaths` (nearest-neighbour), so `orderedPaths[0]` may be a different path. With `softJoin` and `pi === 0` there is no travel, so the first `G1` of the next layer is an extruding move from the wrong point. Fix: compute the ordered paths for all layers up front, and aim the transition at `ordered[li+1][0][0]`. (`lib/gcodeGenerator.ts`, layer loop.) Single-path SVGs are unaffected.
2. **Z-hop arc positions drift in multi-path layers, and preview disagrees with G-code.** `buildArcPath(allLayerMm)` concatenates every path in the layer, so the jump between paths counts as arc length *and* as a segment that can produce phantom crossings; `arcOffset` in the emit loop only sums in-path distances. `Preview2D.buildLayerGeo` does the same on the *unordered* paths, while G-code uses the reordered ones. Fix: build arc paths per ordered path (or add the jump to `arcOffset` and skip jump segments in `findCrossings`), and share one helper between generator and preview.
3. **3D preview ignores Z oscillation.** `WavePoint.zOffset` (from `lissAmpZ`) is emitted in G-code but never used in `Preview2D` (`flattenPoints` uses `layer.z + hop`). Add `zOffset` to the preview Z.
4. **"Reiniciar" in the Lissajous panel resets *all* params** (`onReset={() => setParams(DEFAULT_PARAMS)}` in `App.tsx`), wiping layers, speeds and scale. Reset only the Lissajous fields.

### UX quick wins

5. Fix the NumInput-while-focused wheel refresh and add Shift = fine step (both in `NumInput.tsx`, one handler; covers every numeric field in the app).
6. Translate parser errors in `lib/svgParser.ts` to Spanish (convention #6).
7. Default G-code filename is still `curva.de.barro.gcode` (`App.tsx`) — rename to `barrocode.gcode`.
8. Estimated print time in the preview header (pendientes Ola 4 #10): sum path + transition length ÷ `printSpeed`, travel ÷ `travelSpeed`.

### Hygiene (only when touching the area)

9. Sample navigator in `App.tsx` uses inline styles with hardcoded hex colours; move to classes using tokens. `Preview2D.tsx` and `CenterPad.tsx` also hardcode colours.
10. Unused files: `src/assets/sample1..4.svg` (samples are inlined in `App.tsx`), `public/sample.svg` (only referenced by README), `public/isotype.png`, `public/icon.png`, `public/icon.ico`, `public/favicon.ico`, `make_ico.py`. `public/logo-43n-editable.svg` is a source asset — keep unless told otherwise. Ask before deleting.
11. `.claude/settings.local.json` is committed and contains stale Windows paths from the old `svg-clay-wave` folder. It is normally a per-user file.
12. Update `pendientes.md` checkmarks to match the "Current state" list above.

### Lower priority / needs a decision

- `parseSVG` inserts the raw uploaded SVG with `container.innerHTML`. Event-handler attributes (`onload`, etc.) in a shared SVG could run. Cheap hardening: strip `<script>` and `on*` attributes from the already-parsed `doc` and insert it with `importNode`.
- `getPointAtLength` returns **element-local** arc length. For elements under a scaling `transform`, `arcLength`/`totalLength` are not in root SVG units, so wavelengths come out wrong. Fix by accumulating arc length from the transformed points.
- `viewBox.x/y` are ignored by `svgToMM`; SVGs with a non-zero viewBox origin print offset.
- Skirt travel lifts a hardcoded `z + 2` mm (`buildSkirtTravel`), independent of `safeZ`.
- New keyframes don't capture `ampZ/wlZ/phaseZ`; they fall back to the global values.

---

## Data pipeline

```
SVG string
  └─ parseSVG()            [lib/svgParser.ts]
       • DOMParser (with HTML-entity sanitising) to validate + read viewBox
       • inserts raw SVG into a hidden off-screen div, forced to 1000×1000 px
       • queries path / polyline / polygon / line / circle / ellipse / rect
       • arc-length sampling via getTotalLength + getPointAtLength
       • central finite-difference tangent; normal = (-ty, tx)
       • getScreenCTM() of element and root to map into root user units
     → ParsedSVG { paths: SampledPath[], viewBox, raw }

SampledPath[] + PrintParams + WaveKeyframe[]
  └─ generateWaveLayers()  [lib/waveGenerator.ts]
       • filters enabled paths
       • per layer: phaseBase = lissPhaseOffset + li * phaseShiftPerLayer
       • keyframes: createKeyframeSampler() — cursor-based, t must be monotonic
       • lissajousPoint(): offsetN = ampN*sin(2π·s/wlN + δ + phase)
                           offsetT = ampT*sin(2π·s/wlT + phase)
                           zOffset = ampZ*sin(2π·s/wlZ + phaseZ + phase)   (mm)
       • applyScaleSVG: scale around pivot (mm → SVG units) per point
       • reversePath XOR alternateDirection(odd layer) → reverse; s' = L − s
       • closePath: append first point if not closed
     → WaveLayer[] { index, z (mm), paths: WavePoint[][] (SVG units + zOffset mm) }

WaveLayer[] + PrintParams + SVGViewBox
  └─ generateGcode()       [lib/gcodeGenerator.ts]
       • header with every param, G21/G90/G92 E0, safe Z
       • optional priming line at (originX−5, originY−5)
       • svgToMM() at emit time (NOT before)
       • reorderPaths(): nearest-neighbour O(n²) per layer
       • computeCentroid + skirtArcPoints for inter-path travel
       • buildArcPath + findCrossings (spatial grid) + hopAtArc for z-hop
       • first move: travel, descend, optional G4 dwell
       • buildTransition for softJoin: smoothstep XY + linear Z, no retract
       • E accumulates: E += dist * extrusionMultiplier
       • end: lift safeZ+10, M84
     → string
```

Regeneration in `App.tsx` is split into two effects: wave layers re-run immediately on `[parsedSVG, params, keyframes]`; G-code is debounced 400 ms (via `gcodeTimerRef`). Re-sampling (re-parsing the raw SVG) only happens when `params.sampleSpacing` changes.

---

## Layout and file map

Screen layout (all panels resizable via `useResize` in `App.tsx`):

```
┌ left sidebar ─────┬ center ─────────────────────────┬ right sidebar ──────┐
│ logo, upload,     │ Preview2D (tabs: preview/gcode) │ LissajousPreview    │
│ sample navigator, │  + timeline + KF diamonds       │ ─── drag ───        │
│ PathList,         │ ─── drag ───                    │ LissajousParams     │
│ PathParams,       │ Keyframes panel (in App.tsx):   │  (sliders, presets, │
│ CenterScaleParams │  tags + KF editor + CenterPad   │   reset)            │
└───────────────────┴─────────────────────────────────┴─────────────────────┘
```

```
src/
  main.tsx                  React root, StrictMode
  App.tsx                   Master state, layout, inline samples, KF panel/editor (≈550 lines)
  index.css                 All styles (≈1140 lines, design tokens in :root)
  types/index.ts            All shared types
  components/
    Preview2D.tsx           3D ortho canvas, timeline, KF diamonds, G-code tab (≈1000 lines, LARGEST)
    LissajousParams.tsx     Right panel: wave N/T/Z sliders, phase, presets, extrusion
    LissajousPreview.tsx    Right panel top: animated Lissajous in the extruder frame
    PathParams.tsx          Left panel: sampling, layers, join, scale, speeds, path, clay
    PathList.tsx            Per-path enable + overrides (disabled when keyframes exist)
    CenterScaleParams.tsx   Left panel: pivot, scale X/Y, z-hop height/radius
    CenterPad.tsx           56×56 canvas pivot picker inside the KF editor
    GcodeOutput.tsx         G-code textarea + copy + download
    NumInput.tsx            Controlled number input with wheel-to-change
  lib/
    svgParser.ts            DOM-based SVG sampling
    waveGenerator.ts        Lissajous math, keyframe interp/sampler, scale, svgToMM
    gcodeGenerator.ts       G-code assembly (≈390 lines)
    hopUtils.ts             Z-hop crossing detection (spatial grid) + parabolic lift
    skirtUtils.ts           Concentric arc travel math
docs/                       usage, architecture, fabrication notes, research notes,
                            perf spec, UI mockup/prompt (design references)
pendientes.md               Prioritised backlog (checkmarks stale — see "Current state")
```

---

## State and types

`PrintParams` is a single **flat** object with ≈50 fields covering sampling, Lissajous wave (N/T/Z), layers, soft-join, SVG→mm transform, shape transform, z-hop, travel, speeds, extrusion, path options, and clay-specific behaviour. Defaults are `DEFAULT_PARAMS` in `App.tsx`. **Do not nest it, do not split it into multiple stores.**

Keyframes (`WaveKeyframe[]`) override Lissajous and pivot/scale fields at given `t ∈ [0,1]` (fraction of all flattened points across all layers). Optional KF fields fall back to `PrintParams`. Between keyframes, values are linearly interpolated (`wlN/wlT/wlZ` floor-clamped at 0.1). When `keyframes.length > 0`, the per-path overrides (`ampNOverride` etc. on `SampledPath`) are **ignored by `waveGenerator`** — the UI disables them in this case (`PathList.tsx`).

`App.tsx` state:
- `params: PrintParams` — the print config
- `parsedSVG: ParsedSVG | null` — sampled SVG
- `layers: WaveLayer[]` — output of `generateWaveLayers`
- `gcode: string` — output of `generateGcode`
- `error: string | null` — SVG parse error shown in the UI
- `keyframes: WaveKeyframe[]`
- `timelineProgress: number ∈ [0,1]` — scrubber on `Preview2D`
- `gcodeFilename: string` — derived from uploaded SVG filename
- `centerTab: 'preview' | 'gcode'` — active tab in the center panel
- `sampleIndex: number` — which inline sample SVG the navigator shows
- `selectedKfId: string | null` — currently selected keyframe
- `lastRawRef: { raw, spacing } | null` — kept for re-parse on spacing change
- `gcodeTimerRef` — debounce handle for G-code regeneration (400 ms)

---

## Coordinate / unit conventions

- `WaveLayer.paths` stores XY in **SVG user units**; `WavePoint.zOffset` is already in **mm**.
- `svgToMM()` (in `waveGenerator.ts`) converts XY to **mm** only at G-code emit / preview time.
- `lissAmpN/T` and `lissWlN/T/Z` are in **mm** and divided by `scaleFactor` inside the wave math; `lissAmpZ` is not (Z is always mm).
- Transform order: `scaleFactor` (SVG→mm) is separate from `scaleX/Y` (shape scale around pivot). `applyScaleSVG` handles `scaleX/Y` in SVG space, using the mm pivot converted back to SVG units.
- `flipY`: most printers want Y growing upward; SVG Y grows downward.

---

## Conventions to follow

1. **All print params live in one flat `PrintParams`.** No nested objects. No context, no zustand, no redux.
2. **Panels receive `params` + `onChange`.** Update with the spread pattern: `onChange({ ...params, [k]: v })`.
3. **Component-local helpers.** `Num`, `Slider`, `Check`, `Sec` are defined inside each panel file. Don't extract them into a shared module.
4. **Canvas rendering** lives inside `useEffect` with the full dependency array. Expensive *geometry* may be memoized (as `layerGeo`/`flatPoints` in `Preview2D`); the drawing itself is not.
5. **Stable-refs pattern for window-level handlers.** Refs are updated in a separate `useEffect([dep])`, then read inside a `useEffect([])` that attaches `window` listeners once. See `Preview2D.tsx` keyframe drag code for the canonical example.
6. **Spanish UI throughout.** Labels, tooltips, section titles, error messages — all Spanish. Code, identifiers, and comments — English. (Existing files mix in some Spanish comments; keep new comments English.)
7. **No undo/redo.** State changes are permanent until the user changes them again.
8. **Default to writing no comments.** Only add a comment when the WHY is non-obvious. Never explain WHAT well-named code already says, and never reference the current task / fix / caller.
9. **Don't add error handling for impossible scenarios.** Trust internal code. Only validate at boundaries (user input, SVG parsing).
10. **No backwards-compat shims.** This project has no public API; just change the code.

---

## Architectural sharp edges

Fix them when you touch the area, but don't go on cleanup sweeps without being asked.

- **`Preview2D.tsx` is ≈1000 lines.** The canvas draw code is the obvious extraction (→ `lib/draw3D.ts`). Do it when adding a feature that would otherwise inflate the file further.
- **Z-hop geometry is computed twice** (`gcodeGenerator` and `Preview2D.buildLayerGeo`) with different path orders — see Next steps #2. `hopUtils.ts` claims they always agree; for multi-path layers they don't.
- **`ParsedSVG.raw` duplicates `lastRawRef.current.raw`.** Either could be removed.
- **`resampleSVG` in `lib/svgParser.ts`** is exported but never imported.
- **Z-hop crossing detection** uses a spatial grid; it only `console.warn`s above 3000 points (`WARN_PTS`), never skips.
- **`CenterPad`'s drag has no window-level handler** — drag stops at the 56×56 canvas boundary (`onMouseLeave`).
- **`skirtThreshold` lives under "Velocidades"** in `PathParams.tsx` but conceptually belongs with travel options.

---

## When working on G-code generation

This is the most subtle area. Before changing `lib/gcodeGenerator.ts`:

- Generate a sample with a 2- or 3-path SVG and read the output. The header comment block lists every parameter — use it to sanity-check. Multi-path + `softJoin` + `zHopHeight > 0` is where the known bugs live.
- Inter-path travel logic depends on three conditions: `isFirstMove`, `params.softJoin`, and `pi > 0`. Layer→layer transitions only happen after the **last** path of a layer when `softJoin` is true.
- Coordinate conversion via `svgToMM()` happens at emit time. Never pre-convert `WaveLayer.paths` to mm.
- E accumulates monotonically (`E += dist * extrusionMultiplier`). If you add new motion, account for E unless `params.generateE` is false.
- Clay printers don't retract. Don't introduce retraction moves.

---

## When working on the canvas previews

- `Preview2D` uses orthographic projection: `project(x, y, z, azimuth, elevation)`. Screen coords are `[offsetX + px*scale, offsetY + py*scale]`.
- While the user drags (`isInteracting`), draw uses a LOD stride of 4 and skips z-hop, skirt and join overlays. Keep new expensive overlays behind `!isInteracting`.
- Layer colors are an HSL gradient from cobalt to terracotta: `hsl(218→20, 72%→88%, 50%→62%)` (`layerColor`). KF tags in `App.tsx` reuse the same formula.
- `LissajousPreview` cancels its `requestAnimationFrame` when both `ampN` and `ampT` are ≈0. Don't remove this — it's a battery and CPU optimization.
- Auto-fit triggers in `LissajousPreview` key off specific param changes (`lissAmpN`, `lissAmpT`). Pan/zoom are user-only.

---

## CSS

- Design tokens in `:root` at the top of `src/index.css`. Use them; don't hardcode colours.
- Smallest text size is **9px**. Don't go below.
- Art direction: Swiss, restrained — **neutral white with a slight indigo tint** (`--bg #EDEDF2`), indigo-black ink (`--ink #1A1640`, `--muted #6A6590`), single accent `--accent #4F46E5`, borders only, no shadows, minimal radius. Axis colours `--n-axis` / `--t-axis` are semantic only.
- Sliders apply a dynamic `linear-gradient` fill inline (see `LissajousParams.Slider`). Keep this pattern when adding new sliders.
- `body.dragging-h` / `body.dragging-v` are added during resize drags to override the cursor globally.

---

## What's gitignored (and why it matters)

`.gitignore` excludes `node_modules/`, **`package-lock.json`**, `dist/`, `release/`, `.vite/`, env files, editor settings, OS junk, and logs.

The lockfile being gitignored is intentional (it broke cross-platform rollup native binaries in CI) — accept it; don't try to commit it.

`release/` was the Electron build output and is gitignored for legacy reasons; nothing writes to it any more.

---

## Documentation map

- [README.md](README.md) — public overview.
- [CLAUDE.md](CLAUDE.md) — this file.
- [docs/usage.md](docs/usage.md) — user-facing flow and parameter reference.
- [docs/architecture.md](docs/architecture.md) — pipeline detail.
- [docs/fabrication-notes.md](docs/fabrication-notes.md) — clay-printer criteria informing the design.
- [docs/research-notes.md](docs/research-notes.md) — **open research notes**, unprioritised ideas. Read before suggesting any new feature.
- [pendientes.md](pendientes.md) — **actionable backlog**, prioritised in waves. Checkmarks are stale; cross-check with "Current state" above.
- [docs/performance-optimization-spec.md](docs/performance-optimization-spec.md) — execution spec for preview caching, LOD, G-code debounce, and worker offload (Ola 8).
- `docs/ui-interactive-mockup.html`, `docs/ui-image-prompt.md` — UI design references, not shipped.

---

## Commit and review hygiene

- Conventional-commit prefixes are welcome but not enforced.
- Keep commits scoped to one logical change.
- Run `npm run build` before committing.
- The GitHub repo is [Cranmellar/barrocode](https://github.com/Cranmellar/barrocode) (formerly `curvabarro`; the local clone and old links may still use that name).
