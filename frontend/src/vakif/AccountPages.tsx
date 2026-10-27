import { useEffect, useState, type FormEvent } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import { accountApi, useAccount, type ProfileFields, type ProfileOptions } from '../lib/account';
import { consent, setConsent } from '../lib/analytics';
import { Link, navigate } from '../lib/navigation';
import { useProgress } from '../lib/store';
import { Scene } from '../components/UI';
import './visitor.css';

function useOptions() {
  const [options, setOptions] = useState<ProfileOptions | null>(null);
  useEffect(() => { accountApi.options().then(setOptions, () => {}); }, []);
  return options;
}

const toggle = (list: string[], id: string) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];

/** İsteğe bağlı profil alanları (kayıt ve "Hesabım"). Ad-soyad ve doğum tarihi istenmez. */
function ProfileInputs({ value, onChange, options }: { value: ProfileFields; onChange: (v: ProfileFields) => void; options: ProfileOptions | null }) {
  return <fieldset className="v-fieldset"><legend>Seni biraz tanıyalım <small>(hepsi isteğe bağlı)</small></legend>
    <label className="v-field"><span>Takma ad</span><input maxLength={40} value={value.display_name ?? ''} onChange={e => onChange({ ...value, display_name: e.target.value })} placeholder="Katkılarında görünür" /></label>
    <label className="v-field"><span>Yaş aralığı</span><select value={value.age_range ?? ''} onChange={e => onChange({ ...value, age_range: e.target.value || null })}>
      <option value="">Belirtmek istemiyorum</option>{options?.age_ranges.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    <label className="v-field"><span>Yaşadığın şehir</span><input maxLength={60} value={value.home_city ?? ''} onChange={e => onChange({ ...value, home_city: e.target.value })} /></label>
    <div className="v-field" role="group" aria-labelledby="v-purposes"><span id="v-purposes">Bu siteye neden geldin?</span>
      <div className="v-chips">{options?.purposes.map(o => <label key={o.id} className={value.purposes?.includes(o.id) ? 'on' : ''}>
        <input type="checkbox" checked={value.purposes?.includes(o.id) ?? false} onChange={() => onChange({ ...value, purposes: toggle(value.purposes ?? [], o.id) })} />{o.label}</label>)}</div></div>
    <div className="v-field" role="group" aria-labelledby="v-interests"><span id="v-interests">En çok neyi merak ediyorsun?</span>
      <div className="v-chips">{options?.interests.map(o => <label key={o.id} className={value.interests?.includes(o.id) ? 'on' : ''}>
        <input type="checkbox" checked={value.interests?.includes(o.id) ?? false} onChange={() => onChange({ ...value, interests: toggle(value.interests ?? [], o.id) })} />{o.label}</label>)}</div></div>
  </fieldset>;
}

export function LoginPage({ query }: { query: string }) {
  const { login, register, user } = useAccount();
  const { progress } = useProgress();
  const options = useOptions();
  const next = new URLSearchParams(query).get('sonra') || '/hesabim';
  const [mode, setMode] = useState<'login' | 'register'>(new URLSearchParams(query).get('kayit') ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [profile, setProfile] = useState<ProfileFields>({ purposes: [], interests: [] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) navigate(next); }, [user, next]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mode === 'register' && !agreed) { setError('Hesap açmak için aydınlatma metnini onaylaman gerekiyor.'); return; }
    setBusy(true);
    try {
      if (mode === 'login') await login({ email, password, progress });
      else await register({ email, password, consent: true, progress, ...profile, display_name: profile.display_name?.trim() || undefined, home_city: profile.home_city?.trim() || undefined });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Scene className="visitor-scene"><div className="page-shell v-page">
    <p className="eyebrow">MİRAS PASAPORTUN HER CİHAZDA</p>
    <h1>{mode === 'login' ? <>Tekrar <em>hoş geldin.</em></> : <>Keşfine <em>bir ad ver.</em></>}</h1>
    <p className="v-lede">Hesabınla pasaportun ve madalyonların her cihazda seninle gelir; eserlere fotoğraf, anı ya da bilgi ekleyebilirsin.</p>
    <div className="v-tabs" role="tablist">
      <button role="tab" aria-selected={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>Giriş yap</button>
      <button role="tab" aria-selected={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>Hesap aç</button>
    </div>
    <form className="v-form" onSubmit={submit} noValidate>
      <label className="v-field"><span>E-posta</span><input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="v-field"><span>Şifre</span><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={options?.password_min ?? 8} value={password} onChange={e => setPassword(e.target.value)} />
        {mode === 'register' && <small>En az {options?.password_min ?? 8} karakter.</small>}</label>
      {mode === 'register' && <>
        <ProfileInputs value={profile} onChange={setProfile} options={options} />
        <label className="v-check"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
          <span><Link to="/gizlilik">Aydınlatma metnini</Link> okudum; e-postamın ve isteğe bağlı profil bilgilerimin hesabım için işlenmesini kabul ediyorum. 13 yaşından büyüğüm.</span></label>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button dark" disabled={busy}>{busy ? 'Bekleyin…' : mode === 'login' ? 'Giriş yap' : 'Hesabımı aç'}</button>
      {mode === 'login' && <p className="v-note">Hesabın yok mu? <button type="button" className="text-link" onClick={() => setMode('register')}>Hemen aç</button></p>}
    </form>
  </div></Scene>;
}

export function AccountPage() {
  const { user, ready, update, logout, remove } = useAccount();
  const { progress } = useProgress();
  const options = useOptions();
  const [profile, setProfile] = useState<ProfileFields | null>(null);
  const [mine, setMine] = useState<MyContribution[]>([]);
  const [message, setMessage] = useState('');
  const [tracking, setTracking] = useState(consent());
  useEffect(() => { if (ready && !user) navigate('/giris?sonra=/hesabim'); }, [ready, user]);
  useEffect(() => { if (user) setProfile({ display_name: user.display_name, age_range: user.age_range, home_city: user.home_city, purposes: user.purposes, interests: user.interests }); }, [user]);
  useEffect(() => { if (user) fetch('/api/me/contributions', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []).then(setMine, () => {}); }, [user]);
  if (!user || !profile) return <div className="page-shell loading-state" role="status">Hesabın açılıyor…</div>;
  async function save(event: FormEvent) {
    event.preventDefault();
    try { await update({ ...profile, display_name: profile?.display_name?.trim() || null, home_city: profile?.home_city?.trim() || null }); setMessage('Bilgilerin kaydedildi.'); }
    catch (e) { setMessage((e as Error).message); }
  }
  const STATUS: Record<string, string> = { pending: 'Onay bekliyor', approved: 'Yayında', rejected: 'Yayınlanmadı' };
  return <Scene className="visitor-scene"><div className="page-shell v-page">
    <p className="eyebrow">HESABIM</p>
    <h1>Merhaba{user.display_name ? `, ${user.display_name}` : ''}.</h1>
    <p className="v-lede">{user.email} · Pasaportunda {Object.keys(progress.discovered).length} mühür, {progress.favorites.length} favori var; her cihazda aynı.</p>
    <form className="v-form" onSubmit={save}>
      <ProfileInputs value={profile} onChange={setProfile} options={options} />
      {message && <p className="v-note" role="status">{message}</p>}
      <button className="button dark">Kaydet</button>
    </form>
    <section className="v-section"><h2>Katkıların</h2>
      {mine.length ? <ul className="v-mine">{mine.map(c => <li key={c.id}><Link to={`/eser/${c.monument}`}>{c.monument_name}</Link>
        <span>{c.kind === 'photo' ? 'Fotoğraf' : c.text_kind_label}</span><strong className={`v-status ${c.status}`}>{STATUS[c.status]}</strong>
        {c.reject_reason && <small>Gerekçe: {c.reject_reason}</small>}</li>)}</ul>
        : <p className="v-note">Henüz katkın yok. Bir eser sayfasının sonundaki “Ziyaretçi katkıları” bölümünden fotoğraf, anı ya da bilgi ekleyebilirsin.</p>}
    </section>
    <section className="v-section"><h2>Gizlilik</h2>
      <label className="v-check"><input type="checkbox" checked={tracking === 'granted'} onChange={e => { const v = e.target.checked ? 'granted' : 'denied'; setConsent(v); setTracking(v); }} />
        <span>Keşfimin (baktığım eserler, anlatım biçimi, arama) adım olmadan kaydedilmesine izin veriyorum. <Link to="/gizlilik">Ayrıntılar</Link></span></label>
      <div className="v-actions">
        <button className="button line" onClick={() => logout().then(() => navigate('/'))}><LogOut size={16} /> Çıkış yap</button>
        <button className="button line danger" onClick={() => { if (confirm('Hesabın, pasaportun ve katkıların silinsin mi? Bu geri alınamaz.')) remove().then(() => navigate('/')); }}><Trash2 size={16} /> Hesabımı sil</button>
      </div>
    </section>
  </div></Scene>;
}
type MyContribution = { id: number; kind: string; text_kind_label: string | null; status: string; reject_reason: string | null; monument: string; monument_name: string };

export function PrivacyPage() {
  return <Scene className="visitor-scene"><div className="page-shell v-page v-prose">
    <p className="eyebrow">AYDINLATMA METNİ · SÜRÜM 2026-10-28</p>
    <h1>Verilerin ve <em>senin hakların</em></h1>
    <p>EŞİK, vakıf eserlerini tanıtan bir hackathon prototipidir. Verilerin yalnızca bu sitenin sunucusunda tutulur; reklam ya da dış analitik servisi kullanılmaz.</p>
    <h2>Hesap açarsan</h2>
    <p>E-posta adresin ve şifren (yalnızca geri çözülemeyen bir özeti) hesabın için saklanır. Takma ad, yaş aralığı, yaşadığın şehir, ziyaret amacın ve ilgi alanların isteğe bağlıdır; sana eser önermek ve sitenin kimlere ulaştığını toplu olarak görmek için kullanılır. Ad-soyad ve doğum tarihi istemeyiz. 13 yaşından küçükler hesap açamaz.</p>
    <h2>İzin verirsen</h2>
    <p>Baktığın eserler, seçtiğin anlatım biçimi, okuma süren, aramaların, “Esere Sor”a yazdığın sorular, harita ve kamera kullanımın bu tarayıcıda üretilen rastgele bir kimlikle kaydedilir. IP adresin ve cihaz bilgin saklanmaz. Bunlarla sana öneriler hazırlar, sitenin hangi bölümlerinin işe yaradığını anlarız. İzin vermezsen hiçbir şey kaydedilmez; site aynen çalışır. İznini “Hesabım” sayfasından ya da tarayıcı verilerini silerek geri alabilirsin.</p>
    <h2>Katkı yaparsan</h2>
    <p>Gönderdiğin fotoğraf ve metinler yönetici onayından sonra eser sayfasında takma adınla görünür. Fotoğrafların içindeki konum ve cihaz bilgisi (EXIF) kaydetmeden önce silinir. Katkılar kitaptaki bilgiden ayrı gösterilir ve sohbet asistanının kaynağı olarak kullanılmaz.</p>
    <h2>Silme hakkın</h2>
    <p>“Hesabım → Hesabımı sil” ile e-postan, şifren, profil bilgilerin, pasaportun ve katkıların silinir; daha önceki keşif kayıtların hesabından ayrılır ve kimliksiz kalır.</p>
    <Link className="button dark" to="/">Keşfe dön</Link>
  </div></Scene>;
}
