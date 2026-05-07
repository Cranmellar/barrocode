import { useState } from 'react';
import { downloadGcode } from '../lib/gcodeGenerator';

interface Props {
  gcode: string;
  filename?: string;
}

export function GcodeOutput({ gcode, filename = 'curvabarro.gcode' }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(gcode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const lineCount = gcode ? gcode.split('\n').length : 0;
  const kb = gcode ? (new Blob([gcode]).size / 1024).toFixed(1) : '0';

  return (
    <div className="gcode-panel">
      <div className="toolbar">
        <span className="toolbar-title">G-code</span>
        {gcode && (
          <span className="gcode-info">{lineCount} líneas · {kb} KB</span>
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
        value={gcode || '; Carga un SVG para generar G-code.'}
        spellCheck={false}
      />
    </div>
  );
}
