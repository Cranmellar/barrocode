import { useMemo, useState } from 'react';
import { downloadGcode } from '../lib/gcodeGenerator';

interface Props {
  gcode: string;
  filename?: string;
}

// Laying out a multi-MB textarea freezes the page for seconds, so only the
// head of the program is shown; copy and download use the full string.
const PREVIEW_LINES = 1500;

function summarize(gcode: string) {
  let lines = 1, headEnd = -1;
  for (let i = gcode.indexOf('\n'); i !== -1; i = gcode.indexOf('\n', i + 1)) {
    if (lines === PREVIEW_LINES) headEnd = i;
    lines++;
  }
  const hidden = lines - PREVIEW_LINES;
  const text = headEnd === -1
    ? gcode
    : `${gcode.slice(0, headEnd)}\n\n; … ${hidden.toLocaleString()} líneas más. ` +
      'Usa «Copiar» o «↓ .gcode» para obtener el programa completo.';
  return { lines, text, kb: (new Blob([gcode]).size / 1024).toFixed(1) };
}

export function GcodeOutput({ gcode, filename = 'barrocode.gcode' }: Props) {
  const [copied, setCopied] = useState(false);
  const info = useMemo(() => (gcode ? summarize(gcode) : null), [gcode]);

  function handleCopy() {
    navigator.clipboard.writeText(gcode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="gcode-panel">
      <div className="toolbar">
        <span className="toolbar-title">G-code</span>
        {info && (
          <span className="gcode-info">
            {info.lines.toLocaleString()} líneas · {info.kb} KB
            {info.lines > PREVIEW_LINES && ` · vista: primeras ${PREVIEW_LINES.toLocaleString()}`}
          </span>
        )}
        <div className="gcode-actions">
          {gcode && (
            <>
              <button className="btn-small" onClick={handleCopy}>
                {copied ? '✓ Copiado' : 'Copiar'}
              </button>
              <button className="btn-primary"
                onClick={() => downloadGcode(gcode, filename)}
                disabled={!gcode}>
                ↓ .gcode
              </button>
            </>
          )}
        </div>
      </div>
      <textarea
        className="gcode-textarea"
        readOnly
        value={info?.text ?? '; Carga un SVG para generar G-code.'}
        spellCheck={false}
      />
    </div>
  );
}
