import { useEffect, useState, type ReactNode } from 'react';
import { BarChart3, BookA, Building2, CalendarDays, ChevronRight, CircleHelp, History, Images, LayoutDashboard, LogOut, MapPinned, Megaphone, Menu, MessageSquareHeart, Newspaper, Plus, Route, ScanSearch, Sparkles, SplitSquareVertical, X } from 'lucide-react';
import { api, getToken, handleUnauthorized, setToken } from './lib/api';
import { Link, useRoute } from './lib/navigation';
import { Brand, ToastProvider } from './components/UI';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ImageQueue } from './pages/Images';
import { Monuments } from './pages/Monuments';
import { MonumentEdit } from './pages/MonumentEdit';
import { MonumentNew } from './pages/MonumentNew';
import { Cities } from './pages/Cities';
import { AuditLog } from './pages/AuditLog';
import { PreviewPage } from './pages/Preview';
import { Segmentation } from './pages/Segmentation';
import { VisualSearchPage } from './pages/VisualSearchPage';
import { RoutesPage } from './pages/Routes';
import { QuizPage } from './pages/Quiz';
import { ContributionsPage } from './pages/Contributions';
import { InsightsPage } from './pages/Insights';
import { AssistantPage } from './pages/Assistant';
import { CalendarPage } from './pages/Calendar';
import { AgendaPage } from './pages/Agenda';
import { ArticlesPage } from './pages/Articles';
import { ArticleEdit } from './pages/ArticleEdit';
import { ArticleImport } from './pages/ArticleImport';
import { TermsPage } from './pages/Terms';

type Pending = { images: number; segmentation: number; contributions: number; agent: number; articles: number; terms: number } | null;
type NavItem = { to: string; label: string; icon: ReactNode; badge?: keyof NonNullable<Pending>; badgeTitle?: string };

// Menü, işin türüne göre gruplanır; uzun liste kendi içinde kaydırılır, giriş bilgisi altta sabit kalır.
const NAV: { title: string; items: NavItem[] }[] = [
  { title: 'Genel', items: [
    { to: '/', label: 'Pano', icon: <LayoutDashboard size={17} /> },
    { to: '/asistan', label: 'Asistan', icon: <Sparkles size={17} />, badge: 'agent', badgeTitle: 'Asistanın açık önerisi' },
    { to: '/analitik', label: 'Ziyaretçi analitiği', icon: <BarChart3 size={17} /> },
  ] },
  { title: 'Koleksiyon', items: [
    { to: '/eserler', label: 'Eserler', icon: <Building2 size={17} /> },
    { to: '/yeni-eser', label: 'Yeni eser', icon: <Plus size={17} /> },
    { to: '/fotograflar', label: 'Fotoğraflar', icon: <Images size={17} />, badge: 'images', badgeTitle: 'Kontrol bekleyen fotoğraf' },
    { to: '/bolumleme', label: 'Bölümleme', icon: <SplitSquareVertical size={17} />, badge: 'segmentation', badgeTitle: 'Bakılacak paragraf' },
    { to: '/gorsel-arama', label: 'Görselle arama', icon: <ScanSearch size={17} /> },
  ] },
  { title: 'Ziyaretçi içeriği', items: [
    { to: '/katkilar', label: 'Ziyaretçi katkıları', icon: <MessageSquareHeart size={17} />, badge: 'contributions', badgeTitle: 'Onay bekleyen katkı' },
    { to: '/makaleler', label: 'Makaleler', icon: <Newspaper size={17} />, badge: 'articles', badgeTitle: 'Onay bekleyen makale' },
    { to: '/terimler', label: 'Terimler', icon: <BookA size={17} />, badge: 'terms', badgeTitle: 'Onay bekleyen terim önerisi' },
  ] },
  { title: 'Keşif ve etkinlik', items: [
    { to: '/rotalar', label: 'Keşif rotaları', icon: <Route size={17} /> },
    { to: '/gundem', label: 'Gündem', icon: <Megaphone size={17} /> },
    { to: '/takvim', label: 'Takvim', icon: <CalendarDays size={17} /> },
    { to: '/sorular', label: 'Yarışma soruları', icon: <CircleHelp size={17} /> },
  ] },
  { title: 'Sistem', items: [
    { to: '/sehirler', label: 'Şehirler', icon: <MapPinned size={17} /> },
    { to: '/kayit', label: 'Değişiklik kaydı', icon: <History size={17} /> },
  ] },
];

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toLocaleUpperCase('tr-TR')).join('') || '?';

