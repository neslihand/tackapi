import { useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { KIND_LABELS } from '../lib/format';
import type { CalendarDay, CalendarFields, CalendarKind, Kind } from '../lib/types';
import { Field, Issues, PageHead, useLoad, useToast } from '../components/UI';

const KINDS: Record<CalendarKind, string> = { religious: 'Dinî gün', national: 'Milli gün', city: 'Şehir günü', other: 'Diğer' };
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const trDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

/**
 * Asistanın takvimi: yaklaşan günler (varsayılan 45 gün önceden) asistan sayfasında öneri olur. Her yıl aynı gün
 * tekrarlanan günler gün ve ayla, her yıl değişen dinî günler tek tarihle girilir. Hazır listedeki dinî günlerin
 * tarihi tahminidir ("doğrulanmadı"); Diyanet takviminden kontrol edip işaretleyin.
 */
export function CalendarPage() {
  const data = useLoad(() => api.calendar(), []);
  const cities = useLoad(() => api.cities(), []);
  const d = data.data;
  return <>
    <PageHead kicker="YÖNETİCİ ASİSTANI" title="Takvim">Bayramlar, milli günler ve şehirlerin önemli günleri. Yaklaşan bir gün{d?.horizon ? ` (${d.horizon} gün önceden)` : ''} asistan
      sayfasında öneri olur: ilgili eserler, rota ve duyuru taslağı. Tarihleri yapay zekâ üretmez; burada yazdığın tarih kullanılır.</PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Takvim tablosu yok: önce <code>python migrate.py --apply</code> (göç 016).</p>}
    {d?.enabled && <DayForm cities={cities.data ?? []} onSaved={data.reload} />}
    {d?.enabled && <table className="admin-table calendar-table">
      <thead><tr><th>Gün</th><th>Tarih</th><th>Sıradaki</th><th>Kapsam</th><th>Durum</th><th><span className="sr-only">Düzenle</span></th></tr></thead>
      <tbody>{d.days.map(day => <CalendarRow key={`${day.id}-${day.title}-${day.on_date}-${day.month}-${day.checked}-${day.active}`} day={day} cities={cities.data ?? []} onChange={data.reload} />)}</tbody>
    </table>}
  </>;
}

type City = { slug: string; name_tr: string };

