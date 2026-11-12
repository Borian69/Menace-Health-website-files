import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, onUnauthorized, type ServerStatus } from './api';
import { ToastProvider } from './components/Toast';
import { LoginPage } from './pages/LoginPage';
import { RecordPage } from './pages/RecordPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';

// Hash-Routen: #/aufnahme · #/projekte · #/projekte/<id> · #/import
function useHash(): [string, (h: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/aufnahme');
  useEffect(() => {
    const f = () => setHash(window.location.hash.slice(1) || '/aufnahme');
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const go = useCallback((h: string) => { window.location.hash = h; }, []);
  return [hash, go];
}

export type Go = (h: string) => void;

export function App() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [hash, go] = useHash();
  const [kopf, setKopf] = useState({ p: 0, titel: '' });

  const pruefe = useCallback(() => {
    api.status().then((s) => { setStatus(s); setOffline(false); }).catch(() => setOffline(true));
  }, []);
  useEffect(() => { pruefe(); }, [pruefe]);
  useEffect(() => onUnauthorized(() => setStatus((s) => (s ? { ...s, authenticated: false } : s))), []);

  if (!status) {
    return (
      <div className="app-rahmen">
        <div className="seite">
          {offline ? (
            <div className="notice is-warning" role="alert">
              <span><strong>Server nicht erreichbar.</strong> Aufnehmen geht erst, wenn die Verbindung steht.
                <br /><button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={pruefe}>Erneut versuchen</button></span>
            </div>
          ) : <p className="muted">Lädt …</p>}
        </div>
      </div>
    );
  }
  if (status.auth_required && !status.authenticated) {
    return <ToastProvider><LoginPage onDone={pruefe} /></ToastProvider>;
  }

  const teile = hash.split('/').filter(Boolean);
  const tab = teile[0] === 'projekte' ? 1 : 0;
  const projektId = teile[0] === 'projekte' ? teile[1] : undefined;
  const importModus = teile[0] === 'import';
  const vorwahl = teile[0] === 'aufnahme' && teile[1] ? teile[1] : undefined;

  return (
    <ToastProvider>
      <div className="app-rahmen">
        <header className="leiste" style={{ ['--p' as string]: kopf.p }} aria-hidden="true">
          <span className="mini">{kopf.titel}</span>
        </header>
        <div className="seiten" style={{ transform: `translateX(${-tab * 100}%)` }}>
          <Seite aktiv={tab === 0} label="Aufnahme" onKopf={setKopf} schluessel="aufnahme">
            <RecordPage status={status} go={go} importModus={importModus} vorwahl={vorwahl} />
          </Seite>
          <Seite aktiv={tab === 1} label="Projekte" onKopf={setKopf} schluessel={projektId ?? 'liste'}>
            {projektId ? <ProjectPage id={projektId} status={status} go={go} aktiv={tab === 1} /> : <ProjectsPage go={go} aktiv={tab === 1} />}
          </Seite>
        </div>
        <nav className="tabs" role="tablist" aria-label="Bereiche">
          <span className="ind" style={{ left: `calc(${25 + tab * 50}% - 18px)` }} />
          <button role="tab" aria-selected={tab === 0} onClick={() => go('/aufnahme')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>
            Aufnahme
          </button>
          <button role="tab" aria-selected={tab === 1} onClick={() => go('/projekte')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v10h-17z" /></svg>
            Projekte
          </button>
        </nav>
      </div>
    </ToastProvider>
  );
}

/** Eine Seite im Rahmen. Beim Scrollen wandert ihr Titel in die Glasleiste (--p). */
function Seite({ aktiv, label, children, onKopf, schluessel }: {
  aktiv: boolean; label: string; children: ReactNode; schluessel: string;
  onKopf: (k: { p: number; titel: string }) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const melde = useCallback(() => {
    const el = ref.current;
    if (!el || !aktiv) return;
    const p = Math.min(1, Math.max(0, (el.scrollTop - 20) / 60));
    onKopf({ p, titel: el.querySelector('.app-kopf h1')?.textContent ?? '' });
  }, [aktiv, onKopf]);
  // Neue Ansicht: oben beginnen, Leiste neu bestimmen.
  useEffect(() => { ref.current?.scrollTo({ top: 0 }); }, [schluessel]);
  useEffect(() => { melde(); }, [melde, schluessel]);
  return (
    <section className="seite" ref={ref} aria-label={label} aria-hidden={!aktiv} inert={!aktiv} onScroll={melde}>
      {children}
    </section>
  );
}
