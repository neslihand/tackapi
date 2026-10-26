import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { api, setToken } from '../lib/api';
import { Brand, Field } from '../components/UI';

export function Login({ onLogin }: { onLogin: (name: string) => void }) {
  const [token, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    setToken(token.trim());
    try { onLogin((await api.me()).name); }
    catch (e) { setToken(null); setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="login"><form onSubmit={submit} aria-labelledby="login-title">
    <Brand />
    <div><h1 id="login-title">Yönetici girişi</h1><p className="admin-help" style={{ marginTop: 8 }}>Size verilen yönetici anahtarını girin. Anahtar yalnızca bu sekmede tutulur; sekmeyi kapatınca silinir.</p></div>
    <Field label="Yönetici anahtarı"><input type="password" autoComplete="current-password" required minLength={16} value={token} onChange={e => setValue(e.target.value)} autoFocus /></Field>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button dark" disabled={busy || token.trim().length < 16}><KeyRound size={17} />{busy ? 'Denetleniyor…' : 'Giriş yap'}</button>
  </form></div>;
}
