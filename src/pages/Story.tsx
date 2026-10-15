import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowLeft, ArrowUpRight, BookOpen, Check, Heart, MapPin, Plus, Stamp, X } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { type Artifact } from '../data/artifacts';
import { Eyebrow } from '../components/UI';
import { Link } from '../lib/navigation';
import { useProgress } from '../lib/store';
import { useContent } from '../lib/contentStore';

gsap.registerPlugin(ScrollTrigger);
type Mode = 'short' | 'story' | 'child';
const modes = [['short', 'Kısa ve Öz'], ['story', 'Hikâyeleştirerek'], ['child', 'Çocuklar İçin']] as const;
const smooth = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

// Where the stage camera looks in each chapter: focus point (percent of the illustration) and zoom.
// Chapter 3 zooms onto the artifact's documented detail; chapter 4 returns to the full view in present-day colour.
function shot(artifact: Artifact, chapter: number) {
  const [fx, fy] = artifact.detail.focus ?? [50, 50];
  return [{ x: 50, y: 55, s: 1.04 }, { x: 34, y: 46, s: 1.32 }, { x: fx, y: fy, s: 2.05 }, { x: 50, y: 50, s: 1 }][chapter] ?? { x: 50, y: 50, s: 1 };
}

function Stage({ artifact, chapter, detail, setDetail }: { artifact: Artifact; chapter: number; detail: boolean; setDetail: (open: boolean) => void }) {
  const { x, y, s } = shot(artifact, chapter);
  const tone = ['past', 'past', 'detail', 'present'][chapter];
  return <aside className={`story-stage tone-${tone}`} aria-label="Hikâye sahnesi">
    <div className="stage-canvas" style={{ '--fx': x, '--fy': y, '--zoom': s } as CSSProperties}><img src={artifact.image} alt={`${artifact.name} için özgün mimari illüstrasyon; ${artifact.chapters[chapter]?.title ?? ''} bölümünün görünümü`} /></div>
    <div className="stage-grade" aria-hidden="true" />
    <div className="stage-top"><span>BÖLÜM {String(chapter + 1).padStart(2, '0')} / {String(artifact.chapters.length).padStart(2, '0')}</span><span className="stage-era">{chapter === 3 ? 'BUGÜN' : artifact.year}</span></div>
    {chapter === 2 && <><button className="hotspot stage-hotspot" onClick={() => setDetail(!detail)} aria-expanded={detail} aria-label={`Mimari ayrıntı: ${artifact.detail.title}`}>{detail ? <X size={18} /> : <Plus />}</button>
      {detail && <div className="hotspot-info stage-info" role="note"><strong>{artifact.detail.title}</strong><p>{artifact.detail.text}</p></div>}</>}
    <div className="stage-caption"><small>{artifact.city} · ÖZGÜN MİMARİ YORUM</small><strong>{artifact.chapters[chapter]?.title}</strong></div>
  </aside>;
}

