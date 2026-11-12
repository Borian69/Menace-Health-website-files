import { useEffect, useState, type FormEvent } from 'react';
import type { ServerStatus } from '../api';
import type { Go } from '../App';
import { useToast } from '../components/Toast';
import { pruefeSchluessel } from '../engine/geraet/openrouter';
import { dollar, groesse } from '../lib/format';
import { speichereEinstellungen, STANDARD, useEinstellungen } from '../lib/einstellungen';

export function SettingsPage({ status, go, onGeaendert }: { status: ServerStatus; go: Go; onGeaendert: () => void }) {
  const e = useEinstellungen();
  const toast = useToast();
  const [key, setKey] = useState(e.apiKey);
  const [zeigen, setZeigen] = useState(false);
  const [pruefung, setPruefung] = useState<{ ok: boolean; text: string } | null>(null);
  const [prueft, setPrueft] = useState(false);
  const [stt, setStt] = useState(e.sttModel);
  const [llm, setLlm] = useState(e.llmModel);
  const [sprache, setSprache] = useState(e.sprache);
  const [speicher, setSpeicher] = useState<{ belegt: number; frei: number; dauerhaft: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const est = await navigator.storage?.estimate?.();
        const dauerhaft = (await navigator.storage?.persisted?.()) ?? false;
        if (est) setSpeicher({ belegt: est.usage ?? 0, frei: est.quota ?? 0, dauerhaft });
      } catch { /* nicht verfügbar */ }
    })();
  }, []);

  const pruefe = async (k: string) => {
    setPrueft(true);
    setPruefung(null);
    try {
      const info = await pruefeSchluessel(k);
      const teile = ['Schlüssel gültig'];
      if (info.usage != null) teile.push(`verbraucht ${dollar(info.usage)}`);
      if (info.limit != null) teile.push(`Limit ${dollar(info.limit)}`);
      if (info.rest != null) teile.push(`übrig ${dollar(info.rest)}`);
      setPruefung({ ok: true, text: teile.join(' · ') + '.' });
      return true;
    } catch (err) {
      const m = (err as Error).message;
      setPruefung({ ok: false, text: m === 'Failed to fetch' ? 'openrouter.ai ist nicht erreichbar. Internetverbindung prüfen.' : m });
      return false;
    } finally { setPrueft(false); }
  };

  const speichereKey = async (ev: FormEvent) => {
    ev.preventDefault();
    speichereEinstellungen({ apiKey: key.trim() });
    onGeaendert();
    toast('Gespeichert.', 'Der Schlüssel liegt jetzt auf diesem Gerät.');
    if (key.trim()) await pruefe(key);
  };

  const speichereModelle = (ev: FormEvent) => {
    ev.preventDefault();
    speichereEinstellungen({ sttModel: stt.trim(), llmModel: llm.trim(), sprache: sprache.trim().toLowerCase() });
    onGeaendert();
    toast('Gespeichert.', 'Gilt ab der nächsten Verarbeitung.');
  };

  const geaendert = key.trim() !== e.apiKey;

  return (
    <>
      {/* Zurück dorthin, woher man kam (z. B. aus einem Projekt) */}
      <button className="btn btn-quiet zurueck" onClick={() => (history.length > 1 ? history.back() : go('/aufnahme'))}>‹ Zurück</button>
      <div className="app-kopf">
        <h1>Einstellungen</h1>
        <p className="kz">Gelten nur für dieses Gerät</p>
      </div>

      {status.betrieb === 'server' ? (
        <section className="gruppe notice is-info">
          <span><strong>Eigener Server.</strong> Diese Installation verarbeitet auf dem Server. Schlüssel und Modelle stehen
            dort in der Datei <span className="n">.env</span> – hier ist nichts einzutragen.</span>
        </section>
      ) : (
        <>
          <form className="gruppe stapel-eng" onSubmit={speichereKey}>
            <p className="eyebrow">OpenRouter-Schlüssel</p>
            <div className={`field${pruefung && !pruefung.ok ? ' has-error' : ''}${pruefung?.ok ? ' is-valid' : ''}`} style={{ maxWidth: 'none' }}>
              <label htmlFor="api-key">API-Schlüssel</label>
              <input id="api-key" type={zeigen ? 'text' : 'password'} value={key} autoComplete="off" spellCheck={false}
                placeholder="sk-or-v1-…" onChange={(ev) => { setKey(ev.target.value); setPruefung(null); }} />
              <p className="field-msg" aria-live="polite">
                {pruefung ? pruefung.text : e.apiKey ? 'Ein Schlüssel ist hinterlegt.' : 'Noch kein Schlüssel hinterlegt.'}
              </p>
            </div>
            <label className="schalter">
              <input type="checkbox" checked={zeigen} onChange={(ev) => setZeigen(ev.target.checked)} /> Schlüssel anzeigen
            </label>
            <div className="row">
              {geaendert && <button className="btn btn-primary" type="submit">Schlüssel speichern</button>}
              {!geaendert && e.apiKey && (
                <button className="btn btn-ghost" type="button" onClick={() => void pruefe(e.apiKey)} disabled={prueft} aria-busy={prueft}>
                  Schlüssel prüfen
                </button>
              )}
            </div>
            <p className="klein muted">
              Einen Schlüssel gibt es unter <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>.
              Er bleibt auf diesem Gerät und geht nur an openrouter.ai. Wer das entsperrte Gerät hat, kann ihn sehen –
              deshalb bei OpenRouter für diesen Schlüssel ein Ausgabenlimit setzen, z. B. 5 $.
            </p>
          </form>

          <form className="gruppe stapel-eng" onSubmit={speichereModelle}>
            <details className="hinweis">
              <summary className="lb">Modelle und Sprache</summary>
              <div className="stapel-eng">
                <div className="field" style={{ maxWidth: 'none' }}>
                  <label htmlFor="stt">Transkription (OpenRouter-Modell)</label>
                  <input id="stt" value={stt} spellCheck={false} onChange={(ev) => setStt(ev.target.value)} placeholder={STANDARD.sttModel} />
                </div>
                <div className="field" style={{ maxWidth: 'none' }}>
                  <label htmlFor="llm">Zusammenfassung (OpenRouter-Modell)</label>
                  <input id="llm" value={llm} spellCheck={false} onChange={(ev) => setLlm(ev.target.value)} placeholder={STANDARD.llmModel} />
                </div>
                <div className="field">
                  <label htmlFor="sprache">Sprache der Aufnahmen</label>
                  <input id="sprache" value={sprache} maxLength={5} onChange={(ev) => setSprache(ev.target.value)} placeholder="de" />
                  <p className="field-msg">ISO-Kürzel, z. B. de oder en. Leer = automatisch erkennen.</p>
                </div>
                <div className="row">
                  <button className="btn btn-ghost" type="submit">Modelle speichern</button>
                  <button className="btn btn-quiet" type="button" onClick={() => { setStt(STANDARD.sttModel); setLlm(STANDARD.llmModel); setSprache(STANDARD.sprache); }}>
                    Standard
                  </button>
                </div>
              </div>
            </details>
          </form>

          <section className="gruppe stapel-eng">
            <p className="eyebrow">Daten</p>
            <p>Projekte, Aufnahmen und Ergebnisse liegen nur auf diesem Gerät. Ein anderes Gerät sieht sie nicht.
              Wichtiges als Markdown exportieren (in der Projektansicht).</p>
            {speicher && (
              <p className="dataline offen">
                <span>Belegt <b className="n">{groesse(speicher.belegt)}</b></span>
                <span>Verfügbar <b className="n">{groesse(speicher.frei)}</b></span>
                <span>Vor Löschen geschützt <b>{speicher.dauerhaft ? 'ja' : 'nein'}</b></span>
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}
