import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, CalendarClock, Check, ClipboardCopy, Clock, EyeOff, FileText, Gauge, HeartPulse, History, Layers, Megaphone,
  RefreshCw, RotateCcw, Route, Sparkles, Wand2, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Link, replaceQuery } from '../lib/navigation';
import type { AgentDraft, AgentKind, AgentSuggestion, DraftKind, DraftTone } from '../lib/types';
import { useLoad, useToast } from '../components/UI';

const GROUPS: { kind: AgentKind; title: string; note: string; icon: ReactNode }[] = [
  { kind: 'calendar', title: 'Yaklaşan tarihler', note: 'Bayramlar, milli günler ve şehir günleri (Takvim sayfasından).', icon: <CalendarClock size={16} /> },
  { kind: 'anniversary', title: 'Yıl dönümleri', note: 'Kitaptaki tarihli olayların yuvarlak yıl dönümleri.', icon: <History size={16} /> },
  { kind: 'experience', title: 'Ziyaretçi deneyimi', note: 'Hatalar, yavaş sayfalar, cevapsız sorular, sonuçsuz aramalar ve kamera.', icon: <Gauge size={16} /> },
  { kind: 'engagement', title: 'Süreklilik', note: 'Geri dönen ziyaretçiler, hemen ayrılanlar ve az ulaşılan profiller.', icon: <HeartPulse size={16} /> },
  { kind: 'content', title: 'İçerik', note: 'İlgi gören ama eksik ya da yarım bırakılan eserler.', icon: <Layers size={16} /> },
];
const KIND_NAME = Object.fromEntries(GROUPS.map(g => [g.kind, g.title])) as Record<AgentKind, string>;
const DRAFTS: Record<DraftKind, [string, typeof Route, string]> = {
  announcement: ['Duyuru yaz', Megaphone, 'Ana sayfadaki “Gündem” bandı için üç seçenek'],
  route: ['Rota öner', Route, 'Eserlerden sıralı bir keşif rotası'],
  summary: ['Özet yaz', FileText, 'Eser kartı için kısa tanıtım'],
};
const TONES: [DraftTone, string][] = [['auto', 'Otomatik'], ['warm', 'Samimi'], ['formal', 'Kurumsal'], ['short', 'Kısa'], ['kids', 'Çocuklar için']];
const STATUS: Record<AgentSuggestion['status'], string> = { open: 'Açık', done: 'Yapıldı', dismissed: 'Gizlendi', expired: 'Süresi geçti' };

const level = (p: number) => p >= 70 ? ['high', 'Öncelikli'] : p >= 50 ? ['mid', 'Bu hafta'] : ['low', 'Fırsat'];

function dueText(s: AgentSuggestion) {
  if (!s.due_on) return null;
  if (s.kind === 'anniversary') return `${s.due_on.slice(0, 4)} boyunca`;
  const days = Math.round((new Date(`${s.due_on}T12:00:00`).getTime() - Date.now()) / 86_400_000);
  return days <= 0 ? 'bugün son gün' : days === 1 ? 'yarın son gün' : `${days} gün kaldı`;
}

/**
 * Yönetici asistanı. Öneriyi açık kurallar bulur (takvim, kitaptaki yıl dönümleri, ziyaretçi davranışı, site
 * deneyimi); her önerinin gerekçesi ve dayandığı sayılar yazılır. Yapay zekâ yalnızca "taslak" istendiğinde ve
 * yalnızca kitaptaki bilgiyle yazar; taslağı yönetici düzenler ve uygular, rota ve duyuru yayında olmadan oluşur.
 */
