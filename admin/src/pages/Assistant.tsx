import { useState } from 'react';
import { Check, EyeOff, FileText, Megaphone, RefreshCw, RotateCcw, Route, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Link, replaceQuery } from '../lib/navigation';
import type { AgentDraft, AgentKind, AgentSuggestion, DraftKind } from '../lib/types';
import { Field, PageHead, useLoad, useToast } from '../components/UI';

const GROUPS: [AgentKind, string, string][] = [
  ['calendar', 'Yaklaşan tarihler', 'Bayramlar, milli günler ve şehir günleri (Takvim sayfasından).'],
  ['anniversary', 'Yıl dönümleri', 'Kitaptaki tarihli olayların yuvarlak yıl dönümleri.'],
  ['experience', 'Ziyaretçi deneyimi', 'Hatalar, yavaş sayfalar, cevapsız sorular, sonuçsuz aramalar ve kamera.'],
  ['engagement', 'Süreklilik', 'Geri dönen ziyaretçiler, hemen ayrılanlar ve az ulaşılan profiller.'],
  ['content', 'İçerik', 'İlgi gören ama eksik ya da yarım bırakılan eserler.'],
];
const DRAFTS: Record<DraftKind, [string, typeof Route]> = { route: ['Rota taslağı', Route], announcement: ['Duyuru taslağı', Megaphone], summary: ['Özet taslağı', FileText] };
const STATUS: Record<AgentSuggestion['status'], string> = { open: 'Açık', done: 'Yapıldı', dismissed: 'Gizlendi', expired: 'Süresi geçti' };

/**
 * Yönetici asistanı. Öneriyi açık kurallar bulur (takvim, kitaptaki yıl dönümleri, ziyaretçi davranışı, site
 * deneyimi); her önerinin gerekçesi ve dayandığı sayılar yazılır. Yapay zekâ yalnızca "taslak" istendiğinde ve
 * yalnızca kitaptaki bilgiyle yazar; taslağı yönetici düzenler ve uygular, rota ve duyuru yayında olmadan oluşur.
 */
export function AssistantPage({ params }: { params: URLSearchParams }) {
  const [tab, setTab] = useState<'open' | 'closed'>(params.get('durum') === 'kapanan' ? 'closed' : 'open');
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
  return <>
    <PageHead kicker="YÖNETİCİ ASİSTANI" title="Asistan"
      actions={<button className="button line small" disabled={busy || !d?.enabled} onClick={scan}><RefreshCw size={15} /> Şimdi tara</button>}>
      Tarihleri ve ziyaretçi verisini her gün tarar, ne yapılabileceğini gerekçesiyle önerir. İstersen rota, duyuru ya da
      özet taslağı yazar; taslak yalnızca eserlerin kitaptaki bilgisine dayanır ve sen uygulamadan sitede hiçbir şey değişmez.
    </PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Asistan tabloları yok: önce <code>python migrate.py --apply</code> (göç 016).</p>}
    {d?.enabled && <p className="admin-help">Son tarama: {d.last_scan ? formatDate(d.last_scan) : 'henüz yok'} · tarama ücretsizdir (yapay zekâ kullanmaz)
      {d.fake ? ' · deneme modu: taslaklar şablondan' : d.model ? ` · taslak modeli: ${d.model}` : ''}</p>}
    <div className="tabs" role="tablist">
      <button role="tab" aria-selected={tab === 'open'} onClick={() => { setTab('open'); replaceQuery('/asistan', {}); }}>Açık öneriler{d ? ` (${d.counts.open ?? 0})` : ''}</button>
      <button role="tab" aria-selected={tab === 'closed'} onClick={() => { setTab('closed'); replaceQuery('/asistan', { durum: 'kapanan' }); }}>Kapananlar{d ? ` (${closed})` : ''}</button>
    </div>
    {d?.enabled && !d.items.length && <p className="admin-help">{tab === 'open' ? 'Şu an açık öneri yok. Yaklaşan bir tarih ya da veride bir değişiklik olunca burada görünür.' : 'Kapanan öneri yok.'}</p>}
    {tab === 'open' ? GROUPS.map(([kind, title, note]) => {
      const items = d?.items.filter(s => s.kind === kind) ?? [];
      return items.length ? <section key={kind} className="agent-group" aria-labelledby={`g-${kind}`}>
        <h2 id={`g-${kind}`}>{title} <small>{items.length}</small></h2><p className="admin-help">{note}</p>
        <ul className="agent-list">{items.map(s => <li key={s.id}><SuggestionCard s={s} onChange={data.reload} /></li>)}</ul>
      </section> : null;
    }) : <ul className="agent-list">{d?.items.map(s => <li key={s.id}><SuggestionCard s={s} onChange={data.reload} /></li>)}</ul>}
  </>;
}

