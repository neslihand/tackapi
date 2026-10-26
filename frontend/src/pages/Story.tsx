import { lazy, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowLeft, ArrowUpRight, BookOpen, Check, Heart, MapPin, Puzzle, Sparkles, Stamp, Volume2, VolumeX } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { type Artifact } from '../data/artifacts';
import { Eyebrow } from '../components/UI';
import { Girih } from '../components/PlayArt';
import { NextDoor } from '../components/ArtifactCard';
import { settleScroll } from '../lib/motion';
import { Link } from '../lib/navigation';
import { useProgress } from '../lib/store';
import { useContent } from '../lib/contentStore';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { hasImmersiveStory } from '../lib/artifactAdapter';
import { imageAlt, PLACEHOLDER_IMAGE } from '../lib/content';
import { narrationModes, useNarrationMode, type NarrationMode } from '../lib/preferences';
import { useAmbience } from '../lib/ambience';
import { BriefChapter, CineChapter, Hotspot, pad, shot, TaleChapter } from '../components/StoryScenes';
import { ArtifactSummary } from './ArtifactSummary';
import { AskArtifact } from '../components/AskArtifact';
import { chatEndpoint } from '../lib/chatApi';
import { vakifApiEnabled } from '../lib/vakifApi';
// Loaded on demand: its map (Leaflet) needs a browser window and the demo pages do not use it.
const VakifStory = lazy(() => import('../vakif/VakifStory').then(m => ({ default: m.VakifStory })));

gsap.registerPlugin(ScrollTrigger);
const smooth = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

// The lens of the short telling: an arched window on the illustration whose camera follows the chapter in view.
function Stage({ artifact, chapter, detail, setDetail }: { artifact: Artifact; chapter: number; detail: boolean; setDetail: (open: boolean) => void }) {
  const { x, y, s } = shot(artifact, chapter);
  const tone = ['past', 'past', 'detail', 'present'][Math.min(chapter, 3)];
  return <aside className={`story-stage tone-${tone}`} aria-label="Hikâye sahnesi">
    <div className="stage-canvas" style={{ '--fx': x, '--fy': y, '--zoom': s } as CSSProperties}><img src={artifact.image} alt={`${artifact.name} için özgün mimari illüstrasyon; ${artifact.chapters[chapter]?.title ?? ''} bölümünün görünümü`} /></div>
    <div className="stage-grade" aria-hidden="true" />
    <div className="stage-top"><span>BÖLÜM {pad(chapter + 1)} / {pad(artifact.chapters.length)}</span><span className="stage-era">{chapter === artifact.chapters.length - 1 ? 'BUGÜN' : artifact.year}</span></div>
    {chapter === 2 && <Hotspot artifact={artifact} detail={detail} setDetail={setDetail} className="stage-hotspot" />}
    <div className="stage-caption"><small>{artifact.city} · ÖZGÜN MİMARİ YORUM</small><strong>{artifact.chapters[chapter]?.title}</strong></div>
  </aside>;
}

export function Story({ artifact }: { artifact: DiscoveryArtifact }) {
  const { readOnly } = useContent();
  if (readOnly && vakifApiEnabled()) return <VakifStory artifact={artifact} />;
  return !readOnly && hasImmersiveStory(artifact) ? <ImmersiveStory artifact={artifact} /> : <ArtifactSummary artifact={artifact} />;
}

