import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Plus, Search, X } from 'lucide-react';
import type { Artifact } from '../data/artifacts';
import type { NarrationMode } from '../lib/preferences';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { Motif } from './StoryMotifs';
import { buildingFor, ornamentsFor, storyScenes } from '../lib/motifs';

// The chapters of a story page, drawn differently for each way of telling it:
//   story (Hikâyeleştirerek) → CineChapter: full-screen scenes behind graphic-novel captions, a camera that moves
//                              through the illustration, and an atmosphere that turns from night to dawn; a backend
//                              work's whole story → StoryReader: a centred column with era and building motifs beside it;
//   child (Çocuklar İçin)    → TaleChapter: the pages of a picture book with a guide bird, big words and surprises;
//   short (Kısa ve Öz)       → BriefChapter: an editorial label beside an arched lens (Stage in Story.tsx).
// The scroll animations live in Story.tsx; everything here reads correctly without them.

export const pad = (n: number) => String(n).padStart(2, '0');

// Where the camera looks in each chapter: focus point (percent of the illustration) and zoom.
// Chapter 3 zooms onto the artifact's documented detail; chapter 4 returns to the full view.
export function shot(artifact: Artifact, chapter: number) {
  const [fx, fy] = artifact.detail.focus ?? [50, 50];
  return [{ x: 50, y: 55, s: 1.04 }, { x: 34, y: 46, s: 1.32 }, { x: fx, y: fy, s: 2.05 }, { x: 50, y: 50, s: 1 }][chapter] ?? { x: 50, y: 50, s: 1 };
}

