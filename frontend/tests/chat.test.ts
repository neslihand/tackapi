import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { artifacts } from '../src/data/artifacts.ts';
import { chatStorageKey, chatSuggestions, parseHistory, parseRichText, plainText, requestTurns, welcomeMessage, type RichAllow } from '../src/lib/chat.ts';
import { answerFromJson, CHAT_LIMITS, parseSources, type ChatRequest, type ChatStreamEvent } from '../src/lib/chatContract.ts';
import { ChatError, readChatStream, sendChat } from '../src/lib/chatApi.ts';

const suleymaniye = artifacts[0];
const allow: RichAllow = { chapters: 4, slugs: new Set(['selimiye']), urls: new Set(suleymaniye.sourceReferences.map(s => s.url)) };
const request: ChatRequest = { artifactId: 'suleymaniye', artifactName: 'Süleymaniye Külliyesi', mode: 'short', chapter: 1, feed: false, messages: [{ role: 'user', content: 'Kim tasarladı?' }] };
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function streamOf(...chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close(); } });
}
async function collect(response: () => Response | Promise<Response>, signal = new AbortController().signal) {
  let sent: RequestInit | undefined;
  globalThis.fetch = (async (_url: string, init: RequestInit) => { sent = init; return response(); }) as typeof fetch;
  const events: ChatStreamEvent[] = [];
  await sendChat('/api/chat', request, { signal, onEvent: event => events.push(event) });
  return { events, sent };
}

test('Sohbet geçmişi eser ve koleksiyon başına ayrı anahtarda tutulur', () => {
  assert.equal(chatStorageKey('suleymaniye', false), 'tackapi:chat:v1:suleymaniye');
  assert.equal(chatStorageKey('suleymaniye', true), 'tackapi:chat:feed:v1:suleymaniye');
  assert.notEqual(chatStorageKey('suleymaniye', false), chatStorageKey('selimiye', false));
});

test('Bozuk geçmiş boş sohbete döner; geçerli kayıtlar temizlenir ve sınırlanır', () => {
  for (const bad of [null, '', '{', '42', '{"role":"user"}']) assert.deepEqual(parseHistory(bad, 4), []);
  const many = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
  assert.equal(parseHistory(JSON.stringify(many), 4).length, CHAT_LIMITS.storedMessages);
  const parsed = parseHistory(JSON.stringify([
    { role: 'system', content: 'gizli' }, { role: 'user', content: '  ' }, { role: 'user', content: 'Soru', sources: [{ title: 'x' }] },
    { role: 'assistant', content: 'Cevap', sources: [{ title: 'Bölüm', chapter: 2 }, { title: 'Dış', url: 'javascript:alert(1)' }, { chapter: 9 }, 'bozuk'] },
  ]), 4);
  assert.deepEqual(parsed, [{ role: 'user', content: 'Soru' }, { role: 'assistant', content: 'Cevap', sources: [{ title: 'Bölüm', chapter: 2 }, { title: 'Dış' }] }]);
});

test('İstekle yalnızca son mesajlar gider ve pencere bir soruyla başlar', () => {
  const history = Array.from({ length: 11 }, (_, i) => ({ role: (i % 2 ? 'user' : 'assistant') as 'user' | 'assistant', content: 'x'.repeat(i === 10 ? 9000 : 3), sources: [{ title: 'k' }] }));
  const turns = requestTurns(history);
  assert.ok(turns.length <= CHAT_LIMITS.sentMessages);
  assert.equal(turns[0].role, 'user');
  assert.ok(turns.every(turn => !('sources' in turn) && turn.content.length <= CHAT_LIMITS.assistantMessage));
});

test('Karşılama ve öneriler eser kaydından üretilir; bilinmeyen mimar önerilmez', () => {
  assert.match(welcomeMessage(suleymaniye), /Süleymaniye Külliyesi/);
  const list = chatSuggestions(suleymaniye, 2);
  assert.ok(list.some(q => q.includes('Bölüm 3') && q.includes(suleymaniye.chapters[2].title)));
  assert.ok(list.some(q => q.includes(suleymaniye.detail.title)));
  assert.ok(list.some(q => q.startsWith('Mimar Sinan')));
  const unknown = { ...suleymaniye, architect: 'Bilinmiyor', chapters: [], detail: null };
  const plain = chatSuggestions(unknown);
  assert.ok(!plain.some(q => q.includes('Bilinmiyor') || q.startsWith('Bölüm')));
});

