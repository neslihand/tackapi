import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X, ArrowUpRight, DoorOpen, Landmark, Compass, Map, Shield, Sparkles, Puzzle, Search, Eye } from 'lucide-react';
import { Link } from '../lib/navigation';
import { Girih } from './PlayArt';

export const symbols = { door: DoorOpen, building: Landmark, compass: Compass, map: Map, shield: Shield, sparkles: Sparkles, puzzle: Puzzle, search: Search, eye: Eye };
export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className="brand" aria-label="EŞİK ana sayfa"><svg viewBox="0 0 32 42" aria-hidden="true"><path d="M3 39V18Q3 6 16 2Q29 6 29 18V39M8 39V19Q8 10 16 7Q24 10 24 19V39M16 15V39" /></svg><span>EŞİK{!compact && <small>TARİHE AÇILAN KAPI</small>}</span></Link>;
}
export function Scene({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`theme-scene ${className}`}><Girih className="theme-girih" />{children}</div>;
}
export function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) { return <p className={`eyebrow ${light ? 'light' : ''}`}><span />{children}</p>; }
export function ArrowLink({ to, children }: { to: string; children: ReactNode }) { return <Link className="text-link" to={to}>{children}<ArrowUpRight size={18} /></Link>; }
export function PageHeading({ kicker, title, children }: { kicker: string; title: ReactNode; children?: ReactNode }) { return <header className="page-heading"><Eyebrow>{kicker}</Eyebrow><h1>{title}</h1>{children && <p className="intro-copy">{children}</p>}</header>; }
export function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const dialog = ref.current; const previous = document.activeElement as HTMLElement;
    dialog?.showModal();
    const before = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = before; if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} onCancel={e => { e.preventDefault(); close.current(); }} onClick={e => { if (e.target === e.currentTarget) close.current(); }} aria-labelledby={titleId}><div className="modal-content"><button className="icon-button modal-close" onClick={onClose} aria-label="Kapat" autoFocus><X aria-hidden="true" /></button><h2 id={titleId}>{title}</h2>{children}</div></dialog>;
}
