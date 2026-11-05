import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { AdminImage, Hunt } from '../lib/types';
import { Field, Issues, PageHead, Status, useLoad, useToast } from '../components/UI';
import { MonumentPicker } from '../components/MonumentPicker';

type Draft = { day: string; monument: string; monumentName: string; image: number | null; question: string; options: string[]; answer: number | null; hints: string[]; explanation: string; rights: boolean };
const EMPTY: Draft = { day: '', monument: '', monumentName: '', image: null, question: '', options: ['', '', '', ''], answer: null, hints: ['', ''], explanation: '', rights: false };
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

/**
 * Detay Avı: her gün editörün seçtiği tek yakın çekim görseli ve tek soru. Görevleri yönetici yazar (yapay zekâ yok).
 * Bir tarihe tek görev düşer, gün Türkiye saatiyle hesaplanır. Görselin kullanım hakkı teyit edilmeden yayına alınamaz.
 */
export function HuntsPage() {
  const data = useLoad(() => api.hunts(), []);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const d = data.data;
  return <>
    <PageHead kicker="MOBİL" title="Detay Avı" actions={d?.enabled && editing !== 'new' ? <button className="button dark small" onClick={() => setEditing('new')}><Plus size={15} /> Yeni görev</button> : undefined}>
      Telefondaki günlük görev. Yayında görev olmayan gün uygulama “henüz hazır değil” der ve başka bir keşfe yönlendirir; hedef 30 günlük takvim.</PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Görev tablosu yok: önce <code>python migrate.py --apply</code> (göç 018).</p>}
    {editing === 'new' && <HuntForm onDone={() => { setEditing(null); data.reload(); }} onCancel={() => setEditing(null)} />}
    {d?.enabled && !d.hunts.length && editing !== 'new' && <p className="admin-help">Henüz görev yok. “Yeni görev” ile ekleyin.</p>}
    <ul className="quiz-list">{d?.hunts.map(h => <li key={h.id}>
      {editing === h.id ? <HuntForm hunt={h} onDone={() => { setEditing(null); data.reload(); }} onCancel={() => setEditing(null)} />
        : <HuntCard h={h} onEdit={() => setEditing(h.id)} onChange={data.reload} />}
    </li>)}</ul>
  </>;
}

