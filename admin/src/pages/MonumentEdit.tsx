import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Ban, Check, Eye, ImagePlus, RotateCcw, Save, Star, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { BASIS_LABELS, changedFields, fieldsFromForm, formatDate, formFromDetail, KIND_LABELS, methodLabel, monumentIssues, STATE_LABELS, type MonumentForm } from '../lib/format';
import { Link, navigate } from '../lib/navigation';
import type { AdminImage, MonumentDetail, NoteStatus, QualityNote } from '../lib/types';
import { Field, Issues, PageHead, Status, useLoad, useToast } from '../components/UI';
import { MonumentPicker } from '../components/MonumentPicker';

export function MonumentEdit({ slug }: { slug: string }) {
  const detail = useLoad(() => api.monument(slug), [slug]);
  const d = detail.data;
  if (detail.error) return <><p className="form-error" role="alert">{detail.error}</p><Link className="text-link" to="/eserler">Eser listesine dön</Link></>;
  if (!d) return <p role="status">Eser yükleniyor…</p>;
  return <>
    <PageHead kicker={`${d.city}${d.district ? ' / ' + d.district : ''} · ${KIND_LABELS[d.kind]}`} title={d.name_tr}
      actions={<><Status value={d.review_status} /><Link className="button line small" to={`/onizleme/${encodeURIComponent(d.slug)}`}><Eye size={15} /> Sitede nasıl görünür?</Link></>}>
      {d.from_panel ? `Panelden eklendi${d.created_by ? ` (${d.created_by})` : ''}.` : `Kaynak: ${d.book ?? '—'}.`} Slug: <code>{d.slug}</code>{d.updated_at && ` · Son değişiklik: ${formatDate(d.updated_at)}`}
      {d.qa_flags?.length ? ` · Kalite işaretleri: ${d.qa_flags.join(', ')}` : ''}
    </PageHead>
    <QualityNotes notes={d.notes} onChange={detail.reload} />
    <DetailsForm d={d} onSaved={detail.reload} />
    <TextSection d={d} onSaved={detail.reload} />
    <Gallery d={d} onChange={detail.reload} />
    {d.from_panel && <DangerZone slug={d.slug} />}
  </>;
}

const NOTE_KINDS: Record<string, string> = {
  likely_error: 'Bölümleme', contradiction: 'Çelişki', ocr: 'Metin (OCR) hatası', uncertain: 'Atılan çıkarım',
  translation: 'Çeviri', toc_mismatch: 'İçindekiler farkı',
};
const NOTE_STATUS: Record<NoteStatus, string> = { open: 'Bakılmadı', confirmed: 'Doğrulandı', resolved: 'Çözüldü', wontfix: 'Önemsiz' };

