// Behaviour events, sent to the same POST /api/events as the site (frontend/src/lib/analytics.ts), told apart by
// props.platform = 'mobile'. Nothing leaves the phone before the visitor agrees. Until they decide, events wait on the
// device, so the first minutes can be counted if they say yes; saying no deletes them. Offline events wait too and are
// sent later with their own time; event_id lets the server ignore one that arrives twice.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { ApiError, request, setApiReporter } from './api';

export type Consent = 'granted' | 'denied';
type Event = { type: string; slug?: string; props: Record<string, unknown> };

const CONSENT_KEY = 'esik:consent:v1';
const SID_KEY = 'esik:sid:v1';
const QUEUE_KEY = 'esik:events:v1';
const FIRST_OPEN_KEY = 'esik:first-open:v1';
const FLUSH_MS = 4000;
const RETRY_MS = 30000;
const BATCH = 50;
const QUEUE_MAX = 300;

let consent: Consent | null | undefined;   // undefined: not read from the device yet
let sid: string | null = null;
let queue: Event[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let sending = false;
let firstOpen: number | null = null;
const listeners = new Set<() => void>();

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
const save = () => { AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue)).catch(() => {}); };
const later = (ms = FLUSH_MS) => { if (!timer) timer = setTimeout(() => { timer = undefined; flush(); }, ms); };

/** Reads the stored decision and the waiting events; called once when the app starts. */
export async function initAnalytics() {
  const stored = await AsyncStorage.multiGet([CONSENT_KEY, SID_KEY, QUEUE_KEY, FIRST_OPEN_KEY]).catch(() => null);
  const [c, s, q, f] = [0, 1, 2, 3].map(i => stored?.[i]?.[1] ?? null);
  consent = c === 'granted' || c === 'denied' ? c : null;
  sid = s ?? null;
  if (consent === 'denied') queue = [];
  else {
    try { const saved = JSON.parse(q ?? '[]'); if (Array.isArray(saved)) queue = [...saved, ...queue].slice(-QUEUE_MAX); } catch { /* a broken copy is dropped */ }
  }
  firstOpen = Number(f) || Date.now();
  if (!f) AsyncStorage.setItem(FIRST_OPEN_KEY, String(firstOpen)).catch(() => {});
  listeners.forEach(fn => fn());
  if (consent === 'granted') { await ensureSid(); later(); }
  AppState.addEventListener('change', state => { if (state !== 'active') flush(); else later(); });
  setApiReporter((path, status) => { if (!path.startsWith('/api/events') && (status === 0 || status >= 500)) track('api_error', undefined, { endpoint: path.split('?')[0], status }); });
}

async function ensureSid() {
  if (sid) return;
  sid = uuid();
  await AsyncStorage.setItem(SID_KEY, sid).catch(() => {});
}

/** The random ID that suggestions are asked with; none without permission. */
export const analyticsSession = () => consent === 'granted' ? sid : null;

export function setConsent(value: Consent) {
  consent = value;
  AsyncStorage.setItem(CONSENT_KEY, value).catch(() => {});
  if (value === 'denied') {
    queue = []; sid = null;
    AsyncStorage.multiRemove([SID_KEY, QUEUE_KEY]).catch(() => {});
  } else {
    ensureSid().then(() => { track('consent', undefined, { granted: true }); flush(); });
  }
  listeners.forEach(fn => fn());
}

export function useConsent() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => consent);
}

/** Seconds since the app was first opened on this phone, for "how long until the first discovery". */
export const secondsSinceFirstOpen = () => firstOpen ? Math.round((Date.now() - firstOpen) / 1000) : undefined;

/** id: give one when the same action must count once however often it is repeated. */
export function track(type: string, slug?: string, props?: Record<string, unknown>, id?: string) {
  if (consent === 'denied') return;
  queue.push({ type, ...(slug ? { slug } : {}), props: { ...props, platform: 'mobile', app_version: Constants.expoConfig?.version ?? null, schema_version: 1,
    event_id: id ?? uuid(), occurred_at: new Date().toISOString(), ...(__DEV__ ? { dev: true } : {}) } });
  queue = queue.slice(-QUEUE_MAX);
  save();
  if (consent === 'granted') later();
}

export function flush() {
  if (consent !== 'granted' || !sid || sending || !queue.length) return;
  const batch = queue.slice(0, BATCH);
  sending = true;
  request<void>('/api/events', { method: 'POST', body: JSON.stringify({ session_id: sid, events: batch }) }).then(() => {
    queue = queue.filter(e => !batch.includes(e)); save();
    if (queue.length) later(0);
  }, e => {
    // the server refused these for good; only a lost connection or a busy server is worth another try
    if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429) { queue = queue.filter(x => !batch.includes(x)); save(); }
    else later(RETRY_MS);
  }).finally(() => { sending = false; });
}
