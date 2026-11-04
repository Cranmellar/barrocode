import { useMemo, useState } from 'react';

interface Props {
  gcode: string;
  // A newer G-code is on its way; the text shown is about to change.
  stale?: boolean;
  onClose: () => void;
}

// Laying out a multi-MB textarea freezes the page for seconds, so only the
// head of the program is shown; copy and download use the full string.
const PREVIEW_LINES = 1500;

// The thumbnails' base64 would fill the preview; they show as one line each.
const THUMBNAIL = /(; thumbnail begin (\S+) \d+\n)(?:; [^\n]*\n)*?(; thumbnail end)/g;

function summarize(gcode: string) {
  let lines = 1;
  for (let i = gcode.indexOf('\n'); i !== -1; i = gcode.indexOf('\n', i + 1)) lines++;
  const shown = gcode.replace(THUMBNAIL, (_, begin, size, end) => `${begin}; (imagen PNG de ${size} px)\n${end}`);
  let n = 1, headEnd = -1;
  for (let i = shown.indexOf('\n'); i !== -1; i = shown.indexOf('\n', i + 1)) {
    if (n === PREVIEW_LINES) headEnd = i;
    n++;
  }
  const text = headEnd === -1
    ? shown
    : `${shown.slice(0, headEnd)}\n\n; … ${(n - PREVIEW_LINES).toLocaleString()} líneas más. ` +
      'Usa «Copiar» o «Descargar» para obtener el programa completo.';
  return { lines, text, kb: (new Blob([gcode]).size / 1024).toFixed(1) };
}

export function GcodeOutput({ gcode, stale, onClose }: Props) {
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
              <button className="btn-small gcode-copy" onClick={handleCopy}>
                {copied
                  ? <span key="done" className="btn-label btn-label--ok">
                      <svg className="check-draw" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
                      </svg>Copiado
                    </span>
                  : <span key="idle" className="btn-label">Copiar</span>}
              </button>
            </>
          )}
          <button className="btn-icon" onClick={onClose} title="Cerrar (G)" aria-label="Cerrar G-code">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        </div>
      </div>
      <textarea
        className={`gcode-textarea${stale ? ' gcode-textarea--stale' : ''}`}
        readOnly
        value={info?.text ?? '; Carga un SVG para generar G-code.'}
        spellCheck={false}
      />
    </div>
  );
}
