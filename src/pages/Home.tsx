import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ArrowRight, ArrowUpRight, Compass, MapPin, Sparkles, Stamp } from 'lucide-react';
import { HeroGate } from '../components/HeroGate';
import { ArtifactCard } from '../components/ArtifactCard';
import { PeriodTimeline } from '../components/PeriodTimeline';
import { ArrowLink, Eyebrow } from '../components/UI';
import { Link } from '../lib/navigation';
import { useProgress } from '../lib/store';
import { useContent } from '../lib/contentStore';

const pad = (n: number) => String(n).padStart(2, '0');

export function Home() {
  const ref = useRef<HTMLDivElement>(null);
  const { progress } = useProgress();
  const { artifacts, seasons, quizQuestions } = useContent();
  const today = artifacts[Math.floor(Date.now() / 86400000) % artifacts.length];
  const nextDoor = artifacts.find(a => !progress.discovered[a.id]) ?? today;
  const divrigi = artifacts.find(a => a.id === 'divrigi');
  useEffect(() => {
    const match = gsap.matchMedia();
    match.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => {
        gsap.utils.toArray<HTMLElement>('.reveal').forEach(element => gsap.from(element, { y: 45, opacity: 0, duration: 0.9, ease: 'power2.out', scrollTrigger: { trigger: element, start: 'top 91%', once: true } }));
        gsap.to('.story-panorama img', { yPercent: 13, ease: 'none', scrollTrigger: { trigger: '.story-panorama', start: 'top bottom', end: 'bottom top', scrub: true } });
        // Closing threshold: the arch draws itself as the visitor arrives.
        gsap.fromTo('.final-gate-arch path', { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '.final-gate', start: 'top 85%', end: 'center 55%', scrub: true } });
        gsap.fromTo('.final-gate-glow', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, ease: 'none', scrollTrigger: { trigger: '.final-gate', start: 'top 60%', end: 'center 50%', scrub: true } });
      }, ref);
      return () => context.revert();
    });
    return () => match.revert();
  }, []);
  return <div ref={ref}><HeroGate />
    <section className="manifesto"><span>FARK ET</span><i>✧</i><span>MERAK ET</span><i>✧</i><span>ÖĞREN</span><i>✧</i><span>KEŞFET</span><i>✧</i><span>DENEYİMLE</span></section>
    <section className="section featured" id="featured"><div className="section-heading reveal"><div><Eyebrow>TAŞA İŞLENEN HİKÂYELER</Eyebrow><h2 id="featured-title" tabIndex={-1}>Bazı kapılar, <em>yüzyıllara açılır.</em></h2></div><ArrowLink to="/kesfet">Tüm eserleri keşfet</ArrowLink></div><div className="artifact-grid featured-grid">{artifacts.slice(0, 3).map((artifact, i) => <div className="reveal" key={artifact.id}><ArtifactCard artifact={artifact} index={i} /></div>)}</div><p className="collection-note">{pad(artifacts.length)} eser <span>·</span> {pad(new Set(artifacts.map(a => a.city)).size)} şehir <span>·</span> Sayısız keşif <i>Birlikte koruduğumuz miras.</i></p></section>
    {divrigi && <section className="story-panorama" data-nav-theme="dark"><img src={divrigi.image} alt="Divriği'nin taş kapısından esinlenen özgün mimari illüstrasyon" loading="lazy" /><div className="panorama-shade" /><div className="panorama-copy reveal"><Eyebrow light>TAŞIN HAFIZASI</Eyebrow><h2>Bir kapıya<br />kaç hikâye <em>sığar?</em></h2><p>Divriği’de taş, yalnızca bir yapı malzemesi değil.<br />Bir ustanın sabrı, bir çağın hayali.</p><Link className="button gold" to={`/eser/${divrigi.slug}`}>Hikâyenin içine gir <ArrowUpRight size={18} /></Link></div><div className="panorama-foot"><span>{divrigi.name.toLocaleUpperCase('tr-TR')}</span><span>{divrigi.city.toLocaleUpperCase('tr-TR')} · {divrigi.year}</span></div></section>}
    <PeriodTimeline />
    <section className="section routes-section"><div className="section-heading reveal"><div><Eyebrow>KEŞİF SEZONLARI</Eyebrow><h2>Kendi izini <em>bul.</em></h2></div><p>Bir şehir, bir dönem, bir ustanın dokunuşu.<br />Bu kez hangi rotanın peşindesin?</p></div><div className="route-layout"><Link to="/harita" className="map-teaser reveal"><div className="map-lines" /><div className="map-teaser-pin p1"><MapPin /></div><div className="map-teaser-pin p2"><MapPin /></div><div className="map-teaser-pin p3"><MapPin /></div><div className="route-copy"><span className="eyebrow">MİRAS HARİTASI</span><h3>Yakınında bir<br /><em>hikâye var.</em></h3><span>Haritada keşfet <ArrowUpRight size={20} /></span></div></Link><div className="route-list">{seasons.map((season, i) => { const found = season.artifactIds.filter(id => progress.discovered[id]).length; return <Link to={`/kesfet?season=${season.id}`} className="route-item reveal" key={season.id}><span className="route-number">{pad(i + 1)}</span><div><small>{season.kicker} · {season.artifactIds.length} DURAK{found ? ` · ${found} MÜHÜR` : ''}</small><h3>{season.title}</h3><p>{season.description}</p></div><ArrowUpRight /></Link>; })}</div></div></section>
    <section className="passport-banner"><div className="passport-illustration" aria-hidden="true"><div className="mini-passport"><span>TÜRKİYE KÜLTÜREL MİRASI</span><Compass size={72} strokeWidth={0.8} /><h3>MİRAS<br />PASAPORTU</h3><span>EŞİK · KEŞİF GÜNLÜĞÜ</span></div><div className="floating-stamp"><Stamp size={26} /><span>İLK ADIM</span><i>YOLCULUK BAŞLIYOR</i></div></div><div className="passport-pitch reveal"><Eyebrow>BAKMAKLA BAŞLAR, KEŞFETMEKLE DEĞİŞİR</Eyebrow><h2>Her keşif bir iz.<br />Her iz <em>senin hikâyen.</em></h2><p>Eserlerin hikâyelerini keşfet, madalyonlarını kazan.<br />Kendi miras pasaportunu, kendi merakınla doldur.</p><div className="passport-actions"><Link className="button dark" to="/pasaport">Pasaportumu aç <ArrowRight size={17} /></Link><Link className="text-link" to="/basarimlar">Madalyonları gör <ArrowUpRight size={17} /></Link></div><small>{artifacts.filter(a => progress.discovered[a.id]).length} / {artifacts.length} keşif <span>·</span> Yolculuğun bu tarayıcıda saklanır.</small></div></section>
    <section className="section final-discover"><div className="daily-discovery reveal"><Eyebrow>GÜNÜN KEŞFİ</Eyebrow><h3>{today.name}</h3><p>{today.description}</p><ArrowLink to={`/eser/${today.slug}`}>Bugünün hikâyesini oku</ArrowLink></div><div className="quiz-teaser reveal"><Sparkles size={27} /><div><small>MERAKINI BİLGİYE DÖNÜŞTÜR</small><h3>Tarihin izini sürebilir misin?</h3><p>{Math.min(5, quizQuestions.length)} soru, yepyeni bilgiler ve kazanılacak bir madalyon.</p></div><Link className="circle-link" to="/oyun" aria-label="Bilgi yarışmasına başla"><ArrowUpRight /></Link></div></section>
    <section className="final-gate" data-nav-theme="dark" aria-labelledby="final-gate-title">
      <div className="final-gate-visual" aria-hidden="true"><span className="final-gate-glow" /><svg className="final-gate-arch" viewBox="0 0 300 380"><path pathLength="1" d="M20 380V170C20 92 80 38 150 12C220 38 280 92 280 170V380" /><path pathLength="1" d="M52 380V176C52 112 98 70 150 48C202 70 248 112 248 176V380" /><path pathLength="1" d="M150 48V380" /></svg></div>
      <div className="final-gate-copy"><p className="eyebrow light"><span />YENİ BİR EŞİK</p><h2 id="final-gate-title">Her kapı,<br /><em>bir başkasına açılır.</em></h2><p>{progress.discovered[nextDoor.id] ? 'Koleksiyonun tamamlandı. Günün eserine yeniden bakmaya ne dersin?' : `Sıradaki kapı seni bekliyor: ${nextDoor.name} · ${nextDoor.city}.`}</p><div className="final-gate-actions"><Link className="button gold" to={`/eser/${nextDoor.slug}`}>Sıradaki kapıyı aç <ArrowUpRight size={18} /></Link><Link className="hero-secondary" to="/harita">Haritada bir iz seç <ArrowRight size={17} /></Link></div></div>
    </section>
  </div>;
}
