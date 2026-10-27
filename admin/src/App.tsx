import { useEffect, useState, type ReactNode } from 'react';
import { Building2, History, Images, LayoutDashboard, LogOut, MapPinned, Plus, Route, ScanSearch, SplitSquareVertical } from 'lucide-react';
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

const NAV: [string, string, ReactNode][] = [
  ['/', 'Pano', <LayoutDashboard size={17} />], ['/fotograflar', 'Fotoğraflar', <Images size={17} />],
  ['/eserler', 'Eserler', <Building2 size={17} />], ['/bolumleme', 'Bölümleme', <SplitSquareVertical size={17} />], ['/yeni-eser', 'Yeni eser', <Plus size={17} />],
  ['/gorsel-arama', 'Görselle arama', <ScanSearch size={17} />], ['/rotalar', 'Keşif rotaları', <Route size={17} />],
  ['/sehirler', 'Şehirler', <MapPinned size={17} />], ['/kayit', 'Değişiklik kaydı', <History size={17} />],
];

type Pending = { images: number; segmentation: number } | null;

function Shell({ user, onLogout, pending }: { user: string; onLogout: () => void; pending: Pending }) {
  const { path, params } = useRoute();
  const active = (to: string) => to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`) || (to === '/eserler' && path.startsWith('/eser/'));
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
  else page = <div className="empty">Bu sayfa bulunamadı. <Link className="text-link" to="/">Panoya dön</Link></div>;
  useEffect(() => { document.getElementById('main')?.focus({ preventScroll: true }); }, [path]);
  return <div className="shell">
    <a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>İçeriğe geç</a>
    <aside className="sidebar"><Brand />
      <nav aria-label="Yönetim menüsü">{NAV.map(([to, label, icon]) => <Link key={to} to={to} aria-current={active(to) ? 'page' : undefined}>{icon}{label}{to === '/fotograflar' && pending?.images ? <b title="Kontrol bekleyen fotoğraf">{pending.images}</b> : null}{to === '/bolumleme' && pending?.segmentation ? <b title="Bakılacak paragraf">{pending.segmentation}</b> : null}</Link>)}</nav>
      <div className="sidebar-foot"><span>Giriş: <strong>{user}</strong></span><button onClick={onLogout}><LogOut size={15} /> Çıkış yap</button></div>
    </aside>
    <main id="main" tabIndex={-1} className="content">{page}</main>
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
      segmentation: s.segmentation_pending ?? 0 })).catch(() => {});
  }, [user, path]);
  useEffect(() => { document.title = 'EŞİK — Yönetim Paneli'; }, []);
  if (checking) return <div className="login" role="status"><p style={{ color: '#f4efe5' }}>Oturum denetleniyor…</p></div>;
  // Önizleme panel kabuğu olmadan, ziyaretçinin göreceği gibi tam genişlikte açılır
  const preview = path.startsWith('/onizleme/');
  return <ToastProvider>{!user ? <Login onLogin={setUser} />
    : preview ? <main id="main" tabIndex={-1}><PreviewPage key={path} slug={decodeURIComponent(path.slice(10))} params={params} /></main>
    : <Shell user={user} pending={pending} onLogout={() => { setToken(null); setUser(null); }} />}</ToastProvider>;
}
