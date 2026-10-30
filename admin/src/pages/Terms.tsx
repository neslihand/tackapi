import { useState, type FormEvent } from 'react';
import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { ARTICLE_ORIGIN_LABELS, TERM_CATEGORY_LABELS, formatDate, termIssues } from '../lib/format';
import { replaceQuery } from '../lib/navigation';
import type { ArticleStatus, Term, TermCategory, TermFields } from '../lib/types';
import { Field, Issues, Modal, PageHead, useLoad, useToast } from '../components/UI';
import { ArticleStatusBadge } from '../components/ArticleBody';

const TABS: [ArticleStatus | '', string][] = [['', 'Tümü'], ['pending', 'Onay bekleyen'], ['published', 'Yayında'], ['draft', 'Taslak'], ['rejected', 'Reddedilen']];

/**
 * Terimler sözlüğü: sitedeki "Terimler" sayfası ve makalelerdeki terim açıklamaları. Kitaptan ve editörden gelen
 * yayındaki terimler sohbet asistanına da gider; ziyaretçi önerileri onaylanınca yalnızca sözlükte görünür.
 * Kitaptan gelen terim silinmez, yayından kaldırılır.
 */
export function TermsPage({ params }: { params: URLSearchParams }) {
  const [status, setStatus] = useState<ArticleStatus | ''>((TABS.find(([s]) => s === params.get('durum'))?.[0]) ?? '');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Term | 'new' | null>(null);
  const data = useLoad(() => api.terms({ status: status || null, q: query }), [status, query]);
  const d = data.data;
  const count = (s: ArticleStatus | '') => s ? d?.counts.find(c => c.status === s)?.n ?? 0 : d?.counts.reduce((n, c) => n + c.n, 0) ?? 0;
  return <>
    <PageHead kicker="SİTE" title="Terimler sözlüğü" actions={<button className="button dark" onClick={() => setEditing('new')}><Plus size={16} /> Yeni terim</button>}>
      Mimari, süsleme ve vakıf terimleri. Sitede A’dan Z’ye sözlükte ve makalelerde altı noktalı açıklama olarak görünür. Yayındaki kitap ve editör terimleri
      sohbet asistanına da açıklama olarak gider; ziyaretçi önerileri gitmez.
    </PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Sözlük alanları yok: önce <code>python migrate.py --apply</code> (göç 017).</p>}
    <div className="tabs" role="tablist" aria-label="Yayın durumu">{TABS.map(([s, label]) => <button key={s || 'all'} role="tab" aria-selected={status === s}
      onClick={() => { setStatus(s); replaceQuery('/terimler', { durum: s }); }}>{label}{d ? <small>{count(s)}</small> : null}</button>)}</div>
    <form className="toolbar" role="search" onSubmit={(e: FormEvent) => { e.preventDefault(); setQuery(q.trim()); }}>
      <Field label="Ara"><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Terim, karşılık ya da tanım…" /></Field>
      <button className="button line small"><Search size={15} /> Ara</button>
    </form>
    {d?.enabled && !d.items.length && <div className="empty-panel"><p>{status === 'pending' ? 'Onay bekleyen terim önerisi yok.' : 'Bu listede terim yok.'}</p></div>}
    <ul className="term-list">{d?.items.map(t => <li key={t.id}><TermCard t={t} onEdit={() => setEditing(t)} onChange={data.reload} /></li>)}</ul>
    {editing && <TermEditor term={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); data.reload(); }} />}
  </>;
}