function Shell({ user, onLogout, pending }: { user: string; onLogout: () => void; pending: Pending }) {
  const { path, params } = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const active = (to: string) => to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`) || (to === '/eserler' && path.startsWith('/eser/')) || (to === '/makaleler' && (path.startsWith('/makale/') || path === '/makale-aktar'));
  const current = NAV.flatMap(g => g.items.map(i => ({ group: g.title, ...i }))).find(i => active(i.to));
  const waiting = pending ? Object.values(pending).reduce((a, b) => a + b, 0) : 0;
  let page: ReactNode;
  if (path === '/') page = <Dashboard />;
  else if (path === '/fotograflar') page = <ImageQueue params={params} />;
  else if (path === '/eserler') page = <Monuments params={params} />;
  else if (path.startsWith('/eser/')) page = <MonumentEdit key={path} slug={decodeURIComponent(path.slice(6))} />;
  else if (path === '/yeni-eser') page = <MonumentNew />;
  else if (path === '/sehirler') page = <Cities />;
  else if (path === '/bolumleme') page = <Segmentation params={params} />;
  else if (path === '/kayit') page = <AuditLog params={params} />;
  else if (path === '/gorsel-arama') page = <VisualSearchPage />;
  else if (path === '/rotalar') page = <RoutesPage />;
  else if (path === '/sorular') page = <QuizPage />;
  else if (path === '/katkilar') page = <ContributionsPage params={params} />;
  else if (path === '/analitik') page = <InsightsPage />;
  else if (path === '/asistan') page = <AssistantPage params={params} />;
  else if (path === '/takvim') page = <CalendarPage />;
  else if (path === '/gundem') page = <AgendaPage />;
  else if (path === '/makaleler') page = <ArticlesPage params={params} />;
  else if (path === '/makale-aktar') page = <ArticleImport params={params} />;
  else if (/^\/makale\/\d+$/.test(path)) page = <ArticleEdit key={path} id={Number(path.slice(8))} />;
  else if (path === '/terimler') page = <TermsPage params={params} />;
  else page = <div className="empty">Bu sayfa bulunamadı. <Link className="text-link" to="/">Panoya dön</Link></div>;
  useEffect(() => { document.getElementById('main')?.focus({ preventScroll: true }); setMenuOpen(false); }, [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  return <div className={`shell ${menuOpen ? 'menu-open' : ''}`}>
    <a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>İçeriğe geç</a>
    <aside className="sidebar" id="sidebar">
      <div className="sidebar-head"><Link to="/" aria-label="Panoya dön"><Brand /></Link>
        <button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat"><X size={20} /></button></div>
      <nav className="sidebar-nav" aria-label="Yönetim menüsü">{NAV.map(group => <div className="nav-group" key={group.title}>
        <p className="nav-group-title">{group.title}</p>
        {group.items.map(({ to, label, icon, badge, badgeTitle }) => <Link key={to} to={to} aria-current={active(to) ? 'page' : undefined}>
          {icon}<span>{label}</span>{badge && pending?.[badge] ? <b title={badgeTitle}>{pending[badge]}</b> : null}</Link>)}
      </div>)}</nav>
      <div className="sidebar-foot"><span className="avatar" aria-hidden="true">{initials(user)}</span>
        <span className="sidebar-user"><small>Giriş yapan</small><strong>{user}</strong></span>
        <button className="icon-button" onClick={onLogout} title="Çıkış yap" aria-label="Çıkış yap"><LogOut size={17} /></button></div>
    </aside>
    <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />
    <div className="workspace">
      <header className="topbar">
        <button className="icon-button menu-toggle" onClick={() => setMenuOpen(true)} aria-label="Menüyü aç" aria-controls="sidebar" aria-expanded={menuOpen}>
          <Menu size={21} />{waiting > 0 && <i className="menu-dot" aria-hidden="true" />}</button>
        <p className="crumbs">{current ? <><span>{current.group}</span><ChevronRight size={14} aria-hidden="true" /><strong>{current.label}</strong></> : <strong>Yönetim paneli</strong>}</p>
        <span className="topbar-date">{new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </header>
      <main id="main" tabIndex={-1} className="content">{page}</main>
    </div>
  </div>;
}

export function App() {
  const [user, setUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(Boolean(getToken()));
  const [pending, setPending] = useState<Pending>(null);
  const { path, params } = useRoute();
  useEffect(() => {
    handleUnauthorized(() => setUser(null));
    if (!getToken()) return;
    api.me().then(me => setUser(me.name)).catch(() => setToken(null)).finally(() => setChecking(false));
  }, []);
  // Menüdeki "kontrol bekleyen" sayısı her sayfa değişiminde tazelenir
  useEffect(() => {
    if (!user) return;
    api.stats().then(s => setPending({ images: s.images.find(c => c.review_status === 'draft')?.n ?? 0,
      segmentation: s.segmentation_pending ?? 0, contributions: s.contributions_pending ?? 0, agent: s.agent_open ?? 0,
      articles: s.articles_pending ?? 0, terms: s.terms_pending ?? 0 })).catch(() => {});
  }, [user, path]);
  useEffect(() => { document.title = 'EŞİK — Yönetim Paneli'; }, []);
  if (checking) return <div className="login" role="status"><p style={{ color: '#f4efe5' }}>Oturum denetleniyor…</p></div>;
  // Önizleme panel kabuğu olmadan, ziyaretçinin göreceği gibi tam genişlikte açılır
  const preview = path.startsWith('/onizleme/');
  return <ToastProvider>{!user ? <Login onLogin={setUser} />
    : preview ? <main id="main" tabIndex={-1}><PreviewPage key={path} slug={decodeURIComponent(path.slice(10))} params={params} /></main>
    : <Shell user={user} pending={pending} onLogout={() => { setToken(null); setUser(null); }} />}</ToastProvider>;
}
