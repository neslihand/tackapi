import { useEffect, useState, type ReactNode } from 'react';
import { Building2, History, Images, LayoutDashboard, LogOut, MapPinned, Plus } from 'lucide-react';
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

const NAV: [string, string, ReactNode][] = [
  ['/', 'Pano', <LayoutDashboard size={17} />], ['/fotograflar', 'Fotoğraflar', <Images size={17} />],
  ['/eserler', 'Eserler', <Building2 size={17} />], ['/yeni-eser', 'Yeni eser', <Plus size={17} />],
  ['/sehirler', 'Şehirler', <MapPinned size={17} />], ['/kayit', 'Değişiklik kaydı', <History size={17} />],
];

function Shell({ user, onLogout, pending }: { user: string; onLogout: () => void; pending: number | null }) {
  const { path, params } = useRoute();
  const active = (to: string) => to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`) || (to === '/eserler' && path.startsWith('/eser/'));
  let page: ReactNode;
  if (path === '/') page = <Dashboard />;
  else if (path === '/fotograflar') page = <ImageQueue params={params} />;
  else if (path === '/eserler') page = <Monuments params={params} />;
  else if (path.startsWith('/eser/')) page = <MonumentEdit key={path} slug={decodeURIComponent(path.slice(6))} />;
  else if (path === '/yeni-eser') page = <MonumentNew />;
  else if (path === '/sehirler') page = <Cities />;
  else if (path === '/kayit') page = <AuditLog params={params} />;
  else page = <div className="empty">Bu sayfa bulunamadı. <Link className="text-link" to="/">Panoya dön</Link></div>;
  useEffect(() => { document.getElementById('main')?.focus({ preventScroll: true }); }, [path]);
  return <div className="shell">
    <a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>İçeriğe geç</a>
    <aside className="sidebar"><Brand />
      <nav aria-label="Yönetim menüsü">{NAV.map(([to, label, icon]) => <Link key={to} to={to} aria-current={active(to) ? 'page' : undefined}>{icon}{label}{to === '/fotograflar' && pending ? <b title="Kontrol bekleyen fotoğraf">{pending}</b> : null}</Link>)}</nav>
      <div className="sidebar-foot"><span>Giriş: <strong>{user}</strong></span><button onClick={onLogout}><LogOut size={15} /> Çıkış yap</button></div>
    </aside>
    <main id="main" tabIndex={-1} className="content">{page}</main>
  </div>;
}

export function App() {
  const [user, setUser] = useState<string | null>(null);
  const [checking, setChecking] = useState(Boolean(getToken()));
  const [pending, setPending] = useState<number | null>(null);
  const { path } = useRoute();
  useEffect(() => {
    handleUnauthorized(() => setUser(null));
    if (!getToken()) return;
    api.me().then(me => setUser(me.name)).catch(() => setToken(null)).finally(() => setChecking(false));
  }, []);
  // Menüdeki "kontrol bekleyen" sayısı her sayfa değişiminde tazelenir
  useEffect(() => {
    if (!user) return;
    api.stats().then(s => setPending(s.images.find(c => c.review_status === 'draft')?.n ?? 0)).catch(() => {});
  }, [user, path]);
  useEffect(() => { document.title = 'EŞİK — Yönetim Paneli'; }, []);
  if (checking) return <div className="login" role="status"><p style={{ color: '#f4efe5' }}>Oturum denetleniyor…</p></div>;
  return <ToastProvider>{user
    ? <Shell user={user} pending={pending} onLogout={() => { setToken(null); setUser(null); }} />
    : <Login onLogin={setUser} />}</ToastProvider>;
}
