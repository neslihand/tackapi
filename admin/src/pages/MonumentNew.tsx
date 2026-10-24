import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { BASIS_LABELS, KIND_LABELS, monumentIssues, slugPreview, toNumber } from '../lib/format';
import { Link, navigate } from '../lib/navigation';
import type { DateBasis, Kind } from '../lib/types';
import { Field, Issues, PageHead, useLoad, useToast } from '../components/UI';

export function MonumentNew() {
  const cities = useLoad(() => api.cities(), []);
  const [f, setF] = useState({ city: '', name_tr: '', kind: 'mosque', district: '', neighborhood: '', built_from: '', built_to: '',
    date_basis: '', source_note: '', text_tr: '', text_en: '' });
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF(x => ({ ...x, [key]: e.target.value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    const fields = { name_tr: f.name_tr, built_from: toNumber(f.built_from), built_to: toNumber(f.built_to) };
    const list = [...(!f.city ? ['Şehir seçin.'] : []), ...monumentIssues(fields),
      ...(f.text_tr && f.text_tr.trim().length < 20 ? ['Metin en az 20 karakter olmalı (ya da boş bırakın).'] : []),
      ...(f.text_tr.trim() && !f.source_note.trim() ? ['Metin giriyorsanız kaynağını “Kaynak notu” alanına yazın.'] : [])];
    setIssues(list);
    if (list.length) return;
    setBusy(true);
    try {
      const r = await api.createMonument({
        city: f.city, name_tr: f.name_tr.trim(), kind: f.kind as Kind, district: f.district.trim() || null,
        neighborhood: f.neighborhood.trim() || null, built_from: fields.built_from, built_to: fields.built_to,
        date_basis: (f.date_basis || null) as DateBasis | null, source_note: f.source_note.trim() || null,
        ...(f.text_tr.trim() ? { text_tr: f.text_tr, text_en: f.text_en || undefined } : {}),
      });
      notify(`Eser taslak olarak eklendi${r.chunks ? ` (${r.chunks} metin parçası)` : ''}. Fotoğraf ekleyip yayına alabilirsiniz.`);
      navigate(`/eser/${encodeURIComponent(r.slug)}`);
    } catch (e) { setIssues([(e as Error).message]); }
    finally { setBusy(false); }
  }
  const city = cities.data?.find(c => c.slug === f.city);
  return <>
    <PageHead kicker="Yeni kayıt" title={<>Yeni <em>eser.</em></>}>Eklenen eser taslak olarak başlar ve yayına alınana kadar sitede görünmez. Yeni bir şehir gerekiyorsa önce <Link className="text-link" to="/sehirler">Şehirler</Link> sayfasından ekleyin.</PageHead>
    <form className="admin-form" onSubmit={submit} noValidate>
      <Issues list={issues} />
      <fieldset><legend>Temel bilgiler</legend><div className="admin-grid">
        <Field label="Şehir"><select value={f.city} onChange={set('city')} required><option value="">Seçin…</option>{cities.data?.map(c => <option key={c.slug} value={c.slug}>{c.name_tr}</option>)}</select></Field>
        <Field label="Tür"><select value={f.kind} onChange={set('kind')}>{Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Türkçe ad" hint={f.name_tr ? `Adres: ${slugPreview(city?.slug ?? 'sehir', f.district, f.name_tr)}` : undefined}><input required minLength={2} maxLength={200} value={f.name_tr} onChange={set('name_tr')} /></Field>
        <Field label="İlçe"><input maxLength={100} value={f.district} onChange={set('district')} /></Field>
        <Field label="Mahalle"><input maxLength={100} value={f.neighborhood} onChange={set('neighborhood')} /></Field>
      </div></fieldset>
      <fieldset><legend>Tarih</legend><div className="admin-grid three">
        <Field label="Yapım yılı (başlangıç)"><input inputMode="numeric" value={f.built_from} onChange={set('built_from')} /></Field>
        <Field label="Yapım yılı (bitiş)"><input inputMode="numeric" value={f.built_to} onChange={set('built_to')} /></Field>
        <Field label="Tarihin dayanağı"><select value={f.date_basis} onChange={set('date_basis')}><option value="">—</option>{Object.entries(BASIS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </div></fieldset>
      <fieldset><legend>Metin ve kaynak</legend>
        <p className="admin-help">Sohbet asistanı bu eser hakkında yalnızca buraya yazdığınız metne dayanarak cevap verir. Paragrafları boş bir satırla ayırın. Metni sonra da ekleyebilirsiniz.</p>
        <div className="admin-grid" style={{ marginTop: 12 }}>
          <Field label="Kaynak notu" wide hint="Metnin nereden alındığı (ör. “Vakıflar Genel Müdürlüğü, eser tescil kaydı, 2023”)."><input maxLength={500} value={f.source_note} onChange={set('source_note')} /></Field>
          <Field label="Türkçe metin" wide><textarea rows={10} maxLength={60000} value={f.text_tr} onChange={set('text_tr')} /></Field>
          <Field label="İngilizce metin (isteğe bağlı)" wide><textarea rows={5} maxLength={60000} value={f.text_en} onChange={set('text_en')} /></Field>
        </div>
      </fieldset>
      <div className="admin-actions"><button className="button dark" disabled={busy}><Plus size={16} />{busy ? 'Ekleniyor…' : 'Taslak olarak ekle'}</button></div>
    </form>
  </>;
}
