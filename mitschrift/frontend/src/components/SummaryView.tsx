import type { Eintrag, Summary } from '../api';
import { liesQuelle } from '../lib/format';

type Springe = (nr: number, sek: number) => void;

function Quelle({ q, springe }: { q: string; springe: Springe }) {
  if (!q) return null;
  const ziel = liesQuelle(q);
  return ziel ? (
    <button type="button" className="quelle n" onClick={() => springe(ziel.nr, ziel.sek)} title="An diese Stelle springen">{q}</button>
  ) : <span className="quelle n">{q}</span>;
}

function Liste({ items, springe, aufgabe }: { items: Eintrag[]; springe: Springe; aufgabe?: boolean }) {
  return (
    <ul className="punkte">
      {items.map((e, i) => (
        <li key={i}>
          {e.text}
          {aufgabe && (e.wer || e.bis) && (
            <span className="aufgabe-meta">
              {e.wer && <span><span className="lb">Wer</span>{e.wer}</span>}
              {e.bis && <span><span className="lb">Bis</span>{e.bis}</span>}
            </span>
          )}
          <Quelle q={e.quelle} springe={springe} />
        </li>
      ))}
    </ul>
  );
}

function Abschnitt({ nr, titel, children }: { nr: string; titel: string; children: React.ReactNode }) {
  return (
    <section className="gruppe zf-abschnitt">
      <p className="eyebrow"><span className="n">{nr}</span> {titel}</p>
      {children}
    </section>
  );
}

/** Die sieben Abschnitte in fester Reihenfolge; leere bleiben weg. */
export function SummaryView({ s, springe }: { s: Summary; springe: Springe }) {
  const has = (k: keyof Summary) => Array.isArray(s[k]) && (s[k] as unknown[]).length > 0;
  return (
    <div className="zusammenfassung">
      {s.ueberblick && (
        <Abschnitt nr="01" titel="Überblick">
          <p className="lead ueberblick">{s.ueberblick}</p>
        </Abschnitt>
      )}
      {has('erkenntnisse') && <Abschnitt nr="02" titel="Wichtigste Erkenntnisse"><Liste items={s.erkenntnisse} springe={springe} /></Abschnitt>}
      {has('themen') && (
        <Abschnitt nr="03" titel="Themen">
          {s.themen.map((t, i) => (
            <div className="thema" key={i}>
              <h3>{t.titel}</h3>
              <Liste items={t.punkte} springe={springe} />
              {t.unterthemen.map((u, j) => (
                <div className="unterthema" key={j}>
                  <h4>{u.titel}</h4>
                  <Liste items={u.punkte} springe={springe} />
                </div>
              ))}
            </div>
          ))}
        </Abschnitt>
      )}
      {has('fakten') && <Abschnitt nr="04" titel="Fakten, Zahlen, Fachbegriffe"><Liste items={s.fakten} springe={springe} /></Abschnitt>}
      {has('entscheidungen') && <Abschnitt nr="05" titel="Entscheidungen und Ergebnisse"><Liste items={s.entscheidungen} springe={springe} /></Abschnitt>}
      {has('aufgaben') && <Abschnitt nr="06" titel="Aufgaben"><Liste items={s.aufgaben} springe={springe} aufgabe /></Abschnitt>}
      {has('offene_fragen') && <Abschnitt nr="07" titel="Offene Fragen"><Liste items={s.offene_fragen} springe={springe} /></Abschnitt>}
      {has('widersprueche') && (
        <Abschnitt nr="!" titel="Widersprüche zwischen Aussagen">
          <p className="klein muted">Nicht aufgelöst – beide Fassungen stehen da.</p>
          <Liste items={s.widersprueche} springe={springe} />
        </Abschnitt>
      )}
      {has('unklar') && (
        <Abschnitt nr="?" titel="Unklare Stellen">
          <p className="klein muted">Akustisch unklar oder vermutlich falsch erkannt. Im Audio nachhören.</p>
          <Liste items={s.unklar} springe={springe} />
        </Abschnitt>
      )}
    </div>
  );
}
