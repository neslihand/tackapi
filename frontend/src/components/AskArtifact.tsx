import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { chatEndpoint } from '../lib/chatApi';
import type { NarrationMode } from '../lib/preferences';

// The panel's code loads on the first click, so the story page does not pay for it up front.
const ArtifactChat = lazy(() => import('./ArtifactChat').then(m => ({ default: m.ArtifactChat })));

export function AskArtifact({ artifact, mode, chapter }: { artifact: DiscoveryArtifact; mode: NarrationMode; chapter?: number }) {
  const endpoint = chatEndpoint();
  const offered = Boolean(endpoint) || import.meta.env.DEV;
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [inlineVisible, setInlineVisible] = useState(true);
  const [mounted, setMounted] = useState(false);
  const inline = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (open) { wasOpen.current = true; return; }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    // Runs after the panel has closed and the page is no longer inert: focus goes back to whichever button opened
    // the panel, or to the toolbar one if that is hidden now.
    const target = opener.current?.isConnected && opener.current.getClientRects().length ? opener.current : inline.current;
    target?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    const button = inline.current;
    if (!button || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setInlineVisible(entry.isIntersecting));
    observer.observe(button);
    return () => observer.disconnect();
  }, [offered]);
  if (!offered) return null;
  const show = (from: HTMLButtonElement) => { opener.current = from; setLoaded(true); setOpen(true); };
  const close = () => setOpen(false);
  const props = { 'aria-expanded': open, 'aria-controls': loaded ? panelId : undefined, 'aria-haspopup': 'dialog' as const };
  return <>
    <button ref={inline} className="ask-button" onClick={e => show(e.currentTarget)} {...props}>
      <span className="ask-button-icon" aria-hidden="true"><MessageCircle size={16} /></span><span>Esere Sor</span><small>Yapay zekâ</small>
    </button>
    {mounted && createPortal(<button className={`ask-fab ${!inlineVisible && !open ? 'visible' : ''}`} onClick={e => show(e.currentTarget)} {...props} tabIndex={inlineVisible || open ? -1 : undefined} aria-hidden={inlineVisible || open ? true : undefined}>
      <MessageCircle size={18} aria-hidden="true" /><span>Esere Sor</span>
    </button>, document.body)}
    {loaded && <Suspense fallback={null}><ArtifactChat id={panelId} artifact={artifact} mode={mode} chapter={chapter} endpoint={endpoint} open={open} onClose={close} /></Suspense>}
  </>;
}
