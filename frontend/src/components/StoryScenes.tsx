import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MapPin, Plus, Search, X } from 'lucide-react';
import type { Artifact } from '../data/artifacts';
import type { NarrationMode } from '../lib/preferences';
import { Link } from '../lib/navigation';

// The chapters of a story page, drawn differently for each way of telling it:
//   story (Hikâyeleştirerek) → CineChapter: full-screen scenes behind graphic-novel captions, a camera that moves
//                              through the illustration, and an atmosphere that turns from night to dawn;
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
    <button type="button" className={`hotspot ${className}`} onClick={() => setDetail(!detail)} aria-expanded={detail} aria-label={`Mimari ayrıntı: ${artifact.detail.title}`}>{detail ? <X size={18} aria-hidden="true" /> : className === 'tale-hotspot' ? <Search size={20} aria-hidden="true" /> : <Plus aria-hidden="true" />}</button>
    {detail && <div className={`hotspot-info ${className}-info`} role="note"><strong>{artifact.detail.title}</strong><p>{artifact.detail.text}</p></div>}
  </>;
}

const hints: Record<NarrationMode, (title: string) => string> = {
  story: title => `Sahnede parlayan işarete dokunarak ${title} ayrıntısını incele.`,
  child: title => `Resimde büyütecin parladığı yeri bul ve dokun: ${title} seni bekliyor!`,
  short: title => `Görseldeki işarete dokunarak ${title} ayrıntısını incele.`,
};

// What a chapter carries besides its narration: the note on the narration, the facts and the image description in
// the first chapter, the hint to the detail in the third and the visit note in the last.
function ChapterExtras({ artifact, index, mode }: { artifact: Artifact; index: number; mode: NarrationMode }) {
  const last = index === artifact.chapters.length - 1;
  return <>
    {mode !== 'short' && <small className="narrative-note">{mode === 'story' ? 'Anlatımdaki atmosfer yaratıcı bir yorumdur; tarihî bilgiler aşağıdaki kaynaklara dayanır.' : 'Çocuklar için hazırlanmış sadeleştirilmiş anlatım.'}</small>}
    {index === 0 && <div className="story-facts"><div><small>DÖNEM</small><strong>{artifact.period}</strong></div><div><small>MİMAR / USTA</small><strong>{artifact.architect}</strong></div><div><small>TARİH</small><strong>{artifact.year}</strong></div><div><small>TÜR</small><strong>{artifact.category}</strong></div></div>}
    {index === 0 && artifact.imageAlt && <details className="image-description"><summary>GÖRSELDE NE VAR?</summary><p>{artifact.imageAlt} {artifact.origin ? `Fotoğraf: ${artifact.origin.photoCredit}.` : 'Bu çizim eserden esinlenen özgün bir yorumdur; fotoğraf veya rölöve değildir.'}</p></details>}
    {index === 2 && artifact.detail.title && <p className="detail-hint">{mode === 'child' ? <Search size={16} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}<span>{hints[mode](artifact.detail.title.toLocaleLowerCase('tr-TR'))}</span></p>}
    {last && <div className="visit-note"><MapPin size={21} aria-hidden="true" /><p>Yola çıkmadan önce güncel ziyaret koşullarını ve restorasyon durumunu ilgili kurumdan kontrol et. Haritadaki konumlar yaklaşık yönlendirme içindir. <Link to="/harita">Haritada gör</Link></p></div>}
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
      <span className="cine-slate" aria-hidden="true">SAHNE {pad(index + 1)} <i>·</i> {tone === 'dawn' ? 'BUGÜN' : artifact.year}</span>
      {index === 2 && artifact.detail.title && <Hotspot artifact={artifact} detail={detail} setDetail={setDetail} className="cine-hotspot" />}
    </div>
    <div className="cine-flow">
      <header className="cine-title">
        <span className="cine-numeral" aria-hidden="true">{pad(index + 1)}</span>
        <span className="chapter-number">BÖLÜM {pad(index + 1)} / {pad(artifact.chapters.length)}</span>
        <h2 id={`chapter-title-${index}`}>{c.title}</h2>
      </header>
      <div className="narrative cine-captions">{sentences(c.story).map((text, k) => <p key={k} className={`cine-caption at-${k % 3}`}>{text}</p>)}</div>
      <div className="cine-panel"><ChapterExtras artifact={artifact} index={index} mode="story" /></div>
    </div>
  </section>;
}

