import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { authorApi, type MonumentHit } from '../lib/author';

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

/** Sistemdeki eser kaydını arama kutusu (WAI-ARIA combobox): yazdıkça arar; ok tuşları, Enter ve Escape ile kullanılır. */
export function MonumentPicker({ label, onPick, city }: { label: string; onPick: (m: MonumentHit) => void; city?: string }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MonumentHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const picked = useRef(false);   // seçimden sonra kutuya yazılan ad yeniden aranmasın
  const id = useId();
  useEffect(() => {
    if (picked.current) { picked.current = false; return; }
    if (q.trim().length < 2) { setItems([]); return; }
    let alive = true;
    const t = setTimeout(() => authorApi.monuments(q.trim(), city)
      .then(r => { if (alive) { setItems(r); setActive(0); setOpen(true); } }).catch(() => {}), 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, city]);
  function pick(m: MonumentHit) { onPick(m); picked.current = m.name_tr !== q; setQ(m.name_tr); setOpen(false); }
  return <div className="combo admin-field"><span id={`${id}-label`}>{label}</span>
    <input type="search" role="combobox" aria-labelledby={`${id}-label`} aria-expanded={open && items.length > 0}
      aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open && items[active] ? `${id}-${active}` : undefined}
      placeholder="Eser adını yazın…" value={q} onChange={e => { setQ(e.target.value); setOpen(true); }}
      onBlur={() => setTimeout(() => setOpen(false), 150)}
      onKeyDown={e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, items.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
        else if (e.key === 'Enter' && open && items[active]) { e.preventDefault(); pick(items[active]); }
        else if (e.key === 'Escape') setOpen(false);
      }} />
    {open && items.length > 0 && <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`}>
      {items.map((m, i) => <li key={m.slug} id={`${id}-${i}`} role="option" aria-selected={i === active}
        onMouseDown={e => { e.preventDefault(); pick(m); }}>{m.name_tr}<small>{m.city_tr}{m.district ? ` / ${m.district}` : ''}</small></li>)}
    </ul>}
    {open && q.trim().length >= 2 && !items.length && <small>Eşleşen eser yok.</small>}
  </div>;
}