// Sentences of a narration, each with its closing punctuation.
export function sentences(text: string) {
  return (text.match(/[^.!?…]+(?:[.!?…]+[”"’']?|$)/g) ?? [text]).map(s => s.trim()).filter(Boolean);
}

type DetailState = { detail: boolean; setDetail: (open: boolean) => void };

export function Hotspot({ artifact, detail, setDetail, className }: { artifact: Artifact; className: string } & DetailState) {
  return <>
    <button type="button" className={`hotspot ${className}`} onClick={() => setDetail(!detail)} aria-expanded={detail} aria-label={`${t('Mimari ayrıntı', 'Architectural detail')}: ${artifact.detail.title}`}>{detail ? <X size={18} aria-hidden="true" /> : className === 'tale-hotspot' ? <Search size={20} aria-hidden="true" /> : <Plus aria-hidden="true" />}</button>
    {detail && <div className={`hotspot-info ${className}-info`} role="note"><strong>{artifact.detail.title}</strong><p>{artifact.detail.text}</p></div>}
  </>;
}

const hints = (): Record<NarrationMode, (title: string) => string> => ({
  story: title => t(`Sahnede parlayan işarete dokunarak ${title} ayrıntısını incele.`, `Tap the glowing mark on the stage to look at the detail: ${title}.`),
  child: title => t(`Resimde büyütecin parladığı yeri bul ve dokun: ${title} seni bekliyor!`, `Find where the magnifier glows in the picture and tap it: ${title} is waiting for you!`),
  short: title => t(`Görseldeki işarete dokunarak ${title} ayrıntısını incele.`, `Tap the mark on the picture to look at the detail: ${title}.`),
});

// What a chapter carries besides its narration: the note on the narration, the facts and the image description in
// the first chapter, the hint to the detail in the third and the visit note in the last.
function ChapterExtras({ artifact, index, mode }: { artifact: Artifact; index: number; mode: NarrationMode }) {
  const last = index === artifact.chapters.length - 1;
  return <>
    {mode !== 'short' && <small className="narrative-note">{mode === 'story' ? t('Anlatımdaki atmosfer yaratıcı bir yorumdur; tarihî bilgiler aşağıdaki kaynaklara dayanır.', 'The atmosphere of the telling is a creative interpretation; the historical facts rest on the sources below.') : t('Çocuklar için hazırlanmış sadeleştirilmiş anlatım.', 'A simplified telling made for children.')}</small>}
    {index === 0 && artifact.imageAlt && <details className="image-description"><summary>{t('GÖRSELDE NE VAR?', 'WHAT IS IN THE PICTURE?')}</summary><p>{artifact.imageAlt} {artifact.origin ? `${t('Fotoğraf', 'Photo')}: ${artifact.origin.photoCredit}.` : t('Bu çizim eserden esinlenen özgün bir yorumdur; fotoğraf veya rölöve değildir.', 'This drawing is an original interpretation inspired by the work; it is not a photograph or a survey drawing.')}</p></details>}
    {index === 2 && artifact.detail.title && <p className="detail-hint">{mode === 'child' ? <Search size={16} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}<span>{hints()[mode](artifact.detail.title.toLocaleLowerCase('tr-TR'))}</span></p>}
  </>;
}

// ——— Hikâyeleştirerek: cinematic scenes ———

export const cineTones = ['sketch', 'lantern', 'detail', 'dawn'] as const;
const cineTone = (index: number, total: number) => index === total - 1 ? 'dawn' : cineTones[Math.min(index, 2)];

// A field of stars as one element: box-shadows at fixed, scattered positions.
const stars = Array.from({ length: 90 }, (_, i) => `${(i * 197) % 1000 / 10}vw ${(i * 89) % 620 / 10}svh 0 ${i % 7 === 0 ? 1.4 : .6}px #f6f1e1${i % 3 ? 'b3' : ''}`).join(',');

function CineAtmosphere({ tone }: { tone: string }) {
  if (tone === 'sketch') return <div className="cine-atmos" aria-hidden="true"><span className="cine-stars" style={{ boxShadow: stars }} /></div>;
  if (tone === 'lantern') return <div className="cine-atmos" aria-hidden="true">{[0, 1, 2, 3].map(i => <span key={i} className={`cine-glow g${i}`} />)}<span className="cine-motes" /></div>;
  if (tone === 'detail') return <div className="cine-atmos" aria-hidden="true"><span className="cine-spot" /></div>;
  return <div className="cine-atmos" aria-hidden="true"><span className="cine-dawn" /><svg className="cine-birds" viewBox="0 0 220 70">{[[10, 40, 1], [52, 22, .8], [92, 46, .7], [130, 18, .6], [168, 36, .55]].map(([x, y, s], i) => <path key={i} d={`M${x} ${y}q${8 * s} ${-9 * s} ${16 * s} 0q${8 * s} ${-9 * s} ${16 * s} 0`} />)}</svg></div>;
}

// The architect's construction lines over the first scene: they draw themselves before the stone appears.
function CineLines() {
  return <svg className="cine-lines" viewBox="0 0 1400 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <path pathLength="1" d="M0 790H1400" />
    <path pathLength="1" d="M700 120V790" />
    <path pathLength="1" d="M430 560A270 270 0 0 1 970 560" />
    <path pathLength="1" d="M300 640A150 150 0 0 1 600 640M800 640A150 150 0 0 1 1100 640" />
    <path pathLength="1" d="M250 790V230M1150 790V230" />
    <circle pathLength="1" cx="700" cy="560" r="330" />
    <path pathLength="1" d="M370 560H1030M700 560L960 330" />
  </svg>;
}

export function CineChapter({ artifact, index, detail, setDetail }: { artifact: Artifact; index: number } & DetailState) {
  const c = artifact.chapters[index];
  const tone = cineTone(index, artifact.chapters.length);
  const { x, y, s } = shot(artifact, index);
  const centre = Math.max(0, (s - 1) / s);
  const style = { '--fx': x, '--fy': y, '--zoom': s, '--sx': (50 - x) * centre, '--sy': (50 - y) * centre } as CSSProperties;
  return <section className={`story-chapter cine tone-${tone}`} id={`chapter-${index}`} data-chapter={index} data-nav-theme="dark" aria-labelledby={`chapter-title-${index}`} style={style}>
    <div className="cine-stage">
      <div className="cine-camera" aria-hidden="true"><img src={artifact.image} alt="" loading="lazy" draggable={false} />{tone === 'sketch' && <CineLines />}</div>
      <CineAtmosphere tone={tone} />
      <span className="cine-grade" aria-hidden="true" />
      <span className="cine-bar top" aria-hidden="true" /><span className="cine-bar bottom" aria-hidden="true" />
      <span className="cine-slate" aria-hidden="true">{t('SAHNE', 'SCENE')} {pad(index + 1)} <i>·</i> {tone === 'dawn' ? t('BUGÜN', 'TODAY') : artifact.year}</span>
      {index === 2 && artifact.detail.title && <Hotspot artifact={artifact} detail={detail} setDetail={setDetail} className="cine-hotspot" />}
    </div>
    <div className="cine-flow">
      <header className="cine-title">
        <span className="cine-numeral" aria-hidden="true">{pad(index + 1)}</span>
        <span className="chapter-number">{t('BÖLÜM', 'CHAPTER')} {pad(index + 1)} / {pad(artifact.chapters.length)}</span>
        <h2 id={`chapter-title-${index}`}>{c.title}</h2>
      </header>
      <div className="narrative cine-captions">{sentences(c.story).map((text, k) => <p key={k} className={`cine-caption at-${k % 3}`}>{text}</p>)}</div>
      <div className="cine-panel"><ChapterExtras artifact={artifact} index={index} mode="story" /></div>
    </div>
  </section>;
}

// ——— Çocuklar İçin: picture-book pages ———

const guideLines = () => [
  t('Merhaba! Ben Hüdhüd. Bu yapının hikâyesini birlikte keşfedelim mi?', 'Hello! I am Hüdhüd the hoopoe. Shall we discover this building’s story together?'),
  t('Resme dikkatli bak: kaç kubbe, kaç pencere sayabilirsin?', 'Look closely at the picture: how many domes and windows can you count?'),
  t('Büyütecin parladığı yeri gördün mü? Ona dokun, sana bir sır vereceğim!', 'Did you see where the magnifier glows? Tap it and I will tell you a secret!'),
  t('Harika bir keşifti! Eski yapıları korumak hepimizin görevi.', 'What a great discovery! Looking after old buildings is a job for all of us.'),
];

// Hüdhüd, a hoopoe: the guide of the picture book. It bobs, blinks and talks when tapped.
function Hoopoe() {
  return <svg className="hoopoe" viewBox="0 0 130 120" aria-hidden="true" focusable="false">
    <g className="hoopoe-crest">{[-52, -30, -8, 14, 36].map((a, i) => <g key={a} transform={`rotate(${a} 84 46)`}><ellipse cx="84" cy={22 + (i % 2) * 2} rx="6" ry="16" fill="#efb173" /><ellipse cx="84" cy={9 + (i % 2) * 2} rx="4.6" ry="5" fill="#2b2622" /></g>)}</g>
    <path d="M30 78 6 92 12 74 4 64 32 68Z" fill="#2b2622" />
    <ellipse cx="58" cy="76" rx="32" ry="25" fill="#e9a25f" />
    <path d="M30 70Q52 58 76 74 64 98 36 92 26 84 30 70Z" fill="#2b2622" />
    {[0, 1, 2].map(i => <path key={i} d={`M${36 + i * 11} ${70 + i * 2}q6 6 2 16`} fill="none" stroke="#f6efe2" strokeWidth="4" strokeLinecap="round" />)}
    <circle cx="86" cy="54" r="17" fill="#efb173" />
    <circle cx="80" cy="60" r="4.5" fill="#f28c74" opacity=".55" />
    <g className="hoopoe-eye"><circle cx="90" cy="51" r="5.2" fill="#fffaf0" /><circle cx="91" cy="51.5" r="3" fill="#1d1a17" /><circle cx="92" cy="50" r="1" fill="#fff" /></g>
    <path d="M101 56Q114 60 124 70" fill="none" stroke="#3b3127" strokeWidth="3.2" strokeLinecap="round" />
    <path d="M52 99V110M64 99V110M48 110H57M60 110H69" stroke="#8a5a32" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}

const sparkles = [[12, 16], [27, 8], [70, 11], [86, 24], [56, 5], [40, 20], [92, 9]];

export function TaleChapter({ artifact, index, detail, setDetail }: { artifact: Artifact; index: number } & DetailState) {
  const [talking, setTalking] = useState(false);
  const c = artifact.chapters[index];
  const line = guideLines()[index === artifact.chapters.length - 1 ? 3 : Math.min(index, 2)];
  const [fx, fy] = artifact.detail.focus ?? [50, 50];
  return <section className={`story-chapter tale ${index % 2 ? 'flip' : ''}`} id={`chapter-${index}`} data-chapter={index} aria-labelledby={`chapter-title-${index}`}>
    <div className="tale-page">
      <div className="tale-art" style={{ '--fx': fx, '--fy': fy } as CSSProperties}>
        <div className="tale-window" aria-hidden="true">
          <img src={artifact.image} alt="" loading="lazy" draggable={false} />
          {sparkles.map(([x, y], k) => <span key={k} className="tale-spark" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${k * -0.6}s` }} />)}
          <span className="tale-shooting" /><span className="tale-cloud c1" /><span className="tale-cloud c2" />
        </div>
        {index === 2 && artifact.detail.title && <Hotspot artifact={artifact} detail={detail} setDetail={setDetail} className="tale-hotspot" />}
        <button type="button" className={`tale-guide ${talking ? 'talking' : ''}`} onClick={() => setTalking(!talking)} aria-expanded={talking} aria-controls={`guide-${index}`} aria-label={t('Rehber kuş Hüdhüd ile konuş', 'Talk to Hüdhüd, the guide bird')}><Hoopoe /></button>
      </div>
      <div className="tale-text">
        <span className="tale-page-no">SAYFA {index + 1} / {artifact.chapters.length}</span>
        <h2 id={`chapter-title-${index}`}>{c.title}</h2>
        <p className="narrative tale-words">{c.child.split(' ').map((word, k) => <span key={k}>{word} </span>)}</p>
        <p className={`tale-bubble ${talking ? 'open' : ''}`} id={`guide-${index}`} aria-live="polite">{talking ? line : ''}</p>
        <ChapterExtras artifact={artifact} index={index} mode="child" />
      </div>
    </div>
  </section>;
}

// ——— Kısa ve Öz: an editorial label ———

// Years in the text are set as figures.
function marked(text: string) {
  return text.split(/(\b1\d{3}(?:[–-]\d{2,4})?\b)/).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part);
}

export function BriefChapter({ artifact, index, detail, setDetail }: { artifact: Artifact; index: number } & DetailState) {
  const c = artifact.chapters[index];
  const { x, y, s } = shot(artifact, index);
  return <section className="story-chapter brief" id={`chapter-${index}`} data-chapter={index} aria-labelledby={`chapter-title-${index}`}>
    <span className="brief-num" aria-hidden="true">{pad(index + 1)}</span>
    <div className="brief-body">
      <div className="brief-thumb" aria-hidden={index !== 2 || undefined}><div className="stage-canvas" style={{ '--fx': x, '--fy': y, '--zoom': Math.min(1.7, s) } as CSSProperties}><img src={artifact.image} alt="" loading="lazy" /></div>{index === 2 && artifact.detail.title && <Hotspot artifact={artifact} detail={detail} setDetail={setDetail} className="brief-hotspot" />}</div>
      <span className="chapter-number">{t('BÖLÜM', 'CHAPTER')} {pad(index + 1)}</span>
      <h2 id={`chapter-title-${index}`}>{c.title}</h2>
      <p className="narrative brief-lead">{marked(c.short)}</p>
      <ChapterExtras artifact={artifact} index={index} mode="short" />
    </div>
  </section>;
}

// ——— Whole narrations (a backend monument): the stored text, paragraph by paragraph, without chapters ———

export const paragraphs = (text: string) => text.split(/\n\s*\n/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

// The facts, the image description and the visit note that the chapters would carry, once, after the text.
function NarrationExtras({ artifact, mode }: { artifact: Artifact; mode: NarrationMode }) {
  return <>
    <small className="narrative-note">{mode === 'story' ? t('Anlatımdaki atmosfer yaratıcı bir yorumdur; tarihî bilgiler aşağıdaki kaynaklara dayanır.', 'The atmosphere of the telling is a creative interpretation; the historical facts rest on the sources below.') : mode === 'child' ? t('Çocuklar için hazırlanmış sadeleştirilmiş anlatım.', 'A simplified telling made for children.') : `${t('Envanter kitabındaki metin', 'The text of the inventory book')}: ${artifact.sourceReferences[0]?.title ?? ''}.`}</small>
    {artifact.imageAlt && <details className="image-description"><summary>{t('GÖRSELDE NE VAR?', 'WHAT IS IN THE PICTURE?')}</summary><p>{artifact.imageAlt}{artifact.origin ? ` ${t('Fotoğraf', 'Photo')}: ${artifact.origin.photoCredit}.` : ''}</p></details>}
  </>;
}

/**
 * Hikâyeleştirerek, whole: the story read in one calm column in the middle of the night green. Beside it, line drawings
 * of the work's building type and its era's ornaments (StoryMotifs.tsx) change with each paragraph and drift gently as
 * the page scrolls. The text never sits on a picture, so it reads the same on any screen; the drawings only accompany it.
 */
// Specks of gold dust drifting up through the light, and a few stars that glint: [x %, y %, size px, delay s, length s].
const MOTES: [number, number, number, number, number][] = Array.from({ length: 22 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return [Math.round(r(1) * 100), Math.round(r(2) * 100), 1.5 + Math.round(r(3) * 25) / 10, Math.round(r(4) * 120) / 10, 9 + Math.round(r(5) * 10)];
});

export function StoryReader({ artifact, text }: { artifact: Artifact; text: string }) {
  const parts = paragraphs(text);
  const scenes = storyScenes(artifact, parts.length);
  const [at, setAt] = useState(0);
  const [seen, setSeen] = useState(() => new Set([0]));
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = root.current;
    if (!section || !('IntersectionObserver' in window)) return;
    // Paragraphs fade in once as they come up (never hidden without this script or for less motion).
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setReady(true);
    const items = [...section.querySelectorAll<HTMLElement>('.sr-text > p')];
    const reading = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) setAt(Number((entry.target as HTMLElement).dataset.i));
    }), { rootMargin: '-40% 0px -50% 0px' });
    const reveal = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { const i = Number((entry.target as HTMLElement).dataset.i); setSeen(s => s.has(i) ? s : new Set([...s, i])); }
    }), { rootMargin: '0px 0px 8% 0px' });
    items.forEach(el => { reading.observe(el); reveal.observe(el); });
    // Gentle parallax: how far through the story the reader is, for the drawings to drift a little against the text.
    let frame = 0;
    const drift = () => {
      frame = 0;
      const box = section.getBoundingClientRect();
      const progress = Math.min(1, Math.max(0, (window.innerHeight - box.top) / (box.height + window.innerHeight)));
      section.style.setProperty('--sp', progress.toFixed(3));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(drift); };
    drift();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => { reading.disconnect(); reveal.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); };
  }, [text]);
  const state = (i: number) => i === at ? 'on' : i < at ? 'past' : '';
  return <section ref={root} className={`story-chapter sr ${ready ? 'ready' : ''}`} id="chapter-0" data-chapter={0} data-nav-theme="dark" aria-label={`${artifact.name}: ${t('hikâye', 'story')}`}>
    {/* The stage covers the story only: its pinned layer leaves with the last paragraph, never over what comes next. */}
    <div className="sr-stage" aria-hidden="true"><div className="sr-pin">
      <span className="sr-rays" />
      <div className="sr-halo"><Motif id={scenes[0].right} /></div>
      <div className="sr-motes">{MOTES.map(([x, y, size, delay, time], i) => <i key={i} style={{ '--x': `${x}%`, '--y': `${y}%`, '--size': `${size}px`, '--delay': `${delay}s`, '--time': `${time}s` } as CSSProperties} className={i % 4 ? '' : 'star'} />)}</div>
      {(['left', 'right'] as const).map(side => <div key={side} className={`sr-side ${side}`}>
        <span className="sr-glow" /><svg className="sr-ring" viewBox="0 0 200 200"><circle cx={100} cy={100} r={96} /><circle cx={100} cy={100} r={84} /></svg>
        {scenes.map((scene, i) => <div key={i} className={`sr-motif ${state(i)}`}><Motif id={scene[side]} /></div>)}
      </div>)}
    </div></div>
    <div className="sr-flow">
      <header className="sr-head">
        <p className="sr-kicker">{t('HİKÂYELEŞTİREREK', 'AS A STORY')}</p>
        <h2>{artifact.name}</h2>
        <p className="sr-meta">{[artifact.period, artifact.category, artifact.city].filter(Boolean).join(' · ')}</p>
        <span className="sr-rule" aria-hidden="true"><i /></span>
      </header>
      <div className="narrative sr-text">{parts.map((p, i) => <p key={i} data-i={i} className={seen.has(i) ? 'seen' : ''}>{p}</p>)}</div>
      <div className="sr-extras"><NarrationExtras artifact={artifact} mode="story" /></div>
    </div>
  </section>;
}

// What Hüdhüd says beside the storybook: hello, two reading tips, and well done at the last page.
const readerLines = () => [
  t('Merhaba! Ben Hüdhüd. Bu yapının masalını birlikte okuyalım mı?', 'Hello! I am Hüdhüd the hoopoe. Shall we read this building’s tale together?'),
  t('Her sayfayı okudukça bir yıldız kazanıyorsun. Hepsini toplayabilir misin?', 'You win a star for every page you read. Can you collect them all?'),
  t('Kapaktaki çizime bak: kaç kubbe, kaç pencere sayabilirsin?', 'Look at the drawing on the cover: how many domes and windows can you count?'),
  t('Harika! Eski yapıları korumak hepimizin görevi.', 'Wonderful! Looking after old buildings is a job for all of us.'),
];
const STICKER_TONES = ['turquoise', 'terracotta', 'sun', 'emerald'];

/**
 * Çocuklar İçin, whole: a picture book. The cover draws the work's building in a dawn window (no photograph); each
 * paragraph is a page with a sticker of the era's ornaments; clouds drift as the page scrolls. Hüdhüd the guide stays
 * beside the pages, hops when a new page comes up, talks when tapped, and lights a star for every page read.
 */
export function TaleNarration({ artifact, text }: { artifact: Artifact; text: string }) {
  const parts = paragraphs(text);
  const ornaments = ornamentsFor(artifact);
  const [talking, setTalking] = useState(false);
  const [at, setAt] = useState(0);
  const [hop, setHop] = useState(0);
  const [read, setRead] = useState(() => new Set<number>());
  const [inView, setInView] = useState(false);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const section = root.current;
    if (!section || !('IntersectionObserver' in window)) return;
    const pages = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const k = Number((entry.target as HTMLElement).dataset.k);
      setAt(k); setHop(h => h + 1); setRead(r => r.has(k) ? r : new Set([...r, k]));
    }), { rootMargin: '-35% 0px -45% 0px' });
    section.querySelectorAll('.kr-page').forEach(page => pages.observe(page));
    // On a phone the guide floats in the corner of the screen, so it shows only while the tale is on screen.
    const shown = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: '-20% 0px -20% 0px' });
    shown.observe(section);
    // The clouds drift a little against the pages (--sp, 0 → 1 through the tale).
    let frame = 0;
    const drift = () => {
      frame = 0;
      const box = section.getBoundingClientRect();
      section.style.setProperty('--sp', Math.min(1, Math.max(0, (window.innerHeight - box.top) / (box.height + window.innerHeight))).toFixed(3));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(drift); };
    drift();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => { pages.disconnect(); shown.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule); };
  }, [text]);
  const done = read.size >= parts.length;
  const line = readerLines()[done ? 3 : at === 0 ? 0 : 1 + (at % 2)];
  return <section ref={root} className="story-chapter kr" id="chapter-0" data-chapter={0} aria-label={`${artifact.name}: ${t('çocuklar için', 'for children')}`}>
    <div className="kr-sky" aria-hidden="true">
      <span className="kr-cloud c1" /><span className="kr-cloud c2" /><span className="kr-cloud c3" /><span className="kr-cloud c4" />
      {sparkles.map(([x, y], k) => <span key={k} className="kr-twinkle" style={{ left: `${x}%`, top: `${y * 3}%`, animationDelay: `${k * -0.7}s` }} />)}
    </div>
    <header className="kr-cover">
      <div className="kr-window" aria-hidden="true">
        <span className="kr-sun" /><span className="kr-hill back" /><span className="kr-hill front" />
        <div className="kr-building"><Motif id={buildingFor(artifact)} /></div>
        {sparkles.slice(0, 4).map(([x, y], k) => <span key={k} className="tale-spark" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${k * -0.6}s` }} />)}
      </div>
      <div className="kr-cover-text">
        <span className="kr-chip">{t('ÇOCUKLAR İÇİN', 'FOR CHILDREN')}</span>
        <h2>{artifact.name}</h2>
        <p>{artifact.city} · {t(`${parts.length} sayfalık bir masal`, `a tale in ${parts.length} pages`)}</p>
      </div>
    </header>
    <div className="kr-body">
      <ol className="kr-pages">{parts.map((p, k) => <li key={k} data-k={k} className={`kr-page ${k === at ? 'now' : ''} ${read.has(k) ? 'read' : ''}`}>
        <span className="kr-page-no">{t(`Sayfa ${k + 1} / ${parts.length}`, `Page ${k + 1} / ${parts.length}`)}</span>
        <span className={`kr-sticker ${STICKER_TONES[k % STICKER_TONES.length]} ${k % 2 ? 'right' : 'left'}`} aria-hidden="true"><Motif id={ornaments[k % ornaments.length]} /></span>
        <p>{p}</p>
      </li>)}</ol>
      <aside className={`kr-companion ${inView ? 'in' : ''}`}>
        {/* The drawing is remounted on each hop so its animation restarts; the button keeps its focus. */}
        <button type="button" className={`tale-guide ${talking ? 'talking' : ''} ${hop > 1 ? 'hop' : ''}`} onClick={() => setTalking(!talking)} aria-expanded={talking} aria-controls="guide-whole" aria-label={t('Rehber kuş Hüdhüd ile konuş', 'Talk to Hüdhüd, the guide bird')}><Hoopoe key={hop} /></button>
        <p className={`tale-bubble ${talking ? 'open' : ''}`} id="guide-whole" aria-live="polite">{talking ? line : ''}</p>
        <p className="kr-stars" aria-label={t(`Okunan sayfa: ${read.size} / ${parts.length}`, `Pages read: ${read.size} of ${parts.length}`)}>
          {parts.map((_, k) => <span key={k} className={read.has(k) ? 'on' : ''} aria-hidden="true">★</span>)}
        </p>
      </aside>
    </div>
    <div className={`kr-finish ${done ? 'done' : ''}`}>
      <span className="kr-medal" aria-hidden="true">★</span>
      <div><strong>{t('Masalın sonuna geldin!', 'You reached the end of the tale!')}</strong>
        <span>{t(`${read.size} yıldız topladın. Şimdi bu yapının yapbozunu çözebilir ya da bilgi yarışmasında kendini deneyebilirsin.`, `You collected ${read.size} stars. Now you can solve this building’s puzzle or try the quiz.`)}</span></div>
    </div>
    <div className="kr-extras"><NarrationExtras artifact={artifact} mode="child" /></div>
  </section>;
}

/** Detaylı Anlatım, whole: the book's text paragraph by paragraph beside the photograph lens (Stage in Story.tsx). */
export function BriefNarration({ artifact, text }: { artifact: Artifact; text: string }) {
  return <section className="story-chapter brief brief-whole" id="chapter-0" data-chapter={0} aria-label={`${artifact.name}: kitaptaki metin`}>
    <div className="brief-body">
      <span className="chapter-number">{t('KİTAPTAKİ METİN', 'THE BOOK’S TEXT')}</span>
      {paragraphs(text).map((p, k) => <p key={k} className="narrative brief-lead">{marked(p)}</p>)}
      {artifact.detail.title && <p className="detail-hint"><Plus size={15} aria-hidden="true" /><span>{hints().short(artifact.detail.title.toLocaleLowerCase('tr-TR'))}</span></p>}
      <NarrationExtras artifact={artifact} mode="short" />
    </div>
  </section>;
}
