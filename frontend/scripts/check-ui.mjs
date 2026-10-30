// Local Chrome + CDP audit. No browser automation dependency or production bundle changes.
// CHROME_PATH can point to a Chromium executable on other platforms.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';

const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await access(chromePath);
const output = await mkdtemp(join(tmpdir(), 'esik-ui-audit-'));
const profile = join(output, 'chrome-profile');
await mkdir(profile);
const axe = await readFile(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { browser: '', axe: '4.10.3', checks: [], scans: [], runtimeErrors: [] };
// "Esere Sor" is offered only with a chat backend address; the audit answers /api/chat itself (see chatReplies below).
process.env.VITE_CHAT_API_URL = '/api/chat';
// The checks walk the six built-in demo artifacts, so the backend mode a local .env may switch on stays off here,
// and nothing is proxied to a running backend. Variables set here win over the .env files.
process.env.VITE_VAKIF_API = '';
process.env.VAKIF_API_PROXY = '';
process.env.CHAT_API_PROXY = '';
const server = await createServer({ server: { host: '127.0.0.1', port: 0, hmr: false, ws: false } });
// Canned backend replies for the chat checks, used in order; the default is a streamed answer citing chapter 2.
const chatReplies = [];
const chatRequests = [];
const streamedAnswer = { status: 200, type: 'text/event-stream', body: ['Süleymaniye Külliyesi\'ni **Mimar Sinan** tasarladı [Bölüm 1].', ' Külliye eğitim, sağlık ve yardımlaşmayı bir araya getiriyordu [Bölüm 2].'].map(text => `data: ${JSON.stringify({ type: 'text', text })}\n\n`).join('') + `data: ${JSON.stringify({ type: 'sources', sources: [{ title: 'Bölüm 2 · Birlikte yaşamanın mimarisi', chapter: 2 }] })}\n\ndata: {"type":"done"}\n\n` };
let chrome, socket;
let sequence = 0;
const pending = new Map();
let sessionId;

async function send(method, params = {}, session = sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject });
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text + ': ' + result.exceptionDetails.exception?.description);
  return result.result.value;
}
async function until(expression) {
  for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await delay(100); }
  throw new Error(`Page condition timed out: ${expression}`);
}
async function route(path) {
  await send('Page.navigate', { url: `${server.resolvedUrls.local[0]}#${path}` });
  await until(`document.querySelector('main h1') && document.readyState === 'complete'`);
  await evaluate('document.fonts.ready.then(() => true)');
  await delay(200);
}
async function key(name, modifiers = 0) {
  const codes = { Tab: 9, Enter: 13, Escape: 27, ' ': 32, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };
  // Enter and Space need `text` so Chrome emits the keypress that activates buttons, as a real keyboard does.
  const text = { Enter: '\r', ' ': ' ' }[name];
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name === ' ' ? 'Space' : name, windowsVirtualKeyCode: codes[name], modifiers, ...(text ? { text } : {}) });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name === ' ' ? 'Space' : name, windowsVirtualKeyCode: codes[name], modifiers });
  await delay(80);
}
async function keyboardActivate(selector) {
  assert(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`), `Missing control ${selector}`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await key('Enter');
}
async function scan(name, screenshot = false) {
  await evaluate(axe);
  const result = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } }).then(r => ({ violations: r.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incomplete: r.incomplete.map(v => ({ id: v.id, count: v.nodes.length })) }))`);
  const overflow = await evaluate(`({width: innerWidth, page: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('main *, header *, footer *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e).position !== 'absolute' && getComputedStyle(e).visibility !== 'hidden'; }).slice(0,20).map(e => e.tagName + '.' + e.className)})`);
  report.scans.push({ name, ...result, overflow });
  console.log(`${name}: ${result.violations.length} axe violations; width ${overflow.page}/${overflow.width}`);
  if (screenshot) {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(join(output, `${name}.png`), Buffer.from(data, 'base64'));
  }
}
// Solves the open puzzle with Enter alone, reading each piece's number from its accessible name.
async function solvePuzzle() {
  const count = await evaluate(`document.querySelectorAll('.mg-tile').length`);
  for (let target = 0; target < count; target++) {
    const from = await evaluate(`[...document.querySelectorAll('.mg-tile')].findIndex(t => Number(t.getAttribute('aria-label').match(/: parça (\\d+)/)[1]) === ${target + 1})`);
    if (from === target) continue;
    await keyboardActivate(`.mg-tile:nth-child(${target + 1})`);
    await keyboardActivate(`.mg-tile:nth-child(${from + 1})`);
  }
}
const focusedTile = () => evaluate(`[...document.querySelectorAll('.mg-tile')].indexOf(document.activeElement)`);
function checked(label) { report.checks.push(label); console.log(`PASS ${label}`); }
function skipped(label, reason) { report.checks.push(`SKIP ${label}: ${reason}`); console.log(`SKIP ${label}: ${reason}`); }

