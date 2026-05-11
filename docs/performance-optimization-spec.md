# BarroCode Performance Optimization Spec

Execution spec for improving visualization and modelling performance with high
layer counts and complex SVGs. This document is intentionally implementation
ready, but no code changes are implied by the spec itself.

Primary problem: around 60 layers, dense SVGs, or many paths, camera rotation
and editing become slow because modelling, G-code generation, and preview
rendering are tightly coupled and all run on the main browser thread.

---

## 1. Goals

- Keep camera pan/rotate/zoom responsive at high layer counts.
- Support a higher ceiling than 60 layers, targeting 100-200 layers for common
  SVGs and graceful degradation for denser files.
- Improve complex SVG handling across:
  - many separate paths;
  - long paths with dense samples;
  - many curves;
  - self-intersection and z-hop-heavy geometry.
- Preserve fabrication correctness. G-code output must remain equivalent unless
  a future task explicitly changes generation semantics.
- Allow lower visual fidelity while the user is actively dragging the camera,
  then restore full detail after interaction stops.

---

## 2. Non-Goals

- Do not replace React.
- Do not introduce a UI library.
- Do not introduce backend/native code.
- Do not change the flat `PrintParams` shape.
- Do not pre-convert `WaveLayer.paths` to mm globally. Existing geometry
  convention remains: wave layers store SVG user units.
- Do not change clay-printer behavior: no retracts, no fabrication shortcuts.
- Do not rewrite the UI overhaul while optimizing performance.

---

## 3. Current Data Flow

```text
SVG string
  -> parseSVG(raw, sampleSpacing)
  -> ParsedSVG.paths: sampled SVG user-unit centerlines

ParsedSVG + params + keyframes
  -> generateWaveLayers(...)
  -> WaveLayer[] in SVG user units

WaveLayer[] + params + viewBox
  -> generateGcode(...)
  -> full G-code string

WaveLayer[] + params + viewBox + camera state
  -> Preview2D draw effect
  -> canvas pixels
```

Important current coupling:

- `App.tsx` regenerates both layers and G-code in one effect whenever
  `parsedSVG`, `params`, or `keyframes` changes.
- `Preview2D` redraws on every camera state change and recomputes geometry
  inside the draw effect.
- G-code generation and visualization share utilities such as z-hop crossing
  detection, but each recomputes its own intermediate geometry.

---

## 4. Current Bottlenecks

### 4.1 Eager full regeneration

File: `src/App.tsx`

The effect at the regeneration boundary runs:

```ts
generateWaveLayers(parsedSVG.paths, params, keyframes, parsedSVG.viewBox.height)
generateGcode(newLayers, params, parsedSVG.viewBox)
```

on every `params` and `keyframes` change. Sliders, number inputs, path toggles,
and keyframe edits all compete with rendering.

### 4.2 Preview redraw recomputes render data

File: `src/components/Preview2D.tsx`

Every camera move updates `view`, which re-runs the canvas draw effect. Inside
that draw path the component repeatedly:

- flattens layer points;
- converts SVG points to mm;
- builds arc-length paths;
- optionally finds crossings;
- computes z-hop per point;
- scans bounds for grid fitting;
- recomputes selected-layer highlight geometry;
- recomputes travel/skirt preview geometry;
- locates keyframe and extruder points.

This makes camera movement proportional to the full model size.

### 4.3 Object allocation and array churn

Hot paths use object arrays, `flatMap`, `map`, and temporary arrays. This is
clean code, but it creates heavy allocation pressure for large layer counts.

### 4.4 Z-hop crossing detection

File: `src/lib/hopUtils.ts`

`findCrossings` is O(n^2), guarded by `MAX_PTS = 600`. This avoids catastrophic
work for dense paths but also means dense layer behavior is skipped. The preview
still pays conversion and arc-path construction costs.

### 4.5 G-code string generation is synchronous

File: `src/lib/gcodeGenerator.ts`

`generateGcode` builds the full output string synchronously on the main thread.
For large jobs, this should not run on every intermediate slider tick.

### 4.6 CenterPad and local previews also redraw from full data

Files:

- `src/components/CenterPad.tsx`
- `src/components/LissajousPreview.tsx`

These are secondary compared with `Preview2D`, but `CenterPad` scans all layers
to build its transform and silhouette. It should eventually share cached preview
geometry.

---

## 5. Target Architecture

Introduce a separate preview/render model. Keep fabrication geometry intact.

```text
ParsedSVG
  -> sampled centerlines

params + keyframes
  -> WaveLayer[]              exact SVG-unit fabrication model

WaveLayer[] + projection params
  -> PreviewModel             cached mm/render model
     - mm coordinates
     - arc positions
     - bounds
     - path ranges
     - optional crossing data
     - optional decimated point sets

Preview2D camera changes
  -> draw PreviewModel only

Export/G-code changes
  -> debounced or worker-generated G-code
```

Core rule: interactive camera movement must not recompute `WaveLayer`,
`PreviewModel`, or G-code.

