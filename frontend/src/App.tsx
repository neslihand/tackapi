import { Component, lazy, Suspense, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowUp, ArrowUpRight, Camera, Check, Menu, Stamp, UserRound, X } from 'lucide-react';
import { ContentProvider, useContent } from './lib/contentStore';
import { Brand, Scene } from './components/UI';
import { Link, useRoute } from './lib/navigation';
import { ProgressProvider, useProgress } from './lib/store';
import { settleScroll, useParallax, useSmoothScroll } from './lib/motion';
import { Home } from './pages/Home';
import { Explore } from './pages/Explore';
import { Story } from './pages/Story';
import { Achievements, Passport } from './pages/Collection';
import { Play, playSections } from './pages/Play';
import { chatEndpoint } from './lib/chatApi';
import { t } from './lib/i18n';
import { LangSwitch } from './components/LangSwitch';
import { vakifApiEnabled } from './lib/vakifApi';
import { AccountProvider, useAccount } from './lib/account';
import { track } from './lib/analytics';
import { ConsentBanner } from './vakif/ConsentBanner';
const AccountPages = () => import('./vakif/AccountPages');
const LoginPage = lazy(() => AccountPages().then(m => ({ default: m.LoginPage })));
const AccountPage = lazy(() => AccountPages().then(m => ({ default: m.AccountPage })));
const PrivacyPage = lazy(() => AccountPages().then(m => ({ default: m.PrivacyPage })));
const MapPage = lazy(() => import('./pages/MapPage').then(m => ({ default: m.MapPage })));
const CameraPage = lazy(() => import('./pages/Camera').then(m => ({ default: m.Camera })));
const AdminPage = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <div className="page-shell empty-state"><h1>{t('Bir an durakladık.', 'We paused for a moment.')}</h1><p>{t('Sayfayı yenileyerek keşfine devam edebilirsin.', 'Reload the page to carry on exploring.')}</p><button className="button dark" onClick={() => window.location.reload()}>{t('Yeniden aç', 'Reload')}</button></div> : this.props.children; }
}

