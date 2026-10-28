import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRightLeft, Ban, Check, Eye, EyeOff, ImagePlus, Rocket, RotateCcw, Save, Scissors, Star, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
<<<<<<< HEAD
import { BASIS_LABELS, changedFields, DECISION_LABELS, decisionMessage, fieldsFromForm, formatDate, formFromDetail, geoStatus, KIND_LABELS, methodLabel, monumentIssues, RULE_LABELS, STATE_LABELS, toNumber, type MonumentForm } from '../lib/format';
=======
import { BASIS_LABELS, changedFields, DECISION_LABELS, decisionMessage, fieldsFromForm, formatDate, formFromDetail, KIND_LABELS, methodLabel, monumentIssues, RULE_LABELS, STATE_LABELS, type MonumentForm } from '../lib/format';
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
import { ParagraphActions, SplitForm, type Split } from '../components/ParagraphActions';
import { ParagraphText } from '../components/ParagraphText';
import { Link, navigate } from '../lib/navigation';
import type { AdminArtwork, AdminImage, Kind, MonumentDetail, ParaDecision } from '../lib/types';
import { artworkLabel } from '../public/model';
import { Field, Issues, PageHead, Status, useLoad, useToast } from '../components/UI';
import { MonumentPicker } from '../components/MonumentPicker';
import { PagePhotos } from '../components/PagePhotos';
<<<<<<< HEAD
import { LocationPicker } from '../components/LocationPicker';
=======
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d

export function MonumentEdit({ slug }: { slug: string }) {
  const detail = useLoad(() => api.monument(slug), [slug]);
  const d = detail.data;
  if (detail.error) return <><p className="form-error" role="alert">{detail.error}</p><Link className="text-link" to="/eserler">Eser listesine dön</Link></>;
  if (!d) return <p role="status">Eser yükleniyor…</p>;
  return <>
    <PageHead kicker={`${d.city}${d.district ? ' / ' + d.district : ''} · ${KIND_LABELS[d.kind]}`} title={d.name_tr}
      actions={<>{d.review_status !== 'removed' && <PilotToggle d={d} onChange={detail.reload} />}<Status value={d.review_status} /><PublishButton d={d} onChange={detail.reload} /><Link className="button line small" to={`/onizleme/${encodeURIComponent(d.slug)}`}><Eye size={15} /> Sitede nasıl görünür?</Link></>}>
      {d.from_panel ? `Panelden eklendi${d.created_by ? ` (${d.created_by})` : ''}.` : `Kaynak: ${d.book ?? '—'}.`} Slug: <code>{d.slug}</code>{d.updated_at && ` · Son değişiklik: ${formatDate(d.updated_at)}`}
      {d.qa_flags?.length ? ` · Kalite işaretleri: ${d.qa_flags.join(', ')}` : ''}
    </PageHead>
    <DetailsForm d={d} onSaved={detail.reload} />
    <TextSection d={d} onSaved={detail.reload} />
    <Gallery d={d} onChange={detail.reload} />
    <PagePhotos d={d} onChange={detail.reload} />
    {d.artworks?.length > 0 && <ArtworkPhotos d={d} onChange={detail.reload} />}
    <RemovalZone d={d} onChange={detail.reload} />
  </>;
}