---

## 6. Proposed PreviewModel

Location option:

- `src/lib/previewModel.ts`

Suggested types:

```ts
export interface PreviewPathRange {
  pathIndex: number;
  start: number;
  end: number; // exclusive point index in layer arrays
}

export interface PreviewLayer {
  index: number;
  z: number;
  points: Float32Array; // x,y,z,arc repeated
  pathRanges: PreviewPathRange[];
  crossings: Float32Array;
  bounds: Bounds3D;
  decimated?: {
    stride: number;
    points: Float32Array; // x,y,z,arc repeated
    pathRanges: PreviewPathRange[];
  };
}

export interface PreviewModel {
  layers: PreviewLayer[];
  totalPoints: number;
  bounds: Bounds3D;
  flatPoints: Float32Array; // x,y,z,layerIndex repeated, full detail
}
```

Notes:

- Use `Float32Array` for hot render paths.
- Keep `pathRanges` as small normal arrays; they are not the hot point data.
- Store mm coordinates because the canvas always renders in mm-space.
- Include z-hop in `z` if z-hop is enabled when the model is built.
- Keep `arc` for extruder positioning and future diagnostics.

---

## 7. Param Invalidation Classes

Separate params by what they actually invalidate.

### SVG parse invalidators

- `sampleSpacing`
- loaded raw SVG

Action: re-run `parseSVG`.

### Wave layer invalidators

- enabled paths;
- path overrides when keyframes are inactive;
- `lissAmpN`, `lissAmpT`;
- `lissWlN`, `lissWlT`;
- `lissDelta`;
- `lissPhaseOffset`;
- `phaseShiftPerLayer`;
- `layerHeight`;
- `numLayers`, `useNumLayers`, `totalHeight`;
- `nozzleHeightOffset`;
- `reversePath`, `alternateDirection`, `closePath`;
- `centerX`, `centerY`, `scaleX`, `scaleY`;
- keyframes.

Action: re-run `generateWaveLayers`.

### PreviewModel invalidators

- `layers`;
- `scaleFactor`;
- `originX`, `originY`;
- `flipY`;
- `zHopHeight`;
- `viewBox.height`.

Action: rebuild cached `PreviewModel`.

### G-code-only or export invalidators

- `safeZ`;
- `softJoin`;
- `transitionLength`;
- `skirtThreshold`;
- `printSpeed`;
- `travelSpeed`;
- `generateE`;
- `extrusionMultiplier`;
- `dwellAtStart`;
- `primingMove`;
- `primingLength`.

Action: regenerate G-code only, debounced or in worker.

Some params appear in more than one class when fabrication output needs them.
The important point is that camera state and timeline state must not invalidate
modelling or export.

---

## 8. Rendering Level Of Detail

Add an interaction-quality mode to `Preview2D`.

### Full quality

Used when idle and for final screenshots/export review.

- draw all points;
- draw z-hop detail;
- draw travel/skirt lines;
- draw selected keyframe layer highlight;
- draw extruder marker;
- draw legend, labels, gizmo, grid.

### Interactive quality

Used while mouse drag or wheel interaction is active.

- draw decimated point arrays;
- target roughly 20k-40k canvas line vertices per frame;
- hide travel/skirt preview lines;
- hide selected-layer bbox;
- hide text labels except maybe gizmo;
- keep layer color ramp;
- keep enough geometry to preserve shape orientation.

### Idle restore

After `mouseup`, wheel idle, or 100-150ms without interaction:

- redraw full quality.

Implementation detail:

- Store `isInteracting` in a ref or state.
- Use `requestAnimationFrame` to coalesce camera moves.
- Do not call `setView` more often than the browser can paint.

---

## 9. G-code Generation Strategy

Phase 1 can simply debounce G-code generation.

Recommended behavior:

- update `layers` immediately for preview;
- schedule `generateGcode` after 250-500ms of no relevant changes;
- show previous G-code until new output finishes, or show a small "generando"
  status if UI work includes status messaging.

Later phase:

- move `generateGcode` into a Web Worker;
- pass plain serializable data;
- preserve exact output formatting;
- cancel/ignore stale worker results using a monotonically increasing job id.

Acceptance requirement:

- For the same input, G-code text should match the pre-optimization output
  except for explicitly approved whitespace/status changes.

---

## 10. Z-hop And Crossing Strategy

Short term:

- compute crossings once per `PreviewModel` rebuild;
- store crossings per layer;
- reuse them during preview drawing;
- keep current `MAX_PTS` behavior unless the phase explicitly improves it.

Medium term:

- add spatial binning for segment intersection checks;
- replace O(n^2) all-pairs with grid buckets or sweep-line candidate pruning;
- expose a diagnostic when dense z-hop is skipped.

Acceptance requirement:

- Preview and G-code must agree on visible z-hop behavior for layers where
  crossings are computed.

---

## 11. Execution Phases

### Phase 1 - Instrumentation And Baseline

Goal: measure before changing behavior.

