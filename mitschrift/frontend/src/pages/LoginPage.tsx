import { useState, type FormEvent } from 'react';
import { api } from '../api';

export function LoginPage({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const senden = async (e: FormEvent) => {
    e.preventDefault();
    setLaeuft(true);
    setFehler(null);
    try {
      await api.login(pw);
      onDone();
    } catch (err) {
      setFehler((err as Error).message);
    } finally { setLaeuft(false); }
  };

  return (
    <div className="app-rahmen">
      <div className="seite">
        <div className="app-kopf">
          <h1>Mitschrift</h1>
          <p className="kz">Anmeldung</p>
        </div>
        <form className="gruppe" onSubmit={senden}>
          <div className={`field${fehler ? ' has-error' : ''}`}>
            <label htmlFor="pw">Passwort</label>
            <input id="pw" type="password" autoComplete="current-password" autoFocus value={pw}
              onChange={(e) => setPw(e.target.value)} />
            <p className="field-msg" aria-live="polite">{fehler ?? 'Das Passwort steht als APP_PASSWORD in der .env des Servers.'}</p>
          </div>
          <button className="btn btn-primary btn-block" type="submit" disabled={!pw || laeuft} aria-busy={laeuft}>Anmelden</button>
        </form>
      </div>
    </div>
  );
}
