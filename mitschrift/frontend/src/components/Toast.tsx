import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Zeige = (wort: string, rest?: string) => void;
const Ctx = createContext<Zeige>(() => undefined);

/** Toast: erscheint nach einer Handlung, mit Wort, geht nach 3,2 s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ wort: string; rest?: string } | null>(null);
  const [da, setDa] = useState(false);
  const timer = useRef<number>(0);
  const zeige = useCallback<Zeige>((wort, rest) => {
    window.clearTimeout(timer.current);
    setMsg({ wort, rest });
    requestAnimationFrame(() => setDa(true));
    timer.current = window.setTimeout(() => setDa(false), 3200);
  }, []);
  return (
    <Ctx.Provider value={zeige}>
      {children}
      <div className={`toast${da ? ' da' : ''}`} role="status" aria-live="polite">
        {msg && <span><b>{msg.wort}</b>{msg.rest ? ` ${msg.rest}` : ''}</span>}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
