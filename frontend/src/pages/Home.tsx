import { ArrowRight, ArrowUpRight, Stamp } from 'lucide-react';
import { HeroGate } from '../components/HeroGate';
import { Manifesto, PassportVisual, SeasonStack } from '../components/HomeScenes';
import { ArtifactAnatomy, known } from '../components/ArtifactAnatomy';
import { Chapter } from '../components/PlayScenes';
import { QuizMark } from '../components/PlayArt';
import { DoorGallery } from '../components/DoorGallery';
import { ToolsShowcase } from '../components/ToolsShowcase';
import { JourneyRail } from '../components/JourneyRail';
import { Link } from '../lib/navigation';
import { locale, t } from '../lib/i18n';
import { useKeptIn } from '../lib/account';
import { useProgress } from '../lib/store';
import { useContent } from '../lib/contentStore';
import { quizPool } from '../lib/quiz';
import { Agenda } from '../vakif/Agenda';

// The home page after the entrance: the tools of discovery, then chapters in the entrance's language, each with its
// own scene — the door gallery, the routes, how a work is discovered (an artifact from the inside), the
// day's discovery, the passport and a last threshold.
const pad = (n: number) => String(n).padStart(2, '0');
// How the passport fills: read, get the stamp, open the medals.
const passportSteps = (): [string, string][] => [[t('Oku', 'Read'), t('Bir eserin hikâyesini sonuna kadar oku.', 'Read a work’s story to the end.')], [t('Mühürle', 'Stamp'), t('Eser, pasaportuna bir mühür olarak işlensin.', 'The work is pressed into your passport as a stamp.')], [t('Kazan', 'Earn'), t('Mühürler biriktikçe madalyonların kilidi açılsın.', 'As stamps gather, medallions unlock.')]];

// The closing section: the day's discovery (today's work and the quiz) as two small plates, and three more doors to
// walk through. The suggestions ("Senin için", "Bu hafta öne çıkanlar") stay on Keşfet, not here.
const doors = (): [string, string, string][] => [['/kesfet', t('Koleksiyon', 'Collection'), t('Tüm eserler, tek bir yerde', 'Every work, in one place')], ['/harita', t('Miras Haritası', 'Heritage Map'), t('Yakınındaki eseri bul', 'Find a work near you')], ['/oyun', t('Oyna & Öğren', 'Play & Learn'), t('Oyunlar, görevler, yarışma', 'Games, quests, a quiz')]];
function Threshold({ today, questions }: { today: { name: string; city: string; slug: string; image: string; year: string }; questions: number }) {
  return <section id="kapanis" className="hp-threshold" data-nav-theme="dark" aria-labelledby="today-title">
    <section className="hp-today" aria-labelledby="today-title">
      <h3 id="today-title">{t('Günün keşfi', 'Today’s discovery')}<span>{t('Her gün koleksiyondan bir eser öne çıkar; oku, sonra bildiklerini sına.', 'Every day one work steps forward; read it, then test what you know.')}</span></h3>
      <ul>
        <li><Link className="hp-plate" to={`/eser/${today.slug}`}><span className="hp-plate-art" aria-hidden="true"><img src={today.image} alt="" loading="lazy" /></span><span className="hp-plate-body"><small>{t('GÜNÜN ESERİ', 'TODAY’S WORK')}{[today.city, today.year].filter(known).map(v => ` · ${v.toLocaleUpperCase(locale())}`).join('')}</small><b>{today.name}</b><em>{t('Hikâyesini oku', 'Read its story')}</em></span><ArrowUpRight size={16} aria-hidden="true" /></Link></li>
        <li><Link className="hp-plate" to="/oyun/quiz"><span className="hp-plate-art quiz" aria-hidden="true"><QuizMark n={1} total={4} /></span><span className="hp-plate-body"><small>{t('BİLGİ YARIŞMASI', 'KNOWLEDGE QUIZ')}</small><b>{t('Tarihin izini sürebilir misin?', 'Can you follow the trail of history?')}</b><em>{questions} {t('soru · bir madalyon', 'questions · a medallion')}</em></span><ArrowUpRight size={16} aria-hidden="true" /></Link></li>
      </ul>
    </section>
    <nav className="hp-doors" aria-label={t('Başka bir kapıdan gir', 'Enter by another door')}>
      <p>{t('Ya da başka bir kapıdan gir', 'Or enter by another door')}</p>
      <ol>{doors().map(([to, title, note], i) => <li key={to}><Link to={to}>
        <svg viewBox="0 0 60 76" aria-hidden="true"><path d="M4 76V26A26 22 0 0 1 56 26V76" /><path d="M12 76V30A18 15 0 0 1 48 30V76" /></svg>
        <i aria-hidden="true">{pad(i + 1)}</i><b>{title}</b><small>{note}</small><ArrowUpRight size={16} aria-hidden="true" />
      </Link></li>)}</ol>
    </nav>
  </section>;
}

