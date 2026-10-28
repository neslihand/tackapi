// Davranış olayları ("Veriyle Gelişen Döngü"). Yalnızca ziyaretçi izin verdiyse ve site arka uca bağlıysa gönderilir.
// Ziyaretçi bu tarayıcıda üretilen rastgele bir kimlikle tanınır; IP ya da ad tutulmaz. İzin geri alınınca kimlik ve
// gönderilmemiş olaylar silinir. Olaylar biriktirilip birkaç saniyede bir, sayfa kapanırken de toplu gönderilir.
import { setApiReporter, vakifApiEnabled } from './vakifApi.ts';

const CONSENT_KEY = 'esik:consent:v1';
const SID_KEY = 'esik:sid:v1';
const FLUSH_MS = 4000;
export type Consent = 'granted' | 'denied';
type Event = { type: string; slug?: string; path?: string; props?: Record<string, unknown> };

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string | null) => {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* kapalıysa bu oturumda */ }
};

let memoryConsent: Consent | null = null;
let memorySid: string | null = null;
const listeners = new Set<() => void>();

export function consent(): Consent | null {
  const v = read(CONSENT_KEY) ?? memoryConsent;
  return v === 'granted' || v === 'denied' ? v : null;
}

export function setConsent(value: Consent) {
  memoryConsent = value;
  write(CONSENT_KEY, value);
  if (value === 'denied') { queue.length = 0; memorySid = null; write(SID_KEY, null); }
  listeners.forEach(fn => fn());
  if (value === 'granted') track('consent', undefined, { granted: true });
}

export function onConsentChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

/** İzin verildiyse bu tarayıcının ziyaretçi kimliği (yoksa üretilir); izin yoksa null. */
export function sessionId(): string | null {
  if (consent() !== 'granted') return null;
  const stored = read(SID_KEY) ?? memorySid;
  if (stored) return stored;
  memorySid = uuid();
  write(SID_KEY, memorySid);
  return memorySid;
}

const queue: Event[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

export function track(type: string, slug?: string, props?: Record<string, unknown>) {
  if (!vakifApiEnabled() || consent() !== 'granted' || typeof window === 'undefined') return;
  queue.push({ type, ...(slug ? { slug } : {}), path: window.location.hash.slice(1).split('?')[0] || '/', ...(props ? { props } : {}) });
  if (queue.length >= 40) flush();
  else if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

export function flush() {
  clearTimeout(timer); timer = undefined;
  const sid = sessionId();
  if (!sid || !queue.length) return;
  const events = queue.splice(0, 50);
  fetch('/api/events', { method: 'POST', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session_id: sid, events }) }).catch(() => { /* çevrimdışı: olay kaybolur, site çalışmaya devam eder */ });
  if (queue.length) timer = setTimeout(flush, FLUSH_MS);
}

// Site health (admin assistant: "Ziyaretçi deneyimi"): script errors, page load time, failed and slow requests.
// Same consent and anonymity as every other event; at most 5 distinct errors per page load.
const SLOW_API_MS = 4000;
const seenErrors = new Set<string>();
function reportError(message: string, source: string) {
  const text = message.trim().slice(0, 200);
  if (!text || seenErrors.size >= 5 || seenErrors.has(text)) return;
  seenErrors.add(text);
  track('client_error', undefined, { message: text, source });
}
setApiReporter((endpoint, status, ms) => {
  if (status === 0 || status >= 500) track('api_error', undefined, { endpoint, status });
  else if (ms > SLOW_API_MS) track('api_slow', undefined, { endpoint, ms });
});

if (typeof window !== 'undefined') {
  window.addEventListener('error', e => reportError(e.message || 'Bilinmeyen hata', 'error'));
  window.addEventListener('unhandledrejection', e => {
    const reason = (e as PromiseRejectionEvent).reason;
    reportError(String(reason instanceof Error ? reason.message : reason ?? 'Promise hatası'), 'promise');
  });
  window.addEventListener('load', () => setTimeout(() => {
    const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav && nav.loadEventEnd > 0) track('page_perf', undefined, { load_ms: Math.round(nav.loadEventEnd), ttfb_ms: Math.round(nav.responseStart) });
  }, 0));
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}