/** Çıkarım sırasında üretilen iç kalite notları. Ziyaretçi görmez; açık olanlar sohbet asistanına uyarı olarak gider. */
function QualityNotes({ notes, onChange }: { notes: QualityNote[]; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  if (!notes.length) return null;
  const open = notes.filter(n => n.status === 'open' || n.status === 'confirmed').length;
  async function set(n: QualityNote, status: NoteStatus) {
    setBusy(true);
    try { await api.updateNote(n.id, status); notify(`Not “${NOTE_STATUS[status]}” olarak işaretlendi`); onChange(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  // Notlardaki P5, P6 gibi paragraf işaretleri aşağıdaki numaralı kitap metnine bağlantı olur
  const linked = (text: string) => text.split(/(\bP\d+\b)/).map((part, i) => /^P\d+$/.test(part) ? <a key={i} className="text-link" href={`#${part}`} onClick={e => { e.preventDefault(); document.getElementById(part)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>{part}</a> : part);
  return <details className="admin-form quality-notes" open={open > 0} style={{ marginBottom: 22 }}>
    <summary><strong>Kalite uyarıları</strong> · {open ? `${open} açık` : 'hepsine bakıldı'} <span className="admin-help">(yalnızca yöneticiler görür)</span></summary>
    <p className="admin-help" style={{ margin: '10px 0' }}>Bu notlar kitap metinleri yapay zekâyla işlenirken otomatik üretildi; ziyaretçilere gösterilmez. Açık notlar sohbet asistanına “dikkat” uyarısı olarak gider. “Çözüldü” ya da “Önemsiz” işaretlenen not artık asistana gönderilmez.</p>
    <table className="admin-table"><thead><tr><th scope="col">Tür</th><th scope="col">Not</th><th scope="col">Durum</th><th scope="col"><span className="sr-only">İşlem</span></th></tr></thead>
      <tbody>{notes.map(n => <tr key={n.id} style={n.status === 'resolved' || n.status === 'wontfix' ? { opacity: .6 } : undefined}>
        <td style={{ whiteSpace: 'nowrap' }}>{NOTE_KINDS[n.kind] ?? n.kind}</td><td>{linked(n.note_tr)}</td><td>{NOTE_STATUS[n.status]}</td>
        <td><div className="admin-actions" style={{ gap: 6, padding: 0 }}>
          {n.status !== 'resolved' && <button className="button line small" disabled={busy} onClick={() => set(n, 'resolved')}>Çözüldü</button>}
          {n.status !== 'wontfix' && <button className="button line small" disabled={busy} onClick={() => set(n, 'wontfix')}>Önemsiz</button>}
          {(n.status === 'resolved' || n.status === 'wontfix') && <button className="button line small" disabled={busy} onClick={() => set(n, 'open')}>Yeniden aç</button>}
        </div></td></tr>)}</tbody></table>
  </details>;
}

function DetailsForm({ d, onSaved }: { d: MonumentDetail; onSaved: () => void }) {
  const [form, setForm] = useState<MonumentForm>(() => formFromDetail(d));
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  const periods = useLoad(() => api.periods(), []);
  useEffect(() => setForm(formFromDetail(d)), [d]);
  const diff = useMemo(() => changedFields(d, fieldsFromForm(form)), [d, form]);
  const dirty = Object.keys(diff).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const set = (key: keyof MonumentForm) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [key]: e.target.value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    const list = monumentIssues(fieldsFromForm(form));
    setIssues(list);
    if (list.length || !dirty) return;
    setBusy(true);
    try { await api.updateMonument(d.slug, diff); notify(`Kaydedildi: ${Object.keys(diff).join(', ')}`); onSaved(); }
    catch (e) { setIssues([(e as Error).message]); }
    finally { setBusy(false); }
  }
  return <form className="admin-form" onSubmit={submit} noValidate>
    <Issues list={issues} />
    <fieldset><legend>Ad ve tür</legend><div className="admin-grid">
      <Field label="Türkçe ad"><input required minLength={2} maxLength={200} value={form.name_tr} onChange={set('name_tr')} /></Field>
      <Field label="İngilizce ad" hint="Boşsa İngilizce arayüzde Türkçe ad gösterilir."><input maxLength={200} value={form.name_en} onChange={set('name_en')} /></Field>
      <Field label="Diğer adları" hint="Virgülle ayırın. Aramada da kullanılır."><input value={form.alt_names} onChange={set('alt_names')} /></Field>
      <Field label="Tür"><select value={form.kind} onChange={set('kind')}>{Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <div className="admin-field wide">
        <MonumentPicker label={`Bağlı olduğu üst eser (külliye vb.)${form.parent ? `: ${form.parent}` : ''}`} city={d.city} onPick={m => setForm(f => ({ ...f, parent: m.slug }))} />
        {form.parent && <button type="button" className="text-link danger" style={{ alignSelf: 'flex-start' }} onClick={() => setForm(f => ({ ...f, parent: '' }))}><X size={14} /> Üst eser bağlantısını kaldır</button>}
      </div>
    </div></fieldset>
    <fieldset><legend>Tarih</legend><div className="admin-grid three">
      <Field label="Yapım yılı (başlangıç)" hint="Miladi. Tek yıl ise yalnızca bunu girin."><input inputMode="numeric" value={form.built_from} onChange={set('built_from')} /></Field>
      <Field label="Yapım yılı (bitiş)"><input inputMode="numeric" value={form.built_to} onChange={set('built_to')} /></Field>
      <Field label="Tarihin dayanağı" hint="Kesin (kitâbe) ile tahmini (üslup) ayrımı sitede gösterilir."><select value={form.date_basis} onChange={set('date_basis')}><option value="">—</option>{Object.entries(BASIS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Dönem"><select value={form.period} onChange={set('period')}><option value="">—</option>
        {periods.data?.filter(p => !p.city || p.city === d.city).map(p => <option key={p.slug} value={p.slug}>{p.parent ? '— ' : ''}{p.name_tr} ({p.start}–{p.end})</option>)}</select></Field>
      <Field label="Bugünkü durumu"><select value={form.status} onChange={set('status')}><option value="">—</option>{Object.entries(STATE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
    </div></fieldset>
    <fieldset><legend>Konum</legend><div className="admin-grid">
      <Field label="İlçe"><input maxLength={100} value={form.district} onChange={set('district')} /></Field>
      <Field label="Mahalle"><input maxLength={100} value={form.neighborhood} onChange={set('neighborhood')} /></Field>
      <Field label="Adres" wide><input maxLength={300} value={form.address} onChange={set('address')} /></Field>
      <Field label="Enlem" hint="Örn. 40.1835 — harita ve “Yakınımdakiler” için."><input inputMode="decimal" value={form.lat} onChange={set('lat')} /></Field>
      <Field label="Boylam" hint="Örn. 29.0612"><input inputMode="decimal" value={form.lon} onChange={set('lon')} /></Field>
    </div></fieldset>
    <fieldset><legend>Tanıtım</legend><div className="admin-grid">
      <Field label="Kısa özet (Türkçe)" wide hint="Kartlarda görünür. Yalnızca kaynakta yazanları özetleyin."><textarea rows={4} maxLength={2000} value={form.summary_tr} onChange={set('summary_tr')} /></Field>
      <Field label="Kısa özet (İngilizce)" wide><textarea rows={3} maxLength={2000} value={form.summary_en} onChange={set('summary_en')} /></Field>
      <Field label="Günümüzdeki durumu" wide><textarea rows={2} maxLength={1000} value={form.current_state} onChange={set('current_state')} /></Field>
    </div></fieldset>
    <fieldset><legend>Kaynak ve yayın</legend><div className="admin-grid">
      <Field label="Kaynak notu" hint="Kitap dışı bilgi eklediyseniz kaynağını yazın (ör. VGM kayıtları, 2024)."><textarea rows={2} maxLength={500} value={form.source_note} onChange={set('source_note')} /></Field>
      <Field label="Yayın durumu" hint="Yalnızca “Yayında” olan eserler herkese açık sitede görünür."><select value={form.review_status} onChange={set('review_status')}><option value="draft">Taslak</option><option value="reviewed">Gözden geçirildi</option><option value="published">Yayında</option></select></Field>
    </div></fieldset>
    <div className="admin-actions"><button className="button dark" disabled={busy || !dirty}><Save size={16} />{busy ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}</button>
      {dirty ? <span className="admin-help">Kaydedilmemiş değişiklik: {Object.keys(diff).join(', ')}</span> : <span className="admin-help">Kaydedilmemiş değişiklik yok.</span>}
      {dirty && <button type="button" className="text-link" onClick={() => { setForm(formFromDetail(d)); setIssues([]); }}>Vazgeç</button>}</div>
  </form>;
}

function TextSection({ d, onSaved }: { d: MonumentDetail; onSaved: () => void }) {
  const [tr, setTr] = useState(d.text_tr ?? '');
  const [en, setEn] = useState(d.text_en ?? '');
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  if (!d.text_editable) return <section className="admin-form" style={{ marginTop: 26 }}><fieldset><legend>Kaynak metin</legend>
    <p className="admin-note">Bu metin envanter kitabından alınmıştır ve doğruluk kaynağıdır; panelden değiştirilemez.</p>
    {d.text_tr ? <details style={{ marginTop: 12 }} open={d.notes.some(n => n.kind === 'likely_error' && n.status === 'open')}>
      <summary>Kitap metnini göster ({d.text_tr.length.toLocaleString('tr-TR')} karakter)</summary>
      <ol className="text-preview numbered" style={{ marginTop: 10 }}>{d.text_tr.split(/\n\s*\n/).filter(p => p.trim()).map((p, i) =>
        <li key={i} id={`P${i + 1}`}><b>P{i + 1}</b>{p}</li>)}</ol>
    </details> : <p className="admin-help">Bu kaydın metni yok (türetilmiş üst kayıt).</p>}
  </fieldset></section>;
  async function save() {
    if (tr.trim().length < 20) { notify('Türkçe metin en az 20 karakter olmalı.', true); return; }
    setBusy(true);
    try {
      const r = await api.updateText(d.slug, { text_tr: tr, text_en: en || null });
      notify(r.embedded === r.chunks ? `Metin kaydedildi ve ${r.chunks} parça olarak dizinlendi.` : `Metin kaydedildi (${r.chunks} parça); yapay zekâ dizini daha sonra tamamlanacak.`);
      onSaved();
    } catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  return <section className="admin-form" style={{ marginTop: 26 }}><fieldset><legend>Eser metni</legend>
    <p className="admin-help">Paragrafları boş bir satırla ayırın. Kaydedince metin parçalanır ve sohbet asistanının kullanabilmesi için dizinlenir. Asistan yalnızca bu metne dayanarak cevap verir.</p>
    <div className="admin-grid" style={{ marginTop: 12 }}>
      <Field label="Türkçe metin" wide><textarea rows={12} value={tr} onChange={e => setTr(e.target.value)} maxLength={60000} /></Field>
      <Field label="İngilizce metin (isteğe bağlı)" wide><textarea rows={6} value={en} onChange={e => setEn(e.target.value)} maxLength={60000} /></Field>
    </div>
    <div className="admin-actions" style={{ marginTop: 12 }}><button type="button" className="button dark" disabled={busy || tr === (d.text_tr ?? '') && en === (d.text_en ?? '')} onClick={save}><Save size={16} />{busy ? 'Kaydediliyor…' : 'Metni kaydet ve dizinle'}</button></div>
  </fieldset></section>;
}

function Gallery({ d, onChange }: { d: MonumentDetail; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); notify(label); onChange(); } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  }
  const visible = d.images.filter(i => i.review_status !== 'rejected');
  const rejected = d.images.length - visible.length;
  const pending = visible.filter(i => i.review_status !== 'published');
  return <section id="fotograflar" style={{ marginTop: 34 }} aria-labelledby="gallery-title">
    <h2 id="gallery-title" style={{ fontSize: 26, marginBottom: 6 }}>Fotoğraflar</h2>
    {pending.length > 1 && <div className="admin-actions" style={{ marginBottom: 10 }}>
      <button className="button gold small" disabled={busy} onClick={() => run(`${pending.length} fotoğraf yayına alındı`, () => api.bulkImages(pending.map(i => i.id), 'published'))}><Check size={14} /> Bekleyen {pending.length} fotoğrafın tümünü onayla</button>
      <span className="admin-help">Önce küçük resimlere göz atın; bu esere ait olmayanları “At” ile ayırın.</span></div>}
    <p className="admin-help" style={{ marginBottom: 14 }}>{visible.filter(i => i.review_status === 'published').length} yayında · {visible.filter(i => i.review_status !== 'published').length} bekliyor{rejected ? ` · ${rejected} atıldı` : ''}. Kapak fotoğrafı listelerde ve eser sayfasının başında görünür. Alternatif metin, görme engelli ziyaretçilere fotoğrafı anlatır.</p>
    {visible.length ? <div className="image-grid">{visible.map(img => <GalleryCard key={img.id} img={img} busy={busy} run={run} />)}</div> : <div className="empty">Bu eserin fotoğrafı yok. Aşağıdan yükleyebilir ya da <Link className="text-link" to="/fotograflar?status=&unassigned=1">esere bağlı olmayan fotoğraflardan</Link> bağlayabilirsiniz.</div>}
    <Upload slug={d.slug} name={d.name_tr} onDone={onChange} />
  </section>;
}

function GalleryCard({ img, busy, run }: { img: AdminImage; busy: boolean; run: (label: string, action: () => Promise<unknown>) => void }) {
  const [alt, setAlt] = useState(img.alt_tr ?? '');
  const [caption, setCaption] = useState(img.caption_tr ?? '');
  const changed = alt !== (img.alt_tr ?? '') || caption !== (img.caption_tr ?? '');
  return <article className="image-card" aria-label={img.alt_tr ?? `Fotoğraf ${img.id}`}>
    <div className="thumb"><a href={`/media/${img.file}`} target="_blank" rel="noreferrer" aria-label="Fotoğrafı yeni sekmede büyük aç"><img src={`/media/thumbs/${img.file}`} alt={img.alt_tr ?? ''} loading="lazy" /></a>{img.is_cover && <span className="cover-flag">Kapak</span>}</div>
    <div className="meta">
      <span><Status value={img.review_status} /> {img.source === 'upload' ? '· panelden yüklendi' : `· s. ${img.printed_page ?? '—'}`}</span>
      {img.source === 'book' && <span>{methodLabel(img.match_method)}</span>}
      <Field label="Alternatif metin"><input value={alt} onChange={e => setAlt(e.target.value)} minLength={3} maxLength={300} /></Field>
      <Field label="Açıklama (isteğe bağlı)"><input value={caption} onChange={e => setCaption(e.target.value)} maxLength={500} /></Field>
    </div>
    <div className="card-actions">
      {changed && <button className="button dark small" disabled={busy || alt.trim().length < 3} onClick={() => run('Fotoğraf bilgisi kaydedildi', () => api.updateImage(img.id, { alt_tr: alt.trim(), caption_tr: caption.trim() || null }))}><Save size={14} /> Kaydet</button>}
      {img.review_status !== 'published' && <button className="button gold small" disabled={busy} onClick={() => run('Fotoğraf yayına alındı', () => api.updateImage(img.id, { review_status: 'published' }))}><Check size={14} /> Onayla</button>}
      {img.review_status === 'published' && !img.is_cover && <button className="button line small" disabled={busy} onClick={() => run('Kapak fotoğrafı değişti', () => api.updateImage(img.id, { is_cover: true }))}><Star size={14} /> Kapak yap</button>}
      {img.review_status === 'published' && <button className="button line small" disabled={busy} onClick={() => run('Fotoğraf taslağa alındı', () => api.updateImage(img.id, { review_status: 'draft' }))}><RotateCcw size={14} /> Taslağa al</button>}
      {img.source === 'upload'
        ? <button className="button danger small" disabled={busy} onClick={() => confirm('Bu fotoğraf kalıcı olarak silinsin mi?') && run('Fotoğraf silindi', () => api.deleteImage(img.id))}><Trash2 size={14} /> Sil</button>
        : <button className="button danger small" disabled={busy} onClick={() => run('Fotoğraf atıldı', () => api.updateImage(img.id, { review_status: 'rejected' }))}><Ban size={14} /> At</button>}
    </div>
  </article>;
}

function Upload({ slug, name, onDone }: { slug: string; name: string; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState('');
  const [caption, setCaption] = useState('');
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const notify = useToast();
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!file) { setError('Bir fotoğraf seçin.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) { setError('15 MB altında JPEG, PNG ya da WebP seçin.'); return; }
    if (alt.trim().length < 3) { setError('Alternatif metin zorunludur: fotoğrafta ne görünüyor?'); return; }
    setBusy(true);
    try {
      await api.uploadImage(slug, file, { alt_tr: alt.trim(), caption_tr: caption.trim() || undefined, review_status: publish ? 'published' : 'draft' });
      notify('Fotoğraf yüklendi'); setFile(null); setAlt(''); setCaption(''); setInputKey(k => k + 1); onDone();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <form className="admin-form" style={{ marginTop: 22 }} onSubmit={submit} noValidate><fieldset><legend>Fotoğraf yükle</legend>
    <div className="admin-grid">
      <Field label="Dosya" hint="JPEG, PNG ya da WebP · en çok 15 MB. Web için 1.600 piksele küçültülür."><input key={inputKey} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
      <Field label="Alternatif metin (zorunlu)" hint={`Ör. “${name}, kuzeydoğudan genel görünüm”`}><input value={alt} onChange={e => setAlt(e.target.value)} maxLength={300} /></Field>
      <Field label="Açıklama (isteğe bağlı)" hint="Fotoğrafçı, tarih ya da kaynak."><input value={caption} onChange={e => setCaption(e.target.value)} maxLength={500} /></Field>
      <label className="admin-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'end' }}><input type="checkbox" checked={publish} onChange={e => setPublish(e.target.checked)} /><span>Hemen yayına al</span></label>
    </div>
    {error && <p className="form-error" role="alert" style={{ marginTop: 10 }}>{error}</p>}
    <div className="admin-actions" style={{ marginTop: 12 }}><button className="button dark" disabled={busy}><ImagePlus size={16} />{busy ? 'Yükleniyor…' : 'Fotoğrafı yükle'}</button></div>
  </fieldset></form>;
}

function DangerZone({ slug }: { slug: string }) {
  const notify = useToast();
  return <section className="admin-form" style={{ marginTop: 34 }}><fieldset style={{ borderColor: '#d9b2a8' }}><legend>Eseri sil</legend>
    <p className="admin-help">Yalnızca panelden eklenen eserler silinebilir. Eser, metni, dizini ve panelden yüklenen fotoğrafları kalıcı olarak silinir. Yayından kaldırmak için durumunu “Taslak” yapmanız yeterlidir.</p>
    <div className="admin-actions" style={{ marginTop: 12 }}><button type="button" className="button danger" onClick={async () => {
      if (!confirm('Bu eser kalıcı olarak silinsin mi? Bu işlem geri alınamaz.')) return;
      try { await api.deleteMonument(slug); notify('Eser silindi'); navigate('/eserler'); } catch (e) { notify((e as Error).message, true); }
    }}><Trash2 size={16} /> Eseri kalıcı olarak sil</button></div>
  </fieldset></section>;
}