export function AssistantPage({ params }: { params: URLSearchParams }) {
  const [tab, setTab] = useState<'open' | 'closed'>(params.get('durum') === 'kapanan' ? 'closed' : 'open');
  const [filter, setFilter] = useState<AgentKind | 'all'>((params.get('tur') as AgentKind) || 'all');
  const data = useLoad(() => api.agent(tab), [tab]);
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const d = data.data;
  async function scan() {
    setBusy(true);
    try { const r = await api.agentScan(); notify(`${r.found} öneri bulundu, ${r.new} yeni.`); data.reload(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  const closed = d ? Object.entries(d.counts).filter(([k]) => k !== 'open').reduce((n, [, v]) => n + v, 0) : 0;
  const byKind = useMemo(() => {
    const m: Partial<Record<AgentKind, number>> = {};
    for (const s of d?.items ?? []) m[s.kind] = (m[s.kind] ?? 0) + 1;
    return m;
  }, [d]);
  const items = (d?.items ?? []).filter(s => filter === 'all' || s.kind === filter);
  const urgent = (d?.items ?? []).filter(s => s.priority >= 70).length;
  const pick = (k: AgentKind | 'all') => { setFilter(k); replaceQuery('/asistan', { durum: tab === 'closed' ? 'kapanan' : null, tur: k === 'all' ? null : k }); };
  const mode = !d ? '' : d.fake ? 'Deneme modu: taslaklar kayıttaki bilgiden şablonla yazılır' : d.model ? `Taslak modeli: ${d.model}` : '';

  return <div className="as">
    <header className="as-hero">
      <div className="as-hero-text">
        <p className="as-kicker"><Sparkles size={14} aria-hidden="true" /> Yönetici asistanı</p>
        <h1>Bugün ne yapalım?</h1>
        <p>Takvimi, kitaptaki yıl dönümlerini ve ziyaretçi verisini her gün tarar; ne yapılabileceğini gerekçesiyle önerir.
          İstersen duyuru, rota ya da eser özeti yazar. Yazdığı her şey yalnızca kitaptaki bilgiye dayanır ve sen onaylamadan sitede hiçbir şey değişmez.</p>
        <div className="as-hero-actions">
          <button className="button gold small" disabled={busy || !d?.enabled} onClick={scan}><RefreshCw size={15} className={busy ? 'spin' : ''} /> {busy ? 'Taranıyor…' : 'Şimdi tara'}</button>
          {d?.enabled && <span><Clock size={13} aria-hidden="true" /> Son tarama {d.last_scan ? formatDate(d.last_scan) : 'henüz yok'}</span>}
        </div>
      </div>
      <dl className="as-hero-stats">
        <div><dt>Açık öneri</dt><dd>{d?.counts.open ?? '—'}</dd></div>
        <div><dt>Öncelikli</dt><dd>{tab === 'open' ? urgent : '—'}</dd></div>
        <div><dt>Tamamlanan</dt><dd>{d?.counts.done ?? 0}</dd></div>
        {mode && <p className="as-mode"><Wand2 size={13} aria-hidden="true" /> {mode}</p>}
      </dl>
    </header>

    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Asistan tabloları yok: önce <code>python migrate.py --apply</code> (göç 016).</p>}

    <div className="as-toolbar">
      <div className="segmented" role="tablist" aria-label="Durum">
        <button role="tab" aria-selected={tab === 'open'} onClick={() => { setTab('open'); pick('all'); replaceQuery('/asistan', {}); }}>Açık{d && tab === 'open' ? ` · ${d.counts.open ?? 0}` : ''}</button>
        <button role="tab" aria-selected={tab === 'closed'} onClick={() => { setTab('closed'); setFilter('all'); replaceQuery('/asistan', { durum: 'kapanan' }); }}>Kapananlar{d ? ` · ${closed}` : ''}</button>
      </div>
      {tab === 'open' && <div className="as-filters" role="group" aria-label="Türe göre süz">
        <button aria-pressed={filter === 'all'} onClick={() => pick('all')}>Tümü <b>{d?.items.length ?? 0}</b></button>
        {GROUPS.filter(g => byKind[g.kind]).map(g => <button key={g.kind} aria-pressed={filter === g.kind} className={`k-${g.kind}`} onClick={() => pick(g.kind)}>
          {g.icon}{g.title} <b>{byKind[g.kind]}</b></button>)}
      </div>}
    </div>

    {!d && !data.error && <div className="ov-skeleton as-skeleton" role="status" aria-label="Öneriler yükleniyor">{Array.from({ length: 3 }, (_, i) => <span key={i} />)}</div>}
    {d?.enabled && !items.length && <div className="as-empty"><Sparkles size={22} aria-hidden="true" />
      <p>{tab === 'open' ? 'Şu an açık öneri yok. Yaklaşan bir tarih ya da veride bir değişiklik olunca burada görünür.' : 'Kapanan öneri yok.'}</p></div>}
    {filter !== 'all' && tab === 'open' && <p className="admin-help as-note">{GROUPS.find(g => g.kind === filter)?.note}</p>}
    <ul className="as-list">{items.map(s => <li key={s.id}><SuggestionCard s={s} onChange={data.reload} /></li>)}</ul>
  </div>;
}

function resultLink(ref: string) {
  const [kind, id] = ref.split(':');
  if (kind === 'route') return <Link className="text-link" to="/rotalar">Keşif rotalarında aç</Link>;
  if (kind === 'announcement') return <Link className="text-link" to="/gundem">Gündemde aç</Link>;
  return <Link className="text-link" to={`/eser/${encodeURIComponent(id)}`}>Eseri aç</Link>;
}

function SuggestionCard({ s, onChange }: { s: AgentSuggestion; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [studio, setStudio] = useState<DraftKind | null>(s.draft && s.status === 'open' ? s.draft.kind : null);
  async function status(next: 'open' | 'done' | 'dismissed') {
    setBusy(true);
    try { await api.agentStatus(s.id, next); notify(next === 'dismissed' ? 'Öneri gizlendi; bir daha gösterilmez.' : next === 'done' ? 'Öneri yapıldı olarak işaretlendi.' : 'Öneri yeniden açıldı.'); onChange(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  const [lvl, lvlName] = level(s.priority);
  const due = dueText(s);
  const unchecked = s.evidence?.checked === false;
  return <article className={`as-card k-${s.kind} ${studio ? 'open' : ''}`}>
    <div className="as-card-main">
      <p className="as-meta">
        <span className={`as-kind k-${s.kind}`}>{GROUPS.find(g => g.kind === s.kind)?.icon}{KIND_NAME[s.kind]}</span>
        {s.status === 'open' && <span className={`as-level ${lvl}`}>{lvlName}</span>}
        {due && <span className="as-due"><Clock size={12} aria-hidden="true" />{due}</span>}
        {unchecked && <span className="agent-flag">Tarih doğrulanmadı</span>}
        {s.demo && <span className="agent-flag muted" title="Hesaba sunum için üretilmiş deneme ziyaretleri de girdi">Deneme verisi dahil</span>}
        {s.status !== 'open' && <span className="agent-flag muted">{STATUS[s.status]}{s.resolved_by ? ` · ${s.resolved_by}` : ''}</span>}
      </p>
      <h3>{s.title}</h3>
      <p className="as-detail">{s.detail}</p>
      {s.action && <p className="as-action"><ArrowUpRight size={15} aria-hidden="true" /><span><b>Önerilen adım:</b> {s.action}</span></p>}
      {s.monuments.length > 0 && <p className="agent-monuments">{s.monuments.map((slug, i) => <Link key={slug} className="chip" to={`/eser/${encodeURIComponent(slug)}`}>{s.monument_names[i] ?? slug}</Link>)}</p>}
      {s.result_ref && <p className="admin-help">Sonuç: {resultLink(s.result_ref)}</p>}
    </div>
    {s.status === 'open' ? <div className="as-card-actions">
      {s.drafts.map(k => { const [label, Icon, hint] = DRAFTS[k]; return <button key={k} className={`button small ${studio === k ? 'dark' : 'ai'}`} disabled={busy} title={hint}
        onClick={() => setStudio(studio === k ? null : k)} aria-expanded={studio === k}><Icon size={15} /> {label}</button>; })}
      <span className="as-spacer" />
      <button className="button line small" disabled={busy} onClick={() => status('done')}><Check size={15} /> Yapıldı</button>
      <button className="text-link" disabled={busy} onClick={() => status('dismissed')}><EyeOff size={14} /> Gizle</button>
    </div> : <div className="as-card-actions"><button className="text-link" disabled={busy} onClick={() => status('open')}><RotateCcw size={14} /> Yeniden aç</button></div>}
    {studio && s.status === 'open' && <DraftStudio key={studio} s={s} kind={studio} initial={s.draft?.kind === studio ? s.draft : null}
      onClose={() => setStudio(null)} onApplied={onChange} />}
  </article>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
type Variant = { angle: string; title: string; body: string; monuments: string[] };
function variantsOf(d: AgentDraft | null): Variant[] {
  const raw = d?.draft.variants;
  if (Array.isArray(raw) && raw.length && typeof raw[0] === 'object') return (raw as Record<string, unknown>[]).map(v => ({ angle: str(v.angle), title: str(v.title), body: str(v.body), monuments: list(v.monuments) }));
  return [];
}

function Counter({ n, max }: { n: number; max: number }) {
  return <span className={`as-count ${n > max ? 'over' : n > max * 0.85 ? 'near' : ''}`}>{n}/{max}</span>;
}

/** Taslak stüdyosu: ton ve not ile yazdırır, seçenekler arasında geçer, düzenler, sitede nasıl görüneceğini gösterir. */
function DraftStudio({ s, kind, initial, onClose, onApplied }: { s: AgentSuggestion; kind: DraftKind; initial: AgentDraft | null; onClose: () => void; onApplied: () => void }) {
  const notify = useToast();
  const [draft, setDraft] = useState<AgentDraft | null>(initial);
  const [tone, setTone] = useState<DraftTone>(initial?.tone ?? 'auto');
  const [note, setNote] = useState('');
  const [writing, setWriting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [variant, setVariant] = useState(0);
  const blank = { title: '', kicker: '', description: '', body: '', summary: '', starts_on: '', ends_on: s.due_on ?? '' };
  const [f, setF] = useState(() => fill(initial));
  const [picked, setPicked] = useState<string[]>(() => picks(initial));
  function fill(d: AgentDraft | null, v = 0) {
    if (!d) return blank;
    const x = d.draft, vs = variantsOf(d);
    const chosen = vs[v];
    return { ...blank, title: chosen?.title ?? str(x.title), kicker: str(x.kicker), description: str(x.description), body: chosen?.body ?? str(x.body),
      summary: kind === 'summary' ? (list(x.variants)[v] ?? str(x.summary)) : str(x.summary) };
  }
  function picks(d: AgentDraft | null, v = 0) {
    if (!d) return [];
    const vs = variantsOf(d);
    return vs[v]?.monuments.length ? vs[v].monuments : list(d.draft.stops).length ? list(d.draft.stops) : list(d.draft.monuments);
  }
  async function write() {
    setWriting(true);
    try {
      const d = await api.agentDraft(s.id, kind, tone, note);
      setDraft(d); setVariant(0); setF(fill(d)); setPicked(picks(d));
    } catch (e) { notify((e as Error).message, true); }
    finally { setWriting(false); }
  }
  // Düğmeye basınca ilk taslak hemen yazılır (otomatik ton); ton ve notla yeniden yazdırılabilir
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const started = useRef(false);
  useEffect(() => { if (!initial && !started.current) { started.current = true; write(); } }, []);
  function choose(i: number) { if (!draft) return; setVariant(i); setF(fill(draft, i)); setPicked(picks(draft, i)); }
  const name = (slug: string) => s.monument_names[s.monuments.indexOf(slug)] ?? slug;
  const toggle = (slug: string) => setPicked(p => p.includes(slug) ? p.filter(x => x !== slug) : [...p, slug]);
  async function apply() {
    if (!draft) return;
    const payload = kind === 'route' ? { title: f.title, kicker: f.kicker, description: f.description, stops: picked }
      : kind === 'announcement' ? { title: f.title, body: f.body, monuments: picked, starts_on: f.starts_on || null, ends_on: f.ends_on || null }
      : { slug: str(draft.draft.slug), summary: f.summary };
    setApplying(true);
    try {
      await api.agentApply(s.id, kind, payload);
      notify(kind === 'route' ? 'Rota yayında olmayan taslak olarak oluştu; Keşif rotalarından yayına alabilirsin.'
        : kind === 'announcement' ? 'Duyuru taslağı oluştu; Gündem sayfasından yayına alabilirsin.' : 'Özet eser kartına yazıldı.');
      onApplied();
    } catch (e) { notify((e as Error).message, true); }
    finally { setApplying(false); }
  }
  async function copy() {
    const text = kind === 'summary' ? f.summary : kind === 'route' ? `${f.title}\n\n${f.description}` : `${f.title}\n\n${f.body}`;
    try { await navigator.clipboard.writeText(text); notify('Metin panoya kopyalandı.'); } catch { notify('Kopyalanamadı.', true); }
  }
  const vs = draft ? (kind === 'summary' ? list(draft.draft.variants).map((t, i) => ({ angle: `Seçenek ${i + 1}`, title: t })) : variantsOf(draft)) : [];
  const [label, Icon, hint] = DRAFTS[kind];
  const ready = kind === 'summary' ? f.summary.trim().length >= 10 : f.title.trim().length >= 3 && picked.length > 0 && (kind === 'route' || f.body.trim().length >= 10);
  const applyLabel = kind === 'route' ? 'Rotayı taslak olarak oluştur' : kind === 'announcement' ? 'Duyuru taslağı oluştur' : 'Özeti esere yaz';

  return <section className="as-studio" aria-label={`${label}: taslak stüdyosu`}>
    <header className="as-studio-head">
      <h4><Icon size={16} aria-hidden="true" /> {label}<small>{hint}</small></h4>
      <button className="icon-button" onClick={onClose} aria-label="Stüdyoyu kapat"><X size={18} /></button>
    </header>
    <div className="as-controls">
      <div className="as-tones" role="radiogroup" aria-label="Ton">
        {TONES.map(([k, l]) => <button key={k} role="radio" aria-checked={tone === k} onClick={() => setTone(k)}>{l}</button>)}
      </div>
      <label className="as-note-input"><span className="sr-only">Asistana not</span>
        <input value={note} maxLength={300} onChange={e => setNote(e.target.value)} placeholder="Asistana not (isteğe bağlı): ör. çinilere vurgu yap, aileleri davet et"
          onKeyDown={e => { if (e.key === 'Enter' && !writing) write(); }} /></label>
      <button className="button ai small" disabled={writing} onClick={write}>
        <Sparkles size={15} className={writing ? 'pulse' : ''} /> {writing ? 'Yazıyor…' : draft ? 'Yeniden yaz' : 'Yazdır'}</button>
    </div>

    {!draft && !writing && <p className="as-studio-empty">Tonu seç, istersen bir not ekle ve <b>Yazdır</b>’a bas. Asistan yalnızca bu önerideki eserlerin kitaptaki bilgisini kullanır.</p>}
    {writing && !draft && <div className="as-writing" role="status"><span /><span /><span /> Asistan kitaptaki bilgiyi okuyup yazıyor…</div>}

    {draft && <div className={`as-studio-body ${writing ? 'dim' : ''}`}>
      <p className="as-source"><span>{draft.ai ? <><Sparkles size={13} aria-hidden="true" /> Yapay zekâ taslağı{draft.model ? ` · ${draft.model}` : ''}</> : <><FileText size={13} aria-hidden="true" /> Kayıttaki bilgiden şablon (yapay zekâ kullanılmadı)</>}</span>
        <span>Düzenleyip uygula; uygulamadan sitede bir şey değişmez.</span></p>
      {draft.warnings.length > 0 && <ul className="as-warnings">{draft.warnings.map(w => <li key={w}><AlertTriangle size={14} aria-hidden="true" />{w}</li>)}</ul>}
      {vs.length > 1 && <div className="as-variants" role="tablist" aria-label="Seçenekler">
        {vs.map((v, i) => <button key={i} role="tab" aria-selected={variant === i} onClick={() => choose(i)}>
          <small>{v.angle || `Seçenek ${i + 1}`}</small><span>{v.title}</span></button>)}</div>}

      <div className="as-edit">
        <div className="as-form">
          {kind !== 'summary' && <label className="admin-field"><span>{kind === 'route' ? 'Rota adı' : 'Başlık'} <Counter n={f.title.length} max={kind === 'route' ? 60 : 70} /></span>
            <input maxLength={kind === 'route' ? 120 : 90} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>}
          {kind === 'route' && <label className="admin-field"><span>Kısa etiket <Counter n={f.kicker.length} max={30} /></span>
            <input maxLength={40} value={f.kicker} onChange={e => setF({ ...f, kicker: e.target.value })} /></label>}
          {kind === 'route' && <label className="admin-field"><span>Açıklama <Counter n={f.description.length} max={600} /></span>
            <textarea rows={5} maxLength={1000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>}
          {kind === 'announcement' && <label className="admin-field"><span>Metin <Counter n={f.body.length} max={400} /></span>
            <textarea rows={5} maxLength={600} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></label>}
          {kind === 'announcement' && <div className="as-dates">
            <label className="admin-field"><span>Başlangıç</span><input type="date" value={f.starts_on} onChange={e => setF({ ...f, starts_on: e.target.value })} /><small>Boşsa bugün.</small></label>
            <label className="admin-field"><span>Bitiş</span><input type="date" value={f.ends_on} onChange={e => setF({ ...f, ends_on: e.target.value })} /></label></div>}
          {kind === 'summary' && <label className="admin-field"><span>Özet · {name(str(draft.draft.slug))} <Counter n={f.summary.length} max={280} /></span>
            <textarea rows={4} maxLength={280} value={f.summary} onChange={e => setF({ ...f, summary: e.target.value })} /></label>}
          {kind !== 'summary' && <fieldset className="agent-picks"><legend>{kind === 'route' ? 'Duraklar (seçim sırasıyla)' : 'Öne çıkan eserler'}</legend>
            {s.monuments.map(slug => <label key={slug} className={picked.includes(slug) ? 'on' : ''}><input type="checkbox" checked={picked.includes(slug)} onChange={() => toggle(slug)} />
              {name(slug)}{picked.includes(slug) && kind === 'route' ? <small> · {picked.indexOf(slug) + 1}. durak</small> : null}</label>)}
          </fieldset>}
        </div>
        <Preview kind={kind} f={f} names={picked.map(name)} monument={name(str(draft.draft.slug))} />
      </div>

      <div className="as-studio-actions">
        <button className="button dark small" disabled={applying || !ready} onClick={apply}><Check size={15} /> {applyLabel}</button>
        <button className="button line small" onClick={copy}><ClipboardCopy size={15} /> Kopyala</button>
        <button className="text-link" onClick={onClose}>Kapat</button>
      </div>
    </div>}
  </section>;
}

/** Ziyaretçinin göreceği hâl: sitedeki "Gündem" bandı, rota kartı ya da eser kartı (frontend/src/vakif/Agenda.tsx). */
function Preview({ kind, f, names, monument }: { kind: DraftKind; f: { title: string; kicker: string; description: string; body: string; summary: string }; names: string[]; monument: string }) {
  return <aside className="as-preview" aria-label="Sitede nasıl görünür">
    <p className="as-preview-label">Sitede böyle görünecek</p>
    {kind === 'announcement' && <div className="pv-agenda">
      <p className="pv-eyebrow">GÜNDEM</p><h5>{f.title || 'Başlık'}</h5><p>{f.body || 'Duyuru metni'}</p>
      {names.length > 0 && <ul>{names.map(n => <li key={n}>{n}<ArrowUpRight size={13} aria-hidden="true" /></li>)}</ul>}
    </div>}
    {kind === 'route' && <div className="pv-route">
      <p className="pv-eyebrow">{f.kicker || 'ROTA'}</p><h5>{f.title || 'Rota adı'}</h5><p>{f.description}</p>
      <ol>{names.map(n => <li key={n}>{n}</li>)}</ol>
    </div>}
    {kind === 'summary' && <div className="pv-card"><span className="pv-photo" aria-hidden="true" /><div><h5>{monument}</h5><p>{f.summary || 'Kısa özet'}</p></div></div>}
  </aside>;
}
