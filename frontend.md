# Frontend instructions for Claude Code: barrocode

Build the frontend for **barrocode** as a minimal technical interface inspired by CLI installation panels, especially the `claude-mem install` flow. The UI should feel like a light-code graphical instrument: sparse, precise, text-first, and structured around process state, but not visually identical to a code terminal.

## Visual Direction

Use a light-code interface with ASCII-style symbols, vertical process flows, compact data panels, thin lines, and simple diagnostic charts. ASCII characters should work as graphic UI elements integrated into panels, controls, labels, and flows. Avoid a generic SaaS dashboard look, and avoid making the whole interface look like a terminal emulator.

The first screen must be the usable product interface, not a landing page.

## Core Style

- Use a restrained monochrome base with a few functional accent colors.
- Prefer monospaced typography for most UI: commands, labels, tables, logs, metrics, navigation, and statuses.
- Use small uppercase labels for metadata.
- Use large, clean numeric values only when a metric is genuinely important.
- Use thin borders, 1px dividers, compact spacing, and clear alignment.
- Keep border radius subtle, around 4px to 8px maximum.
- Avoid large shadows, gradient backgrounds, glassmorphism, decorative blobs, and oversized marketing sections.

## ASCII UI Language

Use text symbols as graphic elements inside the interface, not as a full terminal skin. They should evoke icons, flow markers, state indicators, dividers, and cursor focus. Examples:

```txt
o  pending step
|  flow continuation
.  info event
!  warning
x  failed
>  command prompt / active focus
[ ] inactive option
[x] selected option
-- divider
#  module/block marker
```

Use these symbols in steppers, status lists, compact controls, panel headers, diagnostic summaries, timeline markers, and flow connectors. They should feel intentional and integrated with the UI layout, not decorative and not confined to code blocks.

Inputs and controls must remain graphical UI controls. Do not style text fields, upload areas, sliders, or numeric inputs as if they were command-line prompts unless that control is explicitly a command/output surface.

## Suggested Layout

Create a dense but readable app shell:

- left rail: product name, sections, compact status markers
- main panel: active workflow, command surface, generated output, or editor-like area
- right or bottom panel: diagnostics, metrics, logs, recent events, or configuration state
- top strip: current project/context and primary action

Do not use nested cards. Use full-width panels, sections, tables, dividers, and compact modules.

## Components To Implement

### Technical Stepper

Render workflow state as a vertical CLI-like sequence:

```txt
o  Detect project
|  Read files
.  Framework: Next.js
!  Missing environment variable
o  Generate interface
```

Each row should have symbol, title, optional description, and state color.

### Command Panel

Create a command/output surface:

```txt
> barrocode scan
  reading workspace...
  extracting interface tokens...
  ready
```

Include primary actions as compact controls, not large CTA buttons.

### Metrics And Bars

Use minimal progress bars and diagnostic charts:

```txt
build     ███████░░░  70%
lint      ██████████  ok
tokens    ███░░░░░░░  31%
```

If rendering with CSS, use flat rectangles, thin borders, and optional hatch patterns for unknown/partial states.

### Compact Tables

Use monospace tables or aligned CSS grids:

```txt
module       status     score
parser       ready      94
ui           active     71
memory       pending    38
```

## Color Rules

Use color only to encode state:

- green: success / ready
- blue: active / selected
- yellow: warning / running
- red: error / blocked
- gray: inactive / secondary

Keep most of the interface black, white, and gray. Do not build a one-hue theme.

## Interaction

- Buttons should be compact and tool-like.
- Prefer icon or symbol buttons when the action is familiar.
- Use segmented controls, checkboxes, toggles, and simple menus for configuration.
- Hover/focus states should be visible but restrained.
- All interactive elements must have accessible labels.
- The app should be navigable by keyboard and cursor: clear focus states, logical tab order, arrow-key support where appropriate, and no interaction that requires dragging only.
- Reveal detailed controls progressively. Keep the user's view clean by default, then expose overrides, diagnostics, and advanced parameters when the user selects, expands, focuses, or needs them.

## Copywriting

Use short, operational labels. Avoid marketing language.

Good:

- `Detect environment`
- `Generate UI`
- `Configure token`
- `Retry build`
- `Open logs`

Avoid:

- `Unlock your full creative potential`
- `Welcome to the ultimate coding experience`
- `Everything you need in one place`

## Implementation Notes

- Keep the CSS system small and explicit: tokens for color, spacing, type, border, and state.
- Prefer CSS grid/flex layouts over complex component abstractions.
- Build reusable primitives for `AsciiStepper`, `CommandPanel`, `MetricBar`, `StatusTable`, and `DiagnosticPanel`.
- Ensure the interface works in narrow and wide viewports without overlapping text.
- Do not scale font sizes with viewport width.
- Use stable dimensions for toolbars, status rows, metric bars, and compact controls.

## Acceptance Criteria

The finished frontend should:

- look like a minimal graphical console for barrocode
- clearly reference CLI installation flows through ASCII symbols and vertical process state without looking like a literal terminal emulator
- expose real product functionality immediately on the first screen
- use text, alignment, borders, and state color as the main visual system
- avoid decorative SaaS patterns, generic hero pages, and heavy card layouts
