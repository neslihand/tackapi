import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, RotateCcw } from 'lucide-react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import type { DiscoveryArtifact as Artifact } from '../lib/artifactContract';
import { useTilt } from '../components/PlayScenes';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';

// The knowledge cards as a hand of cards: fanned in an arc around the one in front. Choosing a card (pointer, focus,
// the arrows or the arrow keys) turns the hand until it is in front; it can then be turned over to read its story.
// The cards are dealt from a pile the first time the hand comes into view.

const pad = (n: number) => String(n).padStart(2, '0');

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function KnowledgeCards({ flipped, onFlip }: { flipped: string[]; onFlip: (id: string) => void }) {
  const { artifacts } = useContent();
  const [active, setActive] = useState(0);
  const stage = useRef<HTMLUListElement>(null);
  const width = useWidth(stage);
  const dealt = useInView(stage, { once: true, amount: 0.3 });
  const still = Boolean(useReducedMotion());
  // While the hand is being dealt the cards leave the pile one after another; later moves are immediate.
  const [dealing, setDealing] = useState(true);
  useEffect(() => { if (!dealt) return; const timer = setTimeout(() => setDealing(false), 1400); return () => clearTimeout(timer); }, [dealt]);
  if (!artifacts.length) return <p role="status">Bu koleksiyonda henüz bilgi kartı yok.</p>;
  const n = artifacts.length;
  const narrow = width < 640;
  const cardWidth = narrow ? Math.min(270, width * 0.8) : 320;
  const reach = Math.ceil((n - 1) / 2);
  // Spread the hand so the outermost cards, tilted, still end inside the stage.
  const step = Math.max(26, Math.min(140, (width - cardWidth) / 2 / (reach + 0.75)));
  // Position in the hand relative to the front card: 0 in front, negative to the left, positive to the right.
  const offset = (i: number) => ((i - active + n + Math.floor(n / 2)) % n) - Math.floor(n / 2);
  function choose(index: number, focus = false) {
    const next = (index + n) % n;
    setActive(next);
    if (focus) requestAnimationFrame(() => stage.current?.querySelectorAll<HTMLElement>('.flip-slot')[next]?.querySelector<HTMLElement>('.flip-card:not(.turned) .flip-turn, .flip-card.turned .flip-return')?.focus());
  }
  function keys(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    choose(active + (event.key === 'ArrowRight' ? 1 : -1), true);
  }
  const current = artifacts[active];
  return <div className="deck">
    <div className="flip-bar"><p><strong>{artifacts.filter(a => flipped.includes(a.id)).length}</strong> / {n} KART KEŞFEDİLDİ <span>· Bu oturumda</span></p>
      <ol className="deck-pips" aria-hidden="true">{artifacts.map((a, i) => <li key={a.id} className={`${flipped.includes(a.id) ? 'seen' : ''} ${i === active ? 'here' : ''}`} />)}</ol></div>
    <ul className="flip-grid deck-hand" ref={stage} onKeyDown={keys} style={{ height: narrow ? cardWidth * 1.46 + 120 : 620 }} aria-label="Bilgi kartları destesi; kartlar arasında sağ ve sol ok tuşlarıyla gezinebilirsin">
      {artifacts.map((artifact, i) => {
        const k = offset(i), far = Math.abs(k);
        const place = still || dealt
          ? { x: k * step, y: far ** 1.35 * (narrow ? 14 : 24) + (k === 0 ? -12 : 0), rotate: k * (narrow ? 6 : 8.5), scale: k === 0 ? 1 : 0.9 - far * 0.035, opacity: 1 }
          : { x: 0, y: 140, rotate: (i % 2 ? 1 : -1) * 4, scale: 0.84, opacity: 0 };
        return <motion.li key={artifact.id} className={`flip-slot ${k === 0 ? 'front' : ''}`} style={{ width: cardWidth, marginLeft: -cardWidth / 2, zIndex: 20 - far * 2 + (k < 0 ? 0 : 1) }}
          initial={false} animate={place} transition={still ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 17, mass: 0.9, delay: dealing ? i * 0.08 : 0 }}
          onPointerDown={() => { if (k !== 0) choose(i); }}>
          <FlipCard artifact={artifact} index={i} front={k === 0} onFlip={onFlip} onSelect={() => choose(i)} shade={Math.min(0.62, far * 0.2)} />
        </motion.li>;
      })}
    </ul>
    <div className="deck-controls">
      <button type="button" className="deck-arrow" onClick={() => choose(active - 1, true)} aria-label="Önceki kart"><ArrowLeft size={18} aria-hidden="true" /></button>
      <p className="deck-now" aria-live="polite"><span>{pad(active + 1)} / {pad(n)}</span><b>{current.name}</b><small>{current.city} · {current.year}</small></p>
      <button type="button" className="deck-arrow" onClick={() => choose(active + 1, true)} aria-label="Sonraki kart"><ArrowRight size={18} aria-hidden="true" /></button>
    </div>
  </div>;
}

