import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUpRight, Camera, Check, Menu, Stamp, X } from 'lucide-react';
import { ContentProvider, useContent } from './lib/contentStore';
import { Brand } from './components/UI';
import { Link, useRoute } from './lib/navigation';
import { ProgressProvider, useProgress } from './lib/store';
import { Home } from './pages/Home';
import { Explore } from './pages/Explore';
import { Story } from './pages/Story';
import { Achievements, Passport } from './pages/Collection';
import { Quiz } from './pages/Quiz';
const MapPage = lazy(() => import('./pages/MapPage').then(m => ({ default: m.MapPage })));
const CameraPage = lazy(() => import('./pages/Camera').then(m => ({ default: m.Camera })));
const AdminPage = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="page-shell empty-state"><h1>Bir an durakladık.</h1><p>Sayfayı yenileyerek keşfine devam edebilirsin.</p><button className="button dark" onClick={() => window.location.reload()}>Yeniden aç</button></div> : this.props.children; }
}

function Navigation({ route }: { route: string }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(window.scrollY > 60);
  const [dark, setDark] = useState(false);
  const { progress } = useProgress();
  useEffect(() => { setOpen(false); }, [route]);
  useEffect(() => {
    // The bar takes the dark treatment while it floats over any section marked data-nav-theme="dark".
    let frame = 0;
    const check = () => {
      frame = 0;
      setScrolled(window.scrollY > 60);
      setDark([...document.querySelectorAll('[data-nav-theme="dark"]')].some(el => { const r = el.getBoundingClientRect(); return r.top <= 40 && r.bottom >= 40; }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(check); };
    check();
    const late = setTimeout(check, 120);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); clearTimeout(late); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [route]);
  const links = [['/kesfet', 'Keşfet'], ['/harita', 'Miras Haritası'], ['/oyun', 'Oyna & Öğren'], ['/basarimlar', 'Madalyonlar']];
  return <header className={`navigation ${dark ? 'nav-dark' : ''} ${scrolled ? 'scrolled' : ''}`}><Brand /><nav className="desktop-nav" aria-label="Ana menü">{links.map(([to, label]) => <Link to={to} key={to} className={route.startsWith(to) ? 'active' : ''} aria-current={route.startsWith(to) ? 'page' : undefined}>{label}</Link>)}</nav><div className="nav-actions"><Link to="/kamera" className="nav-camera" aria-label="Kamera ile keşfet"><Camera size={19} /></Link><Link className="nav-passport" to="/pasaport"><Stamp size={17} /><span>Miras Pasaportum</span><small>{Object.keys(progress.discovered).length}</small></Link><button className="mobile-toggle icon-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'}>{open ? <X /> : <Menu />}</button></div>{open && <nav id="mobile-menu" className="mobile-menu" aria-label="Mobil menü" onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); document.querySelector<HTMLButtonElement>('.mobile-toggle')?.focus(); } }}>{links.map(([to, label]) => <Link key={to} to={to}>{label}<ArrowUpRight size={18} /></Link>)}<Link to="/pasaport">Miras Pasaportum<Stamp size={18} /></Link><Link to="/kamera">Kamera ile keşfet<Camera size={18} /></Link></nav>}</header>;
}

function Footer() {
  return <footer className="footer" data-nav-theme="dark"><div className="footer-top"><div><Brand /><p>Geçmişin izinde.<br />Geleceğe birlikte.</p></div><div className="footer-discover"><span>BİR SONRAKİ HİKÂYEN SENİ BEKLİYOR.</span><Link to="/kesfet">Merak etmeye<br /><em>devam et.</em><ArrowUpRight /></Link></div><div className="footer-links"><Link to="/harita">Miras Haritası</Link><Link to="/pasaport">Miras Pasaportum</Link><Link to="/kamera">Kamera ile Keşfet</Link><Link to="/hakkinda">Proje & Kaynaklar</Link><Link to="/yonetim">Demo Yönetim Paneli</Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} EŞİK · Girls & Codes</span><span>KÜLTÜREL MİRASI MERAKLA YAŞATIYORUZ.</span><span>Bir Kök & Kod hackathon prototipi.</span></div></footer>;
}

function About() {
  return <div className="page-shell about-page"><p className="eyebrow">GIRLS & CODES · KÖK & KOD</p><h1>Geçmişe açılan,<br /><em>birlikte büyüyen bir kapı.</em></h1><p className="intro-copy">EŞİK; vakıf eserlerinin fark edilmesini, merak edilmesini ve keşfedilmesini amaçlayan bir kültürel miras prototipidir.</p><div className="about-grid"><section><h2>Bu ilk eşikte</h2><p>Altı eser, dört şehir ve üç anlatım biçimiyle başlayan koleksiyon; hikâyeleri, dönemlere göre bir zaman tünelini, keşif sezonlarını, dijital keşif pasaportunu, madalyonları ve bir bilgi yarışmasını buluşturur.</p><p>Metinler önceden hazırlanmıştır. Kamera ekranı, eser seçimine dayalı bir demodur. <Link to="/yonetim">Yönetim paneli</Link> yalnızca bu tarayıcıda çalışan yerel bir demodur. Bu sürümde yapay zekâ servisi, görüntü tanıma modeli, sunucu veya kullanıcı hesabı bulunmaz.</p><h2>Keşfin sana ait</h2><p>Favorilerin ve ilerlemen bu tarayıcıda tutulur. Pasaport mühürleri dijital keşfi gösterir. Konumun ve yüklediğin fotoğraflar sunucuya gönderilmez. Çevrimiçi sokak haritasını açarsan OpenStreetMap sunucusundan harita döşemeleri istenir.</p><h2>Girls & Codes</h2><p>Neslihan Doğan · AI & Mobile Developer<br />Fatmanur Çetintaş · Full Stack & Game Developer</p><p>42 Kocaeli · Kök & Kod Hackathon</p></section><section><h2>Kaynaklara dayanan hikâyeler</h2><p>Tarihî bilgiler UNESCO, Kültür Portalı, TDV İslâm Ansiklopedisi ve ilgili kurumların içerikleri esas alınarak derlenmiştir. Her eserin sayfasında kaynak bağlantıları yer alır.</p><p>Hikâyeleştirme modundaki hayalî yürüyüş ve atmosferler yaratıcı anlatımdır. Tarihler yapının kuruluş, inşa veya bezeme aşamalarını gösterebilir; tek bir restorasyon kronolojisi olarak okunmamalıdır.</p><h2>Görsel yaklaşım</h2><p>Tüm mimari çizimler bu prototip için üretilmiş özgün SVG illüstrasyonlardır. Fotoğraf, ölçülü rölöve veya tarihî rekonstrüksiyon değildir. Kapı, Anadolu mimarisinden esinlenen hayalî bir kompozisyondur.</p><a className="text-link" href="/images/SOURCES.md" target="_blank" rel="noreferrer">Görsel kaynak ve kullanım notları <ArrowUpRight size={17} /></a><h2>Referanslar</h2><p><a href="https://artsandculture.google.com/" target="_blank" rel="noreferrer">Google Arts & Culture</a> · <a href="https://dogstudio.co/" target="_blank" rel="noreferrer">Dogstudio</a> · <a href="https://the-goonies.webflow.io/" target="_blank" rel="noreferrer">The Goonies</a> · <a href="https://www.sbs.com.au/theboat/" target="_blank" rel="noreferrer">SBS The Boat</a></p></section></div><Link className="button dark" to="/kesfet">İlk hikâyeni keşfet <ArrowRight size={18} /></Link></div>;
}

function Router() {
  const route = useRoute();
  const [path, query = ''] = route.split('?');
  const { toast, storageAvailable } = useProgress();
  const { artifacts } = useContent();
  const artifact = path.startsWith('/eser/') ? artifacts.find(a => a.slug === path.split('/')[2]) : undefined;
  useEffect(() => {
    const titles: Record<string, string> = { '/': 'Tarihe Açılan Kapı', '/kesfet': 'Eserleri Keşfet', '/harita': 'Miras Haritası', '/oyun': 'Tarihin İzinde', '/basarimlar': 'Miras Madalyonları', '/pasaport': 'Miras Pasaportum', '/kamera': 'Kamera ile Keşfet', '/hakkinda': 'Proje ve Kaynaklar', '/yonetim': 'Demo Yönetim Paneli' };
    document.title = `${artifact?.name || titles[path] || 'Sayfa bulunamadı'} — EŞİK`;
    if (path !== '/') document.getElementById('main')?.focus({ preventScroll: true });
  }, [path, artifact]);
  let page: ReactNode;
  if (path === '/') page = <Home />;
  else if (path === '/kesfet') page = <Explore key={query} query={query} />;
  else if (artifact) page = <Story key={artifact.id} artifact={artifact} />;
  else if (path === '/basarimlar') page = <Achievements />;
  else if (path === '/pasaport') page = <Passport />;
  else if (path === '/oyun') page = <Quiz />;
  else if (path === '/harita') page = <MapPage />;
  else if (path === '/kamera') page = <CameraPage />;
  else if (path === '/hakkinda') page = <About />;
  else if (path === '/yonetim') page = <AdminPage />;
  else page = <div className="empty-state page-shell"><p className="eyebrow">404 · BU KAPI HENÜZ AÇILMADI</p><h1>Başka bir iz sürelim.</h1><Link className="button dark" to="/kesfet">Eserlere dön <ArrowRight size={17} /></Link></div>;
  return <><a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>İçeriğe geç</a><Navigation route={path} /><main id="main" tabIndex={-1}><Suspense fallback={<div className="page-shell loading-state" role="status">Keşif haritan hazırlanıyor…</div>}>{page}</Suspense></main><Footer /><div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast && <><Check size={18} /><span>{toast}</span></>}</div>{!storageAvailable && <div className="storage-warning" role="status">Tarayıcı kaydı kapalı; ilerlemen bu oturumda tutuluyor.</div>}</>;
}
export function App() { return <ErrorBoundary><ContentProvider><ProgressProvider><Router /></ProgressProvider></ContentProvider></ErrorBoundary>; }
