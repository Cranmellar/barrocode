const PATHS = {
  pieza: (<>
    <ellipse cx="8" cy="4" rx="5.5" ry="2" />
    <path d="M2.5 4v7.5c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2V4" />
    <path d="M2.5 7.8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2" />
  </>),
  trayecto: (<>
    <circle cx="3.5" cy="12.5" r="1.5" />
    <path d="M5 12c4-.5 1-7.5 5.5-7.5H14" />
    <path d="M12 2.5 14 4.5 12 6.5" />
  </>),
  maquina: (<>
    <path d="M3.5 1.5h9v4h-9z" />
    <path d="M5.5 5.5h5L9 10H7z" />
    <path d="M2.5 13.5h11" />
  </>),
  onda: <path d="M1 8c1.6-4.5 3.2-4.5 4.7 0s3.1 4.5 4.6 0 3.1-4.5 4.7 0" />,
  giro: (<>
    <path d="M13 8a5 5 0 1 1-5-5h2.5" />
    <path d="M8.5 1 10.5 3 8.5 5" />
  </>),
  escalaX: <path d="M2 8h12M4.5 5.5 2 8l2.5 2.5M11.5 5.5 14 8l-2.5 2.5" />,
  escalaY: <path d="M8 2v12M5.5 4.5 8 2l2.5 2.5M5.5 11.5 8 14l2.5-2.5" />,
  // One layer lifted off the faded ones below it.
  aislar: (<>
    <path d="M8 2 14 5 8 8 2 5z" />
    <path d="M2 8.5 8 11.5 14 8.5" opacity="0.4" />
    <path d="M2 11.5 8 14.5 14 11.5" opacity="0.4" />
  </>),
  reset: (<>
    <path d="M2 8a6 6 0 1 0 6-6 6.5 6.5 0 0 0-4.5 1.8L2 5.3" />
    <path d="M2 2v3.3h3.3" />
  </>),
  centro: (<>
    <circle cx="8" cy="8" r="3.5" />
    <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
  </>),  rutas: (<>
    <path d="M2 12c2-6 4-6 6-2s4 4 6-4" />
    <circle cx="2" cy="12" r="1.3" fill="currentColor" />
    <circle cx="14" cy="6" r="1.3" fill="currentColor" />
  </>),
  // Clay beads stacked, the top one still to print.
  capas: (<>
    <rect x="2.5" y="10.5" width="11" height="3" rx="1.5" />
    <rect x="2.5" y="6.5" width="11" height="3" rx="1.5" />
    <rect x="2.5" y="2.5" width="11" height="3" rx="1.5" opacity="0.45" />
  </>),
  resolucion: (<>
    <path d="M2 12a6 6 0 0 1 12 0" opacity="0.45" />
    <circle cx="2.4" cy="10" r="1.1" fill="currentColor" />
    <circle cx="5" cy="6.8" r="1.1" fill="currentColor" />
    <circle cx="8" cy="6" r="1.1" fill="currentColor" />
    <circle cx="11" cy="6.8" r="1.1" fill="currentColor" />
    <circle cx="13.6" cy="10" r="1.1" fill="currentColor" />
  </>),
  escala: (<>
    <rect x="2" y="6" width="8" height="8" rx="1" />
    <path d="M8.5 7.5 14 2M10 2h4v4" />
  </>),
  direccion: (<>
    <rect x="2" y="4" width="12" height="9" rx="4.5" />
    <path d="M7 2 9 4 7 6" />
  </>),
  // The seam ramp: the bead rises to the next layer while printing.
  union: (<>
    <path d="M1.5 12.5h6c2.5 0 2.5-5 5-5h2" />
    <path d="M1.5 7.5h5" strokeDasharray="1.5 2" />
  </>),
  zhop: (<>
    <path d="M1.5 11h3.5c.8-4.5 5.2-4.5 6 0h3.5" />
    <path d="M8 10v4.5M8 2.5V5" opacity="0.45" />
  </>),
  desplazamiento: (<>
    <path d="M3 12a5.5 5.5 0 0 1 10 0" strokeDasharray="1.6 2" />
    <circle cx="3" cy="12" r="1.3" fill="currentColor" />
    <circle cx="13" cy="12" r="1.3" fill="currentColor" />
  </>),
  velocidad: (<>
    <path d="M2.5 12a5.5 5.5 0 1 1 11 0" />
    <path d="M8 12l3-3.5" />
    <circle cx="8" cy="12" r="0.8" fill="currentColor" />
  </>),
  extrusion: (<>
    <path d="M4.5 1.5h7v3h-7z" />
    <path d="M6 4.5h4L8.8 8H7.2z" />
    <path d="M8 10c-1.1 1.5-1.7 2.4-1.7 3.1a1.7 1.7 0 0 0 3.4 0c0-.7-.6-1.6-1.7-3.1z" />
  </>),
  calibracion: (<>
    <path d="M2.5 1.5h6l-1.5 4h-3z" />
    <path d="M1.5 13.5h13" />
    <path d="M12.5 4v7.5M11 5.5 12.5 4 14 5.5M11 10l1.5 1.5L14 10" />
  </>),
  arcilla: (<>
    <path d="M5 2.5h6" />
    <path d="M6 2.5c0 2-3 3-3 6.5 0 3 2.2 5 5 5s5-2 5-5c0-3.5-3-4.5-3-6.5" />
  </>),
  preajustes: (<>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </>),
  acople: <path d="M8 8c-2-3.5-6.5-3.5-6.5 0S6 11.5 8 8s6.5-3.5 6.5 0S10 11.5 8 8z" />,
  // The same wave, shifted along the path.
  fase: (<>
    <path d="M1 7c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0" opacity="0.4" />
    <path d="M3.3 7c1.5-4 3-4 4.5 0s3 4 4.5 0" />
    <path d="M5 13.5h5M8.5 12l1.5 1.5L8.5 15" />
  </>),
  // Parameters: what the number measures, drawn on the bead or the wave.
  alturaCapa: (<>
    <rect x="1.5" y="9" width="8.5" height="3.5" rx="1.75" />
    <rect x="1.5" y="4" width="8.5" height="3.5" rx="1.75" opacity="0.45" />
    <path d="M13 3.5v9M11.5 5 13 3.5 14.5 5M11.5 11l1.5 1.5 1.5-1.5" />
  </>),
  espaciado: (<>
    <circle cx="3" cy="6.5" r="1.3" fill="currentColor" />
    <circle cx="8" cy="6.5" r="1.3" fill="currentColor" />
    <circle cx="13" cy="6.5" r="1.3" fill="currentColor" />
    <path d="M3 12h5M3 10.5v3M8 10.5v3" />
  </>),
  mover: <path d="M8 1.5v13M1.5 8h13M6 3.5 8 1.5l2 2M6 12.5l2 2 2-2M3.5 6 1.5 8l2 2M12.5 6l2 2-2 2" />,
  reflejar: (<>
    <path d="M1.5 8h13" strokeDasharray="1.6 1.8" />
    <path d="M4 6h8L8 2z" />
    <path d="M4 10h8l-4 4z" opacity="0.45" />
  </>),
  zSeguridad: (<>
    <path d="M2 3h12" strokeDasharray="1.6 1.8" />
    <path d="M8 14V6M5.5 8.5 8 6l2.5 2.5" />
  </>),
  reloj: (<>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8l2.5 1.5" />
  </>),
  cebado: (<>
    <path d="M2 12.5h9.5M10 10.5l2 2-2 2" />
    <path d="M4 2.5c-1.1 1.5-1.7 2.4-1.7 3.1a1.7 1.7 0 0 0 3.4 0c0-.7-.6-1.6-1.7-3.1z" />
  </>),
  amplitud: (<>
    <path d="M1 8c1.3-3.8 2.7-3.8 4 0s2.7 3.8 4 0" />
    <path d="M12.5 3.5v9M11 5l1.5-1.5L14 5M11 11l1.5 1.5L14 11" />
  </>),
  longitud: (<>
    <path d="M2 6.5c2-4.5 4-4.5 6 0s4 4.5 6 0" />
    <path d="M2 13.5h12M2 12v3M14 12v3" />
  </>),
  ok: (<>
    <circle cx="8" cy="8" r="6" />
    <path d="M5.3 8.2 7.1 10l3.6-4" />
  </>),
  aviso: (<>
    <path d="M8 2 14.5 13.5h-13z" />
    <path d="M8 6.5v3.2M8 11.7v.1" />
  </>),
  info: (<>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.5V11M8 5v.1" />
  </>),
  descargar: (<>
    <path d="M8 2v8.5M4.5 7 8 10.5 11.5 7" />
    <path d="M2.5 13.5h11" />
  </>),
  global: (<>
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" />
  </>),
  keyframe: (<>
    <path d="M8 1.5 14.5 8 8 14.5 1.5 8z" />
    <path d="M8 5.5v5M5.5 8h5" />
  </>),
  desfaseCapa: (<>
    <path d="M1.5 5c1.6-2.8 3.2-2.8 4.8 0s3.2 2.8 4.8 0" />
    <path d="M4.5 11c1.6-2.8 3.2-2.8 4.8 0s3.2 2.8 4.8 0" />
  </>),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