function CalendarRow({ day, cities, onChange }: { day: CalendarDay; cities: City[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const when = day.on_date ? trDate(day.on_date) : `Her yıl ${day.day} ${MONTHS[(day.month ?? 1) - 1]}`;
  return <>
    <tr className={day.active ? '' : 'muted'}>
      <th scope="row">{day.title}<small>{KINDS[day.kind]}</small></th>
      <td>{when}{day.days > 1 ? ` · ${day.days} gün` : ''}</td>
      <td>{day.next ? <>{trDate(day.next)}<small>{day.in_days === 0 ? 'bugün' : day.in_days! < 0 ? 'sürüyor' : `${day.in_days} gün sonra`}</small></> : '—'}</td>
      <td>{day.city_name ?? 'Bütün şehirler'}{day.monument_kinds.length ? <small>{day.monument_kinds.map(k => KIND_LABELS[k as Kind] ?? k).join(', ')}</small> : null}</td>
      <td>{!day.active ? <span className="status rejected">Kapalı</span> : day.checked ? <span className="status published">Doğrulandı</span> : <span className="status draft" title={day.source ?? ''}>Doğrulanmadı</span>}</td>
      <td><button className="text-link" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Kapat' : 'Düzenle'}</button></td>
    </tr>
    {open && <tr><td colSpan={6}><DayForm day={day} cities={cities} onSaved={() => { setOpen(false); onChange(); }} /></td></tr>}
  </>;
}

function DayForm({ day, cities, onSaved }: { day?: CalendarDay; cities: City[]; onSaved: () => void }) {
  const notify = useToast();
  const [f, setF] = useState({ title: day?.title ?? '', kind: day?.kind ?? 'national' as CalendarKind, repeat: day ? !day.on_date : true,
    month: day?.month ?? 1, day: day?.day ?? 1, on_date: day?.on_date ?? '', days: day?.days ?? 1, city: day?.city ?? '',
    kinds: day?.monument_kinds ?? [], note: day?.note ?? '', source: day?.source ?? '', checked: day?.checked ?? true, active: day?.active ?? true });
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  async function save() {
    const problems = [];
    if (f.title.trim().length < 2) problems.push('Günün adını yazın.');
    if (!f.repeat && !f.on_date) problems.push('Tarihi seçin.');
    setIssues(problems);
    if (problems.length) return;
    const body: CalendarFields = { title: f.title.trim(), kind: f.kind, days: f.days, city: f.city || null, monument_kinds: f.kinds,
      note: f.note.trim() || null, source: f.source.trim() || null, checked: f.checked, active: f.active,
      ...(f.repeat ? { month: f.month, day: f.day } : { on_date: f.on_date }) };
    setBusy(true);
    try {
      if (day) await api.updateCalendar(day.id, body); else await api.createCalendar(body);
      notify(day ? 'Takvim günü kaydedildi.' : 'Takvim günü eklendi.');
      if (!day) setF({ ...f, title: '', note: '', source: '' });
      onSaved();
    } catch (e) { setIssues([(e as Error).message]); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!day || !confirm(`“${day.title}” takvimden silinsin mi?`)) return;
    try { await api.deleteCalendar(day.id); notify('Takvim günü silindi.'); onSaved(); } catch (e) { notify((e as Error).message, true); }
  }
  const toggleKind = (k: string) => setF({ ...f, kinds: f.kinds.includes(k) ? f.kinds.filter(x => x !== k) : [...f.kinds, k] });
  return <div className="admin-form"><Issues list={issues} />
    <fieldset><legend>{day ? day.title : 'Yeni gün'}</legend>
      <div className="admin-grid three">
        <Field label="Adı"><input maxLength={120} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Türü"><select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as CalendarKind })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Şehir" hint="Şehir günüyse yalnızca o şehrin eserleri önerilir."><select value={f.city} onChange={e => setF({ ...f, city: e.target.value })}>
          <option value="">Bütün şehirler</option>{cities.map(c => <option key={c.slug} value={c.slug}>{c.name_tr}</option>)}</select></Field>
        <Field label="Tekrar"><select value={f.repeat ? 'yearly' : 'once'} onChange={e => setF({ ...f, repeat: e.target.value === 'yearly' })}>
          <option value="yearly">Her yıl aynı gün</option><option value="once">Tek tarih (her yıl değişen günler)</option></select></Field>
        {f.repeat ? <Field label="Gün ve ay"><span className="inline-pair">
          <input type="number" min={1} max={31} value={f.day} onChange={e => setF({ ...f, day: Number(e.target.value) })} aria-label="Gün" />
          <select value={f.month} onChange={e => setF({ ...f, month: Number(e.target.value) })} aria-label="Ay">{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></span></Field>
          : <Field label="Tarih"><input type="date" value={f.on_date} onChange={e => setF({ ...f, on_date: e.target.value })} /></Field>}
        <Field label="Süre (gün)"><input type="number" min={1} max={15} value={f.days} onChange={e => setF({ ...f, days: Number(e.target.value) })} /></Field>
        <Field label="Not" wide hint="Asistan taslak yazarken dikkate alır (ör. “Anma günü: kutlama dili kullanılmaz”)."><input maxLength={300} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} /></Field>
        <Field label="Kaynak" hint="Tarihin nereden alındığı."><input maxLength={200} value={f.source} onChange={e => setF({ ...f, source: e.target.value })} /></Field>
      </div>
      <fieldset className="agent-picks"><legend>Öne çıkarılacak eser türleri (boşsa hepsi)</legend>
        {(['mosque', 'masjid', 'tomb', 'madrasa', 'imaret', 'complex', 'bath', 'han', 'fountain', 'tekke', 'zawiya'] as Kind[]).map(k =>
          <label key={k} className={f.kinds.includes(k) ? 'on' : ''}><input type="checkbox" checked={f.kinds.includes(k)} onChange={() => toggleKind(k)} />{KIND_LABELS[k]}</label>)}
      </fieldset>
      <div className="admin-actions">
        <label className="check"><input type="checkbox" checked={f.checked} onChange={e => setF({ ...f, checked: e.target.checked })} /> Tarih doğrulandı</label>
        <label className="check"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Etkin</label>
        <button className="button dark small" disabled={busy} onClick={save}>{day ? <><Save size={15} /> Kaydet</> : <><Plus size={15} /> Ekle</>}</button>
        {day && <button className="text-link danger" onClick={remove}><Trash2 size={14} /> Sil</button>}
      </div>
    </fieldset>
  </div>;
}
