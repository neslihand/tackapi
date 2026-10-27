import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, ArrowUpRight, BookOpen, Check, Copy, RotateCcw, Square, Trash2, X } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { track } from '../lib/analytics';
import { CHAT_LIMITS, parseSources, type ChatErrorCode, type ChatSource, type ChatTurn } from '../lib/chatContract';
import { ChatError, sendChat } from '../lib/chatApi';
import { chatStorageKey, chatSuggestions, loadHistory, parseRichText, plainText, requestTurns, saveHistory, welcomeMessage, type Inline, type RichAllow } from '../lib/chat';
import { baseContent, useContent } from '../lib/contentStore';
import type { NarrationMode } from '../lib/preferences';
import { Link } from '../lib/navigation';

const errorText: Record<ChatErrorCode, string> = {
  'not-found': 'Asistan bu eser için bilgi bulamadı.',
  'rate-limited': 'Kısa sürede çok fazla soru gönderildi. Biraz bekleyip yeniden dene.',
  unavailable: 'Asistan şu an yanıt veremiyor.',
  timeout: 'Yanıt çok uzun sürdü.',
  network: 'Asistana ulaşılamadı. Bağlantını kontrol edip yeniden dene.',
  refusal: 'Bu soruya yanıt veremiyorum. Eserle ilgili başka bir şey sorabilirsin.',
};
const smooth = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
const PHONE = '(max-width: 640px)';

function InlineText({ nodes, onChapter }: { nodes: Inline[]; onChapter: (n: number) => void }): ReactNode {
  return nodes.map((node, i) => {
    if (node.type === 'text') return <Fragment key={i}>{node.text}</Fragment>;
    if (node.type === 'strong') return <strong key={i}><InlineText nodes={node.children} onChapter={onChapter} /></strong>;
    if (node.type === 'em') return <em key={i}><InlineText nodes={node.children} onChapter={onChapter} /></em>;
    if (node.type === 'chapter') return <button key={i} type="button" className="chat-chapter" onClick={() => onChapter(node.chapter)} aria-label={`Bölüm ${node.chapter}'e git`}><BookOpen size={12} aria-hidden="true" />Bölüm {node.chapter}</button>;
    return node.internal ? <Link key={i} to={node.href.slice(1)}>{node.text}</Link>
      : <a key={i} href={node.href} target="_blank" rel="noreferrer">{node.text}<span className="sr-only"> (yeni sekmede açılır)</span></a>;
  });
}
function RichText({ text, allow, onChapter }: { text: string; allow: RichAllow; onChapter: (n: number) => void }) {
  const blocks = useMemo(() => parseRichText(text, allow), [text, allow]);
  return blocks.map((block, i) => block.type === 'heading' ? <h3 key={i}><InlineText nodes={block.inline} onChapter={onChapter} /></h3>
    : block.type === 'paragraph' ? <p key={i}><InlineText nodes={block.inline} onChapter={onChapter} /></p>
    : block.ordered ? <ol key={i}>{block.items.map((item, j) => <li key={j}><InlineText nodes={item} onChapter={onChapter} /></li>)}</ol>
    : <ul key={i}>{block.items.map((item, j) => <li key={j}><InlineText nodes={item} onChapter={onChapter} /></li>)}</ul>);
}
function Sources({ sources, onChapter }: { sources: ChatSource[]; onChapter: (n: number) => void }) {
  return <div className="chat-sources"><span>Dayandığı içerik</span><ul>{sources.map((source, i) => <li key={i}>
    {source.chapter ? <button type="button" onClick={() => onChapter(source.chapter!)}>{source.title}</button>
      : source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight size={12} aria-hidden="true" /><span className="sr-only"> (yeni sekmede açılır)</span></a>
      : <span>{source.title}</span>}
  </li>)}</ul></div>;
}

type Props = { id: string; artifact: DiscoveryArtifact; mode: NarrationMode; chapter?: number; endpoint: string; open: boolean; onClose: () => void };

