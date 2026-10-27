import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { quizIssues } from '../lib/format';
import type { QuizQuestion } from '../lib/types';
import { Field, Issues, PageHead, Status, useLoad, useToast } from '../components/UI';
import { MonumentPicker } from '../components/MonumentPicker';

type Draft = { monument: string; monumentName: string; question: string; options: string[]; answer: number | null; explanation: string };
const EMPTY: Draft = { monument: '', monumentName: '', question: '', options: ['', '', '', ''], answer: null, explanation: '' };
const LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Bilgi yarışması soruları: sitede "Tarihin İzinde" yarışmasında, eser künyesinden üretilen soruların yanında çıkar.
 * Her soru bir esere bağlıdır; yalnızca yayına alınan sorular ve yayındaki eserlerin soruları sitede görünür.
 * Soruyu ve açıklamayı yönetici yazar (yapay zekâ yok); açıklama eserin kaynağına dayanmalı.
 */
export function QuizPage() {
  const data = useLoad(() => api.quiz(), []);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const d = data.data;
  return <>
    <PageHead kicker="SİTE" title="Yarışma soruları" actions={d?.enabled && editing !== 'new' ? <button className="button dark small" onClick={() => setEditing('new')}><Plus size={15} /> Yeni soru</button> : undefined}>
      Sitedeki “Tarihin İzinde” yarışmasında, eser künyesinden kendiliğinden üretilen soruların yanında burada yazılan sorular da sorulur. Yalnızca yayına alınan sorular görünür.</PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Soru tablosu yok: önce <code>python migrate.py --apply</code> (göç 014).</p>}
    {editing === 'new' && <QuizForm onDone={() => { setEditing(null); data.reload(); }} onCancel={() => setEditing(null)} />}
    {d?.enabled && !d.questions.length && editing !== 'new' && <p className="admin-help">Henüz soru yok. “Yeni soru” ile ekleyin.</p>}
    <ul className="quiz-list">{d?.questions.map(q => <li key={q.id}>
      {editing === q.id ? <QuizForm question={q} onDone={() => { setEditing(null); data.reload(); }} onCancel={() => setEditing(null)} />
        : <QuizCard q={q} onEdit={() => setEditing(q.id)} onChange={data.reload} />}
    </li>)}</ul>
  </>;
}

function QuizCard({ q, onEdit, onChange }: { q: QuizQuestion; onEdit: () => void; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  async function run(job: () => Promise<unknown>, message: string) {
    setBusy(true);
    try { await job(); notify(message); onChange(); } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  }
  return <article className="quiz-card">
    <header><small>{q.monument_name} · {q.city}{q.review_status !== 'published' ? ' · eser yayında değil' : ''}</small><Status value={q.published ? 'published' : 'draft'} /></header>
    <h3>{q.question}</h3>
    <ol className="quiz-options">{q.options.map((o, i) => <li key={i} className={i === q.answer ? 'right' : ''}><b>{LETTERS[i]}</b> {o}{i === q.answer && <span className="sr-only"> (doğru cevap)</span>}</li>)}</ol>
    <p className="admin-help">{q.explanation}</p>
    <div className="admin-actions">
      <button type="button" className="button line small" disabled={busy} onClick={onEdit}><Pencil size={14} /> Düzenle</button>
      <button type="button" className="button line small" disabled={busy} onClick={() => run(() => api.updateQuiz(q.id, { published: !q.published }), q.published ? 'Soru yayından kaldırıldı' : 'Soru yayında')}>{q.published ? <><EyeOff size={14} /> Yayından kaldır</> : <><Eye size={14} /> Yayına al</>}</button>
      <button type="button" className="text-link danger" disabled={busy} onClick={() => { if (confirm('Bu soru silinsin mi?')) run(() => api.deleteQuiz(q.id), 'Soru silindi'); }}><Trash2 size={14} /> Sil</button>
    </div>
  </article>;
}

function QuizForm({ question, onDone, onCancel }: { question?: QuizQuestion; onDone: () => void; onCancel: () => void }) {
  const notify = useToast();
  const [f, setF] = useState<Draft>(() => question ? { monument: question.monument, monumentName: question.monument_name, question: question.question,
    options: [...question.options], answer: question.answer, explanation: question.explanation } : EMPTY);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const list = quizIssues(f);
    setIssues(list);
    if (list.length) return;
    const body = { monument: f.monument, question: f.question.trim(), options: f.options.map(o => o.trim()), answer: f.answer!, explanation: f.explanation.trim() };
    setBusy(true);
    try {
      if (question) await api.updateQuiz(question.id, body); else await api.createQuiz(body);
      notify(question ? 'Soru kaydedildi' : 'Soru eklendi. Sitede görünmesi için yayına alın.'); onDone();
    } catch (e) { setIssues([(e as Error).message]); }
    finally { setBusy(false); }
  }
  const setOption = (i: number, value: string) => setF(x => ({ ...x, options: x.options.map((o, k) => k === i ? value : o) }));
  return <form className="admin-form quiz-form" onSubmit={submit} noValidate><Issues list={issues} />
    <fieldset><legend>{question ? 'Soruyu düzenle' : 'Yeni soru'}</legend><div className="admin-grid">
      <div className="admin-field wide"><MonumentPicker label={`Bağlı olduğu eser${f.monumentName ? `: ${f.monumentName}` : ''}`} initial={f.monumentName}
        onPick={m => setF(x => ({ ...x, monument: m.slug, monumentName: m.name_tr }))} /></div>
      <Field label="Soru" wide hint="En çok 240 karakter."><textarea rows={2} maxLength={240} value={f.question} onChange={e => setF({ ...f, question: e.target.value })} /></Field>
      <div className="admin-field wide" role="group" aria-labelledby="quiz-options-label"><span id="quiz-options-label">Seçenekler — doğru olanı işaretleyin</span>
        {f.options.map((o, i) => <label key={i} className="quiz-option-input">
          <input type="radio" name="quiz-answer" checked={f.answer === i} onChange={() => setF({ ...f, answer: i })} aria-label={`${LETTERS[i]} doğru cevap`} />
          <b>{LETTERS[i]}</b><input maxLength={120} value={o} onChange={e => setOption(i, e.target.value)} aria-label={`${LETTERS[i]} seçeneği`} /></label>)}
      </div>
      <Field label="Açıklama" wide hint="Cevaptan sonra gösterilir. Yalnızca eserin kaynağında yazanlara dayanın (en çok 400 karakter)."><textarea rows={3} maxLength={400} value={f.explanation} onChange={e => setF({ ...f, explanation: e.target.value })} /></Field>
    </div></fieldset>
    <div className="admin-actions"><button className="button dark" disabled={busy}><Save size={16} /> {busy ? 'Kaydediliyor…' : question ? 'Kaydet' : 'Soruyu ekle'}</button>
      <button type="button" className="text-link" onClick={onCancel}><X size={14} /> Vazgeç</button></div>
  </form>;
}