export function Story({ artifact }: { artifact: Artifact }) {
  const [mode, setMode] = useState<Mode>('story');
  const [chapter, setChapter] = useState(0);
  const [detail, setDetail] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { progress, markDiscovered, toggleFavorite, notify } = useProgress();
  const { artifacts } = useContent();
  const stamped = Boolean(progress.discovered[artifact.id]);
  const next = artifacts[(artifacts.findIndex(a => a.id === artifact.id) + 1) % artifacts.length];
  const words = artifact.name.split(' ');
  useEffect(() => { if (chapter !== 2) setDetail(false); }, [chapter]);
  useEffect(() => {
    const sections = ref.current?.querySelectorAll<HTMLElement>('.story-chapter');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setChapter(Number((entry.target as HTMLElement).dataset.chapter)); }), { rootMargin: '-45% 0px -45% 0px' });
    sections?.forEach(s => observer.observe(s));
    const match = gsap.matchMedia();
    match.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => {
        gsap.from('.story-hero h1 .word > span', { yPercent: 110, duration: 1.1, ease: 'power3.out', stagger: 0.07, delay: 0.15 });
        gsap.from('.story-hero-copy > :not(h1)', { y: 24, opacity: 0, duration: 0.9, ease: 'power2.out', stagger: 0.08, delay: 0.45 });
        gsap.to('.story-hero-image', { yPercent: 18, scale: 1.08, ease: 'none', scrollTrigger: { trigger: '.story-hero', start: 'top top', end: 'bottom top', scrub: true } });
        gsap.fromTo('.reading-progress span', { scaleX: 0 }, { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.story-chapters', start: 'top 60%', end: 'bottom 60%', scrub: true } });
        gsap.utils.toArray<HTMLElement>('.chapter-content').forEach(el => {
          gsap.from(el.querySelectorAll('.chapter-number, h2, .narrative'), { y: 40, opacity: 0, duration: 0.9, stagger: 0.09, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 78%' } });
        });
        // Interlude: the camera pulls back from the facade while the date rises out of the stone.
        const interlude = gsap.timeline({ scrollTrigger: { trigger: '.story-interlude', start: 'top top', end: 'bottom bottom', scrub: 0.8 } });
        interlude.fromTo('.interlude-image', { scale: 1.7 }, { scale: 1, ease: 'none', duration: 1 }, 0)
          .fromTo('.interlude-shade', { opacity: 1 }, { opacity: 0.75, ease: 'none', duration: 1 }, 0)
          .fromTo('.interlude-year', { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, ease: 'power2.out', duration: 0.45 }, 0.05)
          .fromTo('.interlude-copy > *', { y: 40, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.3 }, 0.45);
      }, ref);
      return () => context.revert();
    });
    return () => { observer.disconnect(); match.revert(); };
  }, [artifact.id]);
  return <div ref={ref} className="story-page">
    <section className="story-hero" data-nav-theme="dark"><img className="story-hero-image" src={artifact.image} alt={`${artifact.name} için özgün mimari illüstrasyon`} /><div className="story-hero-shade" /><Link className="back-link" to="/kesfet"><ArrowLeft size={17} /> Koleksiyona dön</Link>
      <div className="story-hero-copy"><Eyebrow light>{artifact.city.toLocaleUpperCase('tr')} · {artifact.year}</Eyebrow><h1 aria-label={artifact.name}>{words.map((word, i) => <span className="word" key={i} aria-hidden="true"><span>{word}</span></span>)}</h1><p>{artifact.description}</p><button className="scroll-invite" onClick={() => document.getElementById('story-reading')?.scrollIntoView({ behavior: smooth() })}><span><ArrowDown size={18} /></span> HİKÂYEYİ KEŞFET</button></div>
      <ol className="story-hero-chapters" aria-label="Hikâyenin bölümleri">{artifact.chapters.map((c, i) => <li key={i}><i>{String(i + 1).padStart(2, '0')}</i>{c.title}</li>)}</ol>
      <span className="story-art-note">ÖZGÜN MİMARİ YORUM · FOTOĞRAF DEĞİLDİR</span></section>
    <div className="story-body">
      <div className="story-tools" id="story-reading"><div><BookOpen size={18} /><span>Anlatım şeklini seç</span></div><div className="segmented" role="group" aria-label="Anlatım biçimi">{modes.map(([value, label]) => <button key={value} className={mode === value ? 'active' : ''} aria-pressed={mode === value} onClick={() => setMode(value)}>{label}</button>)}</div><button className="story-save" onClick={() => toggleFavorite(artifact.id)} aria-pressed={progress.favorites.includes(artifact.id)}><Heart size={17} fill={progress.favorites.includes(artifact.id) ? 'currentColor' : 'none'} /><span>Favori</span></button><div className="reading-progress" aria-hidden="true"><span /></div></div>
      <div className="story-reading">
        <aside className="story-index"><span>HİKÂYENİN İZİ</span>{artifact.chapters.map((c, i) => <button className={chapter === i ? 'current' : ''} key={i} onClick={() => document.getElementById(`chapter-${i}`)?.scrollIntoView({ behavior: smooth(), block: 'center' })}><i>{String(i + 1).padStart(2, '0')}</i><span>{c.title}</span></button>)}<div className="story-index-progress"><span style={{ height: `${(chapter + 1) / artifact.chapters.length * 100}%` }} /></div></aside>
        <div className="story-chapters">{artifact.chapters.map((c, i) => <section className="story-chapter" data-chapter={i} id={`chapter-${i}`} key={i}><div className="chapter-content">
          <div className="chapter-visual" aria-hidden="true"><div className="stage-canvas" style={{ '--fx': shot(artifact, i).x, '--fy': shot(artifact, i).y, '--zoom': Math.min(1.6, shot(artifact, i).s) } as CSSProperties}><img src={artifact.image} alt="" loading="lazy" /></div></div>
          <span className="chapter-number">BÖLÜM {String(i + 1).padStart(2, '0')}</span><h2>{c.title}</h2><p key={mode} className="narrative">{c[mode]}</p>
          {mode !== 'short' && <small className="narrative-note">{mode === 'story' ? 'Anlatımdaki atmosfer yaratıcı bir yorumdur; tarihî bilgiler aşağıdaki kaynaklara dayanır.' : 'Çocuklar için hazırlanmış sadeleştirilmiş anlatım.'}</small>}
          {i === 0 && <div className="story-facts"><div><small>DÖNEM</small><strong>{artifact.period}</strong></div><div><small>MİMAR / USTA</small><strong>{artifact.architect}</strong></div><div><small>TARİH</small><strong>{artifact.year}</strong></div><div><small>TÜR</small><strong>{artifact.category}</strong></div></div>}
          {i === 2 && <><p className="detail-hint"><Plus size={15} /><span>Sahnedeki işarete dokunarak <strong>{artifact.detail.title.toLocaleLowerCase('tr-TR')}</strong> ayrıntısını incele.</span></p>
            <div className="architecture-detail"><div className="stage-canvas" style={{ '--fx': shot(artifact, 2).x, '--fy': shot(artifact, 2).y, '--zoom': 1.9 } as CSSProperties}><img src={artifact.image} loading="lazy" alt={`${artifact.name} mimari yorumunun ayrıntısı`} /></div><button className="hotspot" onClick={() => setDetail(!detail)} aria-expanded={detail} aria-label={`Mimari ayrıntı: ${artifact.detail.title}`}>{detail ? <X size={18} /> : <Plus />}</button>{detail && <div className="hotspot-info"><strong>{artifact.detail.title}</strong><p>{artifact.detail.text}</p></div>}<span>Bir ayrıntıya yaklaş · İllüstrasyon</span></div></>}
          {i === 3 && <div className="visit-note"><MapPin size={21} /><p>Yola çıkmadan önce güncel ziyaret koşullarını ve restorasyon durumunu ilgili kurumdan kontrol et. Haritadaki konumlar yaklaşık yönlendirme içindir. <Link to="/harita">Haritada gör</Link></p></div>}
        </div></section>)}</div>
        <Stage artifact={artifact} chapter={chapter} detail={detail} setDetail={setDetail} />
      </div>
    </div>
    <section className="story-interlude" data-nav-theme="dark" aria-label={`${artifact.name}: geçmişten bugüne`}>
      <div className="interlude-sticky"><img className="interlude-image" src={artifact.image} alt="" loading="lazy" /><div className="interlude-shade" />
        <span className="interlude-year" aria-hidden="true">{artifact.year.split(/[–-]/)[0]}</span>
        <div className="interlude-copy"><p className="eyebrow light"><span />GEÇMİŞTEN BUGÜNE</p><h2>Yüzyıllar geçti.<br /><em>Hikâye hâlâ burada.</em></h2><p>{artifact.name} · {artifact.city} · {artifact.year}</p></div></div>
    </section>
    <section className="story-finish" data-nav-theme="dark"><Stamp size={34} /><Eyebrow>BİR HİKÂYE DAHA SANA KATILDI</Eyebrow><h2>Bu keşif <em>senin olsun.</em></h2><p>Hikâyeyi keşfettiğini pasaportuna kaydet.<br />Bu mühür dijital keşfini temsil eder; fiziksel ziyaret kaydı değildir.</p><button className={`button ${stamped ? 'stamped' : 'gold'}`} disabled={stamped} onClick={() => { markDiscovered(artifact.id); notify('Keşfin miras pasaportuna mühürlendi.'); }}>{stamped ? <><Check size={18} /> Pasaportuna mühürlendi</> : <><Stamp size={18} /> Pasaportuma mühürle</>}</button>{stamped && <div className="story-finish-links"><Link className="text-link" to="/pasaport">Pasaportumu gör <ArrowUpRight size={17} /></Link><Link className="text-link" to="/oyun">Bilgini sına <ArrowUpRight size={17} /></Link></div>}</section>
    <section className="story-sources section"><div><h3>Hikâyenin kaynakları</h3><p>Üç anlatım biçimi de önceden hazırlanmış içeriktir.<br />Bu sürümde yapay zekâ ile metin üretimi yapılmaz.</p></div><ul>{artifact.sourceReferences.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight size={16} /></a></li>)}</ul></section>
    <Link className="next-story" to={`/eser/${next.slug}`}><span>SIRADAKİ KAPI</span><h2>{next.name}</h2><ArrowUpRight size={38} /></Link></div>;
}
