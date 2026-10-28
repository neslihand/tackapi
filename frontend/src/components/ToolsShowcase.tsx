import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUpRight, Camera, Check, Compass, HelpCircle, ImagePlus, Layers, MapPin, MessageCircle, Puzzle, ScanLine, Search, Sparkles, Stamp } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { chatEndpoint } from '../lib/chatApi';
import { Link } from '../lib/navigation';
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
    <p className="ts-chip"><Compass size={14} />{artifacts.length} eser · {new Set(artifacts.map(a => a.city)).size} şehir</p>
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
    <p className="ts-bubble q">Bu eser neden yapıldı?</p>
    <p className="ts-bubble a"><span /><span /><span className="short" /></p>
    <p className="ts-bubble q late">Çocuklara nasıl anlatırsın?</p>
    <p className="ts-typing"><i /><i /><i /></p>
    <p className="ts-chip"><Sparkles size={14} />Yapay zekâ rehberi</p>
  </div>;
}

function PlayScene() {
  return <div className="ts-play">
    <span className="ts-card c1"><Puzzle size={30} strokeWidth={1.3} /><b>Yapboz</b></span>
    <span className="ts-card c2"><Search size={30} strokeWidth={1.3} /><b>Dedektif</b></span>
    <span className="ts-card c3"><HelpCircle size={30} strokeWidth={1.3} /><b>Bilgi yarışması</b></span>
    <span className="ts-card c4"><Layers size={30} strokeWidth={1.3} /><b>Bilgi kartları</b></span>
  </div>;
}

function PassportScene({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  return <div className="ts-passport">
    <span className="ts-book"><small>MİRAS PASAPORTU</small><Compass size={46} strokeWidth={.9} /><b>EŞİK</b></span>
    {artifacts.slice(0, 4).map((a, i) => <span key={a.id} className="ts-stamp" style={{ '--i': i } as CSSProperties}><Stamp size={16} /><small>{a.city.toLocaleUpperCase('tr-TR')}</small></span>)}
  </div>;
}

function ShareScene({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  return <div className="ts-share">
    <span className="ts-photo"><img src={artifacts[0].image} alt="" /><small>Ziyaretimden bir kare</small></span>
    <p className="ts-bubble a memory">“Dedemle her bayram bu avluda buluşurduk.”</p>
    <p className="ts-chip ok"><Check size={14} />Onaylandı · eser sayfasında</p>
  </div>;
}

const TOOLS: Tool[] = [
  { id: 'harita', name: 'Miras Haritası', title: <>Yakınında bir <em>hikâye var.</em></>, text: 'Eserleri şehir şehir haritada gör, konumunu paylaşırsan sana en yakın vakıf eserini bul. Bir rota seç, durak durak yürü.', tags: ['Yakınımdaki eserler', 'Şehre göre', 'Rotalar'], to: '/harita', cta: 'Haritayı aç', scene: artifacts => <MapScene artifacts={artifacts} /> },
  { id: 'kamera', name: 'Kamera ile Keşfet', title: <>Önündeki esere <em>bak, tanı.</em></>, text: 'Bir eserin önündeyken kamerayı aç, fotoğrafını çek; EŞİK seni doğrudan o eserin hikâyesine götürsün.', tags: ['Fotoğrafla keşif', 'Doğrudan hikâyeye'], to: '/kamera', cta: 'Kamerayı dene', scene: artifacts => <CameraScene artifacts={artifacts} /> },
  { id: 'sor', name: 'Esere Sor', title: <>Merak ettiğini <em>esere sor.</em></>, text: 'Her eserin sayfasında bir yapay zekâ rehberi seni bekler. Kim yaptırdı, neden yapıldı, bugün ne anlatıyor; sorunu yaz, eserin bilgisine dayanarak yanıtlasın.', tags: ['Yapay zekâ rehberi', 'Eserin bilgisine dayalı'], to: '/kesfet', cta: 'Bir eser seç', scene: () => <AskScene /> },
  { id: 'oyun', name: 'Oyna & Öğren', title: <>Öğrenmenin en <em>keyifli hâli.</em></>, text: 'Yapbozda bir kapıyı yeniden birleştir, dedektif oyununda ipuçlarını izle, bilgi yarışmasında kendini sına. Keşif görevleri ve bilgi kartları da seni bekliyor.', tags: ['Mini oyunlar', 'Keşif görevleri', 'Bilgi yarışması', 'Bilgi kartları', 'Keşif defteri'], to: '/oyun', cta: 'Oyunlara gir', scene: () => <PlayScene /> },
  { id: 'pasaport', name: 'Miras Pasaportu', title: <>Her keşif <em>bir mühür.</em></>, text: 'Okuduğun her hikâye pasaportuna bir mühür basar. Mühürler biriktikçe madalyonlar kazan, kendi miras yolculuğunu oluştur.', tags: ['Mühürler', 'Madalyonlar'], to: '/pasaport', cta: 'Pasaportumu aç', scene: artifacts => <PassportScene artifacts={artifacts} /> },
  { id: 'katki', name: 'Hafızaya Katkı', title: <>Senin anın da <em>bu mirasın parçası.</em></>, text: 'Bir esere dair fotoğrafını ya da anını paylaş. Onaylanan katkılar eserin sayfasında, kitaptaki bilginin yanında yer alır.', tags: ['Fotoğraf', 'Anı ve bilgi', 'Onaylı katkılar'], to: '/giris', cta: 'Katkıda bulun', scene: artifacts => <ShareScene artifacts={artifacts} /> },
];

const icons: Record<string, ReactNode> = { harita: <MapPin size={16} />, kamera: <Camera size={16} />, sor: <MessageCircle size={16} />, oyun: <Puzzle size={16} />, pasaport: <Stamp size={16} />, katki: <ImagePlus size={16} /> };

export function ToolsShowcase({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  // Tools that this build cannot offer are left out: the assistant needs its service, contributions need accounts.
  const tools = TOOLS.filter(t => (t.id !== 'sor' || chatEndpoint()) && (t.id !== 'katki' || vakifApiEnabled()));
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
