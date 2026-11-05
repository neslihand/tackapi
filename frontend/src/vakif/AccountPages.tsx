import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, Award, Check, CircleAlert, Eye, EyeOff, Heart, ImagePlus, LoaderCircle, Lock, LogOut, Mail, ShieldCheck, Stamp, Trash2 } from 'lucide-react';
import { accountApi, useAccount, type ProfileFields, type ProfileOptions } from '../lib/account';
import { consent, setConsent } from '../lib/analytics';
import { known } from '../lib/content';
import { useContent } from '../lib/contentStore';
import { Link, navigate } from '../lib/navigation';
import { achievements } from '../lib/progress';
import { useProgress } from '../lib/store';
import { t } from '../lib/i18n';
import { Scene } from '../components/UI';
import { MedalShelf, PassportStamp } from '../pages/Collection';
import { MyWriting } from './WriteArticle';
import './visitor.css';

function useOptions() {
  const [options, setOptions] = useState<ProfileOptions | null>(null);
  useEffect(() => { accountApi.options().then(setOptions, () => {}); }, []);
  return options;
}

const toggle = (list: string[], id: string) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];

/** İsteğe bağlı profil alanları (kayıt ve "Hesabım"). Ad-soyad ve doğum tarihi istenmez. `plain`: başlıksız, kayıt
 *  formundaki "Seni biraz tanıyalım" bölümünün içinde. */
