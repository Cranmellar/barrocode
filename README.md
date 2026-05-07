# SVG Clay Wave — G-code Generator

A local-first web app that converts SVG centerline curves into oscillating/wavy
toolpaths for clay extrusion 3D printing, then exports G-code.

## Quick Start

```bash
cd svg-clay-wave
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

---

## Architecture — Two-Motion System

The toolpath is the **sum of two independent motions**:

```
final_point(s) = centerline(s)                        ← global motion
              + N(s) · ampN · sin(2π·s/wlN + δ)       ← Lissajous N component
              + T(s) · ampT · sin(2π·s/wlT)           ← Lissajous T component
```

- `s` = cumulative arc length along the SVG path (mm)
- `N(s)` = unit normal at `s` (perpendicular to path, left of travel direction)
- `T(s)` = unit tangent at `s` (forward direction)
- Both wavelengths are measured **along the arc**, so the pattern is consistent regardless of path curvature
- `δ` (delta) is the phase difference between N and T — this controls the **Lissajous shape** (0° = line, 90° = ellipse when wlN=wlT, etc.)

The **Extruder Frame** preview in the centre-top panel shows only the Lissajous figure in local (T, N) coordinates — completely decoupled from the global path shape. Use it to tune the figure before worrying about the path.

### Soft Layer Join

When **Smooth Z transition** is enabled, the end of layer N connects to the start of layer N+1 via a continuous print move that interpolates XY (smoothstep) and Z (linear) over `transition arc` mm. No retract, no lift — ideal for clay.

---

## How to Use

### 1. Upload an SVG

Click the upload area or drag an SVG file onto it.  
The app reads `<path>`, `<polyline>`, `<polygon>`, `<line>`, `<circle>`,
`<ellipse>`, and `<rect>` elements.

A **sample SVG** (with an S-curve, an ellipse, and a diagonal line) is bundled —
click **"Load sample SVG"** to try it immediately.

### 2. Check the Path List

Each detected geometry element appears in the **SVG Paths** list.  
- Toggle individual paths on/off.  
- Override **Amplitude** or **Wavelength** per path (leave blank to use the global value).

### 3. Adjust Parameters

| Parameter | Effect |
|-----------|--------|
| **Sample spacing** | How densely the path is sampled (SVG units). Smaller = smoother wave, more points. |
| **Layer height** | Z increment between stacked print layers (mm). |
| **Num layers / Total height** | How tall the print is. |
| **Nozzle Z offset** | Added to every layer's Z (first-layer calibration). |
| **Amplitude** | Half-amplitude of the sinusoidal oscillation (mm). The toolpath swings this far left and right of the centerline. |
| **Wavelength** | Arc-length of one full wave cycle (mm). Measured along the curve, not along a straight axis. |
| **Phase offset** | Starting phase of the wave (degrees). |
| **Phase shift / layer** | Extra phase added per layer — creates a helical/spiralling appearance. |
| **Scale factor** | Converts SVG user units to mm. Use `1` if your SVG was drawn in mm, `0.2645` for 96 dpi pixels. |
| **Origin X / Y** | Shift the entire print on the bed (mm). |
| **Flip Y** | Mirrors the Y axis (SVG Y grows downward; most printers want Y upward). |
| **Print / Travel speed** | mm/min for extrusion and travel moves. |
| **Generate E values** | Include cumulative extrusion distance in G-code. Disable for motion-only output. |
| **Extrusion multiplier** | E units per mm of travel. Tune for your clay pump/auger system (typical: 0.02–0.1). |
| **Alternate direction** | Odd-numbered layers print in reverse — reduces directional drift in clay. |
| **Close paths** | Appends a move back to the start of each path (useful for ellipses). |
| **Dwell at start** | G4 pause (ms) at the first print position, giving clay time to start flowing. |
| **Priming move** | Extrudes a short line before the main print to prime the nozzle. |

### 4. Preview

- **Gray dashed lines** = original SVG centerlines.
- **Coloured lines** = generated wave toolpath, one colour per layer (cyan → amber gradient).
- **Scroll** to zoom, **drag** to pan, **Fit** button to reset view.

### 5. Export G-code

Click **↓ Download .gcode** to save the file.  
The filename matches your uploaded SVG (e.g. `my-vase.gcode`).

---

## G-code Structure

```
; Header with all parameter values
G21       ; mm units
G90       ; absolute positioning
G92 E0    ; reset extrusion
G1 Z20    ; safe Z
; optional priming move
; --- Layer 1 Z=1.000 ---
G1 X.. Y.. F1500   ; travel
G1 Z1.000 F1500    ; descend
G1 X.. Y.. E.. F600 ; print
...
```

---

## Wave Geometry

The wave is computed in the **local frame of the curve**:

```
phase   = 2π × arcLength / wavelength + phaseOffset + layerIndex × phaseShiftPerLayer
offset  = amplitude × sin(phase)
point   = centerlinePoint + normal × offset
```

- `normal` is the unit vector perpendicular to the curve's tangent at each sample.
- `arcLength` is the cumulative distance along the curve — so wavelength is
  always measured along the path, regardless of its shape.
- For closed curves (circles, ellipses), the wave seamlessly wraps around.

---

## Limitations & Assumptions

- **No transform inheritance across nested `<g>` groups with complex transforms.**  
  Simple translate/rotate on individual elements works. Deeply nested transforms
  may not be fully resolved.
- **SVG units ≠ mm by default.** Set the scale factor to match your SVG's coordinate system.
- **No retraction** is generated (clay printing rarely retracts).
- **Extrusion model is linear** (`E += distance × multiplier`). This suits
  air-pressure and auger-based clay extruders where E is proportional to pump
  speed/time. Tune `extrusionMultiplier` to your machine.
- **No bed-levelling mesh** is applied.
- The preview is 2D only (overhead view with colour-coded layers).

---

## Project Structure

```
src/
  types/index.ts          — shared TypeScript types
  lib/
    svgParser.ts          — SVG parsing & path sampling (uses browser SVG DOM)
    waveGenerator.ts      — sinusoidal wave math & layer stacking
    gcodeGenerator.ts     — G-code formatting & download
  components/
    ControlPanel.tsx      — parameter UI
    PathList.tsx          — per-path enable/override UI
    Preview2D.tsx         — canvas preview with pan/zoom
    GcodeOutput.tsx       — G-code display & download button
  App.tsx                 — main app state & data flow
public/
  sample.svg              — bundled test file
```
