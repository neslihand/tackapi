import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, Camera, Check, Compass, HelpCircle, ImagePlus, Layers, MapPin, MessageCircle, Puzzle, ScanLine, Search, Sparkles, Stamp } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { chatEndpoint } from '../lib/chatApi';
import { Link } from '../lib/navigation';
import { locale, t } from '../lib/i18n';
import { vakifApiEnabled } from '../lib/vakifApi';
import '../tools.css';

// "Keşfin araçları": what the platform offers, one tool at a time. On wide screens a stage stays on the left and shows
// each tool's own small scene while its text passes on the right; on narrow screens the scene sits above its text.
// The scenes are decorative drawings in the entrance's language (emerald, ivory, gold), not screenshots.
const pad = (n: number) => String(n).padStart(2, '0');

type Tool = { id: string; name: string; title: ReactNode; text: string; tags: string[]; to: string; cta: string; scene: (artifacts: DiscoveryArtifact[]) => ReactNode };

function MapScene({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  const spots = [[22, 38], [41, 30], [58, 46], [74, 34], [33, 58], [66, 62]];
  return <div className="ts-map">
    <img src="/images/turkiye-gece.svg" alt="" />
    {spots.map(([x, y], i) => <span key={i} className="ts-pin" style={{ left: `${x}%`, top: `${y}%`, '--i': i } as CSSProperties}><MapPin size={18} /></span>)}
    <p className="ts-chip"><Compass size={14} />{artifacts.length} {t('eser', 'works')} · {new Set(artifacts.map(a => a.city)).size} {t('şehir', 'cities')}</p>
  </div>;
}

function CameraScene({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  const artifact = artifacts[1 % artifacts.length];
  return <div className="ts-camera">
    <img src={artifact.image} alt="" />
    <span className="ts-finder"><i /><i /><i /><i /></span>
    <span className="ts-scan" />
    <p className="ts-chip"><ScanLine size={14} />{artifact.name}</p>
  </div>;
}

function AskScene() {
  return <div className="ts-ask">
    <p className="ts-bubble q">{t('Bu eser neden yapıldı?', 'Why was this work built?')}</p>
    <p className="ts-bubble a"><span /><span /><span className="short" /></p>
    <p className="ts-bubble q late">{t('Çocuklara nasıl anlatırsın?', 'How would you tell it to children?')}</p>
    <p className="ts-typing"><i /><i /><i /></p>
    <p className="ts-chip"><Sparkles size={14} />{t('Yapay zekâ rehberi', 'AI guide')}</p>
  </div>;
}

function PlayScene() {
  return <div className="ts-play">
    <span className="ts-card c1"><Puzzle size={30} strokeWidth={1.3} /><b>{t('Yapboz', 'Puzzle')}</b></span>
    <span className="ts-card c2"><Search size={30} strokeWidth={1.3} /><b>{t('Dedektif', 'Detective')}</b></span>
    <span className="ts-card c3"><HelpCircle size={30} strokeWidth={1.3} /><b>{t('Bilgi yarışması', 'Quiz')}</b></span>
    <span className="ts-card c4"><Layers size={30} strokeWidth={1.3} /><b>{t('Bilgi kartları', 'Knowledge cards')}</b></span>
  </div>;
}

// An open page of the reading room: a city history with a term underlined and its explanation open beside it.
function ReadingScene() {
  return <div className="ts-read">
    <span className="ts-page">
      <small>{t('ŞEHİR TARİHİ · BURSA', 'CITY HISTORY · BURSA')}</small>
      <b>{t('Bir şehrin hafızası', 'The memory of a city')}</b>
      <span className="ts-line" /><span className="ts-line" />
      <span className="ts-line ts-has-term"><i>{t('mukarnas', 'muqarnas')}</i></span>
      <span className="ts-line short" />
    </span>
    <span className="ts-term"><b>{t('Mukarnas', 'Muqarnas')}</b><small>{t('Bal peteğini andıran kademeli süsleme.', 'A tiered, honeycomb-like decoration.')}</small></span>
    <p className="ts-chip"><BookOpen size={14} />{t('Makaleler · Terimler sözlüğü', 'Articles · Glossary')}</p>
  </div>;
}

function PassportScene({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  return <div className="ts-passport">
    <span className="ts-book"><small>{t('MİRAS PASAPORTU', 'HERITAGE PASSPORT')}</small><Compass size={46} strokeWidth={.9} /><b>EŞİK</b></span>
    {artifacts.slice(0, 4).map((a, i) => <span key={a.id} className="ts-stamp" style={{ '--i': i } as CSSProperties}><Stamp size={16} /><small>{a.city.toLocaleUpperCase(locale())}</small></span>)}
  </div>;
}

function ShareScene({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  return <div className="ts-share">
    <span className="ts-photo"><img src={artifacts[0].image} alt="" /><small>{t('Ziyaretimden bir kare', 'A moment from my visit')}</small></span>
    <p className="ts-bubble a memory">{t('“Dedemle her bayram bu avluda buluşurduk.”', '“My grandfather and I met in this courtyard every holiday.”')}</p>
    <p className="ts-chip ok"><Check size={14} />{t('Onaylandı · eser sayfasında', 'Approved · on the work’s page')}</p>
  </div>;
}

const allTools = (): Tool[] => [
  { id: 'harita', name: t('Miras Haritası', 'Heritage Map'), title: <>{t('Yakınında bir', 'There is a story')} <em>{t('hikâye var.', 'near you.')}</em></>, text: t('Eserleri şehir şehir haritada gör, konumunu paylaşırsan sana en yakın vakıf eserini bul. Bir rota seç, durak durak yürü.', 'See the works city by city on the map, and if you share your location, find the waqf work nearest you. Pick a route and walk it stop by stop.'), tags: [t('Yakınımdaki eserler', 'Works near me'), t('Şehre göre', 'By city'), t('Rotalar', 'Routes')], to: '/harita', cta: t('Haritayı aç', 'Open the map'), scene: artifacts => <MapScene artifacts={artifacts} /> },
  { id: 'kamera', name: t('Kamera ile Keşfet', 'Discover with the Camera'), title: <>{t('Önündeki esere', 'Look at the work')} <em>{t('bak, tanı.', 'before you.')}</em></>, text: t('Bir eserin önündeyken kamerayı aç, fotoğrafını çek; EŞİK seni doğrudan o eserin hikâyesine götürsün.', 'Standing before a work, open the camera and take a photo; EŞİK takes you straight to that work’s story.'), tags: [t('Fotoğrafla keşif', 'Discovery by photo'), t('Doğrudan hikâyeye', 'Straight to the story')], to: '/kamera', cta: t('Kamerayı dene', 'Try the camera'), scene: artifacts => <CameraScene artifacts={artifacts} /> },
  { id: 'sor', name: t('Esere Sor', 'Ask the Work'), title: <>{t('Merak ettiğini', 'Ask the work')} <em>{t('esere sor.', 'what you wonder.')}</em></>, text: t('Her eserin sayfasında bir yapay zekâ rehberi seni bekler. Kim yaptırdı, neden yapıldı, bugün ne anlatıyor; sorunu yaz, eserin bilgisine dayanarak yanıtlasın.', 'An AI guide waits on every work’s page. Who had it built, why it was made, what it tells us today: write your question and it answers from what is known about the work.'), tags: [t('Yapay zekâ rehberi', 'AI guide'), t('Eserin bilgisine dayalı', 'Based on the work’s record')], to: '/kesfet', cta: t('Bir eser seç', 'Choose a work'), scene: () => <AskScene /> },
  { id: 'oyun', name: t('Oyna & Öğren', 'Play & Learn'), title: <>{t('Öğrenmenin en', 'The most enjoyable')} <em>{t('keyifli hâli.', 'way to learn.')}</em></>, text: t('Yapbozda bir kapıyı yeniden birleştir, dedektif oyununda ipuçlarını izle, bilgi yarışmasında kendini sına. Keşif görevleri ve bilgi kartları da seni bekliyor.', 'Put a door back together in the puzzle, follow the clues in the detective game, test yourself in the quiz. Discovery quests and knowledge cards are waiting for you too.'), tags: [t('Mini oyunlar', 'Mini games'), t('Keşif görevleri', 'Discovery quests'), t('Bilgi yarışması', 'Quiz'), t('Bilgi kartları', 'Knowledge cards'), t('Keşif defteri', 'Discovery journal')], to: '/oyun', cta: t('Oyunlara gir', 'Go to the games'), scene: () => <PlayScene /> },
  { id: 'okuma', name: t('Okuma Odası', 'Reading Room'), title: <>{t('Şehirlerin hafızasını', 'Read the memory')} <em>{t('oku.', 'of cities.')}</em></>, text: t('Envanter kitaplarının şehir tarihlerini, vakıf eserleri ve vakıf kültürü üzerine yazıları oku. Metinde altı noktalı bir sözcüğe dokun, terimler sözlüğü anlamını açsın; bildiğin bir hikâyeyi de yazıp gönder.', 'Read the city histories from the inventory books and writing on foundation works and waqf culture. Tap a word with a dotted underline and the glossary opens its meaning; you can write and send a story you know, too.'), tags: [t('Şehir tarihleri', 'City histories'), t('Makaleler', 'Articles'), t('Terimler sözlüğü', 'Glossary'), t('Yazı gönder', 'Send an article')], to: '/makaleler', cta: t('Okuma odasına gir', 'Enter the reading room'), scene: () => <ReadingScene /> },
  { id: 'pasaport', name: t('Miras Pasaportu', 'Heritage Passport'), title: <>{t('Her keşif', 'Every discovery')} <em>{t('bir mühür.', 'a stamp.')}</em></>, text: t('Okuduğun her hikâye pasaportuna bir mühür basar. Mühürler biriktikçe madalyonlar kazan, kendi miras yolculuğunu oluştur.', 'Every story you read presses a stamp into your passport. As the stamps gather, earn medallions and build your own heritage journey.'), tags: [t('Mühürler', 'Stamps'), t('Madalyonlar', 'Medallions')], to: '/pasaport', cta: t('Pasaportumu aç', 'Open my passport'), scene: artifacts => <PassportScene artifacts={artifacts} /> },
  { id: 'katki', name: t('Hafızaya Katkı', 'Add to the Memory'), title: <>{t('Senin anın da', 'Your memory is part')} <em>{t('bu mirasın parçası.', 'of this heritage too.')}</em></>, text: t('Bir esere dair fotoğrafını ya da anını paylaş. Onaylanan katkılar eserin sayfasında, kitaptaki bilginin yanında yer alır.', 'Share a photo or a memory of a work. Approved contributions appear on the work’s page, beside the record.'), tags: [t('Fotoğraf', 'Photo'), t('Anı ve bilgi', 'Memories and facts'), t('Onaylı katkılar', 'Approved contributions')], to: '/giris', cta: t('Katkıda bulun', 'Contribute'), scene: artifacts => <ShareScene artifacts={artifacts} /> },
];

const icons: Record<string, ReactNode> = { harita: <MapPin size={16} />, kamera: <Camera size={16} />, sor: <MessageCircle size={16} />, oyun: <Puzzle size={16} />, okuma: <BookOpen size={16} />, pasaport: <Stamp size={16} />, katki: <ImagePlus size={16} /> };

export function ToolsShowcase({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  // Tools that this build cannot offer are left out: the assistant needs its service, contributions and the reading
  // room need the backend.
  const tools = allTools().filter(t => (t.id !== 'sor' || chatEndpoint()) && ((t.id !== 'katki' && t.id !== 'okuma') || vakifApiEnabled()));
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    // The tool whose text crosses the middle of the screen is the one on stage.
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
    }), { rootMargin: '-45% 0px -45% 0px' });
    items.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [tools.length]);
  return <div className="ts">
    <div className="ts-stage" aria-hidden="true">
      <div className="ts-frame">
        {tools.map((tool, i) => <div key={tool.id} className={`ts-scene ${i === active ? 'on' : ''}`}>{tool.scene(artifacts)}</div>)}
      </div>
      <p className="ts-count"><b>{pad(active + 1)}</b><span>/ {pad(tools.length)}</span><i>{tools[active]?.name}</i></p>
      <ol className="ts-dots">{tools.map((tool, i) => <li key={tool.id} className={i === active ? 'on' : ''} />)}</ol>
    </div>
    <ol className="ts-list">
      {tools.map((tool, i) => <li key={tool.id} ref={el => { items.current[i] = el; }} data-index={i} className={`ts-item ${i === active ? 'on' : ''}`}>
        <div className="ts-inline" aria-hidden="true"><div className="ts-frame"><div className="ts-scene on">{tool.scene(artifacts)}</div></div></div>
        <p className="ts-kicker"><span>{pad(i + 1)}</span>{icons[tool.id]}{tool.name}</p>
        <h3>{tool.title}</h3>
        <p className="ts-text">{tool.text}</p>
        <ul className="ts-tags">{tool.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
        <Link className="hp-link en-link" to={tool.to}><span>{tool.cta}</span><span className="en-link-arrow" aria-hidden="true"><ArrowUpRight size={16} /></span></Link>
      </li>)}
    </ol>
  </div>;
}