function resultLink(ref: string) {
  const [kind, id] = ref.split(':');
  if (kind === 'route') return <Link className="text-link" to="/rotalar">Keşif rotalarında aç</Link>;
  if (kind === 'announcement') return <Link className="text-link" to="/gundem">Gündemde aç</Link>;
  return <Link className="text-link" to={`/eser/${encodeURIComponent(id)}`}>Eseri aç</Link>;
}

function SuggestionCard({ s, onChange }: { s: AgentSuggestion; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState<DraftKind | 'status' | null>(null);
  const [draft, setDraft] = useState<AgentDraft | null>(s.draft);
  async function status(next: 'open' | 'done' | 'dismissed') {
    setBusy('status');
    try { await api.agentStatus(s.id, next); notify(next === 'dismissed' ? 'Öneri gizlendi; bir daha gösterilmez.' : next === 'done' ? 'Öneri yapıldı olarak işaretlendi.' : 'Öneri yeniden açıldı.'); onChange(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(null); }
  }
  async function makeDraft(kind: DraftKind) {
    setBusy(kind);
    try { setDraft(await api.agentDraft(s.id, kind)); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(null); }
  }
  const unchecked = s.evidence?.checked === false;
  return <article className={`agent-card ${s.kind}`}>
    <p className="agent-meta">
      {s.due_on && <span>{s.kind === 'anniversary' ? `${s.due_on.slice(0, 4)} boyunca` : `son gün ${formatDate(s.due_on).split(' ').slice(0, 3).join(' ')}`}</span>}
      {unchecked && <span className="agent-flag">Tarih doğrulanmadı</span>}
      {s.demo && <span className="agent-flag muted" title="Hesaba sunum için üretilmiş deneme ziyaretleri de girdi">Deneme verisi dahil</span>}
      {s.status !== 'open' && <span className="agent-flag muted">{STATUS[s.status]}{s.resolved_by ? ` · ${s.resolved_by}` : ''}</span>}
    </p>
    <h3>{s.title}</h3>
    <p>{s.detail}</p>
    {s.action && <p className="agent-action">{s.action}</p>}
    {s.monuments.length > 0 && <p className="agent-monuments">{s.monuments.map((slug, i) => <Link key={slug} className="chip" to={`/eser/${encodeURIComponent(slug)}`}>{s.monument_names[i] ?? slug}</Link>)}</p>}
    {s.result_ref && <p className="admin-help">Sonuç: {resultLink(s.result_ref)}</p>}
    {s.status === 'open' ? <div className="admin-actions">
      {s.drafts.map(k => { const [label, Icon] = DRAFTS[k]; return <button key={k} className="button dark small" disabled={busy !== null} onClick={() => makeDraft(k)}>
        {busy === k ? <><Sparkles size={15} /> Yazılıyor…</> : <><Icon size={15} /> {label}</>}</button>; })}
      <button className="button line small" disabled={busy !== null} onClick={() => status('done')}><Check size={15} /> Yapıldı</button>
      <button className="text-link" disabled={busy !== null} onClick={() => status('dismissed')}><EyeOff size={14} /> Gizle</button>
    </div> : <div className="admin-actions"><button className="text-link" disabled={busy !== null} onClick={() => status('open')}><RotateCcw size={14} /> Yeniden aç</button></div>}
    {draft && s.status === 'open' && <DraftEditor key={`${draft.kind}-${JSON.stringify(draft.draft)}`} s={s} draft={draft} onClose={() => setDraft(null)} onApplied={onChange} />}
  </article>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function DraftEditor({ s, draft, onClose, onApplied }: { s: AgentSuggestion; draft: AgentDraft; onClose: () => void; onApplied: () => void }) {
  const notify = useToast();
  const d = draft.draft;
  const [f, setF] = useState({ title: str(d.title), kicker: str(d.kicker), description: str(d.description), body: str(d.body),
    summary: str(d.summary), starts_on: '', ends_on: s.due_on ?? '' });
  const [picked, setPicked] = useState<string[]>(list(d.stops).length ? list(d.stops) : list(d.monuments));
  const [busy, setBusy] = useState(false);
  const name = (slug: string) => s.monument_names[s.monuments.indexOf(slug)] ?? slug;
  const toggle = (slug: string) => setPicked(p => p.includes(slug) ? p.filter(x => x !== slug) : [...p, slug]);
  async function apply() {
    const payload = draft.kind === 'route' ? { title: f.title, kicker: f.kicker, description: f.description, stops: picked }
      : draft.kind === 'announcement' ? { title: f.title, body: f.body, monuments: picked, starts_on: f.starts_on || null, ends_on: f.ends_on || null }
      : { slug: str(d.slug), summary: f.summary };
    setBusy(true);
    try {
      await api.agentApply(s.id, draft.kind, payload);
      notify(draft.kind === 'route' ? 'Rota yayında olmayan taslak olarak oluştu; Keşif rotalarından yayına alabilirsin.'
        : draft.kind === 'announcement' ? 'Duyuru taslağı oluştu; Gündem sayfasından yayına alabilirsin.' : 'Özet eser kartına yazıldı.');
      onApplied();
    } catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  const label = draft.kind === 'route' ? 'Rotayı taslak olarak oluştur' : draft.kind === 'announcement' ? 'Duyuru taslağı oluştur' : 'Özeti esere yaz';
  return <div className="agent-draft">
    <p className="agent-meta"><span>{draft.ai ? <><Sparkles size={13} /> Yapay zekâ taslağı{draft.model ? ` (${draft.model})` : ''}</> : 'Şablon taslak (yapay zekâ kullanılmadı)'}</span>
      <span>Düzenleyip uygulayın; uygulamadan sitede bir şey değişmez.</span></p>
    {draft.warnings.length > 0 && <ul className="agent-warnings">{draft.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
    <div className="admin-grid">
      {draft.kind !== 'summary' && <Field label={draft.kind === 'route' ? 'Rota adı' : 'Başlık'}><input maxLength={draft.kind === 'route' ? 120 : 90} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>}
      {draft.kind === 'route' && <Field label="Kısa etiket"><input maxLength={40} value={f.kicker} onChange={e => setF({ ...f, kicker: e.target.value })} /></Field>}
      {draft.kind === 'route' && <Field label="Açıklama" wide><textarea rows={3} maxLength={1000} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>}
      {draft.kind === 'announcement' && <Field label={`Metin (${f.body.length}/600)`} wide><textarea rows={3} maxLength={600} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></Field>}
      {draft.kind === 'announcement' && <Field label="Başlangıç" hint="Boşsa bugün."><input type="date" value={f.starts_on} onChange={e => setF({ ...f, starts_on: e.target.value })} /></Field>}
      {draft.kind === 'announcement' && <Field label="Bitiş"><input type="date" value={f.ends_on} onChange={e => setF({ ...f, ends_on: e.target.value })} /></Field>}
      {draft.kind === 'summary' && <Field label={`Özet: ${name(str(d.slug))} (${f.summary.length}/280)`} wide><textarea rows={3} maxLength={280} value={f.summary} onChange={e => setF({ ...f, summary: e.target.value })} /></Field>}
    </div>
    {draft.kind !== 'summary' && <fieldset className="agent-picks"><legend>{draft.kind === 'route' ? 'Duraklar (seçim sırasıyla)' : 'Öne çıkan eserler'}</legend>
      {s.monuments.map(slug => <label key={slug} className={picked.includes(slug) ? 'on' : ''}><input type="checkbox" checked={picked.includes(slug)} onChange={() => toggle(slug)} />
        {name(slug)}{picked.includes(slug) && draft.kind === 'route' ? <small> · {picked.indexOf(slug) + 1}. durak</small> : null}</label>)}
    </fieldset>}
    <div className="admin-actions">
      <button className="button dark small" disabled={busy || (draft.kind === 'summary' ? f.summary.trim().length < 10 : f.title.trim().length < 3 || !picked.length)} onClick={apply}><Check size={15} /> {label}</button>
      <button className="text-link" onClick={onClose}>Kapat</button>
    </div>
  </div>;
}