// ——— Çocuklar İçin: picture-book pages ———

const guideLines = [
  'Merhaba! Ben Hüdhüd. Bu yapının hikâyesini birlikte keşfedelim mi?',
  'Resme dikkatli bak: kaç kubbe, kaç pencere sayabilirsin?',
  'Büyütecin parladığı yeri gördün mü? Ona dokun, sana bir sır vereceğim!',
  'Harika bir keşifti! Eski yapıları korumak hepimizin görevi.',
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
  const line = guideLines[index === artifact.chapters.length - 1 ? 3 : Math.min(index, 2)];
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
        <button type="button" className={`tale-guide ${talking ? 'talking' : ''}`} onClick={() => setTalking(!talking)} aria-expanded={talking} aria-controls={`guide-${index}`} aria-label="Rehber kuş Hüdhüd ile konuş"><Hoopoe /></button>
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
      <span className="chapter-number">BÖLÜM {pad(index + 1)}</span>
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
    <small className="narrative-note">{mode === 'story' ? 'Anlatımdaki atmosfer yaratıcı bir yorumdur; tarihî bilgiler aşağıdaki kaynaklara dayanır.' : mode === 'child' ? 'Çocuklar için hazırlanmış sadeleştirilmiş anlatım.' : `Envanter kitabındaki metin: ${artifact.sourceReferences[0]?.title ?? ''}.`}</small>
    <div className="story-facts"><div><small>DÖNEM</small><strong>{artifact.period}</strong></div><div><small>MİMAR / USTA</small><strong>{artifact.architect}</strong></div><div><small>TARİH</small><strong>{artifact.year}</strong></div><div><small>TÜR</small><strong>{artifact.category}</strong></div></div>
    {artifact.imageAlt && <details className="image-description"><summary>GÖRSELDE NE VAR?</summary><p>{artifact.imageAlt}{artifact.origin ? ` Fotoğraf: ${artifact.origin.photoCredit}.` : ''}</p></details>}
    <div className="visit-note"><MapPin size={21} aria-hidden="true" /><p>Yola çıkmadan önce güncel ziyaret koşullarını ve restorasyon durumunu ilgili kurumdan kontrol et. <Link to="/harita">Haritada gör</Link></p></div>
  </>;
}

/** Hikâyeleştirerek, whole: one night scene behind the photograph, the paragraphs rising over it as captions. */
export function CineNarration({ artifact, text }: { artifact: Artifact; text: string }) {
  const style = { '--fx': 50, '--fy': 50, '--zoom': 1.12, '--sx': 0, '--sy': 0 } as CSSProperties;
  return <section className="story-chapter cine tone-lantern cine-whole" id="chapter-0" data-chapter={0} data-nav-theme="dark" aria-label={`${artifact.name}: hikâye`} style={style}>
    <div className="cine-stage">
      <div className="cine-camera" aria-hidden="true"><img src={artifact.image} alt="" loading="lazy" draggable={false} /></div>
      <CineAtmosphere tone="lantern" />
      <span className="cine-grade" aria-hidden="true" />
      <span className="cine-bar top" aria-hidden="true" /><span className="cine-bar bottom" aria-hidden="true" />
      <span className="cine-slate" aria-hidden="true">{artifact.city.toLocaleUpperCase('tr-TR')} <i>·</i> {artifact.year}</span>
    </div>
    <div className="cine-flow">
      <header className="cine-title"><span className="cine-numeral" aria-hidden="true" /><span className="chapter-number">HİKÂYELEŞTİREREK</span></header>
      <div className="narrative cine-captions">{paragraphs(text).map((p, k) => <p key={k} className={`cine-caption at-${k % 3}`}>{p}</p>)}</div>
      <div className="cine-panel"><NarrationExtras artifact={artifact} mode="story" /></div>
    </div>
  </section>;
}

