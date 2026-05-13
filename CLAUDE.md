# CLAUDE.md

Operating manual for Claude Code sessions in this repo. Read this in full before making changes.

---

## What this project is

**BarroCode** — a web app that turns SVG curves into G-code for clay 3D printers. The SVG paths are sampled, modulated by a Lissajous wave (normal + tangent oscillation along arc length), stacked into layers, and emitted as G-code with clay-specific behaviour (no retract, soft layer joins, optional dwell/priming, concentric skirt travel, parabolic z-hop at self-intersections).

The whole app runs in the browser. There is no backend, no native shell.

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

There is **no** test runner, no linter config, no formatter config wired into npm scripts. Don't add one without being asked.

---

## Deployment

GitHub Pages, one workflow only: [.github/workflows/deploy.yml](.github/workflows/deploy.yml). On push to `main`: `npm install`, `npm run build`, upload `dist/` artifact, deploy.

`vite.config.ts` uses `base: './'` so the build also works opened directly from `file://` or a USB sub-path.

There is **no** desktop / Electron / portable distribution. It was removed; don't re-introduce it without explicit request.

---

## Data pipeline

```
SVG string
  └─ parseSVG()            [lib/svgParser.ts]
       • inserts raw SVG into a hidden 1000×1000 DOM div
       • queries path / polyline / polygon / line / circle / ellipse / rect
       • arc-length sampling via getTotalLength + getPointAtLength
       • finite-difference tangent/normal per sample
       • getScreenCTM() for transforms
     → ParsedSVG { paths: SampledPath[], viewBox, raw }

SampledPath[] + PrintParams + WaveKeyframe[]
  └─ generateWaveLayers()  [lib/waveGenerator.ts]
       • filters enabled paths
       • per layer: phaseBase = lissPhaseOffset + li * phaseShiftPerLayer
       • per point: getParamsAtT() lerps between keyframes
       • lissajousPoint(): offsetN = ampN*sin(2π·s/wlN + δ + phase)
                           offsetT = ampT*sin(2π·s/wlT + phase)
                           offsetZ = ampZ*sin(2π·s/wlZ + phaseZ + phase)
       • applyScaleSVG: scale around pivot in SVG space
       • alternateDirection: reverse every other layer
       • closePath: append first point if not closed
     → WaveLayer[] { index, z (mm), paths: WavePoint[][] (SVG units) }

WaveLayer[] + PrintParams + SVGViewBox
  └─ generateGcode()       [lib/gcodeGenerator.ts]
       • svgToMM() at emit time (NOT before)
       • reorderPaths(): nearest-neighbour O(n²) per layer
       • computeCentroid + skirtArcPoints for inter-path travel
       • buildArcPath + findCrossings + hopAtArc for z-hop
       • buildTransition for softJoin: smoothstep XY + linear Z, no retract
       • E accumulates: E += dist * extrusionMultiplier
     → string
```

Regeneration in `App.tsx` is split into two effects: wave layers re-run immediately on `[parsedSVG, params, keyframes]`; G-code is debounced 400 ms (via `gcodeTimerRef`) to avoid freezing the UI during slider/keyframe edits. Re-sampling (re-parsing the raw SVG) only happens when `params.sampleSpacing` changes.

---

## File map

```
src/
  main.tsx                  React root, StrictMode
  App.tsx                   Master state + layout (≈507 lines)
  index.css                 All styles (≈1086 lines, design tokens in :root)
  types/index.ts            All shared types
  components/
    Preview2D.tsx           3D ortho canvas + timeline + kf editor (≈892 lines, LARGEST)
    LissajousParams.tsx     Right panel: wave sliders + presets
    LissajousPreview.tsx    Bottom center: animated Lissajous canvas
    PathParams.tsx          Left panel: layers, speeds, options
    PathList.tsx            Per-path overrides + collapse
    CenterScaleParams.tsx   Bottom left: pivot + scale + z-hop
    CenterPad.tsx           56×56 canvas pivot picker
    GcodeOutput.tsx         G-code textarea + copy + download
    NumInput.tsx            Controlled number input with wheel-to-change
  lib/
    svgParser.ts            DOM-based SVG sampling
    waveGenerator.ts        Lissajous math + keyframe interp + scale
    gcodeGenerator.ts       G-code assembly (≈327 lines)
    hopUtils.ts             Z-hop crossing detection
    skirtUtils.ts           Concentric arc travel math
```

