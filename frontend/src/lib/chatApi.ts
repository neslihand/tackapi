<<<<<<< HEAD
import { fromVakifChat, toVakifChat, VAKIF_CHAT_ENDPOINT, vakifApiEnabled } from './vakifApi.ts';
=======
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
import { answerFromJson, errorMessageFromJson, type ChatErrorCode, type ChatRequest, type ChatStreamEvent } from './chatContract.ts';

// The only file that talks to the chat backend. If its API differs from docs/ai-sohbet-api.md, adapt it here.
// The address comes from VITE_CHAT_API_URL; without it the panel is not offered at all.
<<<<<<< HEAD
// With the Vakıf backend (VITE_VAKIF_API=1) and no other address the panel uses its POST /api/chat.
export function chatEndpoint(): string {
  const value = import.meta.env?.VITE_CHAT_API_URL;
  const own = typeof value === 'string' ? value.trim() : '';
  return own || (vakifApiEnabled() ? VAKIF_CHAT_ENDPOINT : '');
}
const isVakif = (endpoint: string) => endpoint === VAKIF_CHAT_ENDPOINT && vakifApiEnabled();
=======
export function chatEndpoint(): string {
  const value = import.meta.env?.VITE_CHAT_API_URL;
  return typeof value === 'string' ? value.trim() : '';
}
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d

export class ChatError extends Error {
  code: ChatErrorCode;
  detail?: string;
  constructor(code: ChatErrorCode, detail?: string) { super(code); this.code = code; this.detail = detail; }
}

const IDLE_TIMEOUT = 60_000;
const statusCode = (status: number): ChatErrorCode => status === 404 ? 'not-found' : status === 429 ? 'rate-limited' : status === 408 || status === 504 ? 'timeout' : 'unavailable';

async function* decode(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      if (text) yield text;
    }
    const rest = decoder.decode();
    if (rest) yield rest;
  } finally { reader.releaseLock(); }
}

// Reads `data: {json}` frames. Events can arrive split across chunks.
export async function readChatStream(body: ReadableStream<Uint8Array>, onEvent: (event: ChatStreamEvent) => void) {
  let buffer = '';
  const emit = (frame: string) => {
    const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let event: unknown;
    try { event = JSON.parse(data); } catch { return; /* a malformed frame is skipped, not fatal */ }
    if (typeof event === 'object' && event !== null && 'type' in event) { onEvent(event as ChatStreamEvent); return; }
    const text = answerFromJson(event);
    if (text) onEvent({ type: 'text', text });
  };
  for await (const text of decode(body)) {
    buffer += text.replace(/\r\n?/g, '\n');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) { emit(buffer.slice(0, end)); buffer = buffer.slice(end + 2); }
  }
  emit(buffer);
}

// Sends one question and reports the answer as events, whichever of the three documented forms the backend uses:
// an event stream, a JSON object or plain text. Throws ChatError; an abort by the caller is rethrown as is.
export async function sendChat(endpoint: string, request: ChatRequest, { signal, onEvent }: { signal: AbortSignal; onEvent: (event: ChatStreamEvent) => void }) {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wait = () => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; controller.abort(); }, IDLE_TIMEOUT); };
  const stop = () => controller.abort();
  signal.addEventListener('abort', stop, { once: true });
  const relay = (event: ChatStreamEvent) => {
    wait();
    if (event.type === 'error') throw new ChatError(event.code ?? 'unavailable', event.message);
    onEvent(event);
  };
  try {
    wait();
    let response: Response;
    try {
<<<<<<< HEAD
      response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json;q=0.9, text/plain;q=0.8' }, body: JSON.stringify(isVakif(endpoint) ? toVakifChat(request) : request), signal: controller.signal });
=======
      response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json;q=0.9, text/plain;q=0.8' }, body: JSON.stringify(request), signal: controller.signal });
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
    } catch (error) {
      if (signal.aborted || timedOut) throw error;
      throw new ChatError('network');
    }
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let detail: string | null = null;
      try { detail = errorMessageFromJson(JSON.parse(text)); } catch { /* not JSON */ }
      throw new ChatError(statusCode(response.status), detail ?? undefined);
    }
    if (type.includes('text/event-stream') && response.body) await readChatStream(response.body, relay);
    else if (type.includes('json')) {
<<<<<<< HEAD
      const raw: unknown = await response.json().catch(() => null);
      // The Vakıf backend answers {answer, sources[{book, pages, heading}]}; its source marks are taken out of the text.
      const data: unknown = isVakif(endpoint) ? fromVakifChat(raw) : raw;
=======
      const data: unknown = await response.json().catch(() => null);
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
      const answer = answerFromJson(data);
      if (!answer) throw new ChatError('unavailable', 'Yanıt biçimi anlaşılamadı.');
      relay({ type: 'text', text: answer });
      const sources = typeof data === 'object' && data !== null ? (data as { sources?: unknown }).sources : undefined;
      if (sources !== undefined) relay({ type: 'sources', sources });
    } else if (response.body) {
      for await (const text of decode(response.body)) relay({ type: 'text', text });
    }
    relay({ type: 'done' });
  } catch (error) {
    if (timedOut && !signal.aborted) throw new ChatError('timeout');
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
    signal.removeEventListener('abort', stop);
  }
}
