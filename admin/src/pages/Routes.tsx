import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import type { AdminRoute, RouteStop } from '../lib/types';
import { Field, Issues, PageHead, Status, useLoad, useToast } from '../components/UI';
import { MonumentPicker } from '../components/MonumentPicker';

/**
 * Keşif rotaları: sitede ana sayfadaki "Keşif Sezonları" ve "Keşif Görevleri". Rotanın adını, kısa etiketini ve
 * açıklamasını yönetici yazar (yapay zekâ yok); duraklar sıralı eserlerdir. Yalnızca yayındaki rotalar ve yayındaki
 * eserler sitede görünür. Şehir başına rotalar otomatik kurulur, burada yalnızca gösterilir.
 */
export function RoutesPage() {
  const data = useLoad(() => api.routes(), []);
  const notify = useToast();
  const [title, setTitle] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 3) { setIssues(['Rota adı en az 3 karakter olmalı.']); return; }
    try { await api.createRoute({ title: title.trim() }); setTitle(''); setIssues([]); notify('Rota eklendi. Duraklarını seçip yayına alın.'); data.reload(); }
    catch (e) { setIssues([(e as Error).message]); }
  }
  const d = data.data;
  return <>
    <PageHead kicker="SİTE" title="Keşif rotaları">Sitede ana sayfadaki “Keşif Sezonları” ve “Keşif Görevleri” bu rotalardan oluşur. Önce buradan yazılan ve yayına alınan rotalar, ardından şehir başına otomatik rotalar gösterilir.</PageHead>
    {data.error && <p className="form-error" role="alert">{data.error}</p>}
    {d && !d.enabled && <p className="admin-note">Rota tabloları yok: önce <code>python migrate.py --apply</code> (göç 013). Şehir rotaları yine de sitede görünür.</p>}
    {d?.enabled && <form className="admin-form" onSubmit={create} noValidate><Issues list={issues} />
      <fieldset><legend>Yeni rota</legend><div className="admin-grid">
        <Field label="Rota adı" hint="Örn. “Bursa'da Erken Osmanlı”. Sitede sezon kartının başlığı olur."><input maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></Field>
      </div></fieldset>
      <div className="admin-actions"><button className="button dark"><Plus size={16} /> Rotayı ekle</button></div>
    </form>}
    {d?.routes.map(r => <RouteEditor key={`${r.id}-${r.updated_at}`} route={r} onChange={data.reload} />)}
    {d && <section className="admin-form"><fieldset><legend>Otomatik şehir rotaları (sitede yazılanlardan sonra)</legend>
      {d.auto.length ? <ul className="route-auto">{d.auto.map(a => <li key={a.id}><strong>{a.title}</strong> <small>{a.kicker}</small><p>{a.description}</p></li>)}</ul>
        : <p className="admin-help">Yayında pilot eser yok.</p>}
    </fieldset></section>}
  </>;
}

function RouteEditor({ route, onChange }: { route: AdminRoute; onChange: () => void }) {
  const notify = useToast();
  const [f, setF] = useState({ title: route.title, kicker: route.kicker ?? '', description: route.description ?? '' });
  const [stops, setStops] = useState<RouteStop[]>(route.stops);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStops(route.stops); }, [route.stops]);
  const dirty = f.title !== route.title || f.kicker !== (route.kicker ?? '') || f.description !== (route.description ?? '');
  const stopsDirty = stops.map(s => s.slug).join() !== route.stops.map(s => s.slug).join();
  async function run(job: () => Promise<unknown>, message: string) {
    setBusy(true);
    try { await job(); notify(message); onChange(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  const move = (i: number, step: number) => setStops(list => { const next = [...list]; [next[i], next[i + step]] = [next[i + step], next[i]]; return next; });
  const hidden = stops.filter(s => s.review_status !== 'published').length;
  return <section className="admin-form" aria-label={`Rota: ${route.title}`}>
    <fieldset><legend>{route.title} <Status value={route.published ? 'published' : 'draft'} /></legend>
      <div className="admin-grid">
        <Field label="Rota adı"><input maxLength={120} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
        <Field label="Kısa etiket" hint="Örn. TEMATİK ROTA, ŞEHİR KOLEKSİYONU. Boşsa “KEŞİF ROTASI”."><input maxLength={40} value={f.kicker} onChange={e => setF({ ...f, kicker: e.target.value })} /></Field>
        <Field label="Açıklama" wide hint="Kısa bir giriş. Yalnızca eserlerin kaynaklarında yazanlara dayanın."><textarea rows={2} maxLength={600} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
      </div>
      <div className="admin-actions">
        <button type="button" className="button dark small" disabled={busy || !dirty || f.title.trim().length < 3}
          onClick={() => run(() => api.updateRoute(route.id, { title: f.title.trim(), kicker: f.kicker.trim() || null, description: f.description.trim() || null }), 'Rota kaydedildi')}><Save size={15} /> Kaydet</button>
        <button type="button" className="button line small" disabled={busy}
          onClick={() => run(() => api.updateRoute(route.id, { published: !route.published }), route.published ? 'Rota yayından kaldırıldı' : 'Rota yayında')}>{route.published ? <><EyeOff size={15} /> Yayından kaldır</> : <><Eye size={15} /> Yayına al</>}</button>
        <button type="button" className="text-link danger" disabled={busy}
          onClick={() => { if (confirm(`“${route.title}” rotası silinsin mi? Eserlere dokunulmaz.`)) run(() => api.deleteRoute(route.id), 'Rota silindi'); }}><Trash2 size={14} /> Rotayı sil</button>
      </div>
      <h3 className="route-stops-title">Duraklar ({stops.length})</h3>
      {hidden > 0 && <p className="admin-help">{hidden} durak yayında olmadığı için sitede görünmez.</p>}
      <ol className="route-stops">{stops.map((s, i) => <li key={s.slug}>
        <span><strong>{s.name_tr}</strong> <small>{s.city}{s.pilot ? ' · pilot' : ''}{s.review_status !== 'published' ? ' · yayında değil' : ''}</small></span>
        <button type="button" className="icon-button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${s.name_tr}: yukarı taşı`}><ArrowUp size={15} /></button>
        <button type="button" className="icon-button" disabled={i === stops.length - 1} onClick={() => move(i, 1)} aria-label={`${s.name_tr}: aşağı taşı`}><ArrowDown size={15} /></button>
        <button type="button" className="icon-button" onClick={() => setStops(stops.filter(x => x.slug !== s.slug))} aria-label={`${s.name_tr}: rotadan çıkar`}><X size={15} /></button>
      </li>)}</ol>
      <MonumentPicker label="Durak ekle" onPick={m => setStops(list => list.some(x => x.slug === m.slug) ? list
        : [...list, { slug: m.slug, name_tr: m.name_tr, city: m.city, review_status: m.review_status, pilot: Boolean(m.pilot) }])} />
      <div className="admin-actions"><button type="button" className="button dark small" disabled={busy || !stopsDirty}
        onClick={() => run(() => api.setRouteStops(route.id, stops.map(s => s.slug)), 'Duraklar kaydedildi')}><Save size={15} /> Durakları kaydet</button>
        {stopsDirty && <button type="button" className="text-link" onClick={() => setStops(route.stops)}>Vazgeç</button>}</div>
    </fieldset>
  </section>;
}