function TermCard({ t, onEdit, onChange }: { t: Term; onEdit: () => void; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  async function run(body: TermFields, message: string) {
    setBusy(true);
    try { await api.updateTerm(t.id, body); notify(message); onChange(); } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  }
  return <article className={`term-card ${t.status}`}>
    <header><h3>{t.term_tr}{t.term_en && t.term_en !== t.term_tr && <small> · {t.term_en}</small>}</h3>
      <span className="term-meta"><ArticleStatusBadge value={t.status} />{t.category && <span className="admin-badge">{TERM_CATEGORY_LABELS[t.category]}</span>}
        <span>{ARTICLE_ORIGIN_LABELS[t.origin]}{t.origin === 'visitor' ? ` · ${t.author || 'takma adsız ziyaretçi'}` : ''}</span></span></header>
    <p>{t.definition_tr}</p>
    {t.definition_child_tr && <p className="admin-help"><b>Çocuklar için:</b> {t.definition_child_tr}</p>}
    {t.definition_en && <p className="admin-help" lang="en"><b>EN:</b> {t.definition_en}</p>}
    {t.status === 'rejected' && t.reject_reason && <p className="admin-help">Red gerekçesi: {t.reject_reason}</p>}
    {rejecting ? <div className="contrib-reject"><Field label="Red gerekçesi (öneren görür)"><input autoFocus maxLength={400} value={reason} onChange={e => setReason(e.target.value)} /></Field>
      <div className="admin-actions"><button className="button dark small" disabled={busy || reason.trim().length < 3} onClick={() => run({ status: 'rejected', reject_reason: reason.trim() }, 'Öneri reddedildi.')}>Reddet</button>
        <button className="text-link" onClick={() => setRejecting(false)}>Vazgeç</button></div></div>
      : <div className="admin-actions">
        {t.status !== 'published' && <button className="button dark small" disabled={busy} onClick={() => run({ status: 'published' }, 'Terim sözlükte yayında.')}><Check size={15} /> {t.status === 'pending' ? 'Onayla ve yayımla' : 'Yayına al'}</button>}
        {t.status === 'published' && <button className="button line small" disabled={busy} onClick={() => run({ status: 'draft' }, 'Terim yayından kaldırıldı.')}>Yayından kaldır</button>}
        {t.origin === 'visitor' && t.status === 'pending' && <button className="button line small danger" disabled={busy} onClick={() => setRejecting(true)}><X size={15} /> Reddet</button>}
        <button className="text-link" onClick={onEdit}><Pencil size={14} /> Düzenle</button>
        {t.origin !== 'book' && <button className="text-link danger" disabled={busy} onClick={async () => {
          if (!confirm(`“${t.term_tr}” silinsin mi?`)) return;
          setBusy(true);
          try { await api.deleteTerm(t.id); notify('Terim silindi.'); onChange(); } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
        }}><Trash2 size={14} /> Sil</button>}
        <small className="admin-help">{t.reviewed_by ? `${t.reviewed_by}, ${formatDate(t.reviewed_at)}` : formatDate(t.created_at)}</small>
      </div>}
  </article>;
}

function TermEditor({ term, onClose, onSaved }: { term: Term | null; onClose: () => void; onSaved: () => void }) {
  const notify = useToast();
  const [f, setF] = useState({ term_tr: term?.term_tr ?? '', term_en: term && term.term_en !== term.term_tr ? term.term_en : '',
    definition_tr: term?.definition_tr ?? '', definition_child_tr: term?.definition_child_tr ?? '', definition_en: term?.definition_en ?? '',
    category: (term?.category ?? '') as TermCategory | '' });
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(prev => ({ ...prev, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    const list = termIssues(f);
    setIssues(list);
    if (list.length) return;
    const body: TermFields = { term_tr: f.term_tr.trim(), term_en: f.term_en.trim(), definition_tr: f.definition_tr.trim(),
      definition_child_tr: f.definition_child_tr.trim() || null, definition_en: f.definition_en.trim() || null, category: f.category || null };
    setBusy(true);
    try {
      if (term) await api.updateTerm(term.id, body);
      else await api.createTerm({ ...body, term_tr: body.term_tr!, definition_tr: body.definition_tr!, status: 'published' });
      notify(term ? 'Terim kaydedildi.' : 'Terim sözlüğe eklendi.'); onSaved();
    } catch (err) { setIssues([(err as Error).message]); setBusy(false); }
  }
  return <Modal title={term ? `Terimi düzenle: ${term.term_tr}` : 'Yeni terim'} onClose={onClose}>
    <form className="admin-form" onSubmit={submit} noValidate><Issues list={issues} />
      <div className="admin-grid">
        <Field label="Terim"><input autoFocus maxLength={80} value={f.term_tr} onChange={e => set('term_tr', e.target.value)} placeholder="Örn. Mukarnas" /></Field>
        <Field label="İngilizce karşılık" hint="Boşsa terimin kendisi."><input maxLength={120} value={f.term_en} onChange={e => set('term_en', e.target.value)} placeholder="muqarnas" /></Field>
        <Field label="Kategori"><select value={f.category} onChange={e => set('category', e.target.value)}><option value="">Kategorisiz</option>
          {Object.entries(TERM_CATEGORY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Tanım" wide hint={`Kavram açıklaması; tarihî bilgi değil. ${f.definition_tr.length}/1200`}><textarea rows={3} maxLength={1200} value={f.definition_tr} onChange={e => set('definition_tr', e.target.value)} /></Field>
        <Field label="Çocuklar için tanım" wide hint="İsteğe bağlı; sitede “Çocuklar için” seçilince görünür."><textarea rows={2} maxLength={600} value={f.definition_child_tr} onChange={e => set('definition_child_tr', e.target.value)} /></Field>
        <Field label="İngilizce tanım" wide hint="İsteğe bağlı; yoksa İngilizce sitede Türkçe tanım gösterilir."><textarea rows={2} maxLength={1200} lang="en" value={f.definition_en} onChange={e => set('definition_en', e.target.value)} /></Field>
      </div>
      <div className="admin-actions"><button className="button dark" disabled={busy}><Check size={16} /> {term ? 'Kaydet' : 'Sözlüğe ekle'}</button>
        <button type="button" className="text-link" onClick={onClose}>Vazgeç</button></div>
    </form>
  </Modal>;
}