function ProfileInputs({ value, onChange, options, plain = false }: { value: ProfileFields; onChange: (v: ProfileFields) => void; options: ProfileOptions | null; plain?: boolean }) {
  const fields = <>
    <label className="v-field"><span>{t('Takma ad', 'Nickname')}</span><input maxLength={40} value={value.display_name ?? ''} onChange={e => onChange({ ...value, display_name: e.target.value })} placeholder={t('Katkılarında görünür', 'Shown on your contributions')} /></label>
    <label className="v-field"><span>{t('Yaş aralığı', 'Age range')}</span><select value={value.age_range ?? ''} onChange={e => onChange({ ...value, age_range: e.target.value || null })}>
      <option value="">{t('Belirtmek istemiyorum', 'I would rather not say')}</option>{options?.age_ranges.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    <label className="v-field"><span>{t('Yaşadığın şehir', 'Your home city')}</span><input maxLength={60} value={value.home_city ?? ''} onChange={e => onChange({ ...value, home_city: e.target.value })} /></label>
    <div className="v-field" role="group" aria-labelledby="v-purposes"><span id="v-purposes">{t('Bu siteye neden geldin?', 'Why did you come to this site?')}</span>
      <div className="v-chips">{options?.purposes.map(o => <label key={o.id} className={value.purposes?.includes(o.id) ? 'on' : ''}>
        <input type="checkbox" checked={value.purposes?.includes(o.id) ?? false} onChange={() => onChange({ ...value, purposes: toggle(value.purposes ?? [], o.id) })} />{o.label}</label>)}</div></div>
    <div className="v-field" role="group" aria-labelledby="v-interests"><span id="v-interests">{t('En çok neyi merak ediyorsun?', 'What are you most curious about?')}</span>
      <div className="v-chips">{options?.interests.map(o => <label key={o.id} className={value.interests?.includes(o.id) ? 'on' : ''}>
        <input type="checkbox" checked={value.interests?.includes(o.id) ?? false} onChange={() => onChange({ ...value, interests: toggle(value.interests ?? [], o.id) })} />{o.label}</label>)}</div></div>
  </>;
  if (plain) return <div className="auth-profile">{fields}</div>;
  return <fieldset className="v-fieldset"><legend>{t('Seni biraz tanıyalım', 'Tell us a little about you')} <small>{t('(hepsi isteğe bağlı)', '(all optional)')}</small></legend>{fields}</fieldset>;
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
  const [shown, setShown] = useState(false);
  useEffect(() => { if (user) navigate(next); }, [user, next]);
  const registering = mode === 'register';
  const min = options?.password_min ?? 8;
  const stamps = Object.keys(progress.discovered).length;
  function switchTo(to: 'login' | 'register') { setMode(to); setError(''); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (registering && !agreed) { setError(t('Hesap açmak için aydınlatma metnini onaylaman gerekiyor.', 'To open an account you need to accept the privacy notice.')); return; }
    setBusy(true);
    try {
      if (!registering) await login({ email, password, progress });
      else await register({ email, password, consent: true, progress, ...profile, display_name: profile.display_name?.trim() || undefined, home_city: profile.home_city?.trim() || undefined });
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  // Two panels: what an account gives (dark, with the threshold arch) and the form. On a phone the form comes first.
  return <Scene className="visitor-scene"><div className="auth">
    <div className={`auth-shell ${registering ? 'is-register' : ''}`}>
      <aside className="auth-aside" aria-label={t('Hesabın sana kazandırdıkları', 'What an account gives you')}>
        <svg className="auth-arch" viewBox="0 0 32 42" aria-hidden="true"><path d="M3 39V18Q3 6 16 2Q29 6 29 18V39M8 39V19Q8 10 16 7Q24 10 24 19V39M16 15V39" /></svg>
        <p className="auth-kicker">{t('MİRAS PASAPORTU', 'HERITAGE PASSPORT')}</p>
        <h2>{t('Her kapı bir hikâye,', 'Every door a story,')} <em>{t('hepsi tek pasaportta.', 'all in one passport.')}</em></h2>
        <ul className="auth-perks">
          <li><span><Stamp size={18} aria-hidden="true" /></span><div><strong>{t('Pasaportun her cihazda', 'Your passport on every device')}</strong>
            <p>{t('Mühürlerin, favorilerin ve oyun skorların hesabında saklanır.', 'Your stamps, favourites and game scores are kept in your account.')}</p></div></li>
          <li><span><Award size={18} aria-hidden="true" /></span><div><strong>{t('Madalyonların seninle büyür', 'Your medallions grow with you')}</strong>
            <p>{t('Kazandığın madalyonlar, giriş yaptığın her yerde seni bekler.', 'The medallions you earn wait for you wherever you sign in.')}</p></div></li>
          <li><span><ImagePlus size={18} aria-hidden="true" /></span><div><strong>{t('Mirasa katkıda bulun', 'Add to the heritage')}</strong>
            <p>{t('Eserlere fotoğraf, anı ya da bilgi ekle; onaylanınca eserin sayfasında görünür.', 'Add a photo, memory or fact to a work; once approved it appears on the work’s page.')}</p></div></li>
        </ul>
        <p className="auth-aside-note">{stamps > 0
          ? <><Stamp size={17} aria-hidden="true" />{t(`Bu tarayıcıdaki ${stamps} mühür, giriş yaptığında hesabına eklenir.`, `The ${stamps} ${stamps === 1 ? 'stamp' : 'stamps'} in this browser join your account when you sign in.`)}</>
          : <><ShieldCheck size={17} aria-hidden="true" />{t('Reklam ya da dış analitik yok; verilerin yalnızca bu sitede tutulur.', 'No ads or outside analytics; your data stays on this site.')}</>}</p>
      </aside>

      <section className="auth-main">
        <div className="auth-switch" role="tablist" aria-label={t('Giriş yap ya da hesap aç', 'Sign in or open an account')}>
          <button type="button" role="tab" id="auth-tab-login" aria-selected={!registering} aria-controls="auth-form" onClick={() => switchTo('login')}>{t('Giriş yap', 'Sign in')}</button>
          <button type="button" role="tab" id="auth-tab-register" aria-selected={registering} aria-controls="auth-form" onClick={() => switchTo('register')}>{t('Hesap aç', 'Open an account')}</button>
          <span className="auth-switch-thumb" aria-hidden="true" />
        </div>
        <h1>{registering ? <>{t('Keşfine', 'Give your discovery')} <em>{t('bir ad ver.', 'a name.')}</em></> : <>{t('Tekrar', 'Welcome')} <em>{t('hoş geldin.', 'back.')}</em></>}</h1>
        <p className="auth-lede">{registering
          ? t('Bir dakikada hesabını aç; pasaportun ve madalyonların her cihazda seninle olsun.', 'Open your account in a minute; your passport and medallions come with you on every device.')
          : t('Pasaportuna ve madalyonlarına kaldığın yerden devam et.', 'Pick up your passport and medallions where you left off.')}</p>

        <form id="auth-form" className="auth-form" role="tabpanel" aria-labelledby={registering ? 'auth-tab-register' : 'auth-tab-login'} onSubmit={submit} noValidate>
          <div className="auth-field">
            <label htmlFor="auth-email">{t('E-posta', 'Email')}</label>
            <div className="auth-input"><Mail size={18} aria-hidden="true" />
              <input id="auth-email" type="email" autoComplete="email" inputMode="email" required placeholder={t('ornek@eposta.com', 'name@example.com')} value={email} onChange={e => setEmail(e.target.value)} /></div>
          </div>
          <div className="auth-field">
            <label htmlFor="auth-password">{t('Şifre', 'Password')}</label>
            <div className="auth-input"><Lock size={18} aria-hidden="true" />
              <input id="auth-password" type={shown ? 'text' : 'password'} autoComplete={registering ? 'new-password' : 'current-password'} required minLength={min}
                aria-describedby={registering ? 'auth-password-hint' : undefined} placeholder={registering ? t(`En az ${min} karakter`, `At least ${min} characters`) : '••••••••'} value={password} onChange={e => setPassword(e.target.value)} />
              <button type="button" className="auth-eye" onClick={() => setShown(s => !s)} aria-pressed={shown} aria-label={shown ? t('Şifreyi gizle', 'Hide password') : t('Şifreyi göster', 'Show password')}>
                {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div>
            {registering && <small id="auth-password-hint" className={`auth-hint ${password.length >= min ? 'ok' : ''}`}><Check size={14} aria-hidden="true" />{t(`En az ${min} karakter`, `At least ${min} characters`)}</small>}
          </div>

          {registering && <>
            <section className="auth-more" aria-labelledby="auth-more-title">
              <p className="auth-more-head"><span id="auth-more-title">{t('Seni biraz tanıyalım', 'Tell us a little about you')}</span><small>{t('isteğe bağlı', 'optional')}</small></p>
              <ProfileInputs value={profile} onChange={setProfile} options={options} plain />
            </section>
            <label className="auth-check"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <span>{t('', 'I have read the ')}<Link to="/gizlilik">{t('Aydınlatma metnini', 'privacy notice')}</Link>{t(' okudum; e-postamın ve isteğe bağlı profil bilgilerimin hesabım için işlenmesini kabul ediyorum. 13 yaşından büyüğüm.', ' and agree that my email and optional profile details are processed for my account. I am over 13.')}</span></label>
          </>}

          {error && <p className="auth-error" role="alert"><CircleAlert size={18} aria-hidden="true" />{error}</p>}
          <button className="auth-submit" disabled={busy}>{busy
            ? <><LoaderCircle className="auth-spin" size={18} aria-hidden="true" />{t('Bekleyin…', 'Please wait…')}</>
            : <>{registering ? t('Hesabımı aç', 'Open my account') : t('Giriş yap', 'Sign in')}<ArrowRight size={18} aria-hidden="true" /></>}</button>
        </form>

        <p className="auth-alt">{registering ? t('Zaten hesabın var mı?', 'Already have an account?') : t('Hesabın yok mu?', 'No account yet?')}{' '}
          <button type="button" onClick={() => switchTo(registering ? 'login' : 'register')}>{registering ? t('Giriş yap', 'Sign in') : t('Hemen aç', 'Open one now')}</button></p>
        <p className="auth-trust"><ShieldCheck size={15} aria-hidden="true" />{t('Şifren yalnızca geri çözülemeyen bir özetle saklanır.', 'Your password is kept only as a hash that cannot be reversed.')}
          <Link to="/gizlilik">{t('Aydınlatma metni', 'Privacy notice')}</Link></p>
      </section>
    </div>
  </div></Scene>;
}

export function AccountPage() {
  const { user, ready, update, logout, remove } = useAccount();
  const { progress, toggleFavorite } = useProgress();
  const { artifacts } = useContent();
  const options = useOptions();
  const [profile, setProfile] = useState<ProfileFields | null>(null);
  const [mine, setMine] = useState<MyContribution[]>([]);
  const [message, setMessage] = useState('');
  const [tracking, setTracking] = useState(consent());
  useEffect(() => { if (ready && !user) navigate('/giris?sonra=/hesabim'); }, [ready, user]);
  useEffect(() => { if (user) setProfile({ display_name: user.display_name, age_range: user.age_range, home_city: user.home_city, purposes: user.purposes, interests: user.interests }); }, [user]);
  useEffect(() => { if (user) fetch('/api/me/contributions', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : []).then(setMine, () => {}); }, [user]);
  if (!user || !profile) return <div className="page-shell loading-state" role="status">{t('Hesabın açılıyor…', 'Opening your account…')}</div>;
  async function save(event: FormEvent) {
    event.preventDefault();
    try { await update({ ...profile, display_name: profile?.display_name?.trim() || null, home_city: profile?.home_city?.trim() || null }); setMessage(t('Bilgilerin kaydedildi.', 'Your details have been saved.')); }
    catch (e) { setMessage((e as Error).message); }
  }
  const STATUS: Record<string, string> = { pending: t('Onay bekliyor', 'Awaiting review'), approved: t('Yayında', 'Published'), rejected: t('Yayınlanmadı', 'Not published') };
  const medals = achievements(progress, artifacts);
  const earned = medals.filter(a => a.value >= a.required).length;
  // the latest stamps first; favourites the latest added first
  const stamped = artifacts.filter(a => progress.discovered[a.id]).sort((a, b) => progress.discovered[b.id].localeCompare(progress.discovered[a.id]));
  const cities = new Set(stamped.map(a => a.city)).size;
  const favorites = progress.favorites.flatMap(id => artifacts.filter(a => a.id === id)).reverse();
  return <Scene className="visitor-scene"><div className="page-shell v-page">
    <p className="eyebrow">{t('HESABIM', 'MY ACCOUNT')}</p>
    <h1>{t('Merhaba', 'Hello')}{user.display_name ? `, ${user.display_name}` : ''}.</h1>
    <p className="v-lede">{user.email} · {t(`Pasaportunda ${Object.keys(progress.discovered).length} mühür, ${progress.favorites.length} favori var; her cihazda aynı.`, `Your passport holds ${Object.keys(progress.discovered).length} stamps and ${progress.favorites.length} favourites, the same on every device.`)}</p>
    <section className="v-section" aria-labelledby="v-medals">
      <div className="v-head"><h2 id="v-medals">{t('Madalyonlarım', 'My medallions')}</h2><Link className="text-link" to="/basarimlar">{t('Madalyon odasını aç', 'Open the medal room')} <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      <p className="v-note">{t(`${medals.length} madalyondan ${earned} tanesi sende.`, `You hold ${earned} of ${medals.length} medallions.`)}</p>
      <MedalShelf list={medals} />
    </section>
    <section className="v-section" aria-labelledby="v-passport">
      <div className="v-head"><h2 id="v-passport">{t('Miras Pasaportum', 'My Heritage Passport')}</h2><Link className="text-link" to="/pasaport">{t('Pasaportumu aç', 'Open my passport')} <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      {stamped.length ? <>
        <p className="v-note">{t(`${stamped.length} mühür, ${cities} farklı şehir. Son mühürlerin:`, `${stamped.length} stamps from ${cities} ${cities === 1 ? 'city' : 'different cities'}. Your latest stamps:`)}</p>
        <ul className="v-stamps">{stamped.slice(0, 4).map((a, i) => <li key={a.id}><PassportStamp artifact={a} at={progress.discovered[a.id]} index={i} /></li>)}</ul>
      </> : <p className="v-note">{t('Henüz mühür yok. Bir eserin hikâyesini oku ve sonunda “Pasaportuma mühürle” seçeneğine dokun.', 'No stamps yet. Read the story of a work and tap “Stamp my passport” at the end.')} <Link to="/kesfet">{t('İlk keşfine başla', 'Start your first discovery')}</Link></p>}
    </section>
    <section className="v-section" aria-labelledby="v-favorites">
      <div className="v-head"><h2 id="v-favorites">{t('Favorilerim', 'My favourites')}</h2>{favorites.length > 0 && <Link className="text-link" to="/kesfet">{t('Daha fazla eser', 'More works')} <ArrowUpRight size={16} aria-hidden="true" /></Link>}</div>
      {favorites.length ? <ul className="v-favorites">{favorites.map(a => <li key={a.id}>
        <Link to={`/eser/${a.slug}`}><img src={a.image} alt="" loading="lazy" /><span>{a.city}{known(a.year) ? ` · ${a.year}` : ''}</span><strong>{a.name}</strong></Link>
        <button type="button" className="v-unfavorite" onClick={() => toggleFavorite(a.id)} aria-label={`${t('Favorilerden çıkar', 'Remove from favourites')}: ${a.name}`}><Heart size={17} fill="currentColor" aria-hidden="true" /></button>
      </li>)}</ul>
        : <p className="v-note">{t('Henüz favorin yok. Keşfet’teki eser kartlarında kalbe dokunarak ekleyebilirsin.', 'No favourites yet. Tap the heart on a work’s card in Explore to add one.')} <Link to="/kesfet">{t('Keşfet’e git', 'Go to Explore')}</Link></p>}
    </section>
    <section className="v-section" aria-labelledby="v-profile"><h2 id="v-profile">{t('Profilin', 'Your profile')}</h2>
      <form className="v-form" onSubmit={save}>
        <ProfileInputs value={profile} onChange={setProfile} options={options} />
        {message && <p className="v-note" role="status">{message}</p>}
        <button className="button dark">{t('Kaydet', 'Save')}</button>
      </form>
    </section>
    <section className="v-section"><h2>{t('Katkıların', 'Your contributions')}</h2>
      {mine.length ? <ul className="v-mine">{mine.map(c => <li key={c.id}><Link to={`/eser/${c.monument}`}>{c.monument_name}</Link>
        <span>{c.kind === 'photo' ? t('Fotoğraf', 'Photo') : c.text_kind_label}</span><strong className={`v-status ${c.status}`}>{STATUS[c.status]}</strong>
        {c.reject_reason && <small>{t('Gerekçe', 'Reason')}: {c.reject_reason}</small>}</li>)}</ul>
        : <p className="v-note">{t('Henüz katkın yok. Bir eser sayfasının sonundaki “Ziyaretçi katkıları” bölümünden fotoğraf, anı ya da bilgi ekleyebilirsin.', 'No contributions yet. You can add a photo, memory or fact from the “Visitor contributions” section at the end of a work’s page.')}</p>}
    </section>
    <MyWriting />
    <section className="v-section"><h2>{t('Gizlilik', 'Privacy')}</h2>
      <label className="v-check"><input type="checkbox" checked={tracking === 'granted'} onChange={e => { const v = e.target.checked ? 'granted' : 'denied'; setConsent(v); setTracking(v); }} />
        <span>{t('Keşfimin (baktığım eserler, anlatım biçimi, arama) adım olmadan kaydedilmesine izin veriyorum.', 'I allow my discovery (the works I view, narration style, searches) to be recorded without my name.')} <Link to="/gizlilik">{t('Ayrıntılar', 'Details')}</Link></span></label>
      <div className="v-actions">
        <button className="button line" onClick={() => logout().then(() => navigate('/'))}><LogOut size={16} /> {t('Çıkış yap', 'Sign out')}</button>
        <button className="button line danger" onClick={() => { if (confirm(t('Hesabın, pasaportun, katkıların ve yazıların silinsin mi? Bu geri alınamaz.', 'Delete your account, passport, contributions and articles? This cannot be undone.'))) remove().then(() => navigate('/')); }}><Trash2 size={16} /> {t('Hesabımı sil', 'Delete my account')}</button>
      </div>
    </section>
  </div></Scene>;
}
type MyContribution = { id: number; kind: string; text_kind_label: string | null; status: string; reject_reason: string | null; monument: string; monument_name: string };

export function PrivacyPage() {
  return <Scene className="visitor-scene"><div className="page-shell v-page v-prose">
    <p className="eyebrow">{t('AYDINLATMA METNİ · SÜRÜM 2026-10-28', 'PRIVACY NOTICE · VERSION 2026-10-28')}</p>
    <h1>{t('Verilerin ve', 'Your data and')} <em>{t('senin hakların', 'your rights')}</em></h1>
    <p>{t('EŞİK, vakıf eserlerini tanıtan bir hackathon prototipidir. Verilerin yalnızca bu sitenin sunucusunda tutulur; reklam ya da dış analitik servisi kullanılmaz.', 'EŞİK is a hackathon prototype that introduces foundation (vakıf) works. Your data is kept only on this site’s server; no advertising or outside analytics service is used.')}</p>
    <h2>{t('Hesap açarsan', 'If you open an account')}</h2>
    <p>{t('E-posta adresin ve şifren (yalnızca geri çözülemeyen bir özeti) hesabın için saklanır. Takma ad, yaş aralığı, yaşadığın şehir, ziyaret amacın ve ilgi alanların isteğe bağlıdır; sana eser önermek ve sitenin kimlere ulaştığını toplu olarak görmek için kullanılır. Ad-soyad ve doğum tarihi istemeyiz. 13 yaşından küçükler hesap açamaz.', 'Your email address and password (only a hash that cannot be reversed) are kept for your account. Nickname, age range, home city, reason for visiting and interests are optional; they are used to suggest works to you and to see, in aggregate, whom the site reaches. We do not ask for your full name or date of birth. Children under 13 cannot open an account.')}</p>
    <h2>{t('İzin verirsen', 'If you give permission')}</h2>
    <p>{t('Baktığın eserler, seçtiğin anlatım biçimi, okuma süren, aramaların, “Esere Sor”a yazdığın sorular, harita ve kamera kullanımın bu tarayıcıda üretilen rastgele bir kimlikle kaydedilir. IP adresin ve cihaz bilgin saklanmaz. Bunlarla sana öneriler hazırlar, sitenin hangi bölümlerinin işe yaradığını anlarız. İzin vermezsen hiçbir şey kaydedilmez; site aynen çalışır. İznini “Hesabım” sayfasından ya da tarayıcı verilerini silerek geri alabilirsin.', 'The works you view, the narration style you choose, your reading time, your searches, the questions you write to “Ask the Work” and your use of the map and camera are recorded under a random ID created in this browser. Your IP address and device details are not kept. We use this to prepare suggestions for you and to learn which parts of the site are useful. If you do not give permission, nothing is recorded and the site works just the same. You can withdraw permission on the “My account” page or by clearing your browser’s data.')}</p>
    <h2>{t('Katkı yaparsan', 'If you contribute')}</h2>
    <p>{t('Gönderdiğin fotoğraf ve metinler yönetici onayından sonra eser sayfasında, makalelerin ve terim önerilerin “Makaleler” ile “Terimler” sayfalarında takma adınla görünür. Fotoğrafların içindeki konum ve cihaz bilgisi (EXIF) kaydetmeden önce silinir. Katkılar kitaptaki bilgiden ayrı gösterilir ve sohbet asistanının kaynağı olarak kullanılmaz.', 'Once an administrator approves them, the photos and texts you send appear on the work’s page, and your articles and term suggestions on the “Articles” and “Glossary” pages, under your nickname. Location and device details (EXIF) inside your photos are removed before saving. Contributions are shown apart from the book’s information and are not used as a source for the chat assistant.')}</p>
    <h2>{t('Silme hakkın', 'Your right to deletion')}</h2>
    <p>{t('“Hesabım → Hesabımı sil” ile e-postan, şifren, profil bilgilerin, pasaportun ve katkıların silinir; daha önceki keşif kayıtların hesabından ayrılır ve kimliksiz kalır.', '“My account → Delete my account” deletes your email, password, profile details, passport and contributions; your earlier discovery records are separated from your account and stay anonymous.')}</p>
    <Link className="button dark" to="/">{t('Keşfe dön', 'Back to discovering')}</Link>
  </div></Scene>;
}
