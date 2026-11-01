import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { WeeklyFields, WeeklyItem } from '../lib/types';
import { Field, Issues, PageHead, Status, useLoad, useToast } from '../components/UI';
import { MonumentPicker } from '../components/MonumentPicker';

type Draft = { week: string; monument: string; monumentName: string; hook: string; detail: string; source: string; route: string };
const EMPTY: Draft = { week: '', monument: '', monumentName: '', hook: '', detail: '', source: '', route: '' };
const range = (monday: string) => { const a = new Date(`${monday}T12:00:00`); const b = new Date(a.getTime() + 6 * 86400000); return `${a.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} – ${b.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`; };

/**
 * Haftanın Keşfi: telefonda Keşfet'te bir hafta görünen tek eser, tek detay ve isteğe bağlı bir rota. Takvimi editör yapar, yapay zekâ
 * yazmaz. Bir haftaya tek kayıt; hafta Türkiye saatiyle pazartesi başlar. Kaydı olmayan hafta uygulamada kart görünmez.
 */
export function WeeklyPage() {
  const data = useLoad(() => api.weekly(), []);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const d = data.data;
  const routes = d?.routes ?? [];
  return <>
    <PageHead kicker="MOBİL" title="Haftanın Keşfi" actions={d?.enabled && editing !== 'new' ? <button className="button dark small" onClick={() => setEditing('new')}><Plus size={15} /> Yeni hafta</button> : undefined}>
      Telefonda Keşfet’te bir hafta boyunca görünür. Hikâye eserin kendi sayfasındadır; burada merak uyandıran bir cümle ve eserde bakılacak bir detay yazılır.</PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Tablo yok: önce <code>python migrate.py --apply</code> (göç 021).</p>}
    {editing === 'new' && <WeeklyForm routes={routes} onDone={() => { setEditing(null); data.reload(); }} onCancel={() => setEditing(null)} />}
    {d?.enabled && !d.items.length && editing !== 'new' && <p className="admin-help">Henüz kayıt yok. “Yeni hafta” ile ekleyin.</p>}
    <ul className="quiz-list">{d?.items.map(w => <li key={w.id}>
      {editing === w.id ? <WeeklyForm item={w} routes={routes} onDone={() => { setEditing(null); data.reload(); }} onCancel={() => setEditing(null)} />
        : <WeeklyCard w={w} routes={routes} onEdit={() => setEditing(w.id)} onChange={data.reload} />}
    </li>)}</ul>
  </>;
}

function WeeklyCard({ w, routes, onEdit, onChange }: { w: WeeklyItem; routes: { id: string; title: string }[]; onEdit: () => void; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  async function run(job: () => Promise<unknown>, message: string) {
    setBusy(true);
    try { await job(); notify(message); onChange(); } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  }
  return <article className="quiz-card">
    <header><small>{range(w.week)} · {w.monument_name}{w.review_status !== 'published' ? ' · eser yayında değil' : ''}{!w.pilot ? ' · pilot seçkide değil' : ''}</small><Status value={w.published ? 'published' : 'draft'} /></header>
    <h3>{w.hook}</h3>
    <p className="admin-help">{w.detail}</p>
    <p className="admin-help">Kaynak: {w.source}{w.route ? ` · Rota: ${routes.find(r => r.id === w.route)?.title ?? w.route}` : ''}</p>
    <div className="admin-actions">
      <button type="button" className="button line small" disabled={busy} onClick={onEdit}><Pencil size={14} /> Düzenle</button>
      <button type="button" className="button line small" disabled={busy} onClick={() => run(() => api.updateWeekly(w.id, { published: !w.published }), w.published ? 'Yayından kaldırıldı' : 'Yayında')}>{w.published ? <><EyeOff size={14} /> Yayından kaldır</> : <><Eye size={14} /> Yayına al</>}</button>
      <button type="button" className="text-link danger" disabled={busy} onClick={() => { if (confirm('Bu haftanın kaydı silinsin mi?')) run(() => api.deleteWeekly(w.id), 'Silindi'); }}><Trash2 size={14} /> Sil</button>
    </div>
  </article>;
}

function WeeklyForm({ item, routes, onDone, onCancel }: { item?: WeeklyItem; routes: { id: string; title: string }[]; onDone: () => void; onCancel: () => void }) {
  const notify = useToast();
  const [f, setF] = useState<Draft>(() => item ? { week: item.week, monument: item.monument, monumentName: item.monument_name, hook: item.hook, detail: item.detail, source: item.source, route: item.route ?? '' } : EMPTY);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const list = [!f.week && 'Haftayı seçin.', !f.monument && 'Eseri seçin.', f.hook.trim().length < 10 && 'Merak cümlesi en az 10 karakter olmalı.', f.detail.trim().length < 20 && 'Detay en az 20 karakter olmalı.', f.source.trim().length < 5 && 'Kaynağı yazın.'].filter(Boolean) as string[];
    setIssues(list);
    if (list.length) return;
    const body: WeeklyFields = { week: f.week, monument: f.monument, hook: f.hook.trim(), detail: f.detail.trim(), source: f.source.trim(), route: f.route || null };
    setBusy(true);
    try {
      if (item) await api.updateWeekly(item.id, body); else await api.createWeekly(body);
      notify(item ? 'Kaydedildi' : 'Eklendi. Uygulamada görünmesi için yayına alın.'); onDone();
    } catch (e) { setIssues([(e as Error).message]); }
    finally { setBusy(false); }
  }
  return <form className="admin-form quiz-form" onSubmit={submit} noValidate><Issues list={issues} />
    <fieldset><legend>{item ? 'Haftayı düzenle' : 'Yeni hafta'}</legend><div className="admin-grid">
      <Field label="Hafta" hint="Haftanın herhangi bir günü; pazartesiye çekilir. Bir haftaya tek kayıt."><input type="date" value={f.week} onChange={e => setF({ ...f, week: e.target.value })} /></Field>
      <div className="admin-field wide"><MonumentPicker label={`Eser${f.monumentName ? `: ${f.monumentName}` : ''}`} initial={f.monumentName} onPick={m => setF(x => ({ ...x, monument: m.slug, monumentName: m.name_tr }))} /></div>
      <Field label="Merak cümlesi" wide hint="En çok 200 karakter. Eserin hikâyesine çeken tek cümle; kaynakta yazmayanı söylemeyin."><textarea rows={2} maxLength={200} value={f.hook} onChange={e => setF({ ...f, hook: e.target.value })} /></Field>
      <Field label="Bakılacak detay" wide hint="En çok 500 karakter. Eserde gözle bulunabilecek somut bir ayrıntı."><textarea rows={3} maxLength={500} value={f.detail} onChange={e => setF({ ...f, detail: e.target.value })} /></Field>
      <Field label="Kaynak" hint="Kitap ve sayfa."><input maxLength={300} value={f.source} onChange={e => setF({ ...f, source: e.target.value })} /></Field>
      <Field label="Rota (isteğe bağlı)"><select value={f.route} onChange={e => setF({ ...f, route: e.target.value })}><option value="">Rota yok</option>{routes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></Field>
    </div></fieldset>
    <div className="admin-actions"><button className="button dark" disabled={busy}><Save size={16} /> {busy ? 'Kaydediliyor…' : item ? 'Kaydet' : 'Ekle'}</button>
      <button type="button" className="text-link" onClick={onCancel}><X size={14} /> Vazgeç</button></div>
  </form>;
}
