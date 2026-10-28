import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ArrowRight, ArrowUpRight, Stamp } from 'lucide-react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { HeroGate } from '../components/HeroGate';
import { Manifesto, PassportVisual, SeasonStack } from '../components/HomeScenes';
import { ArtifactAnatomy, known } from '../components/ArtifactAnatomy';
import { Chapter } from '../components/PlayScenes';
import { QuizMark } from '../components/PlayArt';
import { StoryRing } from '../components/StoryRing';
import { ToolsShowcase } from '../components/ToolsShowcase';
import { Vision } from '../components/Vision';
import { JourneyRail } from '../components/JourneyRail';
import { Link } from '../lib/navigation';
import { useProgress } from '../lib/store';
import { useContent } from '../lib/contentStore';
import { quizPool } from '../lib/quiz';
import { Discoveries } from '../vakif/Discoveries';
import { Agenda } from '../vakif/Agenda';

// The home page after the entrance: numbered chapters in the entrance's language, ivory and night in turn, each with
// its own scene — the vision, the story ring, the tools, an artifact from the inside, the routes, the passport, the
// day's discovery and a last threshold.
const pad = (n: number) => String(n).padStart(2, '0');
const TOTAL = 10;
// How the passport fills: read, get the stamp, open the medals.
const PASSPORT_STEPS: [string, string][] = [['Oku', 'Bir eserin hikâyesini sonuna kadar oku.'], ['Mühürle', 'Eser, pasaportuna bir mühür olarak işlensin.'], ['Kazan', 'Mühürler biriktikçe madalyonların kilidi açılsın.']];

// The last threshold: the next door to open, seen through a drawn arch, with the line set around it, and three more
// doors to walk through instead.
const DOORS: [string, string, string][] = [['/kesfet', 'Koleksiyon', 'Tüm eserler, tek bir yerde'], ['/harita', 'Miras Haritası', 'Yakınındaki eseri bul'], ['/oyun', 'Oyna & Öğren', 'Oyunlar, görevler, yarışma']];
function Threshold({ artifact, done, n }: { artifact: { name: string; city: string; slug: string; image: string; year: string }; done: boolean; n: number }) {
  const ref = useRef<HTMLElement>(null);
  const shown = useInView(ref, { once: true, amount: 0.35 });
  const still = Boolean(useReducedMotion());
  const rise = (delay: number) => still ? {} : { initial: { y: '108%' }, animate: shown ? { y: '0%' } : undefined, transition: { duration: 1.2, delay, ease: [0.16, 1, 0.3, 1] as const } };
  return <section ref={ref} id="kapanis" className="hp-threshold" data-nav-theme="dark" aria-labelledby="final-gate-title">
    <p className="pl-index"><span>{pad(n)}</span><i aria-hidden="true" /><span>{pad(TOTAL)}</span><b>YENİ BİR EŞİK</b></p>
    <div className="hp-arch" aria-hidden="true">
      <div className="hp-arch-window"><span className="hp-arch-reveal"><img src={artifact.image} alt="" loading="lazy" /></span></div>
      <svg className="final-gate-arch" viewBox="0 0 300 380"><path pathLength="1" d="M20 380V170C20 92 80 38 150 12C220 38 280 92 280 170V380" /><path pathLength="1" d="M4 380V166C4 82 70 24 150 -4C230 24 296 82 296 166V380" /></svg>
    </div>
    <h2 id="final-gate-title" className="hp-threshold-title"><span className="hp-tw a"><motion.span {...rise(0)}>Her kapı,</motion.span></span> <span className="hp-tw b"><motion.span {...rise(0.15)}><em>bir başkasına açılır.</em></motion.span></span></h2>
    <div className="hp-threshold-foot">
      <p>{done ? 'Koleksiyonun tamamlandı. Günün eserine yeniden bakmaya ne dersin?' : <>Sıradaki kapı seni bekliyor: <b>{artifact.name}</b> · {artifact.city}</>}</p>
      <div className="hp-actions"><Link className="hp-cta en-key" to={`/eser/${artifact.slug}`}><span className="en-key-label">Sıradaki kapıyı aç</span><span className="en-key-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span></Link></div>
    </div>
    <nav className="hp-doors" aria-label="Başka bir kapıdan gir">
      <p>Ya da başka bir kapıdan gir</p>
      <ol>{DOORS.map(([to, title, note], i) => <li key={to}><Link to={to}>
        <svg viewBox="0 0 60 76" aria-hidden="true"><path d="M4 76V34C4 18 16 8 30 2C44 8 56 18 56 34V76" /><path d="M12 76V36C12 24 20 16 30 11C40 16 48 24 48 36V76" /></svg>
        <i aria-hidden="true">{pad(i + 1)}</i><b>{title}</b><small>{note}</small><ArrowUpRight size={16} aria-hidden="true" />
      </Link></li>)}</ol>
    </nav>
  </section>;
}