try {
  await server.listen();
  chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1440,1000', 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); } }
  assert(port, 'Chrome remote debugging did not start');
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(r => r.json());
  report.browser = version.Browser;
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const msg = JSON.parse(event.data);
    if (msg.id) { const request = pending.get(msg.id); pending.delete(msg.id); if (msg.error) request?.reject(new Error(JSON.stringify(msg.error))); else request?.resolve(msg.result); }
    if (msg.method === 'Fetch.requestPaused') {
      const reply = chatReplies.shift() ?? streamedAnswer;
      chatRequests.push(JSON.parse(msg.params.request.postData || '{}'));
      send('Fetch.fulfillRequest', { requestId: msg.params.requestId, responseCode: reply.status, responseHeaders: [{ name: 'content-type', value: reply.type }], body: Buffer.from(reply.body).toString('base64') }, msg.sessionId).catch(() => {});
    }
    if (msg.method === 'Runtime.exceptionThrown') report.runtimeErrors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }));
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/chat*', requestStage: 'Request' }] });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const routes = [['play', '/oyun'], ['play-quiz', '/oyun/quiz'], ['explore', '/kesfet'], ['passport-empty', '/pasaport'], ['medals', '/basarimlar'], ['story', '/eser/suleymaniye'], ['map', '/harita'], ['home', '/'], ['about', '/hakkinda'], ['camera', '/kamera'], ['admin', '/yonetim']];
  for (const width of [1440, 390, 320]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: width === 1440 ? 1000 : 844, deviceScaleFactor: 1, mobile: false });
    for (const [name, path] of routes) { await route(path); await scan(`${name}-${width}`, ['play', 'play-quiz', 'explore'].includes(name)); }
  }
  await route('/oyun');
  await keyboardActivate('.mobile-toggle');
  assert(await evaluate(`document.activeElement.matches('#mobile-menu a')`));
  await key('Escape');
  assert(await evaluate(`document.activeElement.matches('.mobile-toggle') && !document.querySelector('#mobile-menu')`));
  checked('Mobile menu: Enter opens, first link focused, Escape restores trigger');

  await route('/oyun/bilgi-kartlari');
  await until(`document.activeElement.id === 'cards-title'`);
  checked('Section route scrolls to its section and focuses the heading');
  await keyboardActivate('.flip-card .flip-turn');
  assert(await evaluate(`document.activeElement.matches('.flip-card.turned .flip-label') && document.querySelector('.flip-card .flip-front').inert`));
  await scan('cards-turned-320', true);
  await key('Tab');
  assert(await evaluate(`document.activeElement.matches('.flip-card.turned .flip-return')`));
  await key('Enter');
  assert(await evaluate(`document.activeElement.matches('.flip-card:not(.turned) .flip-turn') && document.querySelector('.flip-card .flip-back').inert`));
  assert(await evaluate(`document.querySelector('.flip-bar strong').textContent === '1'`));
  checked('Knowledge cards: Enter turns a card and focuses its story, the hidden face stays inert, Öne dön restores the button');

  await route('/oyun/oyunlar');
  await keyboardActivate('[data-game="puzzle"]');
  assert(await evaluate(`document.activeElement.matches('.modal-close') && document.querySelector('dialog.play-modal').open`));
  // A native modal makes the page inert: Tab may pass through browser UI (body in headless) but never onto page content.
  for (const modifiers of [8, 0, 0, 0]) {
    await key('Tab', modifiers);
    assert(await evaluate(`document.activeElement === document.body || !!document.activeElement.closest('dialog')`), 'Focus reached content behind the modal');
  }
  await scan('puzzle-320', true);
  // Solved with Enter alone, reading each tile's accessible name as a screen reader user would.
  for (let target = 0; target < 9; target++) {
    const from = await evaluate(`[...document.querySelectorAll('.mg-tile')].findIndex(t => t.getAttribute('aria-label').includes(': parça ${target + 1}'))`);
    if (from === target) continue;
    await keyboardActivate(`.mg-tile:nth-child(${target + 1})`);
    assert(await evaluate(`document.querySelector('.mg-tile:nth-child(${target + 1})').getAttribute('aria-pressed') === 'true'`));
    await keyboardActivate(`.mg-tile:nth-child(${from + 1})`);
  }
  await until(`document.activeElement.id === 'puzzle-result'`);
  assert(await evaluate(`document.querySelector('.mg-status').textContent.includes('Yapboz tamamlandı')`));
  await scan('puzzle-solved-320');
  await key('Escape');
  assert(await evaluate(`document.activeElement.matches('[data-game="puzzle"]') && !document.querySelector('dialog')`));
  checked('Kayıp Parçalar: dialog contains focus, tiles swap with Enter, the solved state is announced, Escape returns to the card');

  await keyboardActivate('[data-game="detective"]');
  await keyboardActivate('.mg-file .mg-button');
  assert(await evaluate(`document.activeElement.matches('.mg-clues li.open:nth-child(2)')`));
  const options = await evaluate(`document.querySelectorAll('.mg-option').length`);
  for (let i = 1; i <= options; i++) {
    await keyboardActivate(`.mg-option:nth-child(${i})`);
    await delay(50);
    if (await evaluate(`!!document.getElementById('detective-result')`)) break;
    assert(await evaluate(`document.activeElement.matches('.mg-option:nth-child(${i})[aria-disabled="true"]') && document.activeElement.textContent.includes('Bu eser değil')`));
  }
  await until(`document.activeElement.id === 'detective-result'`);
  await scan('detective-solved-320');
  await key('Escape');
  checked('Miras Dedektifi: a new clue takes focus, ruled-out guesses stay focusable and say so in text, solving focuses the result');

  await keyboardActivate('[data-game="puzzle"]');
  await keyboardActivate('.mg-levels button:nth-child(3)');
  await until(`document.querySelectorAll('.mg-tile').length === 25 && document.querySelector('.mg-levels button:nth-child(3)').getAttribute('aria-pressed') === 'true' && document.querySelector('.mg-status').textContent.includes('5×5')`);
  assert(await evaluate(`[...document.querySelectorAll('.mg-tile')].every(t => { const r = t.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })`), '5×5 pieces are smaller than 44 px at 320 px');
  assert(await evaluate(`[...document.querySelectorAll('.mg-tile')].filter(t => t.tabIndex === 0).length === 1`), 'The board should be one tab stop');
  await scan('puzzle-zor-320', true);
  await evaluate(`document.querySelector('.mg-tile').focus()`);
  await key('ArrowRight'); assert.equal(await focusedTile(), 1);
  await key('ArrowDown'); assert.equal(await focusedTile(), 6);
  await key('End'); assert.equal(await focusedTile(), 9);
  await key('Home'); assert.equal(await focusedTile(), 5);
  await key('ArrowLeft'); assert.equal(await focusedTile(), 5);
  await key('Enter');
  assert(await evaluate(`document.activeElement.getAttribute('aria-pressed') === 'true'`));
  await key('Escape');
  assert(await evaluate(`document.querySelector('dialog.play-modal')?.open && !document.querySelector('.mg-tile[aria-pressed="true"]') && document.querySelector('.mg-status').textContent.includes('Seçim kaldırıldı')`), 'Escape with a selection should only drop it');
  await key('Escape');
  await until(`!document.querySelector('dialog') && document.activeElement.matches('[data-game="puzzle"]')`);
  checked('Kayıp Parçalar Zor: 5×5 keeps 44 px pieces at 320 px, the board is one tab stop with arrow, Home and End keys, the first Escape drops the selection and the second closes');

  // Two other artifacts already solved: the puzzle opened from Selimiye's page is the third and earns Usta Eller.
  await evaluate(`(() => { const p = JSON.parse(localStorage.getItem('esik:passport:v1')); p.games.puzzle = { haseki: { kolay: 9 }, divrigi: { kolay: 8 } }; localStorage.setItem('esik:passport:v1', JSON.stringify(p)); })()`);
  // The marker tells the reloaded page from the old one, which still has its heading while the reload starts.
  await evaluate(`window.esikBeforeReload = true`);
  await send('Page.reload'); await until(`!window.esikBeforeReload && !!document.querySelector('main h1')`);
  await route('/eser/selimiye');
  await keyboardActivate('.story-finish-play a');
  await until(`document.querySelector('dialog.play-modal')?.open && document.querySelectorAll('.mg-tile').length === 25 && document.querySelector('.mg-tile img').getAttribute('src').includes('selimiye')`);
  await solvePuzzle();
  await until(`document.activeElement.id === 'puzzle-result'`);
  assert(await evaluate(`document.querySelector('.mg-medal').textContent.includes('Usta Eller') && document.querySelector('.mg-stars small').textContent.includes('3 yıldızdan') && document.querySelector('.mg-status').textContent.includes('Yapboz tamamlandı')`));
  await scan('puzzle-result-320', true);
  await key('Escape');
  await until(`!document.querySelector('dialog') && location.hash === '#/oyun/oyunlar'`);
  checked('Bu eserin yapbozunu çöz: the artifact page opens its own puzzle at the remembered level, the result names the new medal in the dialog, closing drops the link');

  await keyboardActivate('[data-game="detective"]');
  await keyboardActivate('.mg-levels button:nth-child(3)');
  await until(`document.querySelectorAll('.mg-option').length === 6 && document.querySelectorAll('.mg-clues li').length === 5`);
  await scan('detective-zor-320', true);
  for (let i = 1; i <= 6; i++) {
    if (await evaluate(`!!document.getElementById('detective-result')`)) break;
    await keyboardActivate(`.mg-option:nth-child(${i})`);
  }
  await until(`document.activeElement.id === 'detective-result'`);
  assert(await evaluate(`document.querySelector('.mg-medal').textContent.includes('Keskin Göz')`), 'A Zor puzzle and a Zor case should open Keskin Göz');
  await key('Escape');
  await route('/basarimlar');
  assert(await evaluate(`document.querySelectorAll('.medal-card').length === 9 && ['Usta Eller', 'Keskin Göz'].every(name => [...document.querySelectorAll('.medal-card.earned')].some(e => e.textContent.includes(name)))`));
  checked('Miras Dedektifi Zor: six options and five clues; a Zor puzzle and case open Keskin Göz; nine medals with the game medals earned');

  await route('/oyun/quiz');
  await until(`document.activeElement.id === 'quiz-title'`);
  const count = await evaluate(`document.querySelectorAll('#quiz-pips li').length`);
  assert.equal(count, 4);
  for (let i = 0; i < count; i++) {
    await key('Tab');
    assert(await evaluate(`document.activeElement.matches('#quiz-options .qz-option')`));
    await key(' ');
    assert(await evaluate(`document.activeElement.matches('.qz-option') && document.activeElement.getAttribute('aria-disabled') === 'true'`));
    assert(await evaluate(`document.querySelector('#quiz-feedback[role="status"]').textContent.includes('Doğru cevap:')`));
    const feedback = await evaluate(`document.querySelector('#quiz-feedback').textContent`);
    await key('Enter');
    assert.equal(await evaluate(`document.querySelector('#quiz-feedback').textContent`), feedback);
    if (i === 0) await scan('quiz-feedback-320', true);
    for (let j = 0; j < 6; j++) { if (await evaluate(`document.activeElement.id === 'quiz-next'`)) break; await key('Tab'); }
    assert(await evaluate(`document.activeElement.id === 'quiz-next'`));
    await key('Enter');
    await until(i === count - 1 ? `document.activeElement.id === 'quiz-result-title'` : `document.activeElement.id === 'quiz-question'`);
  }
  assert(await evaluate(`Number(document.querySelector('#quiz-points').textContent.match(/\\d+/)[0]) % 25 === 0`));
  await scan('quiz-result-320', true);
  checked('Quiz: four questions worth 25 points, keyboard-only round, textual feedback, focus follows the round');
  const stored = await evaluate(`JSON.parse(localStorage.getItem('esik:passport:v1'))`);
  assert.equal(stored.quiz.completed, 1);
  assert(await evaluate(`document.querySelectorAll('.play-activities li.done').length === 3 && document.querySelector('.play-notebook-count small').textContent.includes('3 / 4')`));
  checked('Keşif Defteri marks the puzzle, detective and quiz as done for this tab');
  await route('/basarimlar');
  assert(await evaluate(`Array.from(document.querySelectorAll('.medal-card.earned')).some(e => e.textContent.includes('Bilgi Avcısı') && e.textContent.includes('KOLEKSİYONUNDA'))`));
  checked('Completing quiz saves one round and unlocks the existing medal');
  await keyboardActivate('.medal-card.earned .medallion-item');
  await scan('medal-modal-320');
  await key('Escape');
  assert(await evaluate(`document.activeElement.matches('.medal-card.earned .medallion-item')`));
  checked('Medal dialog restores focus to the inspected medal');

  await route('/eser/suleymaniye');
  await keyboardActivate('.story-finish button');
  await route('/pasaport');
  assert(await evaluate(`document.querySelectorAll('.passport-stamp').length === 1`));
  await scan('passport-filled-320', true);
  await send('Page.reload'); await until(`!!document.querySelector('.passport-stamp')`);
  checked('Story stamp appears in passport and survives reload');

  await route('/oyun/gorevler');
  await until(`document.activeElement.id === 'quests-title' && document.querySelectorAll('.quest-card').length === 3`);
  await scan('quests-320', true);
  // Three of the four steps of the Anatolian route done; the last one is a question about Bursa Yeşil Külliye.
  await evaluate(`(() => { const p = JSON.parse(localStorage.getItem('esik:passport:v1')); const now = new Date().toISOString(); p.discovered.divrigi = now; p.discovered['yesil-kulliye'] = now; p.games.puzzle.divrigi = { kolay: 9 }; p.answered = []; localStorage.setItem('esik:passport:v1', JSON.stringify(p)); })()`);
  await evaluate(`window.esikBeforeReload = true`);
  await send('Page.reload'); await until(`!window.esikBeforeReload && document.querySelectorAll('.quest-card').length === 3`);
  const anadolu = '[aria-labelledby="quest-anadolunun-tas-isciligi"]';
  assert(await evaluate(`document.querySelector('${anadolu} .quest-progress').textContent.includes('3 / 4') && document.querySelector('${anadolu} .quest-next').getAttribute('href') === '#/oyun/quiz?eser=yesil-kulliye'`));
  await keyboardActivate(`${anadolu} .quest-next`);
  await until(`document.activeElement.id === 'quiz-title' && document.querySelector('#quiz-play').textContent.includes('Yeşil')`);
  // The right option is not known in advance: answer the first one, and open a fresh focused round until it is right.
  let right = false;
  for (let attempt = 0; attempt < 40 && !right; attempt++) {
    if (attempt) { await route('/oyun'); await route('/oyun/quiz?eser=yesil-kulliye'); await until(`!!document.querySelector('#quiz-options .qz-option')`); }
    assert(await evaluate(`document.querySelector('#quiz-play').textContent.includes('Yeşil')`), 'A focused round should open with a question about the artifact');
    await keyboardActivate('#quiz-options .qz-option');
    right = await evaluate(`document.querySelector('#quiz-feedback').textContent.includes('Doğru cevap!')`);
  }
  assert(right, 'No right answer in 40 focused rounds');
  await until(`document.querySelector('.toast').textContent.includes('Görev tamamlandı') && JSON.parse(localStorage.getItem('esik:passport:v1')).answered.includes('yesil-kulliye')`);
  await route('/oyun/gorevler');
  assert(await evaluate(`document.querySelector('${anadolu}').classList.contains('complete') && document.querySelector('${anadolu} .quest-done').textContent.includes('GÖREV TAMAMLANDI') && !document.querySelector('${anadolu} .quest-next')`));
  await scan('quest-complete-320', true);
  await route('/kesfet?season=anadolunun-tas-isciligi');
  await keyboardActivate('.season-banner .season-quest');
  await until(`location.hash === '#/oyun/gorevler' && document.activeElement.id === 'quests-title'`);
  checked('Keşif görevleri: progress comes from stamps, puzzles and answers; the next step opens a quiz round on that artifact, a right answer completes the quest with a toast, the season banner links to the quests');

  await route('/eser/selimiye');
  await keyboardActivate('.story-tools .segmented button:nth-child(3)');
  assert(await evaluate(`document.querySelector('.story-tools .segmented button:nth-child(3)').getAttribute('aria-pressed') === 'true'`));
  assert(await evaluate(`document.querySelector('.story-hero-image').alt.includes('minare') && !!document.querySelector('.image-description summary')`));
  await route('/eser/divrigi');
  assert(await evaluate(`document.querySelector('.story-tools .segmented button:nth-child(3)').getAttribute('aria-pressed') === 'true'`));
  assert(await evaluate(`document.querySelectorAll('.story-index [aria-current="step"]').length === 1`));
  checked('Narration style carries over to the next artifact; image description and current chapter are exposed as text');

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await route('/eser/suleymaniye');
  await evaluate(`localStorage.removeItem('esik:chat:v1:suleymaniye')`);
  await keyboardActivate('.story-tools .ask-button');
  await until(`document.querySelector('.chat-panel.open') && document.activeElement.matches('.chat-composer textarea')`);
  assert(await evaluate(`document.querySelector('.story-tools .ask-button').getAttribute('aria-expanded') === 'true' && document.querySelector('.chat-panel').getAttribute('aria-modal') === null && !document.getElementById('root').inert`));
  await scan('chat-open-1440', true);
  await keyboardActivate('.chat-suggestions button');
  await until(`document.querySelectorAll('.chat-message.assistant').length === 2 && !!document.querySelector('.chat-panel [role="status"]').textContent.includes('Rehber yanıtladı') && document.activeElement.matches('.chat-composer textarea')`);
  assert.equal(chatRequests.at(-1).artifactId, 'suleymaniye');
  assert(chatRequests.at(-1).messages.length === 1 && chatRequests.at(-1).messages[0].role === 'user' && ['short', 'story', 'child'].includes(chatRequests.at(-1).mode));
  assert(await evaluate(`document.querySelectorAll('.chat-message.assistant .chat-chapter').length === 2 && !!document.querySelector('.chat-sources button') && !document.querySelector('.chat-suggestions')`));
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('esik:chat:v1:suleymaniye')).length`), 2);
  await scan('chat-answer-1440', true);
  await keyboardActivate('.chat-message.assistant:last-of-type .chat-chapter');
  await until(`Math.abs(document.getElementById('chapter-0').getBoundingClientRect().top + document.getElementById('chapter-0').getBoundingClientRect().height / 2 - innerHeight / 2) < 200`);
  assert(await evaluate(`!!document.querySelector('.chat-panel.open')`));
  await evaluate(`document.querySelector('.chat-composer textarea').focus()`);
  await key('Tab', 8);
  assert(await evaluate(`!!document.activeElement.closest('.chat-panel')`), 'Shift+Tab left the panel');
  await key('Escape');
  await until(`!document.querySelector('.chat-panel.open') && document.activeElement.matches('.story-tools .ask-button')`);
  checked('Esere Sor (desktop): opens beside the story by keyboard, a suggestion sends the artifact id, the streamed answer links its chapters and sources, history is saved, Escape returns focus');

  await evaluate(`window.esikBeforeReload = true`);
  await send('Page.reload'); await until(`!window.esikBeforeReload && !!document.querySelector('.story-tools .ask-button')`);
  await keyboardActivate('.story-tools .ask-button');
  await until(`document.querySelectorAll('.chat-panel.open .chat-message').length === 3 && document.activeElement.matches('.chat-composer textarea')`);
  checked('Esere Sor: the conversation for this artifact survives a reload');
  await keyboardActivate('.chat-head-actions button[aria-label="Sohbeti temizle"]');
  await until(`document.activeElement.matches('.chat-confirm button:not(.danger)')`);
  await key('Escape');
  await until(`!document.querySelector('.chat-confirm') && document.activeElement.matches('[aria-label="Sohbeti temizle"]') && !!document.querySelector('.chat-panel.open')`);
  await keyboardActivate('.chat-head-actions button[aria-label="Sohbeti temizle"]');
  await keyboardActivate('.chat-confirm .danger');
  await until(`document.querySelectorAll('.chat-message').length === 1 && !!document.querySelector('.chat-suggestions') && localStorage.getItem('esik:chat:v1:suleymaniye') === null && document.activeElement.matches('.chat-composer textarea')`);
  await key('Escape');
  await until(`!document.querySelector('.chat-panel.open')`);
  checked('Esere Sor: clearing asks first, Escape cancels only the question, clearing empties the saved history and returns to the suggestions');

  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await route('/eser/selimiye');
  await until(`getComputedStyle(document.querySelector('.ask-fab')).display !== 'none'`);
  await keyboardActivate('.ask-fab');
  await until(`document.querySelector('.chat-panel.open') && document.getElementById('root').inert && document.querySelector('.chat-panel').getAttribute('aria-modal') === 'true' && document.activeElement.matches('.chat-composer textarea')`);
  assert(await evaluate(`(() => { const r = document.querySelector('.chat-panel').getBoundingClientRect(); return r.left === 0 && r.width === innerWidth && r.height === innerHeight; })()`));
  chatReplies.push({ status: 503, type: 'application/json', body: JSON.stringify({ detail: 'Test: model kapalı' }) });
  await send('Input.insertText', { text: 'Selimiye hangi şehirde?' });
  await key('Enter');
  await until(`!!document.querySelector('.chat-error[role="alert"]') && document.querySelector('.chat-error').textContent.includes('Test: model kapalı')`);
  assert(await evaluate(`document.querySelector('.chat-message.user').textContent.includes('Selimiye hangi şehirde?')`));
  await scan('chat-error-390', true);
  await keyboardActivate('.chat-error button');
  await until(`!document.querySelector('.chat-error') && document.querySelectorAll('.chat-message.assistant').length === 2 && document.activeElement.matches('.chat-composer textarea')`);
  assert.equal(chatRequests.at(-1).artifactId, 'selimiye');
  await key('Escape');
  await until(`!document.querySelector('.chat-panel.open') && !document.getElementById('root').inert && document.activeElement.matches('.ask-fab')`);
  checked('Esere Sor (phone): the floating button opens a full-screen dialog over an inert page, a failed answer shows the server note and retries, Escape restores the page and focus');
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 1, mobile: false });

  await route('/harita?eser=divrigi');
  await until(`!!document.querySelector('.selected-map-artifact strong')`);
  assert(await evaluate(`document.querySelector('.selected-map-artifact strong').textContent.includes('Divriği')`));
  checked('Haritada gör: /harita?eser=<id> opens the map on that artifact');
  await keyboardActivate('.map-artifact-list button:nth-child(2)');
  assert(await evaluate(`document.querySelector('.map-artifact-list button:nth-child(2)').getAttribute('aria-current') === 'true' && document.querySelectorAll('.heritage-marker.active').length === 1 && document.querySelector('.heritage-marker.active').title === document.querySelector('.selected-map-artifact strong').textContent && document.querySelector('.heritage-marker').getAttribute('role') === 'button'`));
  await scan('map-selected-320', true);
  checked('Miras Haritası: list selection is exposed with aria-current and lights exactly one pin, named by its title');

  await route('/kesfet');
  assert(await evaluate(`!!document.querySelector('.ex-results-list') && document.querySelector('#ex-filter-panel').hidden && document.querySelector('.ex-filter-toggle').getAttribute('aria-expanded') === 'false'`));
  assert(await evaluate(`document.querySelector('.ex-card-cta').getBoundingClientRect().bottom < innerHeight`), 'The first story action should be visible without scrolling on mobile');
  await keyboardActivate('.ex-filter-toggle');
  assert(await evaluate(`!document.querySelector('#ex-filter-panel').hidden && document.querySelector('.ex-filter-toggle').getAttribute('aria-expanded') === 'true'`));
  await scan('explore-filters-open-320', true);
  await evaluate(`(() => { const select = document.querySelectorAll('.ex-segment select')[1]; select.focus(); select.value = 'Edirne'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await until(`document.querySelectorAll('.ex-card').length === 1`);
  assert(await evaluate(`document.querySelector('.ex-count[role="status"]').textContent.includes('1 eser listeleniyor') && getComputedStyle(document.querySelectorAll('.ex-segment-label')[1]).position !== 'absolute'`));
  await keyboardActivate('.ex-filter-done');
  assert(await evaluate(`document.querySelector('#ex-filter-panel').hidden && document.activeElement.id === 'ex-results-title' && document.querySelector('.ex-filter-chip').textContent.includes('Edirne') && document.querySelector('.ex-filter-badge').textContent.includes('1')`));
  await keyboardActivate('.ex-view-toggle button[aria-label="Kart görünümü"]');
  assert(await evaluate(`!!document.querySelector('.ex-results-cards') && document.querySelectorAll('.ex-card').length === 1 && document.querySelector('.ex-card h3').textContent.includes('Selimiye')`));
  await scan('explore-cards-filtered-320', true);
  await keyboardActivate('.ex-filter-toggle');
  await evaluate(`document.querySelector('.ex-segment select').focus()`);
  await key('Escape');
  assert(await evaluate(`document.querySelector('#ex-filter-panel').hidden && document.activeElement.matches('.ex-filter-toggle')`));
  await keyboardActivate('.ex-clear');
  await until(`document.querySelectorAll('.ex-card').length === 6`);
  await keyboardActivate('.ex-results > li:nth-child(2) .ex-favorite');
  assert(await evaluate(`document.querySelector('.ex-results > li:nth-child(2) .ex-favorite').getAttribute('aria-pressed') === 'true'`));
  await keyboardActivate('.ex-favorites');
  await until(`document.querySelectorAll('.ex-card').length === 1`);
  await keyboardActivate('.ex-view-toggle button[aria-label="Liste görünümü"]');
  assert(await evaluate(`!!document.querySelector('.ex-results-list') && document.querySelectorAll('.ex-card').length === 1 && document.querySelector('.ex-favorite').getAttribute('aria-pressed') === 'true'`));
  await scan('explore-favorites-320', true);
  await keyboardActivate('.ex-favorites');
  await keyboardActivate('.ex-results > li:nth-child(2) .ex-favorite');
  assert(await evaluate(`!!document.querySelector('.ex-card .ex-stamp') && document.querySelectorAll('.ex-card a').length === 6`));
  await scan('explore-stamped-320', true);
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await until(`!document.querySelector('#ex-filter-panel').hidden`);
  assert(await evaluate(`!!document.querySelector('.ex-results-list')`), 'An explicit view choice survives resizing');
  await scan('explore-list-desktop', true);
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 1, mobile: false });
  await until(`document.querySelector('#ex-filter-panel').hidden`);
  await evaluate(`(() => { const input = document.querySelector('.ex-search input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Böyle bir eser yok'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await until(`!document.querySelector('.ex-card')`);
  await scan('explore-empty-320', true);
  await keyboardActivate('.ex-search button');
  await until(`document.querySelectorAll('.ex-card').length === 6`);
  assert(await evaluate(`document.activeElement.matches('.ex-search input')`));
  await route('/kesfet?city=Edirne');
  await until(`document.querySelectorAll('.ex-card').length === 1`);
  assert(await evaluate(`document.querySelector('#ex-filter-panel').hidden && document.querySelector('.ex-filter-chip').textContent.includes('Edirne')`));
  await keyboardActivate('.ex-filter-chip');
  await until(`document.querySelectorAll('.ex-card').length === 6`);
  assert(await evaluate(`document.activeElement.id === 'ex-results-title'`));
  await keyboardActivate('.ex-card .ex-card-cta');
  await until(`location.hash.startsWith('#/eser/')`);
  checked('Keşfet: compact mobile list, keyboard filter disclosure and Escape, visible active filters, cards/list retain filters and favourites, empty search recovery, deep links and story navigation');

  await route('/');
  // The facade's two leaves (HeroGate.tsx) each fill half the doorway and stay unturned until the visitor scrolls; the
  // doorway light behind them is there, waiting for the leaves to open.
  assert(await evaluate(`(() => { const doors = document.querySelector('.fc-doors').getBoundingClientRect(); const leaves = [...document.querySelectorAll('.fc-leaf')]; return leaves.length === 2 && leaves.every(leaf => Math.abs(leaf.getBoundingClientRect().width - doors.width / 2) < 2 && new DOMMatrix(getComputedStyle(leaf).transform.replace('none', '')).isIdentity) && !!document.querySelector('.fc-doorglow'); })()`), 'The door should rest closed, with its light behind it');
  await keyboardActivate('.hero-controls .en-skip');
  await until(`document.activeElement.id === 'vision-title'`);
  await route('/kesfet'); await route('/');
  await keyboardActivate('.hero-actions .button');
  await until(`document.activeElement.matches('.cy-copy h2')`);
  checked('Giriş: the door rests closed; Girişi atla reaches the vision chapter and Kapıyı arala the courtyard, both by keyboard');

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await route('/');
  // The home page dropped the ring in df120cb; the checks run again as soon as a page shows it.
  if (!await evaluate(`!!document.querySelector('.story-ring')`)) skipped('Hikâye halkası', 'the ring is not on the home page');
  else {
    const ringFront = () => evaluate(`document.querySelector('.ring-now strong').textContent`);
    assert(await evaluate(`(() => { const links = [...document.querySelectorAll('.story-ring a.ring-face')]; const tabbable = links.filter(a => a.tabIndex >= 0); return tabbable.length === 6 && new Set(tabbable.map(a => a.getAttribute('href'))).size === 6 && links.filter(a => a.tabIndex < 0).every(a => a.getAttribute('aria-hidden') === 'true'); })()`), 'Each artifact should be one focusable link in the ring');
    const firstFront = await ringFront();
    await keyboardActivate('.ring-button[aria-label="Sonraki eser"]');
    await until(`document.querySelector('.ring-now strong').textContent !== ${JSON.stringify(firstFront)}`);
    await keyboardActivate('.ring-controls .ring-button:nth-child(2)');
    assert(await evaluate(`document.querySelector('.ring-controls .ring-button:nth-child(2)').getAttribute('aria-pressed') === 'true' && document.querySelector('.ring-controls .ring-button:nth-child(2)').getAttribute('aria-label') === 'Döndürmeyi başlat'`));
    await evaluate(`document.querySelectorAll('.story-ring a.ring-face:not([tabindex="-1"])')[3].focus()`);
    await until(`document.querySelector('.ring-now strong').textContent === document.querySelectorAll('.story-ring a.ring-face:not([tabindex="-1"])')[3].getAttribute('aria-label').split(' · ')[0]`);
    checked('Hikâye halkası: one link per artifact, Next turns the ring, the pause button reports its state, a focused card turns to the front');
  }

  await send('Emulation.setDeviceMetricsOverride', { width: 720, height: 500, deviceScaleFactor: 1, mobile: false });
  await route('/oyun'); await scan('play-reflow-200');
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 250, deviceScaleFactor: 1, mobile: false });
  await route('/oyun'); await scan('play-reflow-400');
  await keyboardActivate('.mobile-toggle');
  assert(await evaluate(`document.querySelector('#mobile-menu').getBoundingClientRect().bottom <= innerHeight + 1`));
  checked('Short viewport: expanded menu fits and scrolls at 400% equivalent layout');
  await key('Escape');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await route('/oyun'); await scan('play-motion-1440', true);
  await route('/'); await scan('home-motion-1440', true);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await delay(100);
  assert(await evaluate(`getComputedStyle(document.querySelector('.en-beam')).animationName === 'none'`));
  checked('Reduced motion disables decorative CSS animation');
} catch (error) {
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Audit output: ${output}`);
  if (socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close'); } catch {} socket.close(); }
  chrome?.kill(); await server.close();
}
if (report.scans.some(scan => scan.violations.length || scan.overflow.page > scan.overflow.width + 1) || report.runtimeErrors.length) process.exitCode = 1;