/** MVP pilot seçkisi: işaretli eserlerin fotoğraf vektörleri ve anlatımları önce üretilir (pilot.py). */
function PilotToggle({ d, onChange }: { d: MonumentDetail; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  async function toggle(value: boolean) {
    setBusy(true);
    try { await api.updateMonument(d.slug, { pilot: value }); notify(value ? 'Eser pilot seçkiye eklendi' : 'Eser pilot seçkiden çıkarıldı'); onChange(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  return <label className="pilot-toggle" title="MVP demosunda gösterilecek eserler"><input id="pilot-toggle" type="checkbox" checked={d.pilot} disabled={busy} onChange={e => toggle(e.target.checked)} /> Pilot seçkide</label>;
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
<<<<<<< HEAD
      <GeoSection d={d} form={form} moved={'lat' in diff || 'lon' in diff}
        onPick={(lat, lon) => setForm(f => ({ ...f, lat: String(lat), lon: String(lon) }))} onConfirmed={onSaved} />
=======
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
    </div></fieldset>
    <fieldset><legend>Tanıtım</legend><div className="admin-grid">
      <Field label="Kısa özet (Türkçe)" wide hint="Kartlarda görünür. Yalnızca kaynakta yazanları özetleyin."><textarea rows={4} maxLength={2000} value={form.summary_tr} onChange={set('summary_tr')} /></Field>
      <Field label="Kısa özet (İngilizce)" wide><textarea rows={3} maxLength={2000} value={form.summary_en} onChange={set('summary_en')} /></Field>
      <Field label="Günümüzdeki durumu" wide><textarea rows={2} maxLength={1000} value={form.current_state} onChange={set('current_state')} /></Field>
    </div></fieldset>
    <fieldset><legend>Kaynak ve yayın</legend><div className="admin-grid">
      {!d.from_panel && <>
        <Field label="Kaynak sayfası (ilk)" hint={d.pages_auto ? `Düzeltilmiş paragraflara göre: s. ${d.pages_auto[0]}${d.pages_auto[1] !== d.pages_auto[0] ? `–${d.pages_auto[1]}` : ''}. Elle girerseniz otomatik hesap bu esere bir daha dokunmaz.` : 'Sitede kaynakçada görünür.'}><input inputMode="numeric" value={form.page_from} onChange={set('page_from')} /></Field>
        <Field label="Kaynak sayfası (son)" hint="Tek sayfaysa boş bırakın.">
          <input inputMode="numeric" value={form.page_to} onChange={set('page_to')} />
          {d.pages_auto && (String(d.pages_auto[0]) !== form.page_from || String(d.pages_auto[1]) !== (form.page_to || form.page_from)) &&
            <button type="button" className="text-link" style={{ alignSelf: 'flex-start' }} onClick={() => setForm(f => ({ ...f, page_from: String(d.pages_auto![0]), page_to: String(d.pages_auto![1]) }))}>Paragraflara göre doldur</button>}
        </Field>
      </>}
      <Field label="Kaynak notu" hint="Kitap dışı bilgi eklediyseniz kaynağını yazın (ör. VGM kayıtları, 2024)."><textarea rows={2} maxLength={500} value={form.source_note} onChange={set('source_note')} /></Field>
      <Field label="Yayın durumu" hint="Yalnızca “Yayında” olan eserler herkese açık sitede görünür."><select value={form.review_status} onChange={set('review_status')}><option value="draft">Taslak</option><option value="reviewed">Gözden geçirildi</option><option value="published">Yayında</option></select></Field>
    </div></fieldset>
    <div className="admin-actions"><button className="button dark" disabled={busy || !dirty}><Save size={16} />{busy ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}</button>
      {dirty ? <span className="admin-help">Kaydedilmemiş değişiklik: {Object.keys(diff).join(', ')}</span> : <span className="admin-help">Kaydedilmemiş değişiklik yok.</span>}
      {dirty && <button type="button" className="text-link" onClick={() => { setForm(formFromDetail(d)); setIssues([]); }}>Vazgeç</button>}</div>
  </form>;
}

<<<<<<< HEAD
/** Konum: durum (otomatik/doğrulanmış), onay düğmesi ve haritada seçme. Haritada taşınan konum kaydedilince doğrulanmış olur. */
function GeoSection({ d, form, moved, onPick, onConfirmed }: {
  d: MonumentDetail; form: MonumentForm; moved: boolean; onPick: (lat: number, lon: number) => void; onConfirmed: () => void;
}) {
  const notify = useToast();
  const cities = useLoad(() => api.cities(), []);
  const [busy, setBusy] = useState(false);
  const city = cities.data?.find(c => c.slug === d.city);
  const fallback = useMemo<[number, number] | null>(() => (city?.lat != null && city?.lon != null ? [city.lat, city.lon] : null), [city?.lat, city?.lon]);
  const status = geoStatus(d.geo, d.lat != null && d.lon != null);
  async function confirm() {
    setBusy(true);
    try { await api.updateMonument(d.slug, { geo_checked: true }); notify('Konum doğrulandı'); onConfirmed(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  return <div className="admin-field wide">
    <p className={`geo-status ${moved ? 'warn' : status.tone}`} role="status">{moved
      ? 'Konum değişti. “Değişiklikleri kaydet” ile kaydedince elle yerleştirilmiş ve doğrulanmış sayılır.'
      : status.text}</p>
    {status.canConfirm && !moved && <button type="button" className="button line small" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={confirm}><Check size={15} /> {busy ? 'Onaylanıyor…' : 'Konum doğru, onayla'}</button>}
    <LocationPicker lat={toNumber(form.lat)} lon={toNumber(form.lon)} fallback={fallback} onPick={onPick} />
    <small>Haritaya tıklayın ya da işaretçiyi sürükleyin; enlem ve boylam alanları kendiliğinden dolar. Harita: OpenStreetMap.</small>
  </div>;
}

=======
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
/** Numaralı kitap metni ve bölümleme kararları. Kitap metni değişmez; karar ziyaretçi metnini ve sohbet parçalarını etkiler. */
function BookText({ d, onChange }: { d: MonumentDetail; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [sel, setSel] = useState<{ no: number; start: number; end: number } | null>(null);   // metinde seçilen yer
  const [splitting, setSplitting] = useState<{ no: number; at: number } | null>(null);
  const flagged = d.paragraphs.own.some(p => p.decision === 'pending');
  const changed = d.paragraphs.own.filter(p => (p.decision && !['pending', 'keep'].includes(p.decision)) || p.hidden_spans?.length).length;
  type Res = { added: number; kept: number; after?: string };
  async function run(no: number, job: () => Promise<Res>, label: (r: Res) => string) {
    setBusy(true);
    try { const r = await job(); notify(`P${no}: ${label(r)}`); setEditing(null); setSel(null); setSplitting(null); onChange(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  const decide = (no: number, decision: ParaDecision, target?: string, split?: Split) => run(no,
    () => api.decideParagraph(d.slug, no, { decision, target, ...(split ? { split_at: split.at, split_part: split.part } : {}) }),
    r => `${split ? 'bölündü, ' : ''}${decisionMessage({ after: r.after ?? decision, added: r.added, kept: r.kept })}`);
  const setSpans = (no: number, spans: [number, number][], label: string) => run(no, () => api.setHiddenSpans(d.slug, no, spans), () => label);
  return <details style={{ marginTop: 12 }} open={flagged}>
    <summary>Kitap metnini göster ({d.paragraphs.own.length} paragraf{changed ? `, ${changed} düzeltme` : ''})</summary>
    <p className="admin-help" style={{ margin: '8px 0' }}>Paragrafın tamamı başka esere aitse “Düzelt” ile gizleyin, önceki paragrafla birleştirin ya da asıl eserine taşıyın. <strong>Paragrafın bir kısmı</strong> yanlışsa metinde fareyle seçin: metne karışmış başlık ya da kırıntıyı <em>gizleyebilir</em>, iki eserin birleştiği yerden <em>bölebilirsiniz</em> (bölmek için o noktaya tıklamanız yeterli). Kitap metni değişmez; her düzeltme geri alınabilir.</p>
    {d.paragraphs.own.length > 1 && <MoveRange d={d} busy={busy} setBusy={setBusy} onDone={onChange} />}
    <ol className="text-preview numbered">{d.paragraphs.own.map(p => {
      const split = p.split_at && p.split_part && (p.decision === 'hide' || p.decision === 'move') ? { at: p.split_at, part: p.split_part } : null;
      const off = !split && (p.decision === 'hide' || p.decision === 'move');
      const spans = p.hidden_spans ?? [];
      const spansOnly = p.decision === 'keep' && spans.length > 0 && !p.rule;   // yalnızca paragraf içi gizleme
      const mine = sel?.no === p.no ? sel : null;
      return <li key={p.no} id={`P${p.no}`} className={`${off ? 'para-off' : ''} ${p.decision === 'pending' ? 'para-pending' : ''}`}><b>P{p.no}</b>
        <div><ParagraphText text={p.text} spans={spans} split={split} mark={mine}
            onSelect={off || busy ? undefined : r => { setSplitting(null); setSel({ no: p.no, ...r }); }} />
          {mine && !splitting && <div className="sel-bar" role="group" aria-label="Seçili metin için işlemler">
            {mine.end > mine.start
              ? <><span className="admin-help">Seçili: “{p.text.slice(mine.start, mine.end).slice(0, 60)}{mine.end - mine.start > 60 ? '…' : ''}”</span>
                <button className="button danger small" disabled={busy} onClick={() => setSpans(p.no, [...spans, [mine.start, mine.end]], 'seçili kısım gizlendi')}><EyeOff size={14} /> Seçili kısmı gizle</button>
                {!split && mine.start > 0 && <button className="button line small" disabled={busy} onClick={() => setSplitting({ no: p.no, at: mine.start })}><Scissors size={14} /> Seçimin başından böl</button>}</>
              : !split && mine.start > 0 && mine.start < p.text.length
                ? <button className="button line small" disabled={busy} onClick={() => setSplitting({ no: p.no, at: mine.start })}><Scissors size={14} /> Buradan böl</button>
                : <span className="admin-help">Bölmek için paragrafın ortasında bir yere tıklayın; gizlemek için bir kısmı seçin.</span>}
            <button className="text-link" onClick={() => setSel(null)}>Vazgeç</button>
          </div>}
          {splitting?.no === p.no && <SplitForm text={p.text} at={splitting.at} spans={spans} city={d.city} busy={busy}
            onCancel={() => { setSplitting(null); setSel(null); }} onDecide={(dec, t, sp) => decide(p.no, dec, t, sp)} />}
          {((p.decision && !spansOnly) || spans.length > 0) && <div className="para-state">
            {p.decision && !spansOnly && <span className="admin-badge">{split ? `${split.part === 'tail' ? 'Sondaki' : 'Baştaki'} kısım: ` : ''}{DECISION_LABELS[p.decision]}{p.decision === 'move' && p.target_slug ? ` → ${p.target_slug}` : ''}</span>}
            {spans.length > 0 && <> <span className="admin-badge">{spans.length} kısım gizli</span> <button className="text-link" disabled={busy} onClick={() => setSpans(p.no, [], 'gizlenen kısımlar geri getirildi')}>Gizlenen kısımları geri getir</button></>}
            {p.rule && <span className="admin-help"> {RULE_LABELS[p.rule] ?? p.reason}{p.decided_by ? ` · karar: ${p.decided_by}` : p.source === 'auto' ? ' · otomatik' : ''}</span>}</div>}
          {editing === p.no || p.decision === 'pending'
            ? <ParagraphActions decision={spansOnly ? null : p.decision} busy={busy} city={d.city} onDecide={(dec, t) => decide(p.no, dec, t)} />
            : <button className="text-link" style={{ fontSize: 12.5, marginTop: 4 }} onClick={() => setEditing(p.no)}>{p.decision && p.decision !== 'keep' ? 'Değiştir' : 'Düzelt'}</button>}
        </div></li>;
    })}</ol>
  </details>;
}

/**
 * Birden çok paragrafı tek seferde taşıma: başka bir esere ya da bu paragraflardan oluşacak yeni bir esere (bölümlemede
 * başlığı okunamamış eser). Kitap metni değişmez; her paragrafın kararı listeden ayrı ayrı geri alınabilir.
 */
function MoveRange({ d, busy, setBusy, onDone }: { d: MonumentDetail; busy: boolean; setBusy: (b: boolean) => void; onDone: () => void }) {
  const notify = useToast();
  const total = d.paragraphs.own.length;
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(total);
  const [to, setTo] = useState(total);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [target, setTarget] = useState<{ slug: string; name_tr: string } | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('tomb');
  const [district, setDistrict] = useState(d.district ?? '');
  const [midStart, setMidStart] = useState(false);       // ilk paragraf ortadan başlıyor (eser paragrafın ortasında başlıyor)
  const [splitAt, setSplitAt] = useState<number | null>(null);
  const valid = from >= 1 && to >= from && to <= total && (mode === 'existing' ? !!target : name.trim().length >= 2) && (!midStart || splitAt !== null);
  async function submit() {
    setBusy(true);
    try {
      const r = await api.moveParagraphs(d.slug, { from_para: from, to_para: to, ...(midStart && splitAt !== null ? { first_split_at: splitAt } : {}),
        ...(mode === 'existing' ? { target: target!.slug }
        : { new: { name_tr: name.trim(), kind, district: district.trim() || null } }) });
      notify(r.created ? `P${from}–P${to} yeni esere taşındı: ${name.trim()} (taslak). Fotoğraflarını bağlayıp yayına alabilirsiniz.`
        : `P${from}–P${to} “${target!.name_tr}” eserine taşındı.`);
      setOpen(false);
      if (r.created) navigate(`/eser/${encodeURIComponent(r.created)}`); else onDone();
    } catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  const options = Array.from({ length: total }, (_, i) => i + 1);
  if (!open) return <p style={{ margin: '0 0 10px' }}><button className="text-link" onClick={() => setOpen(true)}><ArrowRightLeft size={14} /> Birden çok paragrafı taşı ya da yeni esere ayır</button></p>;
  return <fieldset className="move-range">
    <legend>Paragrafları taşı</legend>
    <p className="admin-help">Bölümleme bir eserin paragraflarını başka bir kayda katmışsa, aralığı seçip asıl eserine taşıyın. Eser listede hiç yoksa (başlığı okunamamışsa) bu paragraflardan yeni bir eser oluşturun: aynı kitap ve sayfalara bağlı, taslak olarak başlar. Taşınan paragraflar kitaptaki sıralarına göre yerleşir.</p>
    <div className="move-range-row">
      <Field label="İlk paragraf"><select id="mr-from" value={from} onChange={e => { const v = Number(e.target.value); setFrom(v); setSplitAt(null); if (to < v) setTo(v); }}>{options.map(n => <option key={n} value={n}>P{n}</option>)}</select></Field>
      <Field label="Son paragraf"><select id="mr-to" value={to} onChange={e => setTo(Number(e.target.value))}>{options.filter(n => n >= from).map(n => <option key={n} value={n}>P{n}</option>)}</select></Field>
      <div className="pv-segmented" role="group" aria-label="Hedef">
        <button type="button" className={mode === 'existing' ? 'active' : ''} aria-pressed={mode === 'existing'} onClick={() => setMode('existing')}>Mevcut esere</button>
        <button type="button" className={mode === 'new' ? 'active' : ''} aria-pressed={mode === 'new'} onClick={() => setMode('new')}>Yeni esere</button>
      </div>
    </div>
    <label className="pilot-toggle" style={{ alignSelf: 'flex-start' }}><input id="mr-mid" type="checkbox" checked={midStart} onChange={e => { setMidStart(e.target.checked); setSplitAt(null); }} /> P{from} paragrafın ortasından başlıyor (önceki eserin son cümleleriyle birleşmiş)</label>
    {midStart && <div className="split-form">
      <p className="admin-help">P{from} metninde yeni eserin başladığı yere tıklayın: o noktadan sonrası taşınır, öncesi bu eserde kalır.</p>
      <ParagraphText text={d.paragraphs.own[from - 1]?.text ?? ''} split={splitAt ? { at: splitAt, part: 'head' } : null}
        onSelect={r => { const t = d.paragraphs.own[from - 1]?.text ?? ''; if (r.start > 0 && r.start < t.length) setSplitAt(r.start); }} />
      {splitAt && <p className="admin-help">Bölme noktası seçildi: çizili kısım bu eserde kalır, sonrası taşınır.</p>}
    </div>}
    {mode === 'existing'
      ? (target ? <p className="admin-help">Hedef: <strong>{target.name_tr}</strong> <button className="text-link" onClick={() => setTarget(null)}>değiştir</button></p>
        : <MonumentPicker label="Paragrafların asıl sahibi olan eser" city={d.city} onPick={m => setTarget(m)} />)
      : <div className="move-range-row">
        <Field label="Yeni eserin adı"><input id="mr-name" value={name} onChange={e => setName(e.target.value)} placeholder="Örn. Hz. Üftâde Türbesi" maxLength={200} /></Field>
        <Field label="Tür"><select id="mr-kind" value={kind} onChange={e => setKind(e.target.value as Kind)}>{Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="İlçe"><input id="mr-district" value={district} onChange={e => setDistrict(e.target.value)} maxLength={100} /></Field>
      </div>}
    <div className="admin-actions">
      <button className="button dark small" disabled={busy || !valid} onClick={submit}><ArrowRightLeft size={14} /> P{from}–P{to} paragraflarını taşı</button>
      <button className="button line small" disabled={busy} onClick={() => setOpen(false)}><X size={14} /> Vazgeç</button>
    </div>
  </fieldset>;
}

/** Metin düzeltildikten sonra künyeyi (kişiler, olaylar, tarih, süsleme kayıtları, özet) yeniden çıkarma. */
function Reextract({ d, onDone }: { d: MonumentDetail; onDone: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!confirm('Künye bu eserin düzeltilmiş metninden yeniden çıkarılsın mı? Kişi, olay ve süsleme kayıtları yenilenir; elle değiştirdiğiniz künye alanları ve süsleme fotoğraf bağları korunur. (Tek Gemini çağrısı)')) return;
    setBusy(true);
    try {
      const r = await api.reextract(d.slug);
      notify(`Künye yenilendi: ${r.persons} kişi, ${r.events} olay, ${r.artworks} süsleme kaydı${r.rejected ? `, alıntısı bulunamayan ${r.rejected} öğe atıldı` : ''}${r.kept_panel_fields.length ? ` · korunan alanlar: ${r.kept_panel_fields.join(', ')}` : ''}`);
      onDone();
    } catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  return <div className="admin-actions" style={{ marginTop: 14, padding: 0 }}>
    <button type="button" className="button line small" disabled={busy} onClick={run}><RotateCcw size={14} /> {busy ? 'Künye çıkarılıyor…' : 'Künyeyi düzeltilmiş metinden yeniden çıkar'}</button>
    <span className="admin-help">Paragrafları düzelttikten sonra: kişiler, olaylar, tarih, süsleme kayıtları ve özet bu metne göre yenilenir.</span>
  </div>;
}

function TextSection({ d, onSaved }: { d: MonumentDetail; onSaved: () => void }) {
  const [tr, setTr] = useState(d.text_tr ?? '');
  const [en, setEn] = useState(d.text_en ?? '');
  const [busy, setBusy] = useState(false);
  const notify = useToast();
  if (!d.text_editable) return <section className="admin-form" style={{ marginTop: 26 }}><fieldset><legend>Kaynak metin</legend>
    <p className="admin-note">Bu metin envanter kitabından alınmıştır ve doğruluk kaynağıdır; panelden değiştirilemez.</p>
    {d.text_tr ? <BookText d={d} onChange={onSaved} /> : d.paragraphs.incoming.length ? null : <p className="admin-help">Bu kaydın metni yok (türetilmiş üst kayıt).</p>}
    {(d.text_tr || d.paragraphs.incoming.length > 0) && <Reextract d={d} onDone={onSaved} />}
    {d.paragraphs.incoming.length > 0 && <p className="admin-note" style={{ marginTop: 12 }}>{d.text_tr ? 'Başka eserlerden bu esere taşınan paragraflar (kitaptaki sıralarına göre yerleşir; metni "Sitede nasıl görünür?" ile görebilirsiniz):' : 'Bu eserin metni, başka bir kayıttan taşınan kitap paragraflarından oluşur (metni "Sitede nasıl görünür?" ile görebilirsiniz). Taşımayı geri almak için paragrafın asıl kaydında kararı geri alın:'} {d.paragraphs.incoming.map(i =>
      <span key={`${i.from_slug}-${i.para_no}`}><Link className="text-link" to={`/eser/${encodeURIComponent(i.from_slug)}#P${i.para_no}`}>{i.from_name} P{i.para_no}</Link> </span>)}</p>}
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

/** Süsleme ve sanat kayıtlarına eserin fotoğraflarını elle bağlama. Ziyaretçi yalnızca yayımlanmış fotoğrafları görür. */
type ArtPhoto = MonumentDetail['artwork_photos'][number];

function ArtworkPhotos({ d, onChange }: { d: MonumentDetail; onChange: () => void }) {
  const photos = d.artwork_photos ?? [];
  const linked = d.artworks.filter(a => a.image_ids.length).length;
  return <section id="susleme" style={{ marginTop: 34 }} aria-labelledby="artwork-title">
    <h2 id="artwork-title" style={{ fontSize: 26, marginBottom: 6 }}>Süsleme ve sanat fotoğrafları</h2>
    <p className="admin-help" style={{ marginBottom: 14 }}>{d.artworks.length} kayıttan {linked} tanesinin fotoğrafı var. Her kayıt için onu gösteren fotoğrafları seçin; bir fotoğraf birden çok kayda bağlanabilir. Eser sayfasında “Süsleme ve sanat” bölümünde fotoğraflı kart olarak görünür. Onay bekleyen fotoğraf ziyaretçiye, yayına alınana kadar görünmez.{photos.some(p => p.other) ? ' Bağlı yapıların (ör. caminin ya da haziresinin) fotoğrafları da seçilebilir; üzerlerinde yapının adı yazar.' : ''}</p>
    {photos.length ? <div className="artwork-list">{d.artworks.map(a => <ArtworkCard key={a.id} a={a} photos={photos} onChange={onChange} />)}</div>
      : <div className="empty">Bağlanacak fotoğraf yok. Önce yukarıdan fotoğraf yükleyin.</div>}
  </section>;
}

function ArtworkCard({ a, photos, onChange }: { a: AdminArtwork; photos: ArtPhoto[]; onChange: () => void }) {
  const notify = useToast();
  const [picked, setPicked] = useState<number[] | null>(null);   // seçici açıkken seçim (sıralı)
  const [busy, setBusy] = useState(false);
  const byId = new Map(photos.map(p => [p.id, p]));
  const shown = (picked ?? a.image_ids).map(id => byId.get(id)).filter((p): p is ArtPhoto => !!p);
  const title = [a.element, a.technique].filter(Boolean).join(' · ') || artworkLabel(a.kind, 'tr');
  const toggle = (id: number) => setPicked(p => (p ?? []).includes(id) ? (p ?? []).filter(x => x !== id) : [...(p ?? []), id]);
  async function save() {
    setBusy(true);
    try { await api.setArtworkImages(a.id, picked ?? []); notify('Süsleme fotoğrafları kaydedildi'); setPicked(null); onChange(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  return <article className="artwork-card" aria-label={title}>
    <header><span className="artwork-kind">{artworkLabel(a.kind, 'tr')}</span><h3>{title}</h3>
      {(a.script || a.date_text) && <small>{[a.script, a.date_text].filter(Boolean).join(' · ')}</small>}</header>
    <p>{a.description_tr}</p>
    {shown.length > 0 && <div className="artwork-thumbs">{shown.map(p => <figure key={p.id}><img src={`/media/thumbs/${p.file}`} alt={p.alt_tr ?? ''} loading="lazy" />
      {p.review_status !== 'published' && <figcaption>onay bekliyor</figcaption>}</figure>)}</div>}
    {picked === null
      ? <div className="admin-actions"><button className="button line small" onClick={() => setPicked(a.image_ids.filter(id => byId.has(id)))}><ImagePlus size={14} /> {a.image_ids.length ? 'Fotoğrafları değiştir' : 'Fotoğraf seç'}</button></div>
      : <div className="artwork-picker">
        <p className="admin-help">Bu kaydı gösteren fotoğraflara tıklayın (seçim sırası, sayfadaki sırayı belirler).</p>
        <div className="picker-grid" role="group" aria-label={`${title} için fotoğraf seçimi`}>{photos.map(p => {
          const n = picked.indexOf(p.id);
          return <button key={p.id} type="button" className={n >= 0 ? 'picked' : ''} aria-pressed={n >= 0} onClick={() => toggle(p.id)}
            aria-label={`${p.alt_tr ?? `Fotoğraf ${p.id}`}${p.printed_page && !(p.alt_tr ?? '').includes(`s. ${p.printed_page}`) ? `, s. ${p.printed_page}` : ''}${p.other ? ` (${p.monument_name})` : ''}`}>
            <img src={`/media/thumbs/${p.file}`} alt="" loading="lazy" />{n >= 0 && <span className="pick-no">{n + 1}</span>}
            {p.printed_page && <span className="pick-page">s. {p.printed_page}</span>}
            {p.other && <span className="pick-owner">{p.monument_name}</span>}
            {p.review_status !== 'published' && <span className="pick-pending">onay bekliyor</span>}</button>;
        })}</div>
        <div className="admin-actions">
          <button className="button dark small" disabled={busy} onClick={save}><Save size={14} /> Kaydet ({picked.length})</button>
          <button className="button line small" disabled={busy} onClick={() => setPicked(null)}><X size={14} /> Vazgeç</button></div>
      </div>}
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

/** Tek tıkla yayına alma / yayından kaldırma (yayın durumu formun altında da değiştirilebilir). */
function PublishButton({ d, onChange }: { d: MonumentDetail; onChange: () => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  if (d.review_status === 'removed') return null;
  const live = d.review_status === 'published';
  async function run() {
    if (live && !confirm(`“${d.name_tr}” yayından kaldırılsın mı? Eser sitede görünmez, taslak olarak kalır.`)) return;
    setBusy(true);
    try { await api.updateMonument(d.slug, { review_status: live ? 'draft' : 'published' }); notify(live ? 'Eser yayından kaldırıldı (taslak)' : 'Eser yayına alındı; artık sitede görünüyor'); onChange(); }
    catch (e) { notify((e as Error).message, true); }
    finally { setBusy(false); }
  }
  return live ? <button className="button line small" disabled={busy} onClick={run}><EyeOff size={15} /> Yayından kaldır</button>
    : <button className="button gold small" disabled={busy} onClick={run}><Rocket size={15} /> Yayına al</button>;
}

/**
 * Eseri kaldırma ya da silme. Kitap eseri silinmez, kaldırılır: sitede, listelerde, aramada, sohbette ve pilot seçkide
 * görünmez; metni, fotoğrafları ve dizini durur, geri getirilebilir. Panelden eklenen ya da paragraflarıyla ayrılmış eser
 * kalıcı olarak silinebilir (ayrılmış eserin paragrafları asıl kaydına döner, kitap fotoğrafları esersiz fotoğraflara geçer).
 */
function RemovalZone({ d, onChange }: { d: MonumentDetail; onChange: () => void }) {
  const notify = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const split = d.qa_flags?.includes('split');
  async function run(label: string, action: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    try { await action(); notify(label); (after ?? onChange)(); } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  }
  if (d.review_status === 'removed') return <section className="admin-form" style={{ marginTop: 34 }}><fieldset><legend>Kaldırılmış eser</legend>
    <p className="admin-note">Bu eser kaldırıldı: sitede, eser listelerinde, görselle aramada ve sohbette görünmüyor. Metni, fotoğrafları ve dizini duruyor.</p>
    <div className="admin-actions" style={{ marginTop: 12 }}><button type="button" className="button dark" disabled={busy} onClick={() => run('Eser geri getirildi (taslak). Kontrol edip yayına alabilirsiniz.', () => api.restoreMonument(d.slug))}><RotateCcw size={16} /> Eseri geri getir</button></div>
  </fieldset></section>;
  return <section className="admin-form" style={{ marginTop: 34 }}><fieldset style={{ borderColor: '#d9b2a8' }}><legend>{d.deletable ? 'Eseri sil' : 'Eseri kaldır'}</legend>
    {d.deletable
      ? <><p className="admin-help">{split ? 'Bu eser başka bir kaydın paragraflarından ayrılmıştı. Silinirse paragraflar asıl kaydına döner; bağlı kitap fotoğrafları silinmez, “esere bağlı olmayan fotoğraflar” arasına geçer.'
          : 'Panelden eklenen bu eser, metni, dizini ve panelden yüklenen fotoğraflarıyla kalıcı olarak silinir. Bağlı kitap fotoğrafları silinmez, esersiz fotoğraflara geçer.'} Yalnızca sitede görünmesin istiyorsanız “Yayından kaldır” yeterlidir.</p>
        <div className="admin-actions" style={{ marginTop: 12 }}><button type="button" className="button danger" disabled={busy} onClick={() => {
          if (!confirm(`“${d.name_tr}” kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) return;
          run('Eser silindi', () => api.deleteMonument(d.slug), () => navigate('/eserler'));
        }}><Trash2 size={16} /> Eseri kalıcı olarak sil</button></div></>
      : <><p className="admin-help">Envanter kitabından gelen eser kalıcı olarak silinmez; kaldırılır. Kaldırılan eser sitede, eser listelerinde, görselle aramada, sohbette ve pilot seçkide görünmez. Metni, fotoğrafları ve dizini durur; “Kaldırılanlar” listesinden geri getirilebilir. Yalnızca geçici olarak gizlemek için “Yayından kaldır” yeterlidir.</p>
        <Field label="Neden (isteğe bağlı)" hint="Değişiklik kaydına yazılır. Örn. “yinelenen kayıt”, “bölümleme kırıntısı”."><input id="remove-reason" value={reason} onChange={e => setReason(e.target.value)} maxLength={300} /></Field>
        <div className="admin-actions" style={{ marginTop: 12 }}><button type="button" className="button danger" disabled={busy} onClick={() => {
          if (!confirm(`“${d.name_tr}” kaldırılsın mı? Sonradan geri getirilebilir.`)) return;
          run('Eser kaldırıldı', () => api.removeMonument(d.slug, reason.trim()));
        }}><Ban size={16} /> Eseri kaldır</button></div></>}
  </fieldset></section>;
}
