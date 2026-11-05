import { useState } from 'react';
import { Eye, EyeOff, Save, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { WorkDetail, WorkDetailKind } from '../lib/types';
import { Field, Status, useLoad, useToast } from './UI';

const KINDS: [WorkDetailKind, string, string][] = [['why', 'Neden yapıldı?', 'Sosyal işlevi ve insan hikâyesi.'], ['look', 'Neye dikkat etmelisin?', 'Eserde gözle bulunabilecek somut bir mimari ya da süsleme ayrıntısı.'], ['today', 'Bugün neden önemli?', 'Güncel değeri ve korunması.']];

/** Bir Eser, Üç Detay: telefonda eser sayfasında görünür. Yalnızca kaynağı yazılmış ve yayına alınmış detaylar gider; yapay zekâ yazmaz. */
export function WorkDetails({ slug }: { slug: string }) {
  const data = useLoad(() => api.workDetails(slug), [slug]);
  if (data.error) return <p className="form-error" role="alert">{data.error}</p>;
  if (!data.data?.enabled) return null;
  return <section className="admin-form" style={{ marginTop: 26 }}><fieldset><legend>Üç detay (telefonda eser sayfası)</legend>
    <p className="admin-help">Yalnızca kaynakta yazanlara dayanın. Kaynaksız ya da taslak detay ziyaretçiye gitmez; bir detay boşsa uygulamada o satır görünmez.</p>
    {KINDS.map(([kind, title, hint]) => <Detail key={`${kind}-${data.data!.details.find(d => d.kind === kind)?.updated_at ?? ''}`} slug={slug} kind={kind} title={title} hint={hint} saved={data.data!.details.find(d => d.kind === kind)} onChange={data.reload} />)}
  </fieldset></section>;
}

function Detail({ slug, kind, title, hint, saved, onChange }: { slug: string; kind: WorkDetailKind; title: string; hint: string; saved?: WorkDetail; onChange: () => void }) {
  const notify = useToast();
  const [body, setBody] = useState(saved?.body_tr ?? '');
  const [english, setEnglish] = useState(saved?.body_en ?? '');
  const [source, setSource] = useState(saved?.source ?? '');
  const [busy, setBusy] = useState(false);
  const dirty = body !== (saved?.body_tr ?? '') || english !== (saved?.body_en ?? '') || source !== (saved?.source ?? '');
  async function save(published: boolean, message: string) {
    setBusy(true);
    try { await api.saveWorkDetail(slug, kind, { body_tr: body.trim(), body_en: english.trim() || null, source: source.trim(), published }); notify(message); onChange(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(`“${title}” silinsin mi?`)) return;
    setBusy(true);
    try { await api.deleteWorkDetail(slug, kind); notify('Detay silindi'); onChange(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  return <div style={{ borderTop: '1px solid #ddd', paddingTop: 14, marginTop: 14 }}>
    <h3 className="route-stops-title">{title} {saved && <Status value={saved.published ? 'published' : 'draft'} />}</h3>
    <div className="admin-grid">
      <Field label="Metin" wide hint={`${hint} 20–500 karakter.`}><textarea rows={3} maxLength={500} value={body} onChange={e => setBody(e.target.value)} /></Field>
      <Field label="İngilizcesi (isteğe bağlı)" wide hint="Boşsa İngilizce arayüzde de Türkçesi görünür."><textarea rows={2} maxLength={500} value={english} onChange={e => setEnglish(e.target.value)} /></Field>
      <Field label="Kaynak" wide hint="Kitap ve sayfa, örn. Bursa Vakıf Eserleri I, s. 77."><input maxLength={300} value={source} onChange={e => setSource(e.target.value)} /></Field>
    </div>
    <div className="admin-actions">
      <button type="button" className="button dark small" disabled={busy || !dirty} onClick={() => save(saved?.published ?? false, 'Detay kaydedildi')}><Save size={15} /> Kaydet</button>
      <button type="button" className="button line small" disabled={busy || (!saved && !dirty)} onClick={() => save(!saved?.published, saved?.published ? 'Detay yayından kaldırıldı' : 'Detay yayında')}>{saved?.published ? <><EyeOff size={15} /> Yayından kaldır</> : <><Eye size={15} /> Yayına al</>}</button>
      {saved && <button type="button" className="text-link danger" disabled={busy} onClick={remove}><Trash2 size={14} /> Sil</button>}
    </div>
  </div>;
}
