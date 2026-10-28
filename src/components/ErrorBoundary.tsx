import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State { error: Error | null; report: string }

// Shows what failed instead of a blank page. The copied report carries the
// autosaved session, so the failure can be reproduced with the same keyframes.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, report: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    let session = '';
    try { session = localStorage.getItem('barrocode.session') ?? ''; } catch { /* no storage */ }
    const report = [
      `${error.name}: ${error.message}`,
      error.stack ?? '',
      'Componentes:' + (info.componentStack ?? ''),
      `Navegador: ${navigator.userAgent}`,
      `Ventana: ${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
      `Sesión: ${session}`,
    ].join('\n');
    this.setState({ report });
  }

  render() {
    const { error, report } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-card">
          <h1>BarroCode se detuvo por un error</h1>
          <p>Copia el informe y envíalo para poder corregirlo. Incluye tus parámetros y keyframes. Al recargar puedes recuperar la sesión guardada.</p>
          <pre className="crash-text">{error.name}: {error.message}</pre>
          <div className="crash-actions">
            <button className="btn-small" onClick={e => {
              const btn = e.currentTarget;
              navigator.clipboard.writeText(report).then(
                () => { btn.textContent = 'Copiado'; },
                () => { btn.textContent = 'No se pudo copiar'; },
              );
            }}>Copiar informe</button>
            <button className="btn-primary" onClick={() => location.reload()}>Recargar</button>
          </div>
          <textarea className="crash-report" readOnly value={report} aria-label="Informe del error"
            onFocus={e => e.currentTarget.select()} />
        </div>
      </div>
    );
  }
}
