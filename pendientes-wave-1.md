# Wave 1 — P0 bugs (execution prompt)

Self-contained prompt for executing Wave 1 of `pendientes.md`. Paste this as the first message of a fresh Claude session inside the BarroCode repo. Designed for minimum tool calls and token usage.

---

## Briefing (read CLAUDE.md first — everything else you need is below)

Two P0 bugs to fix. **Do not explore the codebase beyond the files named here.** Both targets have been verified in their HEAD state and the exact diffs are below. Apply the edits, run nothing, commit, stop.

### Ticket 1 — SVG drag-and-drop is broken

**File**: [src/App.tsx](src/App.tsx), the `<div className="upload-area">` block (around line 209–215).

**Diagnosis**: the current handlers are wired correctly *for the drop target itself*, but the **browser's default drag handler on `window`** intercepts drops that miss the precise drop zone (1–2 px off the bounding box, or while dragging over the file input below it) — the file then opens in the browser tab and replaces the app, which looks like "drag-drop doesn't resolve".

**Fix**: install window-level `dragover` and `drop` preventers in a `useEffect([])` mounted once at the top of `App()`. Inside the upload-area `onDrop`, keep the existing handler.

Add this `useEffect` near the existing effects in `App()` (after the regeneration effect at ~line 157 is a clean spot):

```tsx
// Prevent the browser from opening a dropped SVG when the user misses
// the upload-area drop zone.
useEffect(() => {
  const block = (e: DragEvent) => e.preventDefault();
  window.addEventListener('dragover', block);
  window.addEventListener('drop', block);
  return () => {
    window.removeEventListener('dragover', block);
    window.removeEventListener('drop', block);
  };
}, []);
```

Also harden the upload-area handlers with `dragenter` for cross-browser consistency:

```tsx
<div
  className="upload-area"
  onClick={() => fileInputRef.current?.click()}
  onDragEnter={e => e.preventDefault()}
  onDragOver={e => e.preventDefault()}
  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
>
```

### Ticket 2 — NumInput wheel doesn't refresh the displayed number

**File**: [src/components/NumInput.tsx](src/components/NumInput.tsx) line 54.

**Current**:

```ts
onChange(out);
if (!focusedRef.current) setRaw(String(out));
```

The guard skips the display refresh when the input is focused. Scrolling is a deliberate action, so suppressing the visible update there is wrong.

**Fix**: replace those two lines with:

```ts
onChange(out);
setRaw(String(out));
```

(Drop the `!focusedRef.current` check entirely for the wheel handler. The focus-guard in the separate `useEffect([value])` parent-sync at line 36 stays — that one is correct.)

---

## Execution checklist

1. Read [CLAUDE.md](CLAUDE.md) once. Do not Read any other file unless an Edit fails.
2. Apply Ticket 2 first (1 Edit, no risk).
3. Apply Ticket 1 (2 Edits to `src/App.tsx`: insert the new `useEffect`, replace the `<div className="upload-area">` JSX).
4. Do **not** run `npm run build`, `npm run dev`, or any test. The user will verify manually.
5. Do **not** stage or commit. Stop after the edits and report:
   - "Wave 1 applied: 2 edits to App.tsx, 1 edit to NumInput.tsx."
   - One line per ticket with the file:line that changed.

---

## Constraints

- No new dependencies.
- No new files.
- No refactors. No comment additions beyond the one short comment shown above.
- Don't touch any other file. If you think a related file needs a change, stop and ask.
- Don't run any verification (build / type-check / dev server / preview). If TypeScript or runtime is broken after the edits, the user will report it.

---

## Commit (only if the user confirms verification)

Once the user confirms both fixes work in the browser, create a single commit:

```
fix: SVG drag-drop reliability and NumInput wheel display refresh

- App.tsx: install window-level dragover/drop preventers so a missed
  drop on the upload-area doesn't navigate the browser away from
  the app. Add onDragEnter to the upload-area for cross-browser
  consistency.
- NumInput.tsx: always update the displayed value on wheel events,
  not only when the input is unfocused. Scrolling is a deliberate
  action and should be visible regardless of focus state.
```

---

## How to clone this template for other waves

Each wave's execution prompt should follow the same shape:

1. **Briefing** — one paragraph per ticket: file path, diagnosis (cause not symptom), and the exact patch (old/new code blocks).
2. **Execution checklist** — ordered steps that minimize tool calls. Always start with "read CLAUDE.md" and end with "stop after edits".
3. **Constraints** — explicit no-go list (no exploration, no builds, no auto-commits) to prevent token waste.
4. **Commit message** — pre-written, in a code block, to avoid prose generation.

What makes this efficient:

- **Pre-resolved paths**: every file is named with a clickable link; the executor doesn't run Glob/Grep.
- **Pre-resolved line numbers**: the executor doesn't need to Read whole files to locate the change point.
- **Concrete patches**: old/new code shown verbatim; Edit tool can apply directly without thinking.
- **Pre-decided ambiguities**: every "should I…?" decision is made up front, so the executor doesn't ask.
- **Anti-verification**: "don't run anything" eliminates the largest variable-cost step. The human verifies.
- **Anti-exploration**: explicit "don't touch other files" caps the working set.

Result: a wave that would normally take 8–15 tool calls and ~30k tokens executes in 3–4 Edit calls and well under 10k tokens.