function Navigation({ route }: { route: string }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(window.scrollY > 60);
  const [dark, setDark] = useState(false);
  // On a first visit to the home page the bar arrives last, after the entrance has drawn itself.
  const [intro] = useState(() => route === '/');
  const { progress } = useProgress();
  const account = useAccount();
  useEffect(() => { setOpen(false); }, [route]);
  useEffect(() => {
    if (!open) return;
    document.querySelector<HTMLAnchorElement>('#mobile-menu a')?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); document.querySelector<HTMLButtonElement>('.mobile-toggle')?.focus(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  // A layout effect, so the bar has the right treatment in the first frame of a page.
  useLayoutEffect(() => {
    // The bar takes the dark treatment while it floats over any section marked data-nav-theme="dark".
    let frame = 0;
    const check = () => {
      frame = 0;
      setScrolled(window.scrollY > 60);
      // The section actually showing under the bar, so a pinned dark section covered by a light one does not count.
      const under = document.elementsFromPoint(window.innerWidth / 2, 40).find(el => !el.closest('.navigation, .mobile-menu'));
      // The nearest marked section decides, so a light area inside a dark page counts as light.
      setDark(under?.closest('[data-nav-theme]')?.getAttribute('data-nav-theme') === 'dark');
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(check); };
    check();
    const late = setTimeout(check, 120);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const swapped = new MutationObserver(schedule);
    const main = document.getElementById('main');
    if (main) swapped.observe(main, { childList: true });
    return () => { cancelAnimationFrame(frame); clearTimeout(late); swapped.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [route]);
  const links = [['/', t('Ana Sayfa', 'Home')], ['/kesfet', t('Keşfet', 'Explore')], ['/harita', t('Miras Haritası', 'Heritage Map')], ['/oyun', t('Oyna & Öğren', 'Play & Learn')], ['/basarimlar', t('Madalyonlar', 'Medallions')]];
  // The home link is current only on the home page itself; the others also for the pages under them.
  const current = (to: string) => to === '/' ? route === '/' : route.startsWith(to);
  return <header className={`navigation ${dark ? 'nav-dark' : ''} ${scrolled ? 'scrolled' : ''} ${intro ? 'nav-intro' : ''}`}><Brand /><nav className="desktop-nav" aria-label={t('Ana menü', 'Main menu')}>{links.map(([to, label], i) => <Link to={to} key={to} className={current(to) ? 'active' : ''} aria-current={current(to) ? 'page' : undefined}><span className="nav-num" aria-hidden="true">0{i + 1}</span><span className="nav-label">{label}</span></Link>)}</nav><div className="nav-actions"><LangSwitch className="nav-lang" /><Link to="/kamera" className="nav-camera" aria-label={t('Kamera ile keşfet', 'Discover with the camera')}><Camera size={19} /></Link>{account.enabled && <Link to={account.user ? '/hesabim' : '/giris'} className="nav-camera" aria-label={account.user ? `${t('Hesabım', 'My account')}${account.user.display_name ? `: ${account.user.display_name}` : ''}` : t('Giriş yap ya da hesap aç', 'Sign in or create an account')} title={account.user ? t('Hesabım', 'My account') : t('Giriş yap', 'Sign in')}><UserRound size={19} /></Link>}<Link className="nav-passport" to="/pasaport"><Stamp size={17} /><span>{t('Miras Pasaportum', 'My Heritage Passport')}</span><small><span className="sr-only">, </span>{Object.keys(progress.discovered).length}<span className="sr-only">{t(' keşif', ' discoveries')}</span></small></Link><button className="mobile-toggle icon-button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? t('Menüyü kapat', 'Close the menu') : t('Menüyü aç', 'Open the menu')}>{open ? <X /> : <Menu />}</button></div>{open && <nav id="mobile-menu" className="mobile-menu" aria-label={t('Mobil menü', 'Mobile menu')} onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); document.querySelector<HTMLButtonElement>('.mobile-toggle')?.focus(); } }}>{links.map(([to, label]) => <Link key={to} to={to}>{label}<ArrowUpRight size={18} /></Link>)}<Link to="/pasaport">{t('Miras Pasaportum', 'My Heritage Passport')}<Stamp size={18} /></Link><Link to="/kamera">{t('Kamera ile keşfet', 'Discover with the camera')}<Camera size={18} /></Link>{account.enabled && <Link to={account.user ? '/hesabim' : '/giris'}>{account.user ? t('Hesabım', 'My account') : t('Giriş yap', 'Sign in')}<UserRound size={18} /></Link>}<LangSwitch className="menu-lang" /></nav>}</header>;
}

// The footer, on every page: one last invitation under a row of doors, the links in three groups, the project's
// credits and a way back to the top.
function Footer() {
  const { artifacts } = useContent();
  const cities = new Set(artifacts.map(a => a.city)).size;
  const groups: [string, [string, string][]][] = [
    [t('Keşfet', 'Explore'), [['/kesfet', t('Eserleri Keşfet', 'Explore the Collection')], ['/harita', t('Miras Haritası', 'Heritage Map')], ['/kamera', t('Kamera ile Keşfet', 'Discover with the Camera')]]],
    [t('Oyna & Öğren', 'Play & Learn'), [['/oyun', t('Oyna & Öğren', 'Play & Learn')], ['/oyun/quiz', t('Bilgi Yarışması', 'Knowledge Quiz')], ['/pasaport', t('Miras Pasaportum', 'My Heritage Passport')], ['/basarimlar', t('Madalyonlar', 'Medallions')]]],
    [t('Proje', 'Project'), [['/hakkinda', t('Proje & Kaynaklar', 'Project & Sources')], ...(vakifApiEnabled() ? [['/gizlilik', t('Gizlilik ve veriler', 'Privacy and data')] as [string, string]] : []), ['/yonetim', t('Demo Yönetim Paneli', 'Demo Admin Panel')]]],
  ];
  function top() { settleScroll(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  return <footer className="footer ft" data-nav-theme="dark">
    <div className="ft-doors" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <i key={i} />)}</div>
    <div className="ft-invite" data-curtain>
      <p className="ft-kicker"><span>✦</span>{t('BİR SONRAKİ HİKÂYEN SENİ BEKLİYOR', 'YOUR NEXT STORY AWAITS')}</p>
      <Link to="/kesfet" className="ft-cta">{t('Merak etmeye', 'Stay')} <em>{t('devam et.', 'curious.')}</em><span className="ft-cta-arrow" aria-hidden="true"><ArrowUpRight /></span></Link>
      <p className="ft-count"><b>{String(artifacts.length).padStart(2, '0')}</b> {t('eser', 'works')} <span>·</span> <b>{String(cities).padStart(2, '0')}</b> {t('şehir', 'cities')} <span>·</span> <i>{t('keşfedilmeyi bekliyor', 'waiting to be discovered')}</i></p>
    </div>
    <div className="ft-main" data-curtain>
      <div className="ft-brand"><Brand /><p>{t('Geçmişin izinde.', 'In the footsteps of the past.')}<br /><em>{t('Geleceğe birlikte.', 'Together into the future.')}</em></p><small>{t('Vakıf Katılım · Vakıf Eserleri Envanter Projesi kapsamında geliştirilen dijital keşif platformu.', 'A digital discovery platform built within Vakıf Katılım’s Waqf Works Inventory Project.')}</small></div>
      {groups.map(([title, links]) => <nav key={title} className="ft-group" aria-label={title}><h2>{title}</h2><ul>{links.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}</ul></nav>)}
    </div>
    <div className="footer-bottom ft-bottom" data-curtain><span>© {new Date().getFullYear()} EŞİK · Girls & Codes</span><span>{t('KÜLTÜREL MİRASI MERAKLA YAŞATIYORUZ.', 'KEEPING HERITAGE ALIVE THROUGH CURIOSITY.')}</span><span>{t('Bir Kök & Kod hackathon prototipi.', 'A Kök & Kod hackathon prototype.')}</span><button className="ft-top" onClick={top}>{t('Başa dön', 'Back to top')} <ArrowUp size={14} aria-hidden="true" /></button></div>
  </footer>;
}

function About() {
  const { readOnly } = useContent();
  const chat = Boolean(chatEndpoint());
  if (readOnly) return <Scene><div className="page-shell about-page"><p className="eyebrow">EŞİK · GIRLS & CODES</p><h1>Kaynaklarıyla <em>keşfet.</em></h1><p className="intro-copy">Bu koleksiyondaki eserlerin açıklamalarını ve varsa anlatımlarını okuyabilir, kaynak bağlantılarını inceleyebilir ve dijital keşiflerini pasaportuna ekleyebilirsin.</p><p>Eksik bilgiler ayrıca belirtilir. Kaynak bağlantıları her eserin detayında yer alır. Pasaport bu tarayıcıda saklanır ve fiziksel ziyaret doğrulaması içermez.{chat && ' “Esere Sor” yanıtları yapay zekâ ile üretilir ve hata içerebilir; yazdığın sorular yanıt için yapay zekâ servisine gönderilir.'}</p><Link className="button dark" to="/kesfet">Eserleri keşfet <ArrowRight size={18} /></Link></div></Scene>;
  return <Scene><div className="page-shell about-page"><p className="eyebrow">GIRLS & CODES · KÖK & KOD</p><h1>Geçmişe açılan,<br /><em>birlikte büyüyen bir kapı.</em></h1><p className="intro-copy">EŞİK; vakıf eserlerinin fark edilmesini, merak edilmesini ve keşfedilmesini amaçlayan bir kültürel miras prototipidir.</p><div className="about-grid" data-stagger><section><h2>Bu ilk eşikte</h2><p>Altı eser, dört şehir ve üç anlatım biçimiyle başlayan koleksiyon; hikâyeleri, dönemlere göre bir zaman tünelini, keşif sezonlarını, dijital keşif pasaportunu, madalyonları ve bir bilgi yarışmasını buluşturur.</p><p>Metinler önceden hazırlanmıştır. Kamera ekranı, eser seçimine dayalı bir demodur. <Link to="/yonetim">Yönetim paneli</Link> yalnızca bu tarayıcıda çalışan yerel bir demodur. {chat ? 'Eser sayfalarındaki “Esere Sor” asistanı, sorularını ayrı bir yapay zekâ servisiyle yanıtlar; yanıtlar hata içerebilir. Bu sürümde görüntü tanıma modeli veya kullanıcı hesabı bulunmaz.' : 'Bu sürümde yapay zekâ servisi, görüntü tanıma modeli, sunucu veya kullanıcı hesabı bulunmaz.'}</p><h2>Keşfin sana ait</h2><p>Favorilerin ve ilerlemen bu tarayıcıda tutulur. Pasaport mühürleri dijital keşfi gösterir. Konumun ve yüklediğin fotoğraflar sunucuya gönderilmez.{chat && ' “Esere Sor”a yazdığın sorular yanıt üretmek için yapay zekâ servisine gönderilir; sohbet geçmişin bu tarayıcıda tutulur.'} Çevrimiçi sokak haritasını açarsan OpenStreetMap sunucusundan harita döşemeleri istenir.</p><h2>Girls & Codes</h2><p>Neslihan Doğan · AI & Mobile Developer<br />Fatmanur Çetintaş · Full Stack & Game Developer</p><p>42 Kocaeli · Kök & Kod Hackathon</p></section><section><h2>Kaynaklara dayanan hikâyeler</h2><p>Tarihî bilgiler UNESCO, Kültür Portalı, TDV İslâm Ansiklopedisi ve ilgili kurumların içerikleri esas alınarak derlenmiştir. Her eserin sayfasında kaynak bağlantıları yer alır.</p><p>Hikâyeleştirme modundaki hayalî yürüyüş ve atmosferler yaratıcı anlatımdır. Tarihler yapının kuruluş, inşa veya bezeme aşamalarını gösterebilir; tek bir restorasyon kronolojisi olarak okunmamalıdır.</p><h2>Görsel yaklaşım</h2><p>Tüm mimari çizimler bu prototip için üretilmiş özgün SVG illüstrasyonlardır. Fotoğraf, ölçülü rölöve veya tarihî rekonstrüksiyon değildir. Kapı, Anadolu mimarisinden esinlenen hayalî bir kompozisyondur.</p><a className="text-link" href="/images/SOURCES.md" target="_blank" rel="noreferrer">Görsel kaynak ve kullanım notları <ArrowUpRight size={17} /></a><h2>Referanslar</h2><p><a href="https://artsandculture.google.com/" target="_blank" rel="noreferrer">Google Arts & Culture</a> · <a href="https://dogstudio.co/" target="_blank" rel="noreferrer">Dogstudio</a> · <a href="https://the-goonies.webflow.io/" target="_blank" rel="noreferrer">The Goonies</a> · <a href="https://www.sbs.com.au/theboat/" target="_blank" rel="noreferrer">SBS The Boat</a></p></section></div><Link className="button dark" to="/kesfet">İlk hikâyeni keşfet <ArrowRight size={18} /></Link></div></Scene>;
}

function Router() {
  const route = useRoute();
  const [path, query = ''] = route.split('?');
  const { toast, storageAvailable } = useProgress();
  const { artifacts, readOnly } = useContent();
  const artifact = path.startsWith('/eser/') ? artifacts.find(a => a.slug === path.split('/')[2]) : undefined;
  const playSection = path === '/oyun' ? '' : playSections.find(([id]) => path === `/oyun/${id}`)?.[0];
  useSmoothScroll();
  useParallax(path);
  useEffect(() => {
    const titles: Record<string, string> = { '/': t('Tarihe Açılan Kapı', 'A Door to History'), '/kesfet': t('Eserleri Keşfet', 'Explore the Collection'), '/harita': t('Miras Haritası', 'Heritage Map'), '/oyun': t('Oyna & Öğren', 'Play & Learn'), '/oyun/oyunlar': t('Mini Oyunlar', 'Mini Games'), '/oyun/gorevler': t('Keşif Görevleri', 'Discovery Quests'), '/oyun/quiz': t('Tarihin İzinde', 'On the Trail of History'), '/oyun/bilgi-kartlari': t('Bilgi Kartları', 'Knowledge Cards'), '/oyun/kesif-defteri': t('Keşif Defteri', 'Discovery Journal'), '/basarimlar': t('Miras Madalyonları', 'Heritage Medallions'), '/pasaport': t('Miras Pasaportum', 'My Heritage Passport'), '/kamera': t('Kamera ile Keşfet', 'Discover with the Camera'), '/hakkinda': t('Proje ve Kaynaklar', 'Project and Sources'), '/yonetim': t('Demo Yönetim Paneli', 'Demo Admin Panel'), '/giris': t('Giriş yap', 'Sign in'), '/hesabim': t('Hesabım', 'My account'), '/gizlilik': t('Gizlilik ve veriler', 'Privacy and data') };
    document.title = `${artifact?.name || titles[path] || t('Sayfa bulunamadı', 'Page not found')} — EŞİK`;
    if (path !== '/') document.getElementById('main')?.focus({ preventScroll: true });
    track('page_view');
  }, [path, artifact]);
  let page: ReactNode;
  // The backend collection keeps the home page (the gate entrance); other read-only feeds open on the catalogue.
  if (path === '/') page = readOnly && !vakifApiEnabled() ? <Explore key={query} query={query} /> : <Home />;
  else if (path === '/kesfet') page = <Explore key={query} query={query} />;
  else if (artifact) page = <Story key={artifact.id} artifact={artifact} />;
  else if (path === '/basarimlar') page = <Achievements />;
  else if (path === '/pasaport') page = <Passport />;
  else if (playSection !== undefined) page = <Play section={playSection || undefined} query={query} />;
  else if (path === '/harita') page = <MapPage key={query} query={query} />;
  else if (path === '/kamera') page = <CameraPage />;
  else if (path === '/hakkinda') page = <About />;
  else if (path === '/yonetim') page = <AdminPage />;
  else if (path === '/giris' && vakifApiEnabled()) page = <LoginPage query={query} />;
  else if (path === '/hesabim' && vakifApiEnabled()) page = <AccountPage />;
  else if (path === '/gizlilik' && vakifApiEnabled()) page = <PrivacyPage />;
  else page = <Scene><div className="empty-state page-shell"><p className="eyebrow">{t('404 · BU KAPI HENÜZ AÇILMADI', '404 · THIS DOOR IS NOT OPEN YET')}</p><h1>{t('Başka bir iz sürelim.', 'Let us follow another trail.')}</h1><Link className="button dark" to="/kesfet">{t('Eserlere dön', 'Back to the collection')} <ArrowRight size={17} /></Link></div></Scene>;
  return <><a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>{t('İçeriğe geç', 'Skip to content')}</a><Navigation route={path} /><main id="main" tabIndex={-1}><Suspense fallback={<div className="page-shell loading-state" role="status">{t('Keşif haritan hazırlanıyor…', 'Preparing your discovery…')}</div>}>{page}</Suspense></main><Footer /><ConsentBanner /><div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast && <><Check size={18} /><span>{toast}</span></>}</div>{!storageAvailable && <div className="storage-warning" role="status">{t('Tarayıcı kaydı kapalı; ilerlemen bu oturumda tutuluyor.', 'Browser storage is off; your progress is kept for this visit only.')}</div>}</>;
}
function ContentReady() {
  const { artifacts, issues, progressStorageKey } = useContent();
  // Do not mount progress or pages that require a selected artifact until the
  // read collection is valid and nonempty. In particular, do not erase stamps.
  if (issues.length) return <main className="page-shell empty-state" role="alert"><h1>Eserler açılamadı.</h1><p>Koleksiyon verisi okunamadı. Lütfen veri kaynağını kontrol ederek yeniden dene.</p></main>;
  if (!artifacts.length) return <main className="page-shell empty-state" role="status"><h1>Koleksiyon henüz boş.</h1><p>Eserler eklendiğinde burada keşfedebileceksin.</p></main>;
  return <AccountProvider><ProgressProvider key={progressStorageKey}><Router /></ProgressProvider></AccountProvider>;
}

export function App({ artifactFeed }: { artifactFeed?: unknown } = {}) {
  return <ErrorBoundary><ContentProvider artifactFeed={artifactFeed}><ContentReady /></ContentProvider></ErrorBoundary>;
}
