import { useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../lib/api';
import { slugPreview, toNumber } from '../lib/format';
import { Link } from '../lib/navigation';
import { Field, Issues, PageHead, useLoad, useToast } from '../components/UI';

export function Cities() {
  const cities = useLoad(() => api.cities(), []);
  const [f, setF] = useState({ name_tr: '', name_en: '', lat: '', lon: '' });
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  const slug = slugPreview(f.name_tr);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const lat = toNumber(f.lat), lon = toNumber(f.lon);
    const list = [
      ...(f.name_tr.trim().length < 2 || f.name_en.trim().length < 2 ? ['Türkçe ve İngilizce ad en az 2 karakter olmalı.'] : []),
      ...(!/^[a-z][a-z0-9-]{1,40}$/.test(slug) ? ['Addan geçerli bir adres (slug) üretilemedi.'] : []),
      ...(lat !== null && !(lat >= 35 && lat <= 43) || lon !== null && !(lon >= 25 && lon <= 45) ? ['Koordinatlar Türkiye sınırları içinde olmalı.'] : []),
    ];
    setIssues(list);
    if (list.length) return;
    setBusy(true);
    try {
      await api.createCity({ slug, name_tr: f.name_tr.trim(), name_en: f.name_en.trim(), lat, lon });
      notify(`${f.name_tr} eklendi. Artık bu şehre eser ekleyebilirsiniz.`); setF({ name_tr: '', name_en: '', lat: '', lon: '' }); cities.reload();
    } catch (e) { setIssues([(e as Error).message]); }
    finally { setBusy(false); }
  }
  return <>
    <PageHead kicker="Şehirler" title={<>Şehirler.</>}>Platform yeni şehirlerle büyüyebilir. Bir şehrin envanter kitabının tamamı arka uçtaki toplu ekleme aracıyla eklenir; tek tek eserler panelden eklenebilir.</PageHead>
    <div className="split">
      <div>{cities.data && <table className="admin-table"><caption className="sr-only">Şehirler</caption>
        <thead><tr><th scope="col">Şehir</th><th scope="col">Yayında eser</th><th scope="col">Merkez koordinatı</th><th scope="col" /></tr></thead>
        <tbody>{cities.data.map(c => <tr key={c.slug}><th scope="row">{c.name_tr}</th><td>{c.monuments}</td><td>{c.lat != null ? `${c.lat.toFixed(4)}, ${c.lon?.toFixed(4)}` : '—'}</td><td><Link className="text-link" to={`/eserler?city=${c.slug}`}>Eserler</Link></td></tr>)}</tbody>
      </table>}</div>
      <form className="admin-form" onSubmit={submit} noValidate><fieldset><legend>Yeni şehir</legend>
        <Issues list={issues} />
        <div className="admin-field" style={{ gap: 14 }}>
          <Field label="Türkçe ad" hint={slug ? `Adres: ${slug}` : undefined}><input value={f.name_tr} onChange={e => setF(x => ({ ...x, name_tr: e.target.value }))} maxLength={60} /></Field>
          <Field label="İngilizce ad"><input value={f.name_en} onChange={e => setF(x => ({ ...x, name_en: e.target.value }))} maxLength={60} /></Field>
          <Field label="Merkez enlemi (isteğe bağlı)"><input inputMode="decimal" value={f.lat} onChange={e => setF(x => ({ ...x, lat: e.target.value }))} /></Field>
          <Field label="Merkez boylamı (isteğe bağlı)"><input inputMode="decimal" value={f.lon} onChange={e => setF(x => ({ ...x, lon: e.target.value }))} /></Field>
        </div>
        <div className="admin-actions" style={{ marginTop: 14 }}><button className="button dark" disabled={busy}><Plus size={16} />Şehri ekle</button></div>
      </fieldset></form>
    </div>
  </>;
}
