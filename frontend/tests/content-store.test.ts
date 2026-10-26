import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';
import { artifacts } from '../src/data/artifacts.ts';
import { CONTENT_KEY, serializeOverrides } from '../src/lib/content.ts';
import { discover, emptyProgress, STORAGE_KEY } from '../src/lib/progress.ts';

let server: ViteDevServer;
let contentModule: typeof import('../src/lib/contentStore');
let progressModule: typeof import('../src/lib/store');
let summaryModule: typeof import('../src/pages/ArtifactSummary');
let appModule: typeof import('../src/App');
const storage = new Map<string, string>();
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const feed = { schemaVersion: 1, items: [{
  id: 'record:001', slug: 'deneme-eseri', name: 'Deneme Eseri', city: 'Kayseri',
  period: 'Test dönemi', category: 'Han', description: 'Yalnızca test için hazırlanmış içerik.',
  sourceReferences: [{ title: 'Test kaynağı', url: 'https://example.org/test' }],
}] };

before(async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  } });
  // Vite transforms the actual TSX modules without a new test framework or a
  // listening HTTP server. SSR verifies provider composition and rendered HTML.
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true }, ssr: { noExternal: ['gsap'] } });
  contentModule = await server.ssrLoadModule('/src/lib/contentStore.tsx');
  progressModule = await server.ssrLoadModule('/src/lib/store.tsx');
  summaryModule = await server.ssrLoadModule('/src/pages/ArtifactSummary.tsx');
  appModule = await server.ssrLoadModule('/src/App.tsx');
});

after(async () => {
  await server?.close();
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

function snapshot(artifactFeed?: unknown) {
  let result: ReturnType<typeof contentModule.useContent> | undefined;
  function Capture() { result = contentModule.useContent(); return null; }
  renderToStaticMarkup(createElement(contentModule.ContentProvider, { artifactFeed, children: createElement(Capture) }));
  assert.ok(result);
  return result;
}

test('ContentProvider dış koleksiyonu yerel düzenlemelerden ve demo quiz/rotalarından ayırır', () => {
  const edited = artifacts.map(a => ({ ...a, description: 'Yerel düzenleme.' }));
  storage.set(CONTENT_KEY, serializeOverrides({ artifacts: edited }));
  const external = snapshot(feed);
  assert.equal(external.readOnly, true);
  assert.equal(external.artifacts.length, 1);
  assert.equal(external.artifacts[0].description, feed.items[0].description);
  assert.deepEqual(external.quizQuestions, []);
  assert.deepEqual(external.seasons, []);
  assert.deepEqual(external.overrides, {});
  assert.equal(external.save({ artifacts: edited }), false);
  assert.equal(snapshot().artifacts[0].description, 'Yerel düzenleme.');
  storage.clear();
});

test('Boş veri ve sözleşme hatası provider üzerinden ayrı görünür; demo verisine dönülmez', () => {
  const empty = snapshot({ schemaVersion: 1, items: [] });
  assert.equal(empty.artifacts.length, 0);
  assert.deepEqual(empty.issues, []);
  const invalid = snapshot(null);
  assert.equal(invalid.artifacts.length, 0);
  assert.ok(invalid.issues.length > 0);
  assert.equal(snapshot().artifacts.length, 6);
  const emptyHtml = renderToStaticMarkup(createElement(appModule.App, { artifactFeed: { schemaVersion: 1, items: [] } }));
  const errorHtml = renderToStaticMarkup(createElement(appModule.App, { artifactFeed: null }));
  assert.ok(emptyHtml.includes('Koleksiyon henüz boş'));
  assert.ok(errorHtml.includes('Eserler açılamadı'));
  assert.ok(!emptyHtml.includes('Süleymaniye'));
  assert.ok(!errorHtml.includes('Süleymaniye'));
});

test('Sade detay bütün bölümleri gösterir; kısmi anlatımlar için olmayan mod sunmaz', () => {
  const chapters = Array.from({ length: 5 }, (_, index) => ({ title: `Başlık ${index + 1}`, short: `Kısa metin ${index + 1}`, ...(index === 0 ? { story: 'Yalnızca ilk bölümün hikâyesi.' } : {}) }));
  function Detail() { return createElement(summaryModule.ArtifactSummary, { artifact: contentModule.useContent().artifacts[0] }); }
  const html = renderToStaticMarkup(createElement(contentModule.ContentProvider, {
    artifactFeed: { schemaVersion: 1, items: [{ ...feed.items[0], chapters }] },
    children: createElement(progressModule.ProgressProvider, { children: createElement(Detail) }),
  }));
  for (const chapter of chapters) assert.ok(html.includes(chapter.short));
  assert.ok(!html.includes('Hikâyeleştirerek'));
  assert.ok(!html.includes('Çocuklar İçin'));
});

test('Bölümsüz eserde açıklama, kaynak ve mühür eylemi render edilir; demo pasaportu korunur', () => {
  const localPassport = JSON.stringify(discover(emptyProgress(), 'suleymaniye'));
  storage.set(STORAGE_KEY, localPassport);
  let key = '';
  function Detail() {
    const content = contentModule.useContent();
    key = content.progressStorageKey;
    return createElement(summaryModule.ArtifactSummary, { artifact: content.artifacts[0] });
  }
  const render = () => renderToStaticMarkup(createElement(contentModule.ContentProvider, {
    artifactFeed: feed,
    children: createElement(progressModule.ProgressProvider, { children: createElement(Detail) }),
  }));
  const html = render();
  assert.ok(html.includes(feed.items[0].description));
  assert.ok(html.includes('https://example.org/test'));
  assert.ok(html.includes('Pasaportuma mühürle'));
  assert.ok(html.includes('konum bilgisi henüz eklenmedi'));
  assert.ok(!html.includes('Anlatım biçimi'));
  assert.notEqual(key, STORAGE_KEY);
  storage.set(key, JSON.stringify(discover(emptyProgress(), 'record:001')));
  assert.ok(render().includes('Pasaportuna mühürlendi'));
  assert.equal(storage.get(STORAGE_KEY), localPassport);
  storage.clear();
});
