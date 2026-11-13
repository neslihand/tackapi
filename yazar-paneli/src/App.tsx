import { useEffect, useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { getToken, handleUnauthorized, setToken } from './lib/api';
import { authorApi, type Me } from './lib/author';
import { Link, navigate, useRoute } from './lib/navigation';
import { Brand, ToastProvider, useToast } from './components/UI';
import { Login, PasswordForm } from './pages/Login';
import { Works } from './pages/Works';
import { AuthorWorkPage } from './pages/Work';

const initials = (name: string) => name.replace(/^(Prof\.|Doç\.|Dr\.|Öğr\.|Gör\.|Arş\.|\s)+/g, '').split(/\s+/).filter(Boolean).slice(0, 2)
  .map(w => w[0]?.toLocaleUpperCase('tr-TR')).join('') || '?';

function Shell({ me, setMe, onLogout }: { me: Me; setMe: (m: Me) => void; onLogout: () => void }) {
  const { path } = useRoute();
  const notify = useToast();
  const [changing, setChanging] = useState(false);
  useEffect(() => { document.getElementById('main')?.focus({ preventScroll: true }); setChanging(false); }, [path]);
  let page;
  if (/^\/dosya\/\d+$/.test(path)) page = <AuthorWorkPage key={path} id={Number(path.slice(7))} />;
  else if (path === '/') page = <Works me={me} />;
  else page = <div className="empty">Bu sayfa bulunamadı. <Link className="text-link" to="/">Yazım dosyalarıma dön</Link></div>;
  return <div className="yazar-shell">
    <a href="#main" className="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main')?.focus(); }}>İçeriğe geç</a>
    <header className="yazar-top">
      <Link to="/" aria-label="Yazım dosyalarım"><Brand /></Link>
      <nav aria-label="Yazar menüsü"><Link to="/" aria-current={path === '/' ? 'page' : undefined}>Yazım dosyalarım</Link></nav>
      <div className="yazar-user">
        <span className="avatar" aria-hidden="true">{initials(me.name)}</span>
        <span className="yazar-user-name"><strong>{me.name}</strong><small>{me.email}</small></span>
        <button className="icon-button" onClick={() => setChanging(c => !c)} title="Şifre değiştir" aria-label="Şifre değiştir" aria-expanded={changing}><KeyRound size={17} /></button>
        <button className="icon-button" onClick={onLogout} title="Çıkış yap" aria-label="Çıkış yap"><LogOut size={17} /></button>
      </div>
    </header>
    <main id="main" tabIndex={-1} className="content yazar-content">
      {changing && <PasswordForm me={me} forced={false} onCancel={() => setChanging(false)} onDone={m => { setMe(m); setChanging(false); notify('Şifreniz değiştirildi.'); }} />}
      {page}
    </main>
  </div>;
}

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(Boolean(getToken()));
  useEffect(() => {
    document.title = 'TAÇKAPI — Yazar Paneli';
    handleUnauthorized(() => setMe(null));
    if (!getToken()) return;
    authorApi.me().then(setMe).catch(() => setToken(null)).finally(() => setChecking(false));
  }, []);
  async function logout() {
    try { await authorApi.logout(); } catch { /* oturum zaten düşmüşse sorun değil */ }
    setToken(null); setMe(null); navigate('/');
  }
  if (checking) return <div className="login" role="status"><p style={{ color: '#f4efe5' }}>Oturum denetleniyor…</p></div>;
  return <ToastProvider>{!me ? <Login onLogin={setMe} />
    : me.must_change ? <PasswordForm me={me} forced onDone={setMe} />
    : <Shell me={me} setMe={setMe} onLogout={logout} />}</ToastProvider>;
}