export function ArtifactChat({ id, artifact, mode, chapter, endpoint, open, onClose }: Props) {
  const { artifacts, readOnly, overrides } = useContent();
  const storageKey = chatStorageKey(artifact.id, readOnly);
  const chapters = artifact.chapters.length;
  const [history, setHistory] = useState<ChatTurn[]>(() => loadHistory(storageKey, chapters));
  const [pending, setPending] = useState<{ text: string; sources: ChatSource[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: ChatErrorCode; detail?: string } | null>(null);
  const [input, setInput] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState(-1);
  const [announcement, setAnnouncement] = useState('');
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches);
  const panel = useRef<HTMLElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const trash = useRef<HTMLButtonElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const stick = useRef(true);
  const allow = useMemo<RichAllow>(() => ({ chapters, slugs: new Set(artifacts.map(a => a.slug)), urls: new Set(artifact.sourceReferences.flatMap(s => s.url ? [s.url] : [])) }), [chapters, artifacts, artifact.sourceReferences]);
  const suggestions = useMemo(() => chatSuggestions(artifact, chapter), [artifact, chapter]);
  // Edits made in the local admin panel exist only in this browser; the backend answers from the published record.
  const localEdited = !readOnly && Boolean(overrides.artifacts) && JSON.stringify(baseContent.artifacts.find(a => a.id === artifact.id)) !== JSON.stringify(artifacts.find(a => a.id === artifact.id));

  useEffect(() => () => { const active = request.current; request.current = null; active?.abort(); }, []);
  useEffect(() => {
    const query = window.matchMedia(PHONE);
    const change = () => setPhone(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!open) { setConfirmClear(false); return; }
    stick.current = true;
    const frame = requestAnimationFrame(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); (field.current?.disabled ? panel.current?.querySelector<HTMLElement>('.chat-close') : field.current)?.focus(); });
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => {
    // On phones the panel covers the page like a dialog: the page goes inert and stops scrolling underneath,
    // keeping its scroll position. On wider screens the panel sits beside the story and the page stays usable.
    if (!open || !phone) return;
    const root = document.getElementById('root');
    const overflow = document.documentElement.style.overflow;
    if (root) root.inert = true;
    document.documentElement.style.overflow = 'hidden';
    return () => { if (root) root.inert = false; document.documentElement.style.overflow = overflow; };
  }, [open, phone]);
  useEffect(() => { if (stick.current) log.current?.scrollTo({ top: log.current.scrollHeight }); }, [history, pending, error, busy]);
  useEffect(() => { if (confirmClear) keep.current?.focus(); }, [confirmClear]);

  function commit(turns: ChatTurn[]) {
    const kept = turns.slice(-CHAT_LIMITS.storedMessages);
    setHistory(kept);
    saveHistory(storageKey, kept);
  }
  async function run(turns: ChatTurn[]) {
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(null); setAnnouncement('Yanıt hazırlanıyor…');
    stick.current = true;
    let text = '';
    let sources: ChatSource[] = [];
    let truncated = false;
    try {
      await sendChat(endpoint, { artifactId: artifact.id, artifactName: artifact.name, mode, feed: readOnly, messages: requestTurns(turns), ...(chapter !== undefined ? { chapter } : {}) }, { signal: controller.signal, onEvent: event => {
        if (event.type === 'text') text += event.text;
        else if (event.type === 'reset') text = '';
        else if (event.type === 'sources') sources = parseSources(event.sources, chapters);
        else if (event.type === 'done') truncated = Boolean(event.truncated);
        setPending({ text, sources });
      } });
      if (!text.trim()) throw new ChatError('unavailable', 'Boş yanıt geldi.');
      const answer: ChatTurn = { role: 'assistant', content: text.trim() + (truncated ? '\n\n_(Yanıt uzunluk sınırına ulaştı.)_' : ''), ...(sources.length ? { sources } : {}) };
      commit([...turns, answer]);
      setAnnouncement(`Rehber yanıtladı. ${plainText(answer.content)}`);
      const asked = [...turns].reverse().find(t => t.role === 'user')?.content ?? '';
      track('chat_question', artifact.slug, { question: asked.slice(0, 300), mode });
      track('chat_answer', artifact.slug, { no_info: /bilgi\s+yok|bilgi\s+bulunmuyor|yer\s+almıyor/i.test(text), chars: text.length });
    } catch (failure) {
      if (controller.signal.aborted) {
        // Stopped by the user: keep what arrived. Cleared or closed for good: request.current was let go first.
        if (request.current === controller && text.trim()) commit([...turns, { role: 'assistant', content: `${text.trim()}\n\n_(Yanıt durduruldu.)_`, ...(sources.length ? { sources } : {}) }]);
        setAnnouncement('Yanıt durduruldu.');
      } else {
        const next = failure instanceof ChatError ? { code: failure.code, detail: failure.detail } : { code: 'unavailable' as const };
        setError(next);
        setAnnouncement(errorText[next.code]);
      }
    } finally {
      if (request.current === controller) request.current = null;
      setPending(null); setBusy(false);
    }
  }
  function send(question: string) {
    const content = question.trim().slice(0, CHAT_LIMITS.userMessage);
    if (!content || busy || !endpoint) return;
    const turns: ChatTurn[] = [...history, { role: 'user', content }];
    commit(turns);
    setInput('');
    // The control that sent the question (a suggestion, the send button) disappears; keep focus in the panel.
    field.current?.focus();
    void run(turns);
  }
  function goToChapter(n: number) {
    const target = document.getElementById(`chapter-${n - 1}`);
    if (!target) return;
    if (phone) onClose();
    target.scrollIntoView({ behavior: smooth(), block: phone ? 'start' : 'center' });
  }
  async function copy(index: number, text: string) {
    try {
      await navigator.clipboard.writeText(plainText(text));
      setCopied(index); setAnnouncement('Yanıt kopyalandı.');
      setTimeout(() => setCopied(current => current === index ? -1 : current), 2000);
    } catch { setAnnouncement('Yanıt kopyalanamadı.'); }
  }
  function clear() {
    const active = request.current;
    request.current = null;
    active?.abort();
    commit([]); setError(null); setConfirmClear(false); setAnnouncement('Sohbet geçmişi temizlendi.');
    field.current?.focus();
  }
  function cancelClear() {
    setConfirmClear(false);
    requestAnimationFrame(() => trash.current?.focus());
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(input); }
  }
  const unanswered = history[history.length - 1]?.role === 'user';
  const asked = history.some(turn => turn.role === 'user');

  return createPortal(<section ref={panel} id={id} className={`chat-panel ${open ? 'open' : ''}`} role="dialog" aria-modal={phone ? true : undefined} aria-labelledby={`${id}-title`} aria-describedby={`${id}-note`} inert={!open} onKeyDown={e => { if (e.key === 'Escape' && !e.nativeEvent.isComposing) { e.stopPropagation(); if (confirmClear) cancelClear(); else onClose(); } }}>
    <header className="chat-head">
      <div><p className="chat-eyebrow">YAPAY ZEKÂ REHBERİ</p><h2 id={`${id}-title`}>Esere Sor</h2><p className="chat-subject">{artifact.name} · {artifact.city}</p></div>
      <div className="chat-head-actions">
        {history.length > 0 && <button ref={trash} type="button" className="chat-icon" onClick={() => setConfirmClear(true)} aria-label="Sohbeti temizle" disabled={confirmClear}><Trash2 size={17} aria-hidden="true" /></button>}
        <button type="button" className="chat-icon chat-close" onClick={onClose} aria-label="Sohbeti kapat"><X size={19} aria-hidden="true" /></button>
      </div>
    </header>
    {confirmClear && <div className="chat-confirm" role="group" aria-label="Sohbeti temizleme onayı"><p>Bu eserin sohbet geçmişi silinsin mi?</p><button ref={keep} type="button" onClick={cancelClear}>Vazgeç</button><button type="button" className="danger" onClick={clear}>Sil</button></div>}
    <div ref={log} className="chat-log" tabIndex={0} role="log" aria-live="off" aria-label="Sohbet geçmişi" onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {!endpoint && <p className="chat-note" role="note"><strong>Sohbet servisi henüz bağlı değil.</strong> Backend hazır olunca <code>.env.local</code> dosyasına <code>VITE_CHAT_API_URL</code> adresini yazıp geliştirme sunucusunu yeniden başlat (bkz. <code>docs/ai-sohbet-api.md</code>). Bu not yalnızca geliştirme sırasında görünür.</p>}
      {localEdited && <p className="chat-note">Bu eserde bu tarayıcıda yapılmış düzenlemeler var; asistan bu düzenlemeleri görmez.</p>}
      <div className="chat-message assistant"><RichText text={welcomeMessage(artifact)} allow={allow} onChapter={goToChapter} /></div>
      {!asked && <div className="chat-suggestions" role="group" aria-label="Önerilen sorular">{suggestions.map(question => <button type="button" key={question} onClick={() => send(question)} disabled={busy || !endpoint}>{question}</button>)}</div>}
      {history.map((turn, i) => turn.role === 'user'
        ? <div key={i} className="chat-message user"><span className="sr-only">Sen: </span>{turn.content}</div>
        : <div key={i} className="chat-message assistant"><span className="sr-only">Rehber: </span><RichText text={turn.content} allow={allow} onChapter={goToChapter} />
          {turn.sources && <Sources sources={turn.sources} onChapter={goToChapter} />}
          <div className="chat-message-actions"><button type="button" onClick={() => copy(i, turn.content)}>{copied === i ? <><Check size={14} aria-hidden="true" />Kopyalandı</> : <><Copy size={14} aria-hidden="true" />Kopyala</>}</button></div></div>)}
      {busy && (pending?.text
        ? <div className="chat-message assistant streaming" aria-hidden="true"><RichText text={pending.text} allow={allow} onChapter={goToChapter} /></div>
        : <div className="chat-message assistant chat-typing" aria-hidden="true"><i /><i /><i /><span>Yanıt hazırlanıyor</span></div>)}
      {error && <div className="chat-error" role="alert"><p>{errorText[error.code]}</p>{error.detail && <small>Sunucu: {error.detail}</small>}{unanswered && <button type="button" onClick={() => { field.current?.focus(); void run(history); }}><RotateCcw size={15} aria-hidden="true" />Tekrar dene</button>}</div>}
    </div>
    <form className="chat-composer" onSubmit={e => { e.preventDefault(); send(input); }}>
      <label className="sr-only" htmlFor={`${id}-input`}>{artifact.name} hakkında sorunu yaz</label>
      <textarea ref={field} id={`${id}-input`} value={input} onChange={e => setInput(e.target.value)} onKeyDown={keyDown} maxLength={CHAT_LIMITS.userMessage} rows={1} disabled={!endpoint} placeholder="Bu eser hakkında bir soru sor…" aria-describedby={input.length > 800 ? `${id}-count` : undefined} />
      {busy ? <button type="button" className="chat-send" onClick={() => { request.current?.abort(); field.current?.focus(); }} aria-label="Yanıtı durdur"><Square size={15} fill="currentColor" aria-hidden="true" /></button>
        : <button type="submit" className="chat-send" disabled={!input.trim()} aria-label="Gönder"><ArrowUp size={19} aria-hidden="true" /></button>}
      {input.length > 800 && <small id={`${id}-count`} className="chat-count">{input.length} / {CHAT_LIMITS.userMessage}</small>}
    </form>
    <p id={`${id}-note`} className="chat-privacy">Sorun yanıt üretmek için yapay zekâ servisine gönderilir; kişisel bilgilerini paylaşma. Yanıtlar hata içerebilir, kaynaklardan doğrula.</p>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
  </section>, document.body);
}
