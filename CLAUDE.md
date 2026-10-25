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

## Current state (verified 2026-10-25 against `main` @ `68de593`)

- `npm test` (63 tests) and `npm run build` pass (≈85 kB app JS + 141 kB vendor; gzip ≈74 kB).
- Core pipeline is complete: SVG → sampling → Lissajous N/T/Z wave → layers → shared mm toolpath → G-code, with keyframes, centre/scale pivot, z-hop, skirt travel, soft join, dwell (`G4`) and priming. Preview and G-code draw from the same `buildToolpath` output, and the tests check they agree.
- UI waves UI-1 … UI-5 from `pendientes.md` are done: unified keyframe editing, left panel grouped as Pieza / Trayecto / Máquina, viewer summary (time, size) with view presets and layer range, number fields on every Lissajous slider, keyboard shortcuts and session autosave.
- Performance (Ola 8) is partly done: toolpath memoized in `Preview2D`, LOD stride and skipped overlays while the camera moves (`isInteracting`), cursor-based keyframe sampler, G-code debounced 400 ms. Worker offload remains; see [docs/performance-optimization-spec.md](docs/performance-optimization-spec.md).
- Drag-and-drop of an SVG onto the upload area works (verified in a browser).
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
2. **Skirt travel can drag through the part.** `buildSkirtTravel` lifts a hardcoded `z + 2` mm above the layer's *base* Z and descends to it; with Z oscillation or z-hop the printed bead can be higher. Lift to the layer's real max Z plus a margin and descend to `start.z`. (NP-0b.)
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
- `viewBox.x/y` are ignored by `svgToMM`; SVGs with a non-zero viewBox origin print offset.

---

## Data pipeline

```
SVG string
  └─ parseSVG()            [lib/svgParser.ts]
       • DOMParser to validate and read the viewBox
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
       • per point: createKeyframeSampler() lerps between keyframes
         (cursor-based, t must increase monotonically)
       • phase integrated per path: cycX += 2π·ds/wlX (no chirp when wl varies)
       • lissajousPoint(): offsetN = ampN*sin(cycN + δ + phase)
                           offsetT = ampT*sin(cycT + phase)
                           zOffset = ampZ*sin(cycZ + phaseZ + phase)   (mm)
       • applyScaleSVG: scale around pivot in SVG space
       • alternateDirection: reverse every other layer
       • closePath: append first point if not closed
     → WaveLayer[] { index, z (mm), paths: WavePoint[][] (SVG units + zOffset mm) }

WaveLayer[] + PrintParams + svgH
  └─ buildToolpath()       [lib/toolpath.ts]
       • svgToMM() here (NOT before)
       • nearest-neighbour path order O(n²) per layer, each layer starting
         where the previous one ended
       • buildArcPath + findCrossings (inter-path gaps excluded) + hopAtArc;
         hopSampleArcs inserts points across each hop window so the parabola
         is resolved even when hopRadius < sample spacing
       • z = layer.z + zOffset + hop per point; centroid per layer
     → ToolpathLayer[] { index, z, paths: {x,y,z}[][] (mm), centroid, crossings }

ToolpathLayer[] consumed by BOTH:
  ├─ generateGcode()       [lib/gcodeGenerator.ts]  (calls buildToolpath itself)
  │    • skirtArcPoints for inter-path travel
  │    • buildTransition for softJoin: smoothstep XY + linear Z, no retract
  │    • E accumulates: E += dist * extrusionMultiplier
  │  → string
  ├─ Preview2D (useMemo)   — so the preview always draws what gets printed
  └─ summarizeGcode()      [lib/gcodeStats.ts] reads the G-code back for the
                           viewer's time / length / E summary
```

Regeneration in `App.tsx` is split into two effects: wave layers re-run immediately on `[parsedSVG, params, keyframes]`; G-code is debounced 400 ms (via `gcodeTimerRef`) to avoid freezing the UI during slider/keyframe edits. Re-sampling (re-parsing the raw SVG) only happens when `params.sampleSpacing` changes.

---

## Layout and file map

Screen layout (all panels resizable via `useResize` in `App.tsx`):

```
┌ left sidebar ───────┬ center ──────────────────────────────┬ right sidebar ───────┐
│ logo + ?            │ Preview2D toolbar: Ajustar,          │ LissajousPreview     │
│ session banner      │  Iso/Planta/Frente, summary, tabs    │ ─── drag ───         │
│ upload, samples     │ 3D canvas + layer slider (right)     │ LissajousParams:     │
│ PathList            │ timeline + KF diamonds               │  context header      │
│ PathParams groups:  │ ─── drag ───                         │  (global / KF / lock)│
│  Pieza (incl.       │ Keyframe strip (in App.tsx):         │  presets, N, T, Z,   │
│  CenterScaleParams),│  ‹ › nav, Añadir/OK, delete;         │  Delta, Fase         │
│  Trayecto, Máquina  │  position, scale, CenterPad          │                      │
└─────────────────────┴──────────────────────────────────────┴──────────────────────┘
```

```
src/
  main.tsx                  React root, StrictMode
  App.tsx                   Master state, layout, inline samples, keyframe strip, shortcuts, session (≈720 lines)
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
    gcodeGenerator.ts       G-code assembly (≈282 lines)
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
- `layers: WaveLayer[]` — output of `generateWaveLayers`
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

- `WaveLayer.paths` stores XY in **SVG user units**; `WavePoint.zOffset` is already in **mm**.
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
4. **Canvas rendering** lives inside `useEffect` with the full dependency array — the canvas redraws on every relevant change. Expensive *geometry* may be memoized (`toolpath`, `flatPoints` in `Preview2D`); the drawing itself is not.
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

- Run `npm test`. `src/lib/__tests__/gcodeGenerator.test.ts` checks motion invariants (no long or plunging extrusion, G-code matches the preview toolpath) across soft join / priming / alternate-direction combinations, plus reference `.gcode` files in `__snapshots__/`. When output changes on purpose, read the snapshot diff before accepting it with `npm test -- -u`.
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
- Layer colors are an HSL gradient from cobalt to terracotta: `hsl(218→20, 72%→88%, 50%→62%)` (`layerColor`). `kfColor` in `App.tsx` uses the same formula for keyframe chips.
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
