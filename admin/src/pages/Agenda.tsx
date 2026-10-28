import { useState } from 'react';
import { Eye, EyeOff, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Announcement } from '../lib/types';
import { Field, Issues, PageHead, Status, useLoad, useToast } from '../components/UI';
import { MonumentPicker } from '../components/MonumentPicker';

/**
 * Gündem: sitenin ana sayfasındaki kısa duyurular. Asistanın taslakları da buraya yayında olmadan gelir. Yalnızca
 * yayındaki ve tarihi süren duyurular (en çok 3) sitede görünür; yayında olmayan eser duyuruda gösterilmez.
 */
export function AgendaPage() {
  const data = useLoad(() => api.announcements(), []);
  const notify = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  async function create() {
    const problems = [title.trim().length < 3 && 'Başlık en az 3 karakter olmalı.', body.trim().length < 10 && 'Metin en az 10 karakter olmalı.'].filter(Boolean) as string[];
    setIssues(problems);
    if (problems.length) return;
    try { await api.createAnnouncement({ title: title.trim(), body: body.trim() }); setTitle(''); setBody(''); notify('Duyuru taslağı eklendi.'); data.reload(); }
    catch (e) { setIssues([(e as Error).message]); }
  }
  const d = data.data;
  return <>
    <PageHead kicker="SİTE" title="Gündem">Ana sayfadaki kısa duyurular: bir bayram, yıl dönümü ya da yeni rota için. Yalnızca yayına aldığın ve tarih aralığı süren duyurular (en çok 3) sitede görünür.</PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Duyuru tablosu yok: önce <code>python migrate.py --apply</code> (göç 016).</p>}
    {d?.enabled && <div className="admin-form"><Issues list={issues} /><fieldset><legend>Yeni duyuru</legend><div className="admin-grid">
      <Field label="Başlık"><input maxLength={90} value={title} onChange={e => setTitle(e.target.value)} /></Field>
      <Field label="Metin" wide><textarea rows={2} maxLength={600} value={body} onChange={e => setBody(e.target.value)} /></Field>
    </div><div className="admin-actions"><button className="button dark small" onClick={create}><Plus size={15} /> Taslak olarak ekle</button></div></fieldset></div>}
    {d?.items.map(a => <AnnouncementEditor key={`${a.id}-${a.updated_at}`} a={a} onChange={data.reload} />)}
  </>;
}

function AnnouncementEditor({ a, onChange }: { a: Announcement; onChange: () => void }) {
  const notify = useToast();
  const [f, setF] = useState({ title: a.title, body: a.body, starts_on: a.starts_on ?? '', ends_on: a.ends_on ?? '' });
  const [mons, setMons] = useState(a.monuments.map((slug, i) => ({ slug, name: a.monument_names?.[i] ?? slug })));
  const [busy, setBusy] = useState(false);
  async function run(job: () => Promise<unknown>, message: string) {
    setBusy(true);
    try { await job(); notify(message); onChange(); } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  }
  const today = new Date().toISOString().slice(0, 10);
  const live = a.published && (!a.starts_on || a.starts_on <= today) && (!a.ends_on || a.ends_on >= today);
  return <section className="admin-form" aria-label={`Duyuru: ${a.title}`}><fieldset>
    <legend>{a.title} <Status value={a.published ? 'published' : 'draft'} />{a.ai_draft && <small className="agent-flag muted"><Sparkles size={12} /> asistan taslağı</small>}</legend>
    {a.published && !live && <p className="admin-help">Yayında ama tarih aralığı dışında: sitede görünmüyor.</p>}
    <div className="admin-grid">
      <Field label="Başlık"><input maxLength={90} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Tarih aralığı" hint="Boşsa hemen başlar, süresiz kalır."><span className="inline-pair">
        <input type="date" value={f.starts_on} onChange={e => setF({ ...f, starts_on: e.target.value })} aria-label="Başlangıç" />
        <input type="date" value={f.ends_on} onChange={e => setF({ ...f, ends_on: e.target.value })} aria-label="Bitiş" /></span></Field>
      <Field label={`Metin (${f.body.length}/600)`} wide><textarea rows={3} maxLength={600} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></Field>
    </div>
    <p className="agent-monuments">{mons.map(m => <span key={m.slug} className="chip">{m.name}<button type="button" onClick={() => setMons(mons.filter(x => x.slug !== m.slug))} aria-label={`${m.name}: çıkar`}><X size={12} /></button></span>)}</p>
    {mons.length < 6 && <MonumentPicker label="Öne çıkan eser ekle" onPick={m => setMons(list => list.some(x => x.slug === m.slug) ? list : [...list, { slug: m.slug, name: m.name_tr }])} />}
    <div className="admin-actions">
      <button className="button dark small" disabled={busy} onClick={() => run(() => api.updateAnnouncement(a.id, { title: f.title.trim(), body: f.body.trim(),
        starts_on: f.starts_on || null, ends_on: f.ends_on || null, monuments: mons.map(m => m.slug) }), 'Duyuru kaydedildi')}><Save size={15} /> Kaydet</button>
      <button className="button line small" disabled={busy} onClick={() => run(() => api.updateAnnouncement(a.id, { published: !a.published }), a.published ? 'Duyuru yayından kaldırıldı' : 'Duyuru yayında')}>
        {a.published ? <><EyeOff size={15} /> Yayından kaldır</> : <><Eye size={15} /> Yayına al</>}</button>
      <button className="text-link danger" disabled={busy} onClick={() => { if (confirm(`“${a.title}” duyurusu silinsin mi?`)) run(() => api.deleteAnnouncement(a.id), 'Duyuru silindi'); }}><Trash2 size={14} /> Sil</button>
    </div>
  </fieldset></section>;
}