// Scroll scenes for each telling. Everything here only adds motion: without it (reduced motion) the page reads the same.
function storyMotion(mode: NarrationMode) {
  if (mode === 'story') {
    gsap.utils.toArray<HTMLElement>('.cine').forEach(scene => {
      const whole = { trigger: scene, start: 'top bottom', end: 'bottom top', scrub: true };
      // The camera glides in through the scene and drifts sideways; the letterbox closes in while the scene is on.
      gsap.fromTo(scene.querySelector('.cine-camera'), { '--cam': 1.22, '--pan': 40 }, { '--cam': 1, '--pan': -40, ease: 'none', scrollTrigger: whole });
      gsap.fromTo(scene.querySelectorAll('.cine-bar'), { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: scene, start: 'top 60%', end: 'top top', scrub: true } });
      gsap.fromTo(scene.querySelector('.cine-numeral'), { yPercent: 30 }, { yPercent: -40, ease: 'none', scrollTrigger: whole });
      gsap.from(scene.querySelectorAll('.cine-title > *:not(.cine-numeral)'), { y: 50, opacity: 0, duration: 1, stagger: 0.12, ease: 'power3.out', scrollTrigger: { trigger: scene.querySelector('.cine-title'), start: 'top 75%' } });
      scene.querySelectorAll('.cine-caption, .cine-panel').forEach(box => gsap.from(box, { y: 70, clipPath: 'inset(0% 0% 100% 0%)', duration: 1, ease: 'power3.out', scrollTrigger: { trigger: box, start: 'top 88%' } }));
      // The atmosphere tells the time: lines drawn at night, lanterns lit, the light gathering on a detail, dawn.
      if (scene.classList.contains('tone-sketch')) {
        gsap.fromTo(scene.querySelectorAll('.cine-lines > *'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', stagger: 0.08, scrollTrigger: { trigger: scene, start: 'top 70%', end: 'center center', scrub: true } });
        gsap.fromTo(scene.querySelector('.cine-camera img'), { opacity: 0.18 }, { opacity: 1, ease: 'none', scrollTrigger: { trigger: scene, start: 'top top', end: 'bottom 70%', scrub: true } });
      }
      if (scene.classList.contains('tone-lantern')) gsap.fromTo(scene.querySelectorAll('.cine-glow'), { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, stagger: 0.15, ease: 'none', scrollTrigger: { trigger: scene, start: 'top 60%', end: 'top -20%', scrub: true } });
      if (scene.classList.contains('tone-detail')) gsap.fromTo(scene.querySelector('.cine-spot'), { '--spot': '70%' }, { '--spot': '16%', ease: 'none', scrollTrigger: { trigger: scene, start: 'top 60%', end: 'center center', scrub: true } });
      if (scene.classList.contains('tone-dawn')) gsap.fromTo(scene.querySelector('.cine-dawn'), { opacity: 0, yPercent: 30 }, { opacity: 1, yPercent: 0, ease: 'none', scrollTrigger: { trigger: scene, start: 'top 50%', end: 'bottom bottom', scrub: true } });
    });
  }
  if (mode === 'child') {
    gsap.utils.toArray<HTMLElement>('.tale').forEach((page, i) => {
      const enter = { trigger: page, start: 'top 72%' };
      // The page turns in like a book page, the words pop in, the sparkles appear, the guide hops on.
      gsap.from(page.querySelector('.tale-page'), { rotateY: i % 2 ? 14 : -14, y: 40, opacity: 0, duration: 1.1, ease: 'power3.out', scrollTrigger: enter });
      gsap.from(page.querySelectorAll('.tale-words > span'), { y: 18, opacity: 0, duration: 0.5, stagger: 0.035, ease: 'back.out(2.2)', scrollTrigger: enter });
      gsap.from(page.querySelectorAll('.tale-spark'), { scale: 0, duration: 0.7, stagger: 0.12, ease: 'back.out(3)', scrollTrigger: enter, delay: 0.4 });
      gsap.from(page.querySelector('.tale-guide'), { x: i % 2 ? 80 : -80, y: -60, rotate: i % 2 ? 20 : -20, duration: 1, ease: 'bounce.out', scrollTrigger: enter, delay: 0.3 });
      gsap.fromTo(page.querySelectorAll('.tale-cloud'), { xPercent: -30 }, { xPercent: 30, ease: 'none', scrollTrigger: { trigger: page, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }
  if (mode === 'short') {
    gsap.utils.toArray<HTMLElement>('.brief').forEach(entry => {
      gsap.fromTo(entry.querySelector('.brief-num'), { yPercent: 40 }, { yPercent: -40, ease: 'none', scrollTrigger: { trigger: entry, start: 'top bottom', end: 'bottom top', scrub: true } });
      gsap.from(entry.querySelectorAll('.brief-body > :not(.brief-thumb)'), { y: 36, opacity: 0, duration: 0.9, stagger: 0.08, ease: 'power2.out', scrollTrigger: { trigger: entry, start: 'top 75%' } });
    });
  }
}

function ImmersiveStory({ artifact }: { artifact: Artifact }) {
  const [mode, setMode] = useNarrationMode('story');
  const [chapter, setChapter] = useState(0);
  const [detail, setDetail] = useState(false);
  const [railOn, setRailOn] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { progress, markDiscovered, toggleFavorite, notify } = useProgress();
  const { artifacts } = useContent();
  const sound = useAmbience(mode, chapter);
  const stamped = Boolean(progress.discovered[artifact.id]);
  const position = artifacts.findIndex(a => a.id === artifact.id);
  const next = artifacts[(position + 1) % artifacts.length];
  const words = artifact.name.split(' ');
  const favorite = progress.favorites.includes(artifact.id);
  const [fx, fy] = artifact.detail.focus ?? [50, 50];
  const Chapter = mode === 'story' ? CineChapter : mode === 'child' ? TaleChapter : BriefChapter;
  useEffect(() => { if (chapter !== 2) setDetail(false); }, [chapter]);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const sections = root.querySelectorAll<HTMLElement>('.story-chapter');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setChapter(Number((entry.target as HTMLElement).dataset.chapter)); }), { rootMargin: '-45% 0px -45% 0px' });
    sections.forEach(s => observer.observe(s));
    // The chapter rail shows while the chapters are on screen.
    const rail = new IntersectionObserver(([entry]) => setRailOn(entry.isIntersecting), { rootMargin: '-30% 0px -30% 0px' });
    const chapters = root.querySelector('.story-chapters');
    if (chapters) rail.observe(chapters);
    const match = gsap.matchMedia();
    match.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => {
        // Opening: the title rises out of the dark while the camera pulls back from the detail to the whole building.
        gsap.from('.story-hero h1 .word > span', { yPercent: 110, duration: 1.1, ease: 'power3.out', stagger: 0.07, delay: 0.15 });
        gsap.from('.story-hero-copy > :not(h1)', { y: 24, opacity: 0, duration: 0.9, ease: 'power2.out', stagger: 0.08, delay: 0.45 });
        gsap.fromTo('.story-hero-image', { scale: 1.5 }, { scale: 1.02, ease: 'none', scrollTrigger: { trigger: '.story-curtain', start: 'top top', end: () => `+=${window.innerHeight * 1.1}`, scrub: true } });
        gsap.to('.story-hero-copy', { yPercent: -25, ease: 'none', scrollTrigger: { trigger: '.story-curtain', start: 'top top', end: () => `+=${window.innerHeight}`, scrub: true } });
        gsap.fromTo('.reading-progress span', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.story-chapters', start: 'top 60%', end: 'bottom 60%', scrub: true } });
        gsap.fromTo('.story-index-progress span', { scaleY: 0 }, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.story-chapters', start: 'top 50%', end: 'bottom 50%', scrub: true } });
        storyMotion(mode);
        // Interlude: the camera pulls back from the facade while the date rises out of the stone.
        const interlude = gsap.timeline({ scrollTrigger: { trigger: '.story-interlude', start: 'top top', end: 'bottom bottom', scrub: 0.8 } });
        interlude.fromTo('.interlude-image', { scale: 1.7 }, { scale: 1, ease: 'none', duration: 1 }, 0)
          .fromTo('.interlude-shade', { opacity: 1 }, { opacity: 0.75, ease: 'none', duration: 1 }, 0)
          .fromTo('.interlude-year', { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, ease: 'power2.out', duration: 0.45 }, 0.05)
          .fromTo('.interlude-copy > *', { y: 40, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.3 }, 0.45);
      }, ref);
      return () => context.revert();
    });
    return () => { observer.disconnect(); rail.disconnect(); match.revert(); };
  }, [artifact.id, mode]);
  // Changing the telling rebuilds the chapters; a reader already inside them stays at the same chapter.
  function choose(next: NarrationMode) {
    if (next === mode) return;
    const inside = (document.getElementById('story-reading')?.getBoundingClientRect().top ?? 1) <= 180;
    const at = chapter;
    setMode(next);
    if (inside) requestAnimationFrame(() => requestAnimationFrame(() => { settleScroll(); ScrollTrigger.refresh(); document.getElementById(`chapter-${at}`)?.scrollIntoView({ block: 'start' }); }));
  }
  function goTo(index: number) {
    document.getElementById(`chapter-${index}`)?.scrollIntoView({ behavior: smooth(), block: mode === 'short' ? 'center' : 'start' });
  }
  return <div ref={ref} className={`story-page mode-${mode}`}>
    {/* The opening scene stays put while the telling slides up over it on a torn paper edge. */}
    <div className="story-curtain">
    <section className="story-hero" data-nav-theme="dark" style={{ '--fx': fx, '--fy': fy } as CSSProperties} onFocus={() => { if (window.scrollY > 0) { settleScroll(); window.scrollTo({ top: 0, behavior: 'instant' }); } }}><img className="story-hero-image" src={artifact.image} alt={`${artifact.name} için özgün mimari illüstrasyon. ${imageAlt(artifact)}`} /><div className="story-hero-shade" /><Link className="back-link" to="/kesfet"><ArrowLeft size={17} aria-hidden="true" /> Koleksiyona dön</Link>
      <div className="story-hero-copy"><p className="story-hero-period">{artifact.period}</p><h1 aria-label={artifact.name}>{words.map((word, i) => <span className="word" key={i} aria-hidden="true"><span>{word}</span></span>)}</h1><ul className="story-hero-tags" aria-label="Eser künyesi"><li><MapPin size={14} aria-hidden="true" />{artifact.city}</li><li>{artifact.year}</li><li>ESER {pad(position + 1)}</li></ul><p>{artifact.description}</p><button className="story-hero-cta" onClick={() => document.getElementById('story-reading')?.scrollIntoView({ behavior: smooth() })}>Hikâyeyi keşfet <ArrowDown size={17} aria-hidden="true" /></button></div>
      {stamped && <span className="ex-stamp story-hero-stamp">MÜHÜRLENDİ<span className="ex-seal" aria-hidden="true">✦</span></span>}
      <ol className="story-hero-chapters" aria-label="Hikâyenin bölümleri">{artifact.chapters.map((c, i) => <li key={i}><i>{pad(i + 1)}</i>{c.title}</li>)}</ol>
      <span className="story-art-note">ÖZGÜN MİMARİ YORUM · FOTOĞRAF DEĞİLDİR</span></section>
    <div className="story-body" data-nav-theme={mode === 'story' ? 'dark' : 'light'}>
      <Girih className="story-girih" />
      <div className="story-tools" id="story-reading">
        <div><span className="ex-medallion" aria-hidden="true"><BookOpen size={16} /></span><span>Anlatım şeklini seç</span></div>
        <div className="segmented" role="group" aria-label="Anlatım biçimi">{narrationModes.map(([value, label]) => <button key={value} className={mode === value ? 'active' : ''} aria-pressed={mode === value} onClick={() => choose(value)}>{label}</button>)}</div>
        <button className="story-sound" onClick={sound.toggle} aria-pressed={sound.on} aria-label={sound.on ? 'Ortam sesini kapat' : 'Ortam sesini aç'}><span className="story-save-icon" aria-hidden="true">{sound.on ? <Volume2 size={16} /> : <VolumeX size={16} />}</span><span>Ses</span></button>
        <button className="story-save" onClick={() => toggleFavorite(artifact.id)} aria-pressed={favorite}><span className="story-save-icon" aria-hidden="true"><Heart size={16} fill={favorite ? 'currentColor' : 'none'} /></span><span>Favori</span></button>
        <AskArtifact artifact={artifact} mode={mode} chapter={chapter} />
        <div className="reading-progress" aria-hidden="true"><span /></div>
      </div>
      <nav className={`story-index ${railOn ? 'on' : ''}`} aria-label="Bölümler arasında gezin">
        <span>HİKÂYENİN İZİ</span>
        {artifact.chapters.map((c, i) => <button key={i} className={chapter === i ? 'current' : ''} aria-current={chapter === i ? 'step' : undefined} onClick={() => goTo(i)}><i>{pad(i + 1)}</i><span>{c.title}</span></button>)}
        <div className="story-index-progress" aria-hidden="true"><span /></div>
      </nav>
      <div className="story-chapters">
        {mode === 'short'
          ? <div className="brief-layout"><Stage artifact={artifact} chapter={chapter} detail={detail} setDetail={setDetail} /><div className="brief-entries">{artifact.chapters.map((_, i) => <BriefChapter key={i} artifact={artifact} index={i} detail={detail} setDetail={setDetail} />)}</div></div>
          : artifact.chapters.map((_, i) => <Chapter key={`${mode}-${i}`} artifact={artifact} index={i} detail={detail} setDetail={setDetail} />)}
      </div>
    </div>
    </div>
    <section className="story-interlude" data-nav-theme="dark" aria-label={`${artifact.name}: geçmişten bugüne`}>
      <div className="interlude-sticky"><img className="interlude-image" src={artifact.image} alt="" loading="lazy" /><div className="interlude-shade" />
        <span className="interlude-year" aria-hidden="true">{artifact.year.split(/[–-]/)[0]}</span>
        <div className="interlude-copy"><p className="eyebrow light"><span />GEÇMİŞTEN BUGÜNE</p><h2>Yüzyıllar geçti.<br /><em>Hikâye hâlâ burada.</em></h2><p>{artifact.name} · {artifact.city} · {artifact.year}</p></div></div>
    </section>
    <div className="story-end"><Girih className="story-girih" />
    <div className="end-wrap">
    <section className="story-finish" aria-labelledby="finish-title">
      <div className="finish-copy">
        <span className={`story-seal ${stamped ? 'on' : ''}`} aria-hidden="true"><Stamp size={30} /></span>
        <Eyebrow>BİR HİKÂYE DAHA SANA KATILDI</Eyebrow>
        <h2 id="finish-title">Bu keşif <em>senin olsun.</em></h2>
        <p>Hikâyeyi keşfettiğini pasaportuna kaydet. Bu mühür dijital keşfini temsil eder; fiziksel ziyaret kaydı değildir.</p>
      </div>
      <div className="finish-actions">
        <button className={`button ${stamped ? 'stamped' : 'gold'}`} disabled={stamped} onClick={() => { markDiscovered(artifact.id); notify('Keşfin miras pasaportuna mühürlendi.'); }}>{stamped ? <><Check size={18} /> Pasaportuna mühürlendi</> : <><Stamp size={18} /> Pasaportuma mühürle</>}</button>
        <ul className="finish-links">
          {stamped && <li><Link to="/pasaport"><span className="finish-icon" aria-hidden="true"><Stamp size={18} /></span><span>Pasaportumu gör<small>Topladığın mühürler ve keşiflerin</small></span><ArrowUpRight size={18} aria-hidden="true" /></Link></li>}
          {stamped && <li><Link to="/oyun"><span className="finish-icon" aria-hidden="true"><Sparkles size={18} /></span><span>Bilgini sına<small>Dört soruluk bilgi yarışması</small></span><ArrowUpRight size={18} aria-hidden="true" /></Link></li>}
          {artifact.image !== PLACEHOLDER_IMAGE && <li className="story-finish-play"><Link to={`/oyun/oyunlar?oyun=yapboz&eser=${encodeURIComponent(artifact.id)}`}><span className="finish-icon" aria-hidden="true"><Puzzle size={18} /></span><span>Bu eserin yapbozunu çöz<small>Görseli parçalardan yeniden kur</small></span><ArrowUpRight size={18} aria-hidden="true" /></Link></li>}
        </ul>
      </div>
    </section>
    <section className="story-sources"><div><p className="story-sources-kicker">KAYNAKÇA</p><h3>Hikâyenin kaynakları</h3><p>Üç anlatım biçimi de önceden hazırlanmış içeriktir.<br />{chatEndpoint() ? '“Esere Sor” yanıtları ise yapay zekâ ile üretilir ve hata içerebilir.' : 'Bu sürümde yapay zekâ ile metin üretimi yapılmaz.'}</p></div><ul>{artifact.sourceReferences.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}<span className="sr-only"> (yeni sekmede açılır)</span><ArrowUpRight size={16} aria-hidden="true" /></a></li>)}</ul></section>
    <NextDoor artifact={next} /></div></div></div>;
}
