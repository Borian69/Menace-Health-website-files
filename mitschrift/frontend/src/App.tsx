import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, onUnauthorized, waehleEngine, type ServerStatus } from './api';
import { ToastProvider } from './components/Toast';
import { LoginPage } from './pages/LoginPage';
import { RecordPage } from './pages/RecordPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectPage } from './pages/ProjectPage';
import { SettingsPage } from './pages/SettingsPage';

// Hash-Routen: #/aufnahme · #/projekte · #/projekte/<id> · #/import · #/einstellungen
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

  // Beim Start: eigener Server oder Gerätebetrieb? Danach Status holen.
  const pruefe = useCallback(() => {
    waehleEngine()
      .then(() => api.status())
      .then((s) => { setStatus(s); setOffline(false); })
      .catch(() => setOffline(true));
  }, []);
  useEffect(() => { pruefe(); }, [pruefe]);
  useEffect(() => onUnauthorized(() => setStatus((s) => (s ? { ...s, authenticated: false } : s))), []);

  if (!status) {
    return (
      <div className="app-rahmen">
        <div className="seite">
          {offline ? (
            <div className="notice is-warning" role="alert">
              <span><strong>Start fehlgeschlagen.</strong> Server oder Gerätespeicher nicht erreichbar. Im privaten Modus mancher Browser fehlt der Speicher.
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
  const tab = teile[0] === 'projekte' ? 1 : teile[0] === 'einstellungen' ? 2 : 0;
  const projektId = teile[0] === 'projekte' ? teile[1] : undefined;
  const importModus = teile[0] === 'import';
  const vorwahl = teile[0] === 'aufnahme' && teile[1] ? teile[1] : undefined;

  return (
    <ToastProvider>
      <div className="app-rahmen">
        <header className="leiste" style={{ ['--p' as string]: kopf.p }}>
          <span className="mini" aria-hidden="true">{kopf.titel}</span>
          {tab !== 2 && (
            <button className="icon-btn" aria-label="Einstellungen" onClick={() => go('/einstellungen')}>
              {status.betrieb === 'geraet' && !status.llm_ready && <span className="punkt" aria-hidden="true" />}
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>
            </button>
          )}
        </header>
        <div className="seiten" style={{ transform: `translateX(${-tab * 100}%)` }}>
          <Seite aktiv={tab === 0} label="Aufnahme" onKopf={setKopf} schluessel="aufnahme">
            <RecordPage status={status} go={go} importModus={importModus} vorwahl={vorwahl} />
          </Seite>
          <Seite aktiv={tab === 1} label="Projekte" onKopf={setKopf} schluessel={projektId ?? 'liste'}>
            {projektId ? <ProjectPage id={projektId} status={status} go={go} aktiv={tab === 1} /> : <ProjectsPage go={go} aktiv={tab === 1} />}
          </Seite>
          <Seite aktiv={tab === 2} label="Einstellungen" onKopf={setKopf} schluessel="einstellungen">
            {tab === 2 && <SettingsPage status={status} go={go} onGeaendert={pruefe} />}
          </Seite>
        </div>
        <nav className="tabs" role="tablist" aria-label="Bereiche">
          <span className="ind" style={{ left: `calc(${25 + tab * 50}% - 18px)`, opacity: tab === 2 ? 0 : 1 }} />
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
