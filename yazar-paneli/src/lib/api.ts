// Yazar paneli API istemcisi (/api/author/*). Oturum anahtarı yalnızca bu sekmede (sessionStorage) tutulur: ortak
// bilgisayarda sekme kapanınca oturum da biter. Sunucu tarafında oturum 12 saatte kendiliğinden düşer.
export const SESSION_KEY = 'tackapi:yazar-oturum';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const memory = new Map<string, string>();
const fallback: Store = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: k => void memory.delete(k) };
function store(): Store {
  try { return globalThis.sessionStorage ?? fallback; } catch { return fallback; }
}
export const getToken = () => store().getItem(SESSION_KEY);
export const setToken = (token: string | null) => token ? store().setItem(SESSION_KEY, token) : store().removeItem(SESSION_KEY);

let onUnauthorized: () => void = () => {};
export function handleUnauthorized(fn: () => void) { onUnauthorized = fn; }

/** FastAPI hata gövdesini okunur Türkçe bir mesaja çevirir (422 doğrulama listeleri dahil). */
export function errorMessage(status: number, body: unknown): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map(d => {
      const loc = Array.isArray(d?.loc) ? d.loc.filter((x: unknown) => x !== 'body').join('.') : '';
      return loc ? `${loc}: ${d?.msg ?? 'geçersiz değer'}` : String(d?.msg ?? 'geçersiz değer');
    }).join(' · ');
  }
  if (status === 0) return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.';
  if (status === 503) return 'Yazar paneli şu an kapalı. Editörünüzle iletişime geçin.';
  return `İstek başarısız oldu (${status}).`;
}

export async function request<T>(path: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  let response: Response;
  try { response = await fetcher(path, { ...init, headers }); }
  catch (e) {
    if ((e as Error)?.name === 'TimeoutError') throw new ApiError(0, 'Sunucu zamanında yanıt vermedi. Biraz sonra yeniden deneyin.');
    throw new ApiError(0, errorMessage(0, null));
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) { setToken(null); onUnauthorized(); }
    throw new ApiError(response.status, errorMessage(response.status, body));
  }
  return body as T;
}