---

## State and types

`PrintParams` is a single **flat** object with ≈50 fields covering sampling, Lissajous wave, layers, soft-join, SVG→mm transform, shape transform, z-hop, travel, speeds, extrusion, path options, and clay-specific behaviour. **Do not nest it, do not split it into multiple stores.**

Keyframes (`WaveKeyframe[]`) override Lissajous fields at given `t ∈ [0,1]`. Between keyframes, all fields are linearly interpolated (`wlN/wlT` floor-clamped at 0.1). When `keyframes.length > 0`, the per-path overrides (`ampNOverride` etc. on `SampledPath`) are **silently ignored by `waveGenerator`** — the UI disables them in this case (see `PathList.tsx`).

`App.tsx` state:
- `params: PrintParams` — the print config
- `parsedSVG: ParsedSVG | null` — sampled SVG
- `layers: WaveLayer[]` — output of `generateWaveLayers`
- `gcode: string` — output of `generateGcode`
- `keyframes: WaveKeyframe[]`
- `timelineProgress: number ∈ [0,1]` — scrubber on `Preview2D`
- `gcodeFilename: string` — derived from uploaded SVG filename
- `lastRawRef: { raw, spacing } | null` — kept for re-parse on spacing change
- `gcodeTimerRef` — debounce handle for G-code regeneration (400 ms)
- `centerTab: 'preview' | 'gcode'` — which tab is active in the center panel
- `sampleIndex: number` — which inline sample SVG is shown in the sample navigator
- `selectedKfId: string | null` — id of the currently selected keyframe

---

## Coordinate / unit conventions

- `WaveLayer.paths` stores points in **SVG user units**.
- `svgToMM()` (in `waveGenerator.ts`) converts to **mm** only at G-code emit time.
- `params.lissAmpN` / `lissAmpT` are in **mm** and divided by `scaleFactor` before use inside the wave math (so the visual amplitude tracks the real-world mm regardless of SVG unit scale).
- Transform order: `scaleFactor` (SVG→mm) is separate from `scaleX/Y` (shape scale around pivot). `applyScaleSVG` handles `scaleX/Y` in SVG space before `svgToMM` converts.
- `flipY`: most printers want Y growing upward; SVG Y grows downward.

---

## Conventions to follow

1. **All print params live in one flat `PrintParams`.** No nested objects. No context, no zustand, no redux.
2. **Panels receive `params` + `onChange`.** Update with the spread pattern: `onChange({ ...params, [k]: v })`.
3. **Component-local helpers.** `Num`, `Slider`, `Check`, `Sec` are defined inside each panel file. Don't extract them into a shared module.
4. **Canvas rendering** lives inside `useEffect` with the full dependency array — the canvas redraws on every relevant change. Don't memoize drawing.
5. **Stable-refs pattern for window-level handlers.** Refs are updated in a separate `useEffect([dep])`, then read inside a `useEffect([])` that attaches `window` listeners once. See `Preview2D.tsx` keyframe drag code for the canonical example.
6. **Spanish UI throughout.** Labels, tooltips, section titles, error messages — all Spanish. Code, identifiers, and comments — English. (Existing files mix in some Spanish comments; keep new comments English.)
7. **No undo/redo.** State changes are permanent until the user changes them again.
8. **Default to writing no comments.** Only add a comment when the WHY is non-obvious (a hidden constraint, a workaround, a subtle invariant). Never explain WHAT well-named code already says, and never reference the current task / fix / caller.
9. **Don't add error handling for impossible scenarios.** Trust internal code. Only validate at boundaries (user input, SVG parsing).
10. **No backwards-compat shims.** This project has no public API; just change the code.

