import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { centuryName, t } from '../lib/i18n';
import { animate, motion, useInView, useMotionTemplate, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import type { DiscoveryArtifact } from '../lib/artifactContract';

// Scenes of the Oyna & Öğren page, built from the collection's own night illustrations and animated with framer-motion.
// Everything here is decorative (aria-hidden) except the chapter headings; without motion each scene shows its final,
// readable state.

const pad = (n: number) => String(n).padStart(2, '0');
const SPRING = { stiffness: 70, damping: 18, mass: 0.6 };

// A jigsaw piece in the 140 × 100 space of a plate: a 24-unit square at (88, 42) with three tabs out and one in.
const PIECE = 'M88 42H96C95 36 105 36 104 42H112V50C118 49 118 59 112 58V66H104C105 60 95 60 96 66H88V58C82 59 82 49 88 50Z';
const PIECE_BOX = { x: 81, y: 35, w: 38, h: 32 };

function usePointerDepth(still: boolean) {
  const mx = useMotionValue(0), my = useMotionValue(0);
  const x = useSpring(mx, SPRING), y = useSpring(my, SPRING);
  function move(event: ReactPointerEvent<HTMLElement>) {
    if (still || event.pointerType !== 'mouse') return;
    const r = event.currentTarget.getBoundingClientRect();
    mx.set((event.clientX - r.left) / r.width - 0.5);
    my.set((event.clientY - r.top) / r.height - 0.5);
  }
  return { x, y, move };
}

// ——— Opening: a cabinet of floating plates ———

type PlateSpec = { x: number; y: number; w: number; d: number; r: number; kind?: 'missing' | 'lens'; small?: boolean };
// Positions in percent of the scene, width in vw; d is depth (0 far … 1 near). The centre stays free for the title.
const PLATES: PlateSpec[] = [
  { x: 4, y: 16, w: 17, d: 0.85, r: -5, kind: 'lens' },
  { x: 25, y: 9, w: 8.5, d: 0.22, r: 3, small: true },
  { x: 3, y: 62, w: 11, d: 0.4, r: 4 },
  { x: 19, y: 74, w: 13, d: 0.62, r: -3 },
  { x: 74, y: 9, w: 12.5, d: 0.5, r: 5 },
  { x: 81, y: 41, w: 17.5, d: 1, r: -4, kind: 'missing' },
  { x: 66, y: 73, w: 11, d: 0.36, r: 3 },
  { x: 58, y: 6, w: 7.5, d: 0.16, r: -2, small: true },
];

function Plate({ spec, artifact, px, py, scroll, still, index }: { spec: PlateSpec; artifact: DiscoveryArtifact; px: MotionValue<number>; py: MotionValue<number>; scroll: MotionValue<number>; still: boolean; index: number }) {
  const { d } = spec;
  // Near plates move more with the pointer and rush past the camera as the page scrolls.
  const x = useTransform([px, scroll] as MotionValue<number>[], ([mx, s]: number[]) => mx * -70 * d + (spec.x + spec.w / 2 < 50 ? -1 : 1) * s * 260 * d);
  const y = useTransform([py, scroll] as MotionValue<number>[], ([my, s]: number[]) => my * -46 * d - s * 420 * (0.3 + d));
  const scale = useTransform(scroll, [0, 1], [1, 1 + d * 0.9]);
  const opacity = useTransform(scroll, [0, 0.75], [1, 0]);
  const style = { left: `${spec.x}%`, top: `${spec.y}%`, width: `${spec.w}vw`, '--r': `${spec.r}deg`, '--d': d, '--i': index } as CSSProperties;
  return <motion.div className={`pl-plate ${spec.small ? 'far' : ''} ${spec.kind ?? ''}`} style={{ ...style, x: still ? 0 : x, y: still ? 0 : y, scale: still ? 1 : scale, opacity: still ? 1 : opacity }}>
    <div className="pl-plate-float">
      {spec.kind === 'missing'
        ? <svg className="pl-plate-art" viewBox="0 0 140 100" preserveAspectRatio="xMidYMid slice"><image href={artifact.image} width="140" height="100" preserveAspectRatio="xMidYMid slice" /><path d={PIECE} className="pl-hole" /></svg>
        : <img className="pl-plate-art" src={artifact.image} alt="" draggable={false} loading={index < 3 ? 'eager' : 'lazy'} />}
      {spec.kind === 'lens' && <><img className="pl-plate-art pl-lens-sharp" src={artifact.image} alt="" draggable={false} /><span className="pl-lens-ring" /></>}
      <span className="pl-plate-label">{artifact.city.toLocaleUpperCase('tr-TR')}</span>
    </div>
    {spec.kind === 'missing' && <motion.svg className="pl-piece" viewBox={`${PIECE_BOX.x} ${PIECE_BOX.y} ${PIECE_BOX.w} ${PIECE_BOX.h}`} style={{ width: `${(PIECE_BOX.w / 140) * 100}%` }}
      animate={still ? undefined : { y: [0, -10, 0], rotate: [-14, -8, -14] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
      <defs><clipPath id="pl-piece-clip"><path d={PIECE} /></clipPath></defs>
      <image href={artifact.image} width="140" height="100" preserveAspectRatio="xMidYMid slice" clipPath="url(#pl-piece-clip)" />
      <path d={PIECE} className="pl-piece-edge" />
    </motion.svg>}
  </motion.div>;
}

export function PlayHero({ artifacts, children, footer }: { artifacts: DiscoveryArtifact[]; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const still = Boolean(useReducedMotion());
  const { x, y, move } = usePointerDepth(still);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const pictured = artifacts.filter(a => a.image && !a.image.includes('placeholder'));
  const pick = (i: number) => pictured[(i * 5 + 1) % pictured.length] ?? artifacts[0];
  return <section ref={ref} className="pl-hero" data-nav-theme="dark" aria-labelledby="play-title" onPointerMove={move}>
    <div className="pl-hero-glow" aria-hidden="true" />
    <div className="pl-field" aria-hidden="true">{pictured.length > 0 && PLATES.map((spec, i) => <Plate key={i} spec={spec} artifact={pick(i)} px={x} py={y} scroll={scrollYProgress} still={still} index={i} />)}</div>
    <motion.div className="pl-hero-copy" style={still ? undefined : { y: copyY, opacity: copyOpacity }}>{children}</motion.div>
    {footer}
    <div className="pl-grain" aria-hidden="true" />
  </section>;
}

// ——— Chapter: a section whose backdrop opens from an inset rounded panel to full width ———

export function Chapter({ id, tone, n, total = 5, kicker, titleId, title, lede, children, className = '', headless = false }: { id: string; tone: 'night' | 'ivory'; n?: number; total?: number; kicker: string; titleId: string; title: ReactNode; lede?: ReactNode; children: ReactNode; className?: string;
  /** no visible heading: the section opens on its content, and the title stays for screen readers only */
  headless?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const still = Boolean(useReducedMotion());
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'start 25%'] });
  const inset = useTransform(scrollYProgress, [0, 1], [5, 0]);
  const round = useTransform(scrollYProgress, [0, 1], [56, 0]);
  const clipPath = useMotionTemplate`inset(0% ${inset}% 0% ${inset}% round ${round}px ${round}px 0 0)`;
  const head = useRef<HTMLElement>(null);
  const shown = useInView(head, { once: true, amount: 0.1 });
  const rise = (delay: number) => still ? {} : { initial: { y: '105%' }, animate: shown ? { y: '0%' } : { y: '105%' }, transition: { duration: 0.28, delay, ease: [0.16, 1, 0.3, 1] as const } };
  return <section ref={ref} id={id} className={`pl-chapter tone-${tone} ${className}`} data-nav-theme={tone === 'night' ? 'dark' : 'light'} aria-labelledby={titleId}>
    <motion.div className="pl-backdrop" aria-hidden="true" style={still ? undefined : { clipPath }} />
    <div className="pl-chapter-inner">
      {headless ? <h2 id={titleId} className="sr-only" tabIndex={-1}>{title}</h2> : <header className="pl-head" ref={head}>
        <p className="pl-index">{n !== undefined && <><span>{pad(n)}</span><i aria-hidden="true" /><span>{pad(total)}</span></>}<b>{kicker}</b></p>
        <h2 id={titleId} tabIndex={-1}><span className="pl-mask"><motion.span {...rise(0)}>{title}</motion.span></span></h2>
        <motion.div className="pl-lede" initial={still ? false : { opacity: 0, y: 10 }} animate={shown ? { opacity: 1, y: 0 } : undefined} transition={{ duration: 0.26, delay: 0.05, ease: 'easeOut' }}>{lede}</motion.div>
      </header>}
      {children}
    </div>
  </section>;
}

// ——— Puzzle preview: the illustration cut into tiles that fly together; the last one lands on hover ———

const COLS = 4, ROWS = 3;
const scatter = (i: number) => ({ x: `${((i * 73) % 11 - 5) * 26}%`, y: `${((i * 41) % 9 - 4) * 30}%`, rotate: ((i * 37) % 13 - 6) * 4, scale: 0.86, opacity: 0 });
const LOOSE = 6;

export function PuzzlePreview({ artifact, solved }: { artifact: DiscoveryArtifact; solved: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const still = Boolean(useReducedMotion());
  const inView = useInView(ref, { amount: 0.45 });
  const state = still || solved ? 'solved' : inView ? 'assembled' : 'scattered';
  const placed = COLS * ROWS - (state === 'solved' ? 0 : 1);
  return <div className={`pl-puzzle ${state}`} ref={ref} aria-hidden="true">
    <div className="pl-puzzle-board">
      {Array.from({ length: COLS * ROWS }, (_, i) => {
        const c = i % COLS, r = Math.floor(i / COLS);
        const loose = i === LOOSE;
        const variants = { scattered: scatter(i), assembled: loose ? { x: '150%', y: '-130%', rotate: 16, scale: 1.04, opacity: 1 } : { x: '0%', y: '0%', rotate: 0, scale: 1, opacity: 1 }, solved: { x: '0%', y: '0%', rotate: 0, scale: 1, opacity: 1 } };
        return <motion.span key={i} className={`pl-tile ${loose ? 'loose' : ''}`} style={{ backgroundImage: `url(${artifact.image})`, backgroundPosition: `${(c / (COLS - 1)) * 100}% ${(r / (ROWS - 1)) * 100}%`, gridColumn: c + 1, gridRow: r + 1 }}
          initial={still ? false : 'scattered'} animate={state} variants={variants} transition={{ type: 'spring', stiffness: 120, damping: 16, delay: state === 'assembled' ? i * 0.045 : 0 }} />;
      })}
      <span className="pl-slot" style={{ gridColumn: (LOOSE % COLS) + 1, gridRow: Math.floor(LOOSE / COLS) + 1 }} />
    </div>
    <p className="pl-puzzle-count"><b>{pad(placed)}</b> / {COLS * ROWS} {t('PARÇA', 'PIECES')}</p>
  </div>;
}

// ——— Detective preview: a sealed file; the lens reveals the picture under it ———

export function DetectivePreview({ artifact }: { artifact: DiscoveryArtifact }) {
  const still = Boolean(useReducedMotion());
  const lx = useMotionValue(62), ly = useMotionValue(42);
  const sx = useSpring(lx, { stiffness: 140, damping: 20 }), sy = useSpring(ly, { stiffness: 140, damping: 20 });
  const mask = useMotionTemplate`radial-gradient(circle at ${sx}% ${sy}%, #000 0, #000 15%, transparent 15.6%)`;
  const left = useMotionTemplate`${sx}%`, top = useMotionTemplate`${sy}%`;
  const idle = useRef<ReturnType<typeof animate>[]>([]);
  const [hunting, setHunting] = useState(false);
  useEffect(() => {
    if (still || hunting) return;
    // Without a pointer the lens searches the file on its own.
    idle.current = [animate(lx, [62, 30, 46, 70, 62], { duration: 14, repeat: Infinity, ease: 'easeInOut' }), animate(ly, [42, 34, 64, 58, 42], { duration: 14, repeat: Infinity, ease: 'easeInOut' })];
    return () => idle.current.forEach(control => control.stop());
  }, [still, hunting, lx, ly]);
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (still || event.pointerType !== 'mouse') return;
    const r = event.currentTarget.getBoundingClientRect();
    lx.set(((event.clientX - r.left) / r.width) * 100);
    ly.set(((event.clientY - r.top) / r.height) * 100);
  }
  const century = artifact.year.match(/\d{2}/)?.[0];
  return <div className="pl-file" aria-hidden="true" onPointerEnter={event => { if (event.pointerType === 'mouse') setHunting(true); }} onPointerLeave={() => setHunting(false)} onPointerMove={move}>
    <div className="pl-file-head"><span>{t('GİZLİ DOSYA', 'SECRET FILE')} · N° 07</span><span>{t('KİMLİĞİ BİLİNMİYOR', 'IDENTITY UNKNOWN')}</span></div>
    <div className="pl-file-photo">
      <img className="pl-file-blur" src={artifact.image} alt="" draggable={false} loading="lazy" />
      <motion.img className="pl-file-sharp" src={artifact.image} alt="" draggable={false} loading="lazy" style={{ WebkitMaskImage: mask, maskImage: mask }} />
      <motion.span className="pl-file-lens" style={{ left, top }} />
      <span className="pl-file-stamp">{t('GİZLİ', 'SECRET')}</span>
    </div>
    <ol className="pl-clues">
      <li><span>{t('İPUCU', 'CLUE')} 01</span>{century ? centuryName(Number(century) + 1) : artifact.period}</li>
      <li><span>{t('İPUCU', 'CLUE')} 02</span>{artifact.category}</li>
      <li className="locked"><span>{t('İPUCU', 'CLUE')} 03</span>● ● ● ●</li>
    </ol>
  </div>;
}

// ——— Card tilt: a card leans towards the pointer ———

export function useTilt() {
  const still = Boolean(useReducedMotion());
  const rx = useMotionValue(0), ry = useMotionValue(0);
  const rotateX = useSpring(rx, { stiffness: 150, damping: 18 }), rotateY = useSpring(ry, { stiffness: 150, damping: 18 });
  const glareX = useTransform(rotateY, [-8, 8], ['20%', '80%']);
  const glare = useMotionTemplate`radial-gradient(circle at ${glareX} 0%, #ffffff40, transparent 55%)`;
  function move(event: ReactPointerEvent<HTMLElement>) {
    if (still || event.pointerType !== 'mouse') return;
    const r = event.currentTarget.getBoundingClientRect();
    ry.set(((event.clientX - r.left) / r.width - 0.5) * 12);
    rx.set(-((event.clientY - r.top) / r.height - 0.5) * 10);
  }
  function leave() { rx.set(0); ry.set(0); }
  return { style: still ? {} : { rotateX, rotateY, transformPerspective: 1100 }, glare: still ? undefined : glare, move, leave };
}