export function Home() {
  const { progress } = useProgress();
  const kept = useKeptIn();
  const { artifacts, seasons, quizQuestions } = useContent();
  const today = artifacts[Math.floor(Date.now() / 86400000) % artifacts.length];
  // The artifact shown from the inside: the one with the most to show (sources, a known date), today's on a tie.
  const insideArtifact = [...artifacts].sort((a, b) => (b.sourceReferences.length + Number(known(b.year))) - (a.sourceReferences.length + Number(known(a.year))))[0] ?? today;
  const found = artifacts.filter(a => progress.discovered[a.id]).length;
  return <div className="home-page"><HeroGate />
    <Chapter id="araclar" tone="night" kicker={t('KEŞFİN ARAÇLARI', 'TOOLS OF DISCOVERY')} titleId="tools-title" className="hp-tools" headless title={<>{t('Keşfin', 'Tools of')} <em>{t('araçları.', 'discovery.')}</em></>}>
      <div className="hp-tools-panel"><ToolsShowcase artifacts={artifacts} /></div>
    </Chapter>
    <Chapter id="featured" tone="night" kicker={t('TAŞA İŞLENEN HİKÂYELER', 'STORIES CARVED IN STONE')} titleId="featured-title" className="hp-featured" title={<>{t('Bazı kapılar,', 'Some doors')} <em>{t('yüzyıllara açılır.', 'open onto centuries.')}</em></>} lede={<p>{t('Koleksiyondaki her eser, kendi hikâyesiyle seni bekliyor. Birini seç, kapısını arala.', 'Every work in the collection is waiting for you with its own story. Choose one and open its door.')}</p>}>
      <Agenda />
      <DoorGallery artifacts={artifacts} />
    </Chapter>
    <Chapter id="rotalar" tone="ivory" kicker={t('KEŞİF SEZONLARI', 'DISCOVERY SEASONS')} titleId="routes-title" className="hp-routes" title={<>{t('Kendi izini', 'Find your')} <em>{t('bul.', 'own trail.')}</em></>} lede={<p>{t('Bir şehir, bir dönem, bir ustanın dokunuşu. Bu kez hangi rotanın peşindesin? Her rota bir avuç eserden kurulur; haritada da yürüyebilirsin.', 'A city, an era, a master’s touch. Which route will you follow this time? Each route is made of a handful of works, and you can walk it on the map too.')}</p>}>
      <SeasonStack seasons={seasons} artifacts={artifacts} discovered={progress.discovered} />
    </Chapter>
    <Chapter id="eserin-ici" tone="night" kicker={t('BİR ESERİN İÇİ', 'INSIDE A WORK')} titleId="inside-title" className="hp-inside" headless title={<>{t('Bir eser,', 'One work,')} <em>{t('birçok kapı.', 'many doors.')}</em></>}>
      <div className="hp-inside-plate"><h3>{t('Bir eserin içi', 'Inside a work')}</h3><p>{t('Her eserin kendi sayfası var. Hikâyesini sana uyan biçimde oku, kaynaklarına bak, merak ettiğini sor; okuduğun her eser pasaportuna işlensin.', 'Every work has a page of its own. Read its story the way that suits you, look at its sources, ask what you wonder about; every work you read is stamped into your passport.')}</p></div>
      <ArtifactAnatomy artifact={insideArtifact} />
    </Chapter>
    <Chapter id="pasaport" tone="night" kicker={t('BAKMAKLA BAŞLAR, KEŞFETMEKLE DEĞİŞİR', 'IT STARTS WITH A LOOK AND CHANGES WITH DISCOVERY')} titleId="passport-title" className="hp-passport" title={<>{t('Her keşif bir iz.', 'Every discovery leaves a mark.')} <em>{t('Her iz senin hikâyen.', 'Every mark is your story.')}</em></>} lede={<p>{t('Eserlerin hikâyelerini keşfet, madalyonlarını kazan. Kendi miras pasaportunu, kendi merakınla doldur.', 'Discover the works’ stories and earn their medallions. Fill your own heritage passport with your own curiosity.')}</p>}>
      <div className="hp-passport-body">
        <PassportVisual artifacts={artifacts} />
        <div className="hp-passport-card">
          <p className="hp-passport-count"><strong>{pad(found)}</strong><span>/ {pad(artifacts.length)}</span><small>{t('Pasaportundaki mühür', 'Stamps in your passport')}</small></p>
          <ol className="hp-passport-ticks" aria-hidden="true">{artifacts.map(a => <li key={a.id} className={progress.discovered[a.id] ? 'on' : ''}><Stamp size={14} /></li>)}</ol>
          <div className="hp-actions"><Link className="hp-cta en-key" to="/pasaport"><span className="en-key-label">{t('Pasaportumu aç', 'Open my passport')}</span><span className="en-key-arrow" aria-hidden="true"><ArrowRight size={17} /></span></Link><Link className="hp-link en-link" to="/basarimlar"><span>{t('Madalyonları gör', 'See the medallions')}</span><span className="en-link-arrow" aria-hidden="true"><ArrowUpRight size={16} /></span></Link></div>
          <small className="hp-passport-note">{t(`Yolculuğun ${kept.where} saklanır.`, `Your journey is kept ${kept.where}.`)}</small>
        </div>
      </div>
      <ol className="hp-passport-steps">{passportSteps().map(([title, text], i) => <li key={title}><i aria-hidden="true">{pad(i + 1)}</i><b>{title}</b><span>{text}</span></li>)}</ol>
    </Chapter>
    <Threshold today={today} questions={Math.min(4, quizPool(quizQuestions, artifacts).length)} />
    <Manifesto />
    <JourneyRail />
  </div>;
}