---

## Architectural sharp edges and known issues

These are documented hazards. Fix them when you touch the area, but don't go on cleanup sweeps without being asked.

- **`Preview2D.tsx` is ≈892 lines** and overdue for a split. The canvas draw code is the obvious extraction (→ `lib/draw3D.ts`). Don't refactor it preemptively; do it when adding a feature that would otherwise inflate the file further.
- **`ParsedSVG.raw` duplicates `App.tsx`'s `lastRawRef.current.raw`.** Either could be removed.
- **`resampleSVG` in `lib/svgParser.ts`** is dead code.
- **Z-hop is silently skipped for layer arc paths > 600 points** (`hopUtils.ts` MAX_PTS). No user-facing warning.
- **`CenterPad`'s drag has no window-level handler** — drag stops abruptly at the 56×56 canvas boundary on fast moves.
- **`skirtThreshold` lives under the "Velocidades" UI section** in `PathParams.tsx` but conceptually belongs with travel options.

---

## When working on G-code generation

This is the most subtle area. Before changing `lib/gcodeGenerator.ts`:

- Generate a sample with a 2- or 3-path SVG and read the output. The header comment block lists every parameter — use it to sanity-check.
- Inter-path travel logic depends on three conditions: `isFirstMove`, `params.softJoin`, and `pi > 0` (path index within the layer). Layer→layer transitions only happen on the **last** path of a layer when `softJoin` is true.
- Coordinate conversion via `svgToMM()` happens at emit time. Never pre-convert `WaveLayer.paths` to mm; downstream code expects SVG units there.
- E accumulates monotonically (`E += dist * extrusionMultiplier`). If you add new motion, account for E unless `params.generateE` is false.
- Clay printers don't retract. Don't introduce retraction moves.

---

## When working on the canvas previews

- `Preview2D` uses orthographic projection: `project(x, y, z, azimuth, elevation)`. Screen coords are `[offsetX + px*scale, offsetY + py*scale]`.
- Layer colors are an HSL gradient from cobalt to terracotta: `hsl(218→20, 72%→88%, 50%→62%)`.
- `LissajousPreview` cancels its `requestAnimationFrame` when both `ampN` and `ampT` are ≈0. Don't remove this — it's a battery and CPU optimization.
- Auto-fit triggers in `LissajousPreview` are explicit and key off specific param changes (currently `lissAmpN`, `lissAmpT`). Pan/zoom are user-only.

---

## CSS

- Design tokens in `:root` at the top of `src/index.css`. Use them; don't hardcode colours.
- Smallest text size is **9px**. Don't go below.
- `--muted` is `#6A6762`. `--accent` is `#4F46E5` (indigo). The art direction is "Swiss warm-paper" — restrained, off-white background, single accent.
- Sliders apply a dynamic `linear-gradient` fill inline (see `LissajousParams.Slider`). Keep this pattern when adding new sliders.
- `body.dragging-h` / `body.dragging-v` are added during resize drags to override the cursor globally.

---

## What's gitignored (and why it matters)

`.gitignore` excludes `node_modules/`, **`package-lock.json`**, `dist/`, `release/`, `.vite/`, env files, editor settings, OS junk, and logs.

The lockfile being gitignored is unusual — accept it; don't try to commit it.

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
- [pendientes.md](pendientes.md) — **actionable backlog**, prioritized in waves. Read before starting any new ticket.
- [docs/performance-optimization-spec.md](docs/performance-optimization-spec.md) — execution spec for preview caching, LOD, G-code debounce, and worker offload (Ola 8).

---

## Commit and review hygiene

- Conventional-commit prefixes are welcome but not enforced. The existing log mixes `feat:`, `fix:`, `chore:`, `ci:`, and plain prose.
- Keep commits scoped to one logical change. If a change spans entangled files (rename + bug fix in the same function, etc.), split it manually — don't lump everything into a "misc" commit.
- The remote is at [Cranmellar/barrocode](https://github.com/Cranmellar/barrocode) on GitHub.