function FlipCard({ artifact, index, front, shade, onFlip, onSelect }: { artifact: Artifact; index: number; front: boolean; shade: number; onFlip: (id: string) => void; onSelect: () => void }) {
  const [turned, setTurned] = useState(false);
  const frontButton = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLHeadingElement>(null);
  const acted = useRef(false);
  useEffect(() => { if (acted.current) (turned ? back : frontButton).current?.focus(); }, [turned]);
  function turn(next: boolean) { acted.current = true; onSelect(); setTurned(next); if (next) onFlip(artifact.id); }
  const chapter = artifact.chapters[0];
  const words = (chapter?.title ?? artifact.name).split(' ');
  const lastWord = words.pop() ?? '';
  const number = `ESER ${String(index + 1).padStart(3, '0')}`;
  const tilt = useTilt();
  return <motion.div className={`flip-card ${front ? 'front' : ''} ${turned ? 'turned' : ''}`} style={front ? tilt.style : undefined} onPointerMove={front ? tilt.move : undefined} onPointerLeave={tilt.leave} onFocus={onSelect}>
    <div className="flip-inner">
      <div className="flip-face flip-front" inert={turned}>
        <img className="flip-cover" src={artifact.image} alt="" loading="lazy" draggable={false} />
        {front && tilt.glare && <motion.span className="flip-glare" style={{ background: tilt.glare }} aria-hidden="true" />}
        <div className="flip-top"><span>{number}</span><span aria-hidden="true">✦</span><span>{artifact.category.toLocaleUpperCase('tr-TR')}</span></div>
        <div className="flip-caption">
          <h3>{words.join(' ')} <em>{lastWord}{/[.!?…]$/.test(lastWord) ? '' : '.'}</em></h3>
          <p className="flip-name">{artifact.name} · {artifact.city}</p>
          <button ref={frontButton} type="button" className="flip-turn" onClick={() => turn(true)} aria-label={`Arkasını çevir: ${artifact.name}`}><span>Arkasını çevir</span><ArrowUpRight size={18} aria-hidden="true" /></button>
        </div>
        <span className="flip-shade" style={{ opacity: shade }} aria-hidden="true" />
      </div>
      <div className="flip-face flip-back" inert={!turned}>
        <div className="flip-top"><span>{number}</span><span aria-hidden="true">✦</span><span>{artifact.year}</span></div>
        <h3 className="flip-label" ref={back} tabIndex={-1}><span className="sr-only">{artifact.name}: </span>Eserin hikâyesi</h3>
        <p className="flip-story">{chapter?.short ?? artifact.description}</p>
        <ul className="flip-facts"><li>{artifact.period} · {artifact.category}</li><li>{artifact.architect}</li><li>{artifact.city}</li></ul>
        <div className="flip-foot">
          <button type="button" className="flip-return" onClick={() => turn(false)} aria-label={`Öne dön: ${artifact.name}`}><RotateCcw size={16} aria-hidden="true" /> Öne dön</button>
          <div className="flip-actions"><Link to={`/eser/${artifact.slug}`} aria-label={`Keşfet: ${artifact.name} hikâyesi`}>Keşfet</Link><Link to={`/harita?eser=${artifact.id}`} aria-label={`Haritada gör: ${artifact.name}`}>Haritada gör</Link></div>
        </div>
      </div>
    </div>
  </motion.div>;
}
