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
  centro: (<>
    <circle cx="8" cy="8" r="3.5" />
    <path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" />
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
