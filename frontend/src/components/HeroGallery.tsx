import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Expand, Pause, Play, X } from 'lucide-react';
import { useReducedMotion } from 'framer-motion';
import { t } from '../lib/i18n';

export type Slide = { src: string; alt: string; credit: string };

const pad = (n: number) => String(n).padStart(2, '0');
const DWELL = 6000;

// The pictures of a work at the top of its page: a card that turns to the next photo by itself, with arrows,
// a swipe, a pause button and a larger view. Photos are fetched as they come up, not all at once. It stops turning
// while the pointer or focus is on it, while the tab is hidden and for visitors who ask for less motion.
// The book's photos are small (the inventory PDFs hold them at 75 dpi), so a picture narrower than the card is shown at
// its own size over a blurred fill of itself instead of being stretched into a blur of pixels.
export function HeroGallery({ slides, name, note, badge }: { slides: Slide[]; name: string; note: string; badge?: ReactNode }) {
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState(() => new Set([0, 1]));
  const [small, setSmall] = useState(() => new Set<number>());
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [open, setOpen] = useState(false);
  const still = Boolean(useReducedMotion());
  const many = slides.length > 1;
  const playing = many && !still && !paused && !held && !open;
  const start = useRef<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const expand = useRef<HTMLButtonElement>(null);
  const slide = slides[index];

  function go(next: number) {
    const i = (next + slides.length) % slides.length;
    setIndex(i);
    setSeen(s => s.has(i) && s.has((i + 1) % slides.length) ? s : new Set([...s, i, (i + 1) % slides.length]));
  }
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => { if (document.visibilityState === 'visible') go(index + 1); }, DWELL);
    return () => clearTimeout(timer);
  }, [playing, index]);
  useEffect(() => {
    const d = dialog.current;
    if (open) d?.showModal(); else if (d?.open) { d.close(); expand.current?.focus(); }
  }, [open]);

  function swipeStart(event: PointerEvent) { start.current = event.clientX; }
  function swipeEnd(event: PointerEvent) {
    if (start.current === null) return;
    const moved = event.clientX - start.current;
    start.current = null;
    if (Math.abs(moved) > 40) go(index + (moved < 0 ? 1 : -1));
  }
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(index + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(index - 1); }
  };

  return <div className="hg" role="region" aria-roledescription={t('fotoğraf gösterisi', 'slideshow')} aria-label={t(`${name} fotoğrafları`, `Photos of ${name}`)}
    onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setHeld(false); }} onKeyDown={many ? keys : undefined}>
    <div className="hg-frame" onPointerDown={many ? swipeStart : undefined} onPointerUp={many ? swipeEnd : undefined} onPointerCancel={() => { start.current = null; }}>
      {slides.map((s, i) => <div key={s.src} className={`hg-slide ${i === index ? 'on' : ''}`} role="group" aria-roledescription={t('fotoğraf', 'slide')} aria-label={`${i + 1} / ${slides.length}`} aria-hidden={i !== index}>
        {seen.has(i) && small.has(i) && <img className="hg-fill" src={s.src} alt="" aria-hidden="true" draggable={false} />}
        {seen.has(i) && <img className={small.has(i) ? 'hg-natural' : undefined} src={s.src} alt={s.alt} draggable={false} decoding="async"
          onLoad={e => { const img = e.currentTarget, box = img.parentElement?.clientWidth ?? 0; if (img.naturalWidth < box * 0.85) setSmall(set => set.has(i) ? set : new Set([...set, i])); }} />}
      </div>)}
      {badge}
      {many && <span className="hg-progress" aria-hidden="true"><i key={`${index}-${playing}`} className={playing ? 'run' : ''} /></span>}
    </div>
    <div className="hg-bar">
      {many && <>
        <button type="button" className="hg-button" onClick={() => go(index - 1)} aria-label={t('Önceki fotoğraf', 'Previous photo')}><ChevronLeft size={18} aria-hidden="true" /></button>
        <p className="hg-count" aria-live={playing ? 'off' : 'polite'}><b>{pad(index + 1)}</b><span>/ {pad(slides.length)}</span></p>
        <button type="button" className="hg-button" onClick={() => go(index + 1)} aria-label={t('Sonraki fotoğraf', 'Next photo')}><ChevronRight size={18} aria-hidden="true" /></button>
        {!still && <button type="button" className="hg-button" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? t('Gösteriyi sürdür', 'Resume the slideshow') : t('Gösteriyi duraklat', 'Pause the slideshow')}>{paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}</button>}
      </>}
      <button ref={expand} type="button" className="hg-button hg-expand" onClick={() => setOpen(true)} aria-label={t('Fotoğrafı büyüt', 'Enlarge the photo')}><Expand size={16} aria-hidden="true" /></button>
    </div>
    {/* The credit names a Turkish book: marked Turkish so its capitals keep their dotted İ on the English page. */}
    <p className="hg-caption">{note}{note && slide.credit && ' · '}{slide.credit && <span lang="tr">{slide.credit}</span>}</p>
    <dialog ref={dialog} className="hg-lightbox" aria-label={slide.alt} onCancel={e => { e.preventDefault(); setOpen(false); }} onKeyDown={many ? keys : undefined}>
      {open && <figure><img src={slide.src} alt={slide.alt} /><figcaption>{[slide.alt, slide.credit].filter(Boolean).join(' · ')}{many && ` · ${index + 1} / ${slides.length}`}</figcaption></figure>}
      <button type="button" className="hg-lb-close" onClick={() => setOpen(false)} aria-label={t('Kapat', 'Close')}><X aria-hidden="true" /></button>
      {many && <><button type="button" className="hg-lb-nav prev" onClick={() => go(index - 1)} aria-label={t('Önceki fotoğraf', 'Previous photo')}><ChevronLeft aria-hidden="true" /></button>
        <button type="button" className="hg-lb-nav next" onClick={() => go(index + 1)} aria-label={t('Sonraki fotoğraf', 'Next photo')}><ChevronRight aria-hidden="true" /></button></>}
    </dialog>
  </div>;
}
