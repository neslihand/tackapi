import { useState, type FormEvent } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { setToken } from '../lib/api';
import { authorApi, passwordIssues, type Me } from '../lib/author';
import { Brand, Field } from '../components/UI';

export function Login({ onLogin }: { onLogin: (me: Me) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try { const r = await authorApi.login(email.trim(), password); setToken(r.token); onLogin(r); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="login"><form onSubmit={submit} aria-labelledby="login-title">
    <Brand />
    <div><h1 id="login-title">Yazar girişi</h1><p className="admin-help" style={{ marginTop: 8 }}>Envanter kitabının yazarları için çalışma alanı. Hesabınızı editörünüz açar;
      ilk girişte size verilen geçici şifreyi değiştirmeniz istenir.</p></div>
    <Field label="E-posta"><input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} autoFocus /></Field>
    <Field label="Şifre"><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button dark" disabled={busy || !email.trim() || !password}><LogIn size={17} />{busy ? 'Giriş yapılıyor…' : 'Giriş yap'}</button>
    <p className="admin-help">Şifrenizi unuttuysanız editörünüzden yeni bir geçici şifre isteyin.</p>
  </form></div>;
}

/** Şifre değiştirme: ilk girişte zorunlu (geçici şifre), sonra menüden isteğe bağlı. */
export function PasswordForm({ me, forced, onDone, onCancel }: { me: Me; forced: boolean; onDone: (me: Me) => void; onCancel?: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const issues = passwordIssues(current, next, again);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (issues.length) { setError(issues[0]); return; }
    setBusy(true); setError('');
    try { onDone(await authorApi.changePassword(current, next)); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const body = <form onSubmit={submit} aria-labelledby="pw-title">
    {forced && <Brand />}
    <div><h1 id="pw-title">{forced ? `Hoş geldiniz, ${me.name}` : 'Şifre değiştir'}</h1>
      <p className="admin-help" style={{ marginTop: 8 }}>{forced ? 'Devam etmeden önce editörünüzün verdiği geçici şifreyi kendi şifrenizle değiştirin.'
        : 'Değiştirince diğer cihazlardaki oturumlarınız kapanır.'}</p></div>
    <Field label={forced ? 'Geçici şifre' : 'Şu anki şifre'}><input type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} autoFocus /></Field>
    <Field label="Yeni şifre" hint="En az 10 karakter."><input type="password" autoComplete="new-password" required value={next} onChange={e => setNext(e.target.value)} /></Field>
    <Field label="Yeni şifre (tekrar)"><input type="password" autoComplete="new-password" required value={again} onChange={e => setAgain(e.target.value)} /></Field>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-actions"><button className="button dark" disabled={busy || !current || !next || !again}><KeyRound size={17} />{busy ? 'Kaydediliyor…' : 'Şifreyi kaydet'}</button>
      {onCancel && <button type="button" className="text-link" onClick={onCancel}>Vazgeç</button>}</div>
  </form>;
  return forced ? <div className="login">{body}</div> : <section className="side-card yazar-password">{body}</section>;
}