Edits:

- Add lightweight performance marks around:
  - `parseSVG`;
  - `generateWaveLayers`;
  - `generateGcode`;
  - `Preview2D` draw;
  - `PreviewModel` build once it exists.
- Report timings in dev console only.
- Do not add UI unless requested.

Acceptance:

- A developer can load a complex SVG, set 60+ layers, rotate camera, and see
  approximate timing for generation and draw work.

### Phase 2 - PreviewModel Cache

Goal: remove repeated conversion and geometry prep from camera redraw.

Edits:

- Add `src/lib/previewModel.ts`.
- Build preview model with `useMemo` in `Preview2D` or in `App.tsx`.
- Convert mm points once per relevant invalidation.
- Cache bounds and flat point arrays.
- Update fit view and extruder lookup to use cached model.

Acceptance:

- Camera movement no longer calls `svgToMM`, `buildArcPath`, or `findCrossings`
  for every frame.
- Visual output matches current full-quality preview.

### Phase 3 - Interactive LOD

Goal: keep camera rotation responsive.

Edits:

- Add interaction state for drag and wheel.
- Draw decimated point sets while interacting.
- Restore full-quality draw after idle.
- Use `requestAnimationFrame` to coalesce camera updates.

Acceptance:

- At 60+ layers, rotating feels responsive.
- During drag, shape may be slightly simplified.
- After drag, full detail returns automatically.

### Phase 4 - G-code Debounce

Goal: prevent export generation from blocking live editing.

Edits:

- Split layer generation and G-code generation effects in `App.tsx`.
- Debounce `generateGcode` for 250-500ms.
- Ensure G-code-only params do not rebuild wave layers.

Acceptance:

- Slider edits update preview without synchronous full G-code rebuild on every
  tick.
- Final G-code updates after the debounce.

### Phase 5 - Worker G-code Optional Upgrade

Goal: move large string generation off the main thread.

Edits:

- Add Vite-compatible worker module, e.g. `src/workers/gcodeWorker.ts`.
- Send `layers`, `params`, `viewBox`, and job id.
- Ignore stale results.

Acceptance:

- UI remains responsive during large G-code generation.
- Output matches current generator.

### Phase 6 - Crossing Detection Upgrade

Goal: handle z-hop-heavy complex paths more gracefully.

Edits:

- Add spatial candidate pruning for segment intersections.
- Keep existing guard as fallback.
- Add status/diagnostic if crossings are skipped.

Acceptance:

- Dense self-intersecting paths do not freeze.
- Crossing detection works on larger layers than the current 600-point guard.

### Phase 7 - CenterPad Reuse

Goal: avoid duplicate full-layer scans in `CenterPad`.

Edits:

- Pass a small preview-model-derived silhouette into `CenterPad`, or share
  bounds and selected-layer arrays.
- Keep existing CenterPad behavior.

Acceptance:

- Editing keyframe center no longer rescans all raw layers per redraw.

---

## 12. Verification Matrix

Use at least these scenarios:

| Scenario | Purpose |
|---|---|
| Default sample, 6 layers | regression baseline |
| Default sample, 60 layers | current slowdown case |
| Default sample, 150 layers | higher-ceiling target |
| Complex long single path | dense point count |
| Many separate paths | path ordering and travel stress |
| Z-hop enabled | crossing and z-hop agreement |
| Soft join off | skirt travel preview stress |
| Keyframes active | interpolation and selected layer stress |

For each scenario verify:

- camera rotate/pan/zoom works;
- preview returns to full quality after interaction;
- timeline/extruder marker follows expected position;
- keyframes can be selected and dragged;
- G-code can be copied/downloaded;
- `npm run build` passes.

---

## 13. Performance Targets

Initial targets, to refine after instrumentation:

- Camera interaction:
  - under 16-24ms per interactive frame for common 60-layer jobs;
  - under 32ms per interactive frame for 100-200 layer jobs with decimation.
- Full-quality redraw:
  - acceptable if slower than interactive mode, but should complete without
    visible browser freeze.
- Param edits:
  - preview should start updating before G-code generation completes.
- G-code:
  - large outputs should not block camera interaction once debounce/worker
    phases are complete.

---

## 14. Risks

- Typed arrays improve speed but can make code harder to read.
- Decimation can hide small features during interaction. Full redraw must return
  quickly after idle.
- Splitting invalidation classes can accidentally skip regeneration. Add focused
  manual tests for params that affect both preview and G-code.
- Worker serialization may copy large arrays. Consider transferable buffers only
  after simpler debounce is proven insufficient.

---

## 15. Recommended First Ticket

Implement Phase 2 and Phase 3 together only if kept tightly scoped to
`Preview2D` and `src/lib/previewModel.ts`.

Suggested first commit:

```text
perf(preview): cache render model and decimate while interacting
```

Definition of done:

- no fabrication behavior changes;
- full-quality preview visually matches current output;
- camera interaction no longer recomputes mm conversion and crossings;
- `npm run build` passes.
