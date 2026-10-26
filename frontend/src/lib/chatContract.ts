// What the "Esere Sor" panel sends to the chat backend and the answers it understands. The backend (RAG + model)
// is a separate service; docs/ai-sohbet-api.md is the contract written for it.
export const CHAT_LIMITS = { userMessage: 1000, assistantMessage: 8000, sentMessages: 8, storedMessages: 30 } as const;
export type ChatMode = 'short' | 'story' | 'child';
export type ChatTurn = { role: 'user' | 'assistant'; content: string; sources?: ChatSource[] };
// A passage the backend retrieved for the answer: a chapter of this record, a listed source, or just a title.
export type ChatSource = { title: string; url?: string; chapter?: number };
// `chapter` is the zero-based index of the chapter on screen; `feed` is true for the external collection.
export type ChatRequest = { artifactId: string; artifactName: string; mode: ChatMode; chapter?: number; feed: boolean; messages: { role: 'user' | 'assistant'; content: string }[] };
export type ChatErrorCode = 'not-found' | 'rate-limited' | 'unavailable' | 'timeout' | 'network' | 'refusal';
// `reset` drops the text streamed so far, for a backend that restarts an answer.
export type ChatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'reset' }
  | { type: 'sources'; sources: unknown }
  | { type: 'done'; truncated?: boolean }
  | { type: 'error'; code?: ChatErrorCode; message?: string };

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose => typeof value === 'object' && value !== null && !Array.isArray(value);
const httpsUrl = (value: unknown): value is string => {
  try { return typeof value === 'string' && new URL(value).protocol === 'https:'; } catch { return false; }
};

// Backend sources are untrusted: keep a short title, an https link and an in-range chapter number; drop the rest.
export function parseSources(value: unknown, chapters: number): ChatSource[] {
  if (!Array.isArray(value)) return [];
  const sources: ChatSource[] = [];
  for (const item of value.slice(0, 8)) {
    if (!isObject(item)) continue;
    const chapter = Number.isInteger(item.chapter) && (item.chapter as number) >= 1 && (item.chapter as number) <= chapters ? item.chapter as number : undefined;
    const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim().slice(0, 160) : chapter ? `Bölüm ${chapter}` : '';
    if (!title) continue;
    sources.push({ title, ...(httpsUrl(item.url) ? { url: item.url } : {}), ...(chapter ? { chapter } : {}) });
  }
  return sources;
}

// A JSON reply may name its answer field differently; `answer` is the documented one.
export function answerFromJson(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (!isObject(value)) return null;
  for (const key of ['answer', 'reply', 'response', 'content', 'text', 'message']) {
    if (typeof value[key] === 'string' && (value[key] as string).trim()) return value[key] as string;
  }
  return null;
}

export function errorMessageFromJson(value: unknown): string | null {
  if (!isObject(value)) return null;
  const error = isObject(value.error) ? value.error.message : value.error ?? value.message ?? value.detail;
  return typeof error === 'string' && error.trim() ? error.trim().slice(0, 300) : null;
}