test('Model metni HTML olarak işlenmez; bağlantı ve bölüm referansları izin listesine bağlıdır', () => {
  const blocks = parseRichText('## Başlık\n<img src=x onerror=alert(1)> **kalın** [Bölüm 2] [Bölüm 7]\n\n- [Selimiye](#/eser/selimiye)\n- [Kötü](https://evil.example)\n- [Kaynak](' + suleymaniye.sourceReferences[0].url + ')', allow);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[1].type, 'paragraph');
  const paragraph = blocks[1].type === 'paragraph' ? blocks[1].inline : [];
  assert.deepEqual(paragraph[0], { type: 'text', text: '<img src=x onerror=alert(1)> ' });
  assert.ok(paragraph.some(node => node.type === 'chapter' && node.chapter === 2));
  assert.ok(!paragraph.some(node => node.type === 'chapter' && node.chapter === 7));
  assert.ok(paragraph.some(node => node.type === 'text' && node.text.includes('[Bölüm 7]')));
  const list = blocks[2].type === 'list' ? blocks[2].items : [];
  assert.deepEqual(list[0][0], { type: 'link', text: 'Selimiye', href: '#/eser/selimiye', internal: true });
  assert.deepEqual(list[1][0], { type: 'text', text: 'Kötü' });
  assert.equal(list[2][0].type === 'link' && list[2][0].internal, false);
  assert.equal(plainText('**Mimar Sinan** [Bölüm 1]\n## Not'), 'Mimar Sinan [Bölüm 1]\nNot');
});

test('Kaynaklar güvenilmeyen veri sayılır: yalnızca https ve geçerli bölüm kalır', () => {
  assert.deepEqual(parseSources([{ title: 'TDV', url: 'https://islamansiklopedisi.org.tr/x' }, { title: 'http', url: 'http://a.b' }, { chapter: 3 }, { chapter: 0 }], 4),
    [{ title: 'TDV', url: 'https://islamansiklopedisi.org.tr/x' }, { title: 'http' }, { title: 'Bölüm 3', chapter: 3 }]);
  assert.deepEqual(parseSources('yok', 4), []);
  assert.equal(answerFromJson({ reply: 'Merhaba' }), 'Merhaba');
  assert.equal(answerFromJson({ answer: '' , content: 'İçerik' }), 'İçerik');
  assert.equal(answerFromJson({ foo: 1 }), null);
});

test('Akış okuyucu parçalara bölünmüş olayları birleştirir, bozuk satırı atlar', async () => {
  const events: ChatStreamEvent[] = [];
  await readChatStream(streamOf('data: {"type":"te', 'xt","text":"Mer"}\n\ndata: {bozuk}\n\n', 'data: {"answer":"haba"}\r\n\r\ndata: [DONE]\n\n'), event => events.push(event));
  assert.deepEqual(events, [{ type: 'text', text: 'Mer' }, { type: 'text', text: 'haba' }]);
});

test('JSON yanıtı ve kaynakları olay olarak aktarılır; istek eser kimliğini taşır', async () => {
  const { events, sent } = await collect(() => Response.json({ answer: 'Mimar Sinan [Bölüm 1]', sources: [{ chapter: 1 }] }));
  assert.equal(sent?.method, 'POST');
  assert.deepEqual(JSON.parse(String(sent?.body)), request);
  assert.deepEqual(events, [{ type: 'text', text: 'Mimar Sinan [Bölüm 1]' }, { type: 'sources', sources: [{ chapter: 1 }] }, { type: 'done' }]);
});

test('Olay akışı ve düz metin yanıtları da okunur', async () => {
  const sse = await collect(() => new Response(streamOf('data: {"type":"text","text":"Bir"}\n\n', 'data: {"type":"reset"}\n\ndata: {"type":"text","text":"İki"}\n\n'), { headers: { 'content-type': 'text/event-stream' } }));
  assert.deepEqual(sse.events, [{ type: 'text', text: 'Bir' }, { type: 'reset' }, { type: 'text', text: 'İki' }, { type: 'done' }]);
  const text = await collect(() => new Response(streamOf('Düz ', 'metin'), { headers: { 'content-type': 'text/plain; charset=utf-8' } }));
  assert.equal(text.events.filter(e => e.type === 'text').map(e => e.type === 'text' ? e.text : '').join(''), 'Düz metin');
});

test('Hatalar sınıflandırılır; sunucunun mesajı taşınır', async () => {
  const code = async (response: () => Response | Promise<Response>) => {
    try { await collect(response); return 'ok'; } catch (error) { assert.ok(error instanceof ChatError); return `${error.code}:${error.detail ?? ''}`; }
  };
  assert.equal(await code(() => new Response('yok', { status: 404 })), 'not-found:');
  assert.equal(await code(() => Response.json({ error: { message: 'Dakikada 5 soru' } }, { status: 429 })), 'rate-limited:Dakikada 5 soru');
  assert.equal(await code(() => Response.json({ detail: 'Model kapalı' }, { status: 503 })), 'unavailable:Model kapalı');
  assert.equal(await code(() => { throw new TypeError('fetch failed'); }), 'network:');
  assert.equal(await code(() => Response.json({ foo: 'bar' })), 'unavailable:Yanıt biçimi anlaşılamadı.');
  assert.equal(await code(() => new Response(streamOf('data: {"type":"error","code":"refusal"}\n\n'), { headers: { 'content-type': 'text/event-stream' } })), 'refusal:');
});

test('Kullanıcı durdurunca istek iptal edilir ve hata olarak gösterilmez', async () => {
  const controller = new AbortController();
  globalThis.fetch = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  })) as typeof fetch;
  const pending = sendChat('/api/chat', request, { signal: controller.signal, onEvent: () => {} });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => !(error instanceof ChatError) && (error as Error).name === 'AbortError');
});
