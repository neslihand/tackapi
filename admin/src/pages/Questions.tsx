import { useState } from 'react';
import { Check, RotateCcw, Search, Slash, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Link } from '../lib/navigation';
import type { QuestionRow, QuestionStatus } from '../lib/types';
import { Field, Issues, PageHead, Pager, useLoad, useToast } from '../components/UI';

const PAGE = 50;
const TABS: { id: 'open' | QuestionStatus; label: string }[] = [{ id: 'open', label: 'Bekleyen' }, { id: 'answered', label: 'Cevaplanan' }, { id: 'unresolved', label: 'Çözülemeyen' }, { id: 'rejected', label: 'Reddedilen' }];
const LABELS: Record<QuestionStatus, string> = { submitted: 'Yeni', researching: 'Araştırılıyor', answered: 'Cevaplandı', unresolved: 'Çözülemedi', rejected: 'Reddedildi' };

/**
 * Cevabı Bekleyen Sorular: Esere Sor kaynakta cevap bulamayınca ziyaretçinin takip etmeyi seçtiği sorular. Cevabı editör kaynağıyla
 * yazar, soran kişinin telefonunda Sorularım ekranına gelir. Herkese açık değildir ve sohbetin kaynağı olmaz. Aynı soruyu takip
 * eden herkes tek satırdır, tek cevap alır.
 */
export function QuestionsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('open');
  const [page, setPage] = useState(1);
  const data = useLoad(() => api.questions(tab, page), [tab, page]);
  const d = data.data;
  const count = (id: (typeof TABS)[number]['id']) => (d?.counts ?? []).filter(c => id === 'open' ? c.status === 'submitted' || c.status === 'researching' : c.status === id).reduce((sum, c) => sum + c.n, 0);
  return <>
    <PageHead kicker="MOBİL" title="Cevabı bekleyen sorular">Kaynakta cevabı bulunamayan ve ziyaretçinin takip etmeyi seçtiği sorular. Yalnızca kaynağa dayanan cevap yazın; bulunamazsa “çözülemedi” demek de bir cevaptır.</PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Soru tablosu yok: önce <code>python migrate.py --apply</code> (göç 022).</p>}
    {d?.enabled && <p className="admin-help" role="status">Bekleyen soru: <strong>{count('open')}</strong>{d.oldest_open_hours !== null && <> · en eskisi {d.oldest_open_hours < 1 ? 'bir saatten az süredir' : `${Math.round(d.oldest_open_hours)} saattir`} bekliyor</>}{d.median_hours !== null && <> · cevap süresinin ortancası {d.median_hours} saat</>}</p>}
    <div className="tabs" role="tablist" aria-label="Soru durumu">{TABS.map(x => <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => { setTab(x.id); setPage(1); }}>{x.label}{d?.enabled ? <small>{count(x.id)}</small> : null}</button>)}</div>
    {d?.enabled && !d.items.length && <p className="admin-help">Bu bölümde soru yok.</p>}
    <ul className="quiz-list">{d?.items.map(q => <li key={q.id}><Ticket key={`${q.id}-${q.status}`} q={q} onChange={data.reload} /></li>)}</ul>
    {d && <Pager page={page} pageSize={PAGE} total={d.total} onPage={setPage} />}
  </>;
}

function Ticket({ q, onChange }: { q: QuestionRow; onChange: () => void }) {
  const notify = useToast();
  const [answer, setAnswer] = useState(q.answer ?? '');
  const [source, setSource] = useState(q.answer_source ?? '');
  const [note, setNote] = useState(q.note ?? '');
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function set(status: QuestionStatus, message: string) {
    const list = status === 'answered' ? [answer.trim().length < 20 && 'Cevap en az 20 karakter olmalı.', source.trim().length < 5 && 'Cevabın kaynağını yazın (kitap ve sayfa).'].filter(Boolean) as string[]
      : status === 'rejected' && !note.trim() ? ['Reddetme gerekçesini yazın; soran kişi görür.'] : [];
    setIssues(list);
    if (list.length) return;
    setBusy(true);
    try {
      const done = await api.reviewQuestion(q.id, { status, answer: answer.trim() || null, answer_source: source.trim() || null, note: note.trim() || null });
      notify(`${message}${done.followers > 1 ? ` (${done.followers} kişi)` : ''}`); onChange();
    } catch (e) { setIssues([(e as Error).message]); }
    finally { setBusy(false); }
  }
  const closed = q.status === 'answered' || q.status === 'unresolved' || q.status === 'rejected';
  return <article className="quiz-card">
    <header><small><Link className="text-link" to={`/eser/${encodeURIComponent(q.monument)}`}>{q.monument_name}</Link> · {formatDate(q.created_at)} · {q.lang === 'en' ? 'İngilizce' : 'Türkçe'} · {q.followers} kişi takipte{q.reviewed_by ? ` · ${q.reviewed_by}` : ''}</small><span className="status draft">{LABELS[q.status]}</span></header>
    <h3>{q.question}</h3>
    <div className="admin-form flat"><Issues list={issues} /><div className="admin-grid">
      <Field label="Cevap" wide hint="Yalnızca kaynakta yazanlar. Tahmin ya da yorum yazmayın."><textarea rows={4} maxLength={2000} value={answer} onChange={e => setAnswer(e.target.value)} /></Field>
      <Field label="Kaynak" hint="Kitap ve sayfa, örn. Bursa Vakıf Eserleri I, s. 77."><input maxLength={300} value={source} onChange={e => setSource(e.target.value)} /></Field>
      <Field label="Gerekçe (çözülemedi ya da ret)" hint="Soran kişi görür."><input maxLength={300} value={note} onChange={e => setNote(e.target.value)} /></Field>
    </div></div>
    <div className="admin-actions">
      <button type="button" className="button dark small" disabled={busy} onClick={() => set('answered', 'Cevap gönderildi')}><Check size={14} /> {q.status === 'answered' ? 'Cevabı güncelle' : 'Cevapla'}</button>
      {q.status === 'submitted' && <button type="button" className="button line small" disabled={busy} onClick={() => set('researching', 'Araştırılıyor olarak işaretlendi')}><Search size={14} /> Araştırılıyor</button>}
      {q.status !== 'unresolved' && <button type="button" className="button line small" disabled={busy} onClick={() => set('unresolved', 'Çözülemedi olarak kapatıldı')}><Slash size={14} /> Çözülemedi</button>}
      {q.status !== 'rejected' && <button type="button" className="button line small" disabled={busy} onClick={() => set('rejected', 'Soru reddedildi')}><X size={14} /> Reddet</button>}
      {closed && <button type="button" className="text-link" disabled={busy} onClick={() => set('researching', 'Soru yeniden açıldı')}><RotateCcw size={14} /> Yeniden aç</button>}
    </div>
  </article>;
}
