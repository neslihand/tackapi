import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

export function Brand() {
  return <span className="brand"><svg viewBox="0 0 32 42" aria-hidden="true"><path d="M3 39V18Q3 6 16 2Q29 6 29 18V39M8 39V19Q8 10 16 7Q24 10 24 19V39M16 15V39" /></svg><span>EŞİK<small>YAZAR PANELİ</small></span></span>;
}
export function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`admin-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function PageHead({ kicker, title, children, actions }: { kicker: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return <header className="page-head"><div><p className="eyebrow"><span />{kicker}</p><h1>{title}</h1>{children && <p>{children}</p>}</div>{actions && <div className="admin-actions">{actions}</div>}</header>;
}

// Bildirim (toast): işlemin sonucunu ekran okuyuculara da duyurur
type Toast = { text: string; error?: boolean } | null;
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const notify = useCallback((text: string, error = false) => {
    clearTimeout(timer.current); setToast({ text, error });
    timer.current = setTimeout(() => setToast(null), error ? 9000 : 4000);
  }, []);
  return <ToastContext.Provider value={notify}>{children}
    <div role="status" aria-live="polite" className="sr-only">{toast?.text}</div>
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.error ? <AlertTriangle size={18} /> : <Check size={18} />}<span>{toast.text}</span><button className="icon-button" onClick={() => setToast(null)} aria-label="Bildirimi kapat"><X size={16} /></button></div>}
  </ToastContext.Provider>;
}
export const useToast = () => useContext(ToastContext);

/** Veri yükleme kancası: { data, error, loading, reload }. deps değişince yeniden yükler, eski isteği yok sayar. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string; loading: boolean }>({ data: null, error: '', loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState(s => ({ ...s, loading: true, error: '' }));
    load().then(data => alive && setState({ data, error: '', loading: false }))
      .catch((e: Error) => alive && setState(s => ({ ...s, error: e.message, loading: false })));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick(t => t + 1) };
}
