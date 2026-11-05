import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUpRight, BookOpen, Camera, Check, Compass, HelpCircle, ImagePlus, Layers, MapPin, MessageCircle, Puzzle, ScanLine, Search, Sparkles } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { chatEndpoint } from '../lib/chatApi';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { vakifApiEnabled } from '../lib/vakifApi';
import { collectionStats, spotlight } from '../lib/content';
import { normalize } from '../lib/progress';
import '../tools.css';

// "Keşfin araçları": what the platform offers, on one screen. The chosen tool's scene stands on the left; the tools are
// tabs on the right (a row above the scene on narrow screens) with the chosen one's text under them. While the section
// is in view the next tool comes forward every few seconds, a line filling under its tab; the pointer or focus inside
// holds it, and choosing a tab stops it for good. The scenes are decorative drawings in the entrance's language
// (emerald, ivory, gold), not screenshots. The passport is not among the tools: it has its own chapter on the page.
const pad = (n: number) => String(n).padStart(2, '0');

type Tool = { id: string; name: string; title: ReactNode; text: string; tags: string[]; to: string; cta: string; scene: (artifacts: DiscoveryArtifact[]) => ReactNode };

// Where the collection's cities lie on the schematic map (/images/turkiye-gece.svg, 1200 × 600), in percent of its width
// and height: the city's coordinates scaled to the map's outline, moved onto the land where the outline is simplified
// (İstanbul and Antakya fall just off its coast). A city not listed here gets no pin.
const CITY_PINS: Record<string, [number, number]> = {
  bursa: [21, 32], konya: [36.5, 55], hatay: [53.4, 64.7], antakya: [53.4, 64.7], istanbul: [19.2, 25], edirne: [9.4, 16.2],
  sivas: [57.2, 35.8], izmir: [12.8, 51], ankara: [38.2, 34],
};

