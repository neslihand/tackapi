// Visitor account (backend/pipeline/visitors.py), the same account as on the site. The phone asks for the session
// key at sign-in (token: true), keeps it in the keychain (secret.ts) and sends it as a Bearer header.
// Syncing: the passport is sent on sign-in, a moment after every change and when the app comes back to the front;
// the server merges it with the other devices' progress and the merged passport is taken back in (store.absorb).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { ApiError, request, setSessionKey } from './api';
import { t } from './i18n';
import { canonical, type Progress } from './passport';
import { clearSecret, readSecret, writeSecret } from './secret';
import { usePassport } from './store';

export type User = { id: number; email: string; display_name: string | null; age_range: string | null; home_city: string | null;
  purposes: string[]; interests: string[]; created_at: string };
export type ProfileFields = Partial<Pick<User, 'display_name' | 'age_range' | 'home_city' | 'purposes' | 'interests'>>;
export type ProfileOptions = { consent_version: string; password_min: number; age_ranges: Option[]; purposes: Option[]; interests: Option[] };
type Option = { id: string; label: string };
type SignedIn = { user: User; progress: Progress; token?: string };
export type SyncState = 'idle' | 'syncing' | 'done' | 'offline';

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
export const accountApi = {
  options: () => request<ProfileOptions>('/api/profile-options'),
  me: () => request<{ user: User; progress: Progress }>('/api/me'),
  register: (body: ProfileFields & { email: string; password: string; consent: boolean; progress: Progress }) =>
    request<SignedIn>('/api/auth/register', json('POST', { ...body, token: true })),
  login: (body: { email: string; password: string; progress: Progress }) => request<SignedIn>('/api/auth/login', json('POST', { ...body, token: true })),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  update: (body: ProfileFields) => request<{ user: User }>('/api/me', json('PATCH', body)),
  remove: () => request<void>('/api/me', { method: 'DELETE' }),
  sync: (progress: Progress) => request<{ progress: Progress }>('/api/me/progress', json('PUT', { progress })),
};

type Account = {
  user: User | null; ready: boolean; sync: SyncState; lastSync: Date | null;
  register: (body: Omit<Parameters<typeof accountApi.register>[0], 'progress'>) => Promise<User>;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>; update: (body: ProfileFields) => Promise<User>; remove: () => Promise<void>; syncNow: () => void;
};
const Context = createContext<Account | null>(null);
const SYNC_DELAY = 1500;

export function AccountProvider({ children }: { children: ReactNode }) {
  const { progress, ready: passportReady, absorb } = usePassport();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState>('idle');
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const synced = useRef<string | null>(null);      // the passport the server last confirmed, in canonical form
  const latest = useRef(progress);
  useEffect(() => { latest.current = progress; }, [progress]);

  const signOutHere = useCallback(async () => {
    setSessionKey(null); await clearSecret(); setUser(null); synced.current = null; setSync('idle'); setLastSync(null);
  }, []);
  const took = useCallback((server: Progress) => {
    absorb(server); synced.current = canonical(server); setSync('done'); setLastSync(new Date());
  }, [absorb]);

  const syncNow = useCallback(() => {
    if (!user) return;
    setSync('syncing');
    accountApi.sync(latest.current).then(r => took(r.progress), e => {
      if (e instanceof ApiError && e.status === 401) signOutHere();
      else setSync('offline');
    });
  }, [user, took, signOutHere]);

  // a saved session: who is it? then send what this phone gathered meanwhile
  useEffect(() => {
    if (!passportReady) return;
    readSecret().then(async key => {
      if (!key) return;
      setSessionKey(key);
      try { const r = await accountApi.me(); setUser(r.user); took(r.progress); }
      catch (e) { if (e instanceof ApiError && e.status === 401) await signOutHere(); else setSync('offline'); }
    }).finally(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passportReady]);

  // a moment after every change (and once the merged passport differs from what the server has)
  useEffect(() => {
    if (!user || synced.current === canonical(progress)) return;
    const timer = setTimeout(syncNow, SYNC_DELAY);
    return () => clearTimeout(timer);
  }, [user, progress, syncNow]);

  // back in front: another device may have added stamps
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state === 'active') syncNow(); });
    return () => sub.remove();
  }, [syncNow]);

  const signedIn = useCallback(async (r: SignedIn) => {
    if (r.token) { setSessionKey(r.token); await writeSecret(r.token); }
    setUser(r.user); took(r.progress);
    return r.user;
  }, [took]);

  const value = useMemo<Account>(() => ({
    user, ready, sync, lastSync, syncNow,
    register: body => accountApi.register({ ...body, progress: latest.current }).then(signedIn),
    login: (email, password) => accountApi.login({ email, password, progress: latest.current }).then(signedIn),
    logout: () => accountApi.logout().catch(() => {}).then(signOutHere),
    update: body => accountApi.update(body).then(r => { setUser(r.user); return r.user; }),
    remove: () => accountApi.remove().then(signOutHere),
  }), [user, ready, sync, lastSync, syncNow, signedIn, signOutHere]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAccount() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('AccountProvider eksik');
  return ctx;
}

export const syncLabel = (state: SyncState, last: Date | null) =>
  state === 'syncing' ? t('Eşitleniyor…', 'Syncing…')
    : state === 'offline' ? t('Şu an eşitlenemedi; bağlantı gelince yeniden denenecek.', 'Could not sync right now; it will try again when online.')
      : last ? t(`Son eşitleme: ${last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, `Last synced: ${last.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
        : t('Henüz eşitlenmedi.', 'Not synced yet.');