function HuntCard({ h, onEdit, onChange }: { h: Hunt; onEdit: () => void; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  async function run(job: () => Promise<unknown>, message: string) {
    setBusy(true);
    try { await job(); notify(message); onChange(); } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  }
  return <article className="quiz-card">
    <header><small>{h.day} · {h.monument_name}{h.review_status !== 'published' ? ' · eser yayında değil' : ''}{h.rights_confirmed ? '' : ' · kullanım hakkı teyit edilmedi'}</small><Status value={h.published ? 'published' : 'draft'} /></header>
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <img src={`/media/thumbs/${h.image_file}`} alt="" width={96} height={96} style={{ objectFit: 'cover' }} />
      <div><h3>{h.question}</h3>
        <ol className="quiz-options">{h.options.map((o, i) => <li key={i} className={i === h.answer ? 'right' : ''}><b>{LETTERS[i]}</b> {o}{i === h.answer && <span className="sr-only"> (doğru cevap)</span>}</li>)}</ol>
      </div>
    </div>
    {!!h.hints.length && <p className="admin-help">İpuçları: {h.hints.join(' · ')}</p>}
    <p className="admin-help">{h.explanation}</p>
    <div className="admin-actions">
      <button type="button" className="button line small" disabled={busy} onClick={onEdit}><Pencil size={14} /> Düzenle</button>
      <button type="button" className="button line small" disabled={busy} onClick={() => run(() => api.updateHunt(h.id, { published: !h.published }), h.published ? 'Görev yayından kaldırıldı' : 'Görev yayında')}>{h.published ? <><EyeOff size={14} /> Yayından kaldır</> : <><Eye size={14} /> Yayına al</>}</button>
      <button type="button" className="text-link danger" disabled={busy} onClick={() => { if (confirm('Bu görev silinsin mi?')) run(() => api.deleteHunt(h.id), 'Görev silindi'); }}><Trash2 size={14} /> Sil</button>
    </div>
  </article>;
}

function HuntForm({ hunt, onDone, onCancel }: { hunt?: Hunt; onDone: () => void; onCancel: () => void }) {
  const notify = useToast();
  const [f, setF] = useState<Draft>(() => hunt ? { day: hunt.day, monument: hunt.monument, monumentName: hunt.monument_name, image: hunt.image, question: hunt.question, options: [...hunt.options], answer: hunt.answer,
    hints: [...hunt.hints, '', ''].slice(0, Math.max(hunt.hints.length, 2)), explanation: hunt.explanation, rights: hunt.rights_confirmed } : EMPTY);
  const [images, setImages] = useState<AdminImage[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!f.monument) return;
    let live = true;
    api.images({ monument: f.monument, status: 'published', page_size: 60 }).then(p => { if (live) setImages(p.items); }, () => { if (live) setImages([]); });
    return () => { live = false; };
  }, [f.monument]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const list = [!f.day && 'Tarihi seçin.', !f.monument && 'Eseri seçin.', f.image === null && 'Görseli seçin.', f.answer === null && 'Doğru cevabı işaretleyin.'].filter(Boolean) as string[];
    setIssues(list);
    if (list.length) return;
    const body = { day: f.day, monument: f.monument, image: f.image!, question: f.question.trim(), options: f.options.map(o => o.trim()), answer: f.answer!, hints: f.hints.map(h => h.trim()).filter(Boolean), explanation: f.explanation.trim(), rights_confirmed: f.rights };
    setBusy(true);
    try {
      if (hunt) await api.updateHunt(hunt.id, body); else await api.createHunt(body);
      notify(hunt ? 'Görev kaydedildi' : 'Görev eklendi. Uygulamada görünmesi için yayına alın.'); onDone();
    } catch (e) { setIssues([(e as Error).message]); }
    finally { setBusy(false); }
  }
  const setOption = (i: number, value: string) => setF(x => ({ ...x, options: x.options.map((o, k) => k === i ? value : o) }));
  const setHint = (i: number, value: string) => setF(x => ({ ...x, hints: x.hints.map((o, k) => k === i ? value : o) }));
  return <form className="admin-form quiz-form" onSubmit={submit} noValidate><Issues list={issues} />
    <fieldset><legend>{hunt ? 'Görevi düzenle' : 'Yeni görev'}</legend><div className="admin-grid">
      <Field label="Tarih" hint="Türkiye saatiyle bu gün yayınlanır. Bir tarihe tek görev."><input type="date" value={f.day} onChange={e => setF({ ...f, day: e.target.value })} /></Field>
      <div className="admin-field wide"><MonumentPicker label={`Eser${f.monumentName ? `: ${f.monumentName}` : ''}`} initial={f.monumentName}
        onPick={m => setF(x => ({ ...x, monument: m.slug, monumentName: m.name_tr, image: null }))} /></div>
      {!!f.monument && <div className="admin-field wide" role="radiogroup" aria-label="Yakın çekim görseli"><span>Yakın çekim görseli (yalnızca yayındaki fotoğraflar)</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{images.map(i => <label key={i.id} style={{ outline: f.image === i.id ? '3px solid #1b6b53' : '1px solid #ccc', padding: 2, cursor: 'pointer' }}>
          <input type="radio" name="hunt-image" className="sr-only" checked={f.image === i.id} onChange={() => setF({ ...f, image: i.id })} aria-label={i.alt_tr || `Fotoğraf ${i.id}`} />
          <img src={`/media/thumbs/${i.file}`} alt="" width={96} height={96} style={{ objectFit: 'cover', display: 'block' }} /></label>)}
          {!images.length && <small>Bu eserin yayında fotoğrafı yok.</small>}</div></div>}
      <label className="admin-field wide"><span><input type="checkbox" checked={f.rights} onChange={e => setF({ ...f, rights: e.target.checked })} /> Bu görselin uygulamada gösterilme ve kart olarak paylaşılma hakkını teyit ettim.</span><small>Teyit olmadan yayına alınamaz.</small></label>
      <Field label="Soru" wide hint="En çok 240 karakter. Görselin ne olduğunu ele vermesin."><textarea rows={2} maxLength={240} value={f.question} onChange={e => setF({ ...f, question: e.target.value })} /></Field>
      <div className="admin-field wide" role="group" aria-labelledby="hunt-options-label"><span id="hunt-options-label">Seçenekler (4–6) — doğru olanı işaretleyin</span>
        {f.options.map((o, i) => <label key={i} className="quiz-option-input">
          <input type="radio" name="hunt-answer" checked={f.answer === i} onChange={() => setF({ ...f, answer: i })} aria-label={`${LETTERS[i]} doğru cevap`} />
          <b>{LETTERS[i]}</b><input maxLength={120} value={o} onChange={e => setOption(i, e.target.value)} aria-label={`${LETTERS[i]} seçeneği`} /></label>)}
        {f.options.length < 6 && <button type="button" className="text-link" onClick={() => setF(x => ({ ...x, options: [...x.options, ''] }))}><Plus size={14} /> Seçenek ekle</button>}
      </div>
      <div className="admin-field wide" role="group" aria-labelledby="hunt-hints-label"><span id="hunt-hints-label">İpuçları (isteğe bağlı) — her yanlış tahminden sonra sıradaki açılır</span>
        {f.hints.map((h, i) => <input key={i} maxLength={200} value={h} onChange={e => setHint(i, e.target.value)} aria-label={`${i + 1}. ipucu`} />)}
      </div>
      <Field label="Açıklama" wide hint="Oyun bitince gösterilir. Yalnızca eserin kaynağında yazanlara dayanın (en çok 400 karakter)."><textarea rows={3} maxLength={400} value={f.explanation} onChange={e => setF({ ...f, explanation: e.target.value })} /></Field>
    </div></fieldset>
    <div className="admin-actions"><button className="button dark" disabled={busy}><Save size={16} /> {busy ? 'Kaydediliyor…' : hunt ? 'Kaydet' : 'Görevi ekle'}</button>
      <button type="button" className="text-link" onClick={onCancel}><X size={14} /> Vazgeç</button></div>
  </form>;
}
