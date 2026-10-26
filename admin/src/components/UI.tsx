import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';
import { STATUS_LABELS } from '../lib/format';
import type { ImageStatus } from '../lib/types';

export function Brand() {
  return <span className="brand"><svg viewBox="0 0 32 42" aria-hidden="true"><path d="M3 39V18Q3 6 16 2Q29 6 29 18V39M8 39V19Q8 10 16 7Q24 10 24 19V39M16 15V39" /></svg><span>EŞİK<small>YÖNETİM PANELİ</small></span></span>;
}
export function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`admin-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
export function Issues({ list }: { list: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (list.length) ref.current?.focus(); }, [list.length]);
  if (!list.length) return null;
  return <div className="admin-issues" role="alert" tabIndex={-1} ref={ref}><strong>Kaydetmeden önce düzelt:</strong><ul>{list.map(i => <li key={i}>{i}</li>)}</ul></div>;
}
export function Status({ value }: { value: ImageStatus | 'removed' }) { return <span className={`status ${value}`}>{STATUS_LABELS[value]}</span>; }
export function PageHead({ kicker, title, children, actions }: { kicker: string; title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return <header className="page-head"><div><p className="eyebrow"><span />{kicker}</p><h1>{title}</h1>{children && <p>{children}</p>}</div>{actions && <div className="admin-actions">{actions}</div>}</header>;
}
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav className="pager" aria-label="Sayfalar"><span>{total.toLocaleString('tr-TR')} kayıt · sayfa {page} / {pages}</span>
    <button className="button line small" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Önceki</button>
    <button className="button line small" disabled={page >= pages} onClick={() => onPage(page + 1)}>Sonraki →</button></nav>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const dialog = ref.current; const previous = document.activeElement as HTMLElement;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="modal" onCancel={e => { e.preventDefault(); close.current(); }} onClick={e => { if (e.target === e.currentTarget) close.current(); }} aria-label={title}><div className="modal-content"><button className="icon-button modal-close" onClick={onClose} aria-label="Kapat"><X /></button><h2>{title}</h2>{children}</div></dialog>;
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