export function Home() {
  const ref = useRef<HTMLDivElement>(null);
  const { progress } = useProgress();
  const { artifacts, seasons, quizQuestions } = useContent();
  const today = artifacts[Math.floor(Date.now() / 86400000) % artifacts.length];
  const nextDoor = artifacts.find(a => !progress.discovered[a.id]) ?? today;
  // The artifact shown from the inside: the one with the most to show (sources, a known date), today's on a tie.
  const insideArtifact = [...artifacts].sort((a, b) => (b.sourceReferences.length + Number(known(b.year))) - (a.sourceReferences.length + Number(known(a.year))))[0] ?? today;
  const found = artifacts.filter(a => progress.discovered[a.id]).length;
  useEffect(() => {
    const match = gsap.matchMedia();
    match.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => {
        // The second threshold: the arch draws itself and the next door comes into view.
        gsap.fromTo('.hp-threshold .final-gate-arch path', { strokeDashoffset: 1 }, { strokeDashoffset: 0, ease: 'none', stagger: 0.1, scrollTrigger: { trigger: '.hp-threshold', start: 'top 80%', end: 'center 55%', scrub: true } });
        gsap.fromTo('.hp-arch-reveal', { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none', scrollTrigger: { trigger: '.hp-threshold', start: 'top 60%', end: 'center 50%', scrub: true } });
        gsap.fromTo('.hp-arch-window img', { scale: 1.3 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.hp-threshold', start: 'top bottom', end: 'bottom top', scrub: true } });
      }, ref);
      return () => context.revert();
    });
    return () => match.revert();
  }, []);
  return <div ref={ref} className="home-page"><HeroGate />
    <Chapter id="vizyon" tone="ivory" n={3} total={TOTAL} kicker="NEDEN VAKIF?" titleId="vision-title" className="hp-vision" title={<>Bir iyilik, <em>yüzyıllarca yaşar.</em></>} lede={<p>Vakıf, bir kimsenin malını hayır amacıyla süresiz olarak topluma adamasıdır. Anadolu’nun dört bir yanındaki camiler, çeşmeler, hanlar ve köprüler bu anlayışla yaşadı.</p>}>
      <Vision artifacts={artifacts} />
    </Chapter>
    <Chapter id="featured" tone="night" n={4} total={TOTAL} kicker="TAŞA İŞLENEN HİKÂYELER" titleId="featured-title" className="hp-featured" title={<>Bazı kapılar, <em>yüzyıllara açılır.</em></>} lede={<p>Koleksiyondaki her eser, kendi hikâyesiyle seni bekliyor. Birini seç, kapısını arala.</p>}>
      <Agenda />
      <StoryRing artifacts={artifacts} label="Öne çıkan hikâyeler" />
      <div className="hp-collection"><p>{pad(artifacts.length)} eser <span>·</span> {pad(new Set(artifacts.map(a => a.city)).size)} şehir <span>·</span> <i>Birlikte koruduğumuz miras.</i></p><Link className="hp-link en-link" to="/kesfet"><span>Tüm eserleri keşfet</span><span className="en-link-arrow" aria-hidden="true"><ArrowUpRight size={16} /></span></Link></div>
    </Chapter>
    <Chapter id="araclar" tone="ivory" n={5} total={TOTAL} kicker="KEŞFİN ARAÇLARI" titleId="tools-title" className="hp-tools" title={<>Bir eser, <em>birçok kapı.</em></>} lede={<p>Haritadan kameraya, yapay zekâ rehberinden oyunlara; EŞİK’te her eser birden çok yoldan keşfedilir. Aşağı indikçe hepsiyle tanış.</p>}>
      <ToolsShowcase artifacts={artifacts} />
    </Chapter>
    <Chapter id="eserin-ici" tone="night" n={6} total={TOTAL} kicker="BİR ESERİN İÇİ" titleId="inside-title" className="hp-inside" title={<>Bir kapıya kaç hikâye <em>sığar?</em></>} lede={<p>Her eserin kendi sayfası var. Hikâyesini sana uyan biçimde oku, kaynaklarına bak, merak ettiğini sor; okuduğun her eser pasaportuna işlensin.</p>}>
      <ArtifactAnatomy artifact={insideArtifact} />
    </Chapter>
    <Chapter id="rotalar" tone="ivory" n={7} total={TOTAL} kicker="KEŞİF SEZONLARI" titleId="routes-title" className="hp-routes" title={<>Kendi izini <em>bul.</em></>} lede={<p>Bir şehir, bir dönem, bir ustanın dokunuşu. Bu kez hangi rotanın peşindesin? Her rota bir avuç eserden kurulur; haritada da yürüyebilirsin.</p>}>
      <SeasonStack seasons={seasons} artifacts={artifacts} discovered={progress.discovered} />
    </Chapter>
    <Chapter id="pasaport" tone="night" n={8} total={TOTAL} kicker="BAKMAKLA BAŞLAR, KEŞFETMEKLE DEĞİŞİR" titleId="passport-title" className="hp-passport" title={<>Her keşif bir iz. <em>Her iz senin hikâyen.</em></>} lede={<p>Eserlerin hikâyelerini keşfet, madalyonlarını kazan. Kendi miras pasaportunu, kendi merakınla doldur.</p>}>
      <div className="hp-passport-body">
        <PassportVisual artifacts={artifacts} />
        <div className="hp-passport-card">
          <p className="hp-passport-count"><strong>{pad(found)}</strong><span>/ {pad(artifacts.length)}</span><small>Pasaportundaki mühür</small></p>
          <ol className="hp-passport-ticks" aria-hidden="true">{artifacts.map(a => <li key={a.id} className={progress.discovered[a.id] ? 'on' : ''}><Stamp size={14} /></li>)}</ol>
          <div className="hp-actions"><Link className="hp-cta en-key" to="/pasaport"><span className="en-key-label">Pasaportumu aç</span><span className="en-key-arrow" aria-hidden="true"><ArrowRight size={17} /></span></Link><Link className="hp-link en-link" to="/basarimlar"><span>Madalyonları gör</span><span className="en-link-arrow" aria-hidden="true"><ArrowUpRight size={16} /></span></Link></div>
          <small className="hp-passport-note">Yolculuğun bu tarayıcıda saklanır.</small>
        </div>
      </div>
      <ol className="hp-passport-steps">{PASSPORT_STEPS.map(([title, text], i) => <li key={title}><i aria-hidden="true">{pad(i + 1)}</i><b>{title}</b><span>{text}</span></li>)}</ol>
    </Chapter>
    <Chapter id="gunun-kesfi" tone="ivory" n={9} total={TOTAL} kicker="GÜNÜN KEŞFİ" titleId="today-title" className="hp-today" title={<>Bugün bir kapı, <em>yarın bir başkası.</em></>} lede={<p>Her gün koleksiyondan bir eser öne çıkar. Hikâyesini oku, sonra bildiklerini dört soruluk yarışmada sına.</p>}>
      <div className="hp-exhibits">
        <Link className="hp-exhibit today" to={`/eser/${today.slug}`}>
          <span className="hp-exhibit-art" aria-hidden="true"><span className="hp-exhibit-arch"><img src={today.image} alt="" loading="lazy" /></span></span>
          <span className="hp-exhibit-body"><small>GÜNÜN ESERİ · {[today.city, today.year].filter(known).join(' · ').toLocaleUpperCase('tr-TR')}</small><b>{today.name}</b><span>{today.description}</span><em>Bugünün hikâyesini oku <ArrowUpRight size={16} aria-hidden="true" /></em></span>
        </Link>
        <Link className="hp-exhibit quiz" to="/oyun/quiz">
          <span className="hp-exhibit-art" aria-hidden="true"><QuizMark n={1} total={4} /></span>
          <span className="hp-exhibit-body"><small>MERAKINI BİLGİYE DÖNÜŞTÜR</small><b>Tarihin izini sürebilir misin?</b><span>{Math.min(4, quizPool(quizQuestions, artifacts).length)} soru, yepyeni bilgiler ve kazanılacak bir madalyon.</span><em>Yarışmaya başla <ArrowUpRight size={16} aria-hidden="true" /></em></span>
        </Link>
      </div>
      <Discoveries />
    </Chapter>
    <Threshold artifact={nextDoor} done={Boolean(progress.discovered[nextDoor.id])} n={10} />
    <Manifesto />
    <JourneyRail />
  </div>;
}
