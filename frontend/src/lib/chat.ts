import type { DiscoveryArtifact } from './artifactContract';
import { CHAT_LIMITS, parseSources, type ChatTurn } from './chatContract.ts';
import { t } from './i18n.ts';

// History lives in this browser only, one list per artifact, kept apart for the local demo and an external feed
// the same way the passport is (tackapi:passport:v1 / tackapi:passport:feed:v1).
export const chatStorageKey = (artifactId: string, feed: boolean) => `tackapi:chat:${feed ? 'feed:' : ''}v1:${artifactId}`;

export function parseHistory(raw: string | null, chapters: number): ChatTurn[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((turn: unknown): turn is ChatTurn => typeof turn === 'object' && turn !== null
      && ((turn as ChatTurn).role === 'user' || (turn as ChatTurn).role === 'assistant')
      && typeof (turn as ChatTurn).content === 'string' && (turn as ChatTurn).content.trim().length > 0)
      .map(turn => {
        const sources = turn.role === 'assistant' ? parseSources(turn.sources, chapters) : [];
        return { role: turn.role, content: turn.content, ...(sources.length ? { sources } : {}) };
      })
      .slice(-CHAT_LIMITS.storedMessages);
  } catch { return []; }
}
export function loadHistory(key: string, chapters: number): ChatTurn[] {
  try { return parseHistory(localStorage.getItem(key), chapters); } catch { return []; }
}
export function saveHistory(key: string, turns: ChatTurn[]) {
  try {
    if (turns.length) localStorage.setItem(key, JSON.stringify(turns.slice(-CHAT_LIMITS.storedMessages)));
    else localStorage.removeItem(key);
    return true;
  } catch { return false; }
}

// The window sent with each question: the last few turns, starting at a question, with long answers shortened.
export function requestTurns(history: ChatTurn[]) {
  const recent = history.slice(-CHAT_LIMITS.sentMessages);
  const start = recent.findIndex(turn => turn.role === 'user');
  return start < 0 ? [] : recent.slice(start).map(turn => ({ role: turn.role, content: turn.content.slice(0, CHAT_LIMITS.assistantMessage) }));
}

const known = (value: string | undefined) => Boolean(value && !/^(bilinmiyor|unknown)$/i.test(value.trim()));

// Welcome text and suggestions come from the record itself, so opening the panel costs no model call.
export function welcomeMessage(artifact: DiscoveryArtifact) {
  return t(`Merhaba! **${artifact.name}** hakkında merak ettiklerini sorabilirsin: kim yaptırdı, nasıl bir mimarisi var, hangi dönemin izlerini taşıyor… Cevaplarımı bu sayfadaki bilgilere ve kaynaklara dayandırırım.`, `Hello! Ask me anything you wonder about **${artifact.name}**: who had it built, what its architecture is like, which era it bears the marks of… I base my answers on the information and sources on this page.`);
}
export function chatSuggestions(artifact: DiscoveryArtifact, chapter?: number) {
  const list = [t('Bu eseri üç cümlede anlat', 'Describe this work in three sentences')];
  const index = chapter ?? 0;
  const current = artifact.chapters[index];
  if (current) list.push(t(`Bölüm ${index + 1}: “${current.title}” bölümünü açar mısın?`, `Chapter ${index + 1}: could you explain “${current.title}”?`));
  if (artifact.detail) list.push(t(`“${artifact.detail.title}” ayrıntısını açıkla`, `Explain the detail “${artifact.detail.title}”`));
  if (known(artifact.architect)) list.push(t(`${artifact.architect} kimdir, bu eserde ne yaptı?`, `Who was ${artifact.architect}, and what did they do in this work?`));
  list.push(t('Bu yapı ne için kullanılıyordu?', 'What was this building used for?'), t('Bunu bir çocuğa anlatır gibi anlat', 'Tell it as you would to a child'));
  return list;
}

// A small, safe subset of Markdown. Nothing is ever turned into HTML: the panel renders these nodes as React elements.
// Links survive only when they point at a collection page or one of this artifact's listed sources.
export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'chapter'; chapter: number }
  | { type: 'link'; text: string; href: string; internal: boolean };
export type RichBlock =
  | { type: 'heading'; inline: Inline[] }
  | { type: 'paragraph'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] };
export type RichAllow = { chapters: number; slugs: ReadonlySet<string>; urls: ReadonlySet<string> };

const INLINE = /\*\*(.+?)\*\*|\[Bölüm (\d{1,2})\]|\[([^\]\n]+)\]\(([^)\s]+)\)|(?<![\w*])[*_](?![\s*_])(.+?)(?<![\s*_])[*_](?![\w*])/gu;

export function parseInline(text: string, allow: RichAllow): Inline[] {
  const nodes: Inline[] = [];
  const push = (value: string) => {
    if (!value) return;
    const last = nodes[nodes.length - 1];
    if (last?.type === 'text') last.text += value; else nodes.push({ type: 'text', text: value });
  };
  let at = 0;
  for (const match of text.matchAll(INLINE)) {
    push(text.slice(at, match.index));
    at = match.index + match[0].length;
    const [whole, strong, chapter, label, href, em] = match;
    if (strong !== undefined) nodes.push({ type: 'strong', children: parseInline(strong, allow) });
    else if (chapter !== undefined) {
      const n = Number(chapter);
      if (n >= 1 && n <= allow.chapters) nodes.push({ type: 'chapter', chapter: n }); else push(whole);
    } else if (label !== undefined) {
      const slug = href.match(/^#\/eser\/([a-z0-9-]+)$/)?.[1];
      if (slug && allow.slugs.has(slug)) nodes.push({ type: 'link', text: label, href, internal: true });
      else if (allow.urls.has(href)) nodes.push({ type: 'link', text: label, href, internal: false });
      else push(label);
    } else if (em !== undefined) nodes.push({ type: 'em', children: parseInline(em, allow) });
  }
  push(text.slice(at));
  return nodes;
}

export function parseRichText(text: string, allow: RichAllow): RichBlock[] {
  const blocks: RichBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join(' '), allow) });
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(item => parseInline(item, allow)) });
    paragraph = []; list = null;
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    const item = line.match(/^(?:([-*•])|(\d{1,2})[.)])\s+(.+)$/);
    if (!line) flush();
    else if (heading) { flush(); blocks.push({ type: 'heading', inline: parseInline(heading[1].replace(/\s*#+$/, ''), allow) }); }
    else if (item) {
      const ordered = item[2] !== undefined;
      if (paragraph.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(item[3]);
    } else if (list && /^\s{2,}/.test(raw)) list.items[list.items.length - 1] += ` ${line}`;
    else { if (list) flush(); paragraph.push(line); }
  }
  flush();
  return blocks;
}

// What the copy button and the screen-reader announcement use: the answer without Markdown marks.
export function plainText(text: string) {
  return text
    .replace(/\[([^\]\n]+)\]\((https:[^)\s]+)\)/g, '$1 ($2)')
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,4}\s+/gm, '')
    .trim();
}
