// Ziyaretçi hesabı (arka uç: backend/pipeline/visitors.py). Oturum httpOnly çerezdedir; JavaScript anahtarı görmez.
// Pasaport birleştirmesi ProgressProvider'dadır: kullanıcı belli olunca tarayıcıdaki ilerleme sunucuya gönderilir,
// birleştirilmiş hali (iki cihazın keşifleri, en iyi skorlar) geri yazılır.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { vakifApiEnabled } from './vakifApi';
import type { Progress } from './progress';
import { t } from './i18n';

export type User = { id: number; email: string; display_name: string | null; age_range: string | null; home_city: string | null;
  purposes: string[]; interests: string[]; created_at: string };
export type ProfileFields = Partial<Pick<User, 'display_name' | 'age_range' | 'home_city' | 'purposes' | 'interests'>>;
export type ProfileOptions = { consent_version: string; password_min: number; age_ranges: Option[]; purposes: Option[]; interests: Option[] };
type Option = { id: string; label: string };

export async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init,
    headers: { accept: 'application/json', ...(init?.body && typeof init.body === 'string' ? { 'content-type': 'application/json' } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = typeof body?.detail === 'string' ? body.detail
      : Array.isArray(body?.detail) ? t('Lütfen alanları kontrol edin.', 'Please check the fields.') : t(`Sunucu ${response.status} döndü.`, `The server returned ${response.status}.`);
    throw Object.assign(new Error(detail), { status: response.status });
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const accountApi = {
  options: () => call<ProfileOptions>('/api/profile-options'),
  me: () => call<{ user: User; progress: Progress }>('/api/me'),
  register: (body: ProfileFields & { email: string; password: string; consent: boolean; progress?: Progress }) =>
    call<{ user: User; progress: Progress }>('/api/auth/register', json('POST', body)),
  login: (body: { email: string; password: string; progress?: Progress }) =>
    call<{ user: User; progress: Progress }>('/api/auth/login', json('POST', body)),
  logout: () => call<void>('/api/auth/logout', { method: 'POST' }),
  update: (body: ProfileFields) => call<{ user: User }>('/api/me', json('PATCH', body)),
  remove: () => call<void>('/api/me', { method: 'DELETE' }),
  syncProgress: (progress: Progress) => call<{ progress: Progress }>('/api/me/progress', json('PUT', { progress })),
};

type Account = {
  enabled: boolean; user: User | null; ready: boolean;
  register: (body: Parameters<typeof accountApi.register>[0]) => Promise<User>;
  login: (body: Parameters<typeof accountApi.login>[0]) => Promise<User>;
  logout: () => Promise<void>; update: (body: ProfileFields) => Promise<User>; remove: () => Promise<void>;
};
const Context = createContext<Account | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const enabled = vakifApiEnabled();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!enabled);
  useEffect(() => {
    if (!enabled) return;
    accountApi.me().then(r => setUser(r.user), () => setUser(null)).finally(() => setReady(true));
  }, [enabled]);
  const signedIn = useCallback((r: { user: User; progress: Progress }) => { setUser(r.user); return r.user; }, []);
  const value = useMemo<Account>(() => ({
    enabled, user, ready,
    register: body => accountApi.register(body).then(signedIn),
    login: body => accountApi.login(body).then(signedIn),
    logout: () => accountApi.logout().then(() => setUser(null)),
    update: body => accountApi.update(body).then(r => { setUser(r.user); return r.user; }),
    remove: () => accountApi.remove().then(() => setUser(null)),
  }), [enabled, user, ready, signedIn]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** Hesap bağlamı; sağlayıcı dışında (testler, demo) hesapsız bir varsayılan döner. */
export function useAccount(): Account {
  return useContext(Context) ?? NO_ACCOUNT;
}
const fail = () => Promise.reject(new Error(t('Hesaplar bu sürümde kapalı.', 'Accounts are turned off in this version.')));
const NO_ACCOUNT: Account = { enabled: false, user: null, ready: true, register: fail, login: fail,
  logout: () => Promise.resolve(), update: fail, remove: fail };