function MapScene({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  // the whole country in its own proportions, one pin on each of the collection's cities
  const cities = [...new Map(artifacts.flatMap(a => {
    const pin = CITY_PINS[normalize(a.city)];
    return pin ? [[normalize(a.city), [a.city, pin] as [string, [number, number]]]] as const : [];
  })).values()];
  const stats = collectionStats(artifacts);
  return <div className="ts-map">
    <div className="ts-land">
      <img src="/images/turkiye-gece.svg" alt="" />
      {cities.map(([name, [x, y]], i) => <span key={name} className="ts-pin" style={{ left: `${x}%`, top: `${y}%`, '--i': i } as CSSProperties}><MapPin size={18} /><b>{name}</b></span>)}
    </div>
    <p className="ts-chip"><Compass size={14} />{stats.works} {t('eser', 'works')} · {stats.cities} {t('şehir', 'cities')}</p>
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

function ShareScene({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  const [first, second] = spotlight(artifacts);
  const shown = second ?? first ?? artifacts[0];
  return <div className="ts-share">
    <span className="ts-photo"><img src={shown.image} alt="" /><small>{t('Ziyaretimden bir kare', 'A moment from my visit')}</small></span>
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
  { id: 'katki', name: t('Hafızaya Katkı', 'Add to the Memory'), title: <>{t('Senin anın da', 'Your memory is part')} <em>{t('bu mirasın parçası.', 'of this heritage too.')}</em></>, text: t('Bir esere dair fotoğrafını ya da anını paylaş. Onaylanan katkılar eserin sayfasında, kitaptaki bilginin yanında yer alır.', 'Share a photo or a memory of a work. Approved contributions appear on the work’s page, beside the record.'), tags: [t('Fotoğraf', 'Photo'), t('Anı ve bilgi', 'Memories and facts'), t('Onaylı katkılar', 'Approved contributions')], to: '/giris', cta: t('Katkıda bulun', 'Contribute'), scene: artifacts => <ShareScene artifacts={artifacts} /> },
];

const icons: Record<string, ReactNode> = { harita: <MapPin size={16} />, kamera: <Camera size={16} />, sor: <MessageCircle size={16} />, oyun: <Puzzle size={16} />, okuma: <BookOpen size={16} />, katki: <ImagePlus size={16} /> };

// how long a tool stays forward before the next one comes (the fill under its tab takes as long: tools.css)
const TURN_MS = 6500;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function ToolsShowcase({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  // Tools that this build cannot offer are left out: the assistant needs its service, contributions and the reading
  // room need the backend.
  const tools = allTools().filter(t => (t.id !== 'sor' || chatEndpoint()) && ((t.id !== 'katki' && t.id !== 'okuma') || vakifApiEnabled()));
  const [active, setActive] = useState(0);
  const [chosen, setChosen] = useState(false);
  const [held, setHeld] = useState(false);
  const [seen, setSeen] = useState(false);
  const [still] = useState(reducedMotion);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setSeen(entry.isIntersecting), { threshold: 0.35 });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  // In the row of tabs on a narrow screen, the tab that comes forward slides into view (the row only, never the page).
  useEffect(() => {
    const row = list.current, tab = tabs.current[active];
    if (row && tab && row.scrollWidth > row.clientWidth) row.scrollTo({ left: tab.offsetLeft - row.clientWidth / 2 + tab.offsetWidth / 2, behavior: still ? 'auto' : 'smooth' });
  }, [active, still]);
  const turning = !chosen && !still;
  const choose = (i: number, focus = false) => { setActive(i); setChosen(true); if (focus) tabs.current[i]?.focus(); };
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[event.key];
    const to = step ? (active + step + tools.length) % tools.length : event.key === 'Home' ? 0 : event.key === 'End' ? tools.length - 1 : -1;
    if (to < 0) return;
    event.preventDefault();
    choose(to, true);
  }
  return <div ref={root} className={`ts ${turning ? 'turning' : ''} ${turning && seen && !held ? 'running' : ''}`} style={{ '--ts-turn': `${TURN_MS}ms` } as CSSProperties}
    onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
    onFocus={() => setHeld(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHeld(false); }}>
    <div className="ts-stage" aria-hidden="true">
      <div className="ts-frame">
        {tools.map((tool, i) => <div key={tool.id} className={`ts-scene ${i === active ? 'on' : ''}`}>{tool.scene(artifacts)}</div>)}
      </div>
    </div>
    <div className="ts-side">
      <div ref={list} className="ts-tabs" role="tablist" aria-label={t('Keşfin araçları', 'Tools of discovery')} onKeyDown={onKeyDown}>
        {tools.map((tool, i) => <button key={tool.id} ref={el => { tabs.current[i] = el; }} type="button" role="tab" id={`ts-tab-${tool.id}`} aria-selected={i === active} aria-controls={`ts-panel-${tool.id}`} tabIndex={i === active ? 0 : -1} className={i === active ? 'on' : ''} onClick={() => choose(i)}>
          <span className="ts-tab-n" aria-hidden="true">{pad(i + 1)}</span>{icons[tool.id]}<span>{tool.name}</span>
          {i === active && turning && <i className="ts-tab-time" aria-hidden="true" onAnimationEnd={() => setActive(n => (n + 1) % tools.length)} />}
        </button>)}
      </div>
      {/* every text is laid out in the same cell, only the chosen one visible, so the box keeps the tallest one's height and nothing below moves when the tool changes */}
      <div className="ts-panels">
        {tools.map((tool, i) => <div key={tool.id} id={`ts-panel-${tool.id}`} role="tabpanel" aria-labelledby={`ts-tab-${tool.id}`} className={`ts-panel ${i === active ? 'on' : ''}`}>
          <h3>{tool.title}</h3>
          <p className="ts-text">{tool.text}</p>
          <ul className="ts-tags">{tool.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
          <Link className="hp-link en-link" to={tool.to}><span>{tool.cta}</span><span className="en-link-arrow" aria-hidden="true"><ArrowUpRight size={16} /></span></Link>
        </div>)}
      </div>
    </div>
  </div>;
}