/**
 * Çocuklar İçin, whole: the picture in its frame, then the text paragraph by paragraph. Hüdhüd the guide stays beside
 * the text as the child reads: it hops when a new paragraph comes into view and talks when tapped.
 */
export function TaleNarration({ artifact, text }: { artifact: Artifact; text: string }) {
  const parts = paragraphs(text);
  const [talking, setTalking] = useState(false);
  const [at, setAt] = useState(0);
  const [hop, setHop] = useState(0);
  const story = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = story.current;
    if (!root || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const k = Number((entry.target as HTMLElement).dataset.k);
      setAt(k); setHop(h => h + 1);
    }), { rootMargin: '-40% 0px -45% 0px' });
    root.querySelectorAll('.tale-para').forEach(p => observer.observe(p));
    return () => observer.disconnect();
  }, [text]);
  const line = guideLines[at === 0 ? 0 : at >= parts.length - 1 ? 3 : 1 + (at % 2)];
  return <section className="story-chapter tale tale-whole" id="chapter-0" data-chapter={0} aria-label={`${artifact.name}: çocuklar için`}>
    <div className="tale-page tale-cover">
      <div className="tale-art">
        <div className="tale-window" aria-hidden="true">
          <img src={artifact.image} alt="" loading="lazy" draggable={false} />
          {sparkles.map(([x, y], k) => <span key={k} className="tale-spark" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${k * -0.6}s` }} />)}
          <span className="tale-shooting" /><span className="tale-cloud c1" /><span className="tale-cloud c2" />
        </div>
      </div>
      <div className="tale-text"><span className="tale-page-no">ÇOCUKLAR İÇİN</span><p className="tale-lead">{artifact.name} · {artifact.city}</p></div>
    </div>
    <div className="tale-story" ref={story}>
      <div className="tale-story-text narrative">{parts.map((p, k) => <p key={k} data-k={k} className={`tale-para ${k === at ? 'now' : ''}`}>{p}</p>)}
        <div className="tale-extras"><NarrationExtras artifact={artifact} mode="child" /></div></div>
      <aside className="tale-companion">
        {/* The drawing is remounted on each hop so its animation restarts; the button keeps its focus. */}
        <button type="button" className={`tale-guide ${talking ? 'talking' : ''} ${hop > 1 ? 'hop' : ''}`} onClick={() => setTalking(!talking)} aria-expanded={talking} aria-controls="guide-whole" aria-label="Rehber kuş Hüdhüd ile konuş"><Hoopoe key={hop} /></button>
        <p className={`tale-bubble ${talking ? 'open' : ''}`} id="guide-whole" aria-live="polite">{talking ? line : ''}</p>
      </aside>
    </div>
  </section>;
}

/** Detaylı Anlatım, whole: the book's text paragraph by paragraph beside the photograph lens (Stage in Story.tsx). */
export function BriefNarration({ artifact, text }: { artifact: Artifact; text: string }) {
  return <section className="story-chapter brief brief-whole" id="chapter-0" data-chapter={0} aria-label={`${artifact.name}: kitaptaki metin`}>
    <div className="brief-body">
      <span className="chapter-number">KİTAPTAKİ METİN</span>
      {paragraphs(text).map((p, k) => <p key={k} className="narrative brief-lead">{marked(p)}</p>)}
      {artifact.detail.title && <p className="detail-hint"><Plus size={15} aria-hidden="true" /><span>{hints.short(artifact.detail.title.toLocaleLowerCase('tr-TR'))}</span></p>}
      <NarrationExtras artifact={artifact} mode="short" />
    </div>
  </section>;
}
