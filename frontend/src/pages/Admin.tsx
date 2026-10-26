import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, Download, FileUp, Plus, RotateCcw, Save, ShieldAlert, Trash2, X } from 'lucide-react';
import type { Artifact, QuizQuestion } from '../data/artifacts';
import type { Season } from '../data/collections';
import { artifactIssues, blankArtifact, parseOverrides, PLACEHOLDER_IMAGE, questionIssues, seasonIssues, serializeOverrides, slugify, type Content } from '../lib/content';
import { baseContent, useContent, useLocalContent } from '../lib/contentStore';
import { achievements, emptyProgress } from '../lib/progress';
import { useProgress } from '../lib/store';
import { Link } from '../lib/navigation';
import { vakifApiEnabled } from '../lib/vakifApi';
import { PageHeading, Scene } from '../components/UI';

type Tab = 'artifacts' | 'quiz' | 'seasons' | 'achievements' | 'data';
const tabs: [Tab, string][] = [['artifacts', 'Eserler ve hikâyeler'], ['quiz', 'Quiz soruları'], ['seasons', 'Keşif sezonları'], ['achievements', 'Başarımlar'], ['data', 'Veri']];
const clone = <T,>(value: T): T => structuredClone(value);
const metals: Record<string, string> = { bronze: 'Bronz', silver: 'Gümüş', gold: 'Altın' };

function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`admin-field ${wide ? 'wide' : ''}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function Issues({ list }: { list: string[] }) {
  if (!list.length) return null;
  return <div className="admin-issues" role="alert" tabIndex={-1}><strong>Kaydetmeden önce düzelt:</strong><ul>{list.map(issue => <li key={issue}>{issue}</li>)}</ul></div>;
}
function Actions({ children }: { children: ReactNode }) { return <div className="admin-actions">{children}</div>; }

function ArtifactsPanel() {
  const { artifacts, quizQuestions, seasons, save } = useLocalContent();
  const { notify } = useProgress();
  const [draft, setDraft] = useState<Artifact>(() => clone(artifacts[0]));
  const [isNew, setIsNew] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const form = useRef<HTMLFormElement>(null);
  const base = baseContent.artifacts.find(a => a.id === draft.id);
  const uniqueSlug = (name: string) => { const root = slugify(name) || 'yeni-eser'; let slug = root, n = 2; while (artifacts.some(a => a.id === slug)) slug = `${root}-${n++}`; return slug; };
  const pick = (artifact: Artifact) => { setDraft(clone(artifact)); setIsNew(false); setIssues([]); };
  const create = () => { const fresh = blankArtifact('Yeni eser'); const slug = uniqueSlug(fresh.name); setDraft({ ...fresh, id: slug, slug }); setIsNew(true); setIssues([]); };
  const patch = (next: Partial<Artifact>) => setDraft(d => { const merged = { ...d, ...next }; if (isNew && next.name !== undefined) { const slug = uniqueSlug(next.name); merged.id = slug; merged.slug = slug; } return merged; });
  const patchChapter = (index: number, next: Partial<Artifact['chapters'][number]>) => setDraft(d => ({ ...d, chapters: d.chapters.map((c, i) => i === index ? { ...c, ...next } : c) }));
  const patchSource = (index: number, next: Partial<Artifact['sourceReferences'][number]>) => setDraft(d => ({ ...d, sourceReferences: d.sourceReferences.map((s, i) => i === index ? { ...s, ...next } : s) }));
  function submit(event: FormEvent) {
    event.preventDefault();
    const cleaned = { ...draft, sourceReferences: draft.sourceReferences.filter(s => s.title.trim() || s.url.trim()) };
    const found = artifactIssues(cleaned, artifacts.filter(a => isNew || a.id !== cleaned.id));
    setIssues(found);
    if (found.length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('.admin-issues')?.focus()); return; }
    const list = isNew ? [...artifacts, cleaned] : artifacts.map(a => a.id === cleaned.id ? cleaned : a);
    if (!save({ artifacts: list })) { setIssues(['Kayıt doğrulanamadı. Alanları kontrol edip yeniden dene.']); return; }
    setDraft(cleaned); setIsNew(false);
    notify(isNew ? `${cleaned.name} koleksiyona eklendi.` : `${cleaned.name} güncellendi.`);
  }
  function restore() {
    if (!base) return;
    save({ artifacts: artifacts.map(a => a.id === base.id ? clone(base) : a) });
    setDraft(clone(base)); setIssues([]); notify(`${base.name} varsayılan içeriğe döndü.`);
  }
  function remove() {
    if (base || isNew || !window.confirm(`${draft.name} koleksiyondan kaldırılsın mı?`)) return;
    const id = draft.id;
    const next: Partial<Content> = { artifacts: artifacts.filter(a => a.id !== id) };
    if (seasons.some(s => s.artifactIds.includes(id))) next.seasons = seasons.map(s => ({ ...s, artifactIds: s.artifactIds.filter(x => x !== id) })).filter(s => s.artifactIds.length);
    if (quizQuestions.some(q => q.artifactId === id)) next.quizQuestions = quizQuestions.filter(q => q.artifactId !== id);
    save(next); pick(next.artifacts![0]); notify('Eser kaldırıldı.');
  }
  return <div className="admin-split">
    <div className="admin-list" role="group" aria-label="Düzenlenecek eser">
      {artifacts.map(a => <button key={a.id} aria-current={!isNew && draft.id === a.id ? 'true' : undefined} className={!isNew && draft.id === a.id ? 'active' : ''} onClick={() => pick(a)}><img src={a.image} alt="" /><span><strong>{a.name}</strong><small>{a.city} · {baseContent.artifacts.some(b => b.id === a.id) ? 'İlk koleksiyon' : 'Yerel eklenen'}</small></span></button>)}
      {isNew && <button aria-current="true" className="active"><img src={PLACEHOLDER_IMAGE} alt="" /><span><strong>{draft.name || 'Yeni eser'}</strong><small>Kaydedilmedi</small></span></button>}
      <button className="admin-add" onClick={create}><Plus size={17} /> Yeni eser ekle</button>
    </div>
    <form className="admin-form" ref={form} onSubmit={submit} noValidate>
      <div className="admin-form-head"><img src={draft.image} alt="" /><div><small>{isNew ? 'YENİ ESER · KAYDEDİLMEDİ' : base ? 'İLK KOLEKSİYON ESERİ' : 'YEREL EKLENEN ESER'}</small><h2>{draft.name || 'Adsız eser'}</h2>{!isNew && <Link className="text-link" to={`/eser/${draft.slug}`}>Hikâyeyi önizle <ArrowUpRight size={15} /></Link>}</div></div>
      {draft.image === PLACEHOLDER_IMAGE && <p className="admin-note">Bu eser için henüz özgün illüstrasyon yok; arayüzde “Görsel hazırlanıyor” etiketiyle nötr bir yer tutucu gösterilir. Yanıltıcı olmaması için başka bir eserin görseli kullanılmaz.</p>}
      <Issues list={issues} />
      <fieldset><legend>Temel bilgiler</legend><div className="admin-grid">
        <Field label="Eser adı"><input value={draft.name} onChange={e => patch({ name: e.target.value })} required /></Field>
        <Field label="Bağlantı adı" hint={isNew ? 'Addan otomatik oluşturulur.' : 'Kayıtlı eserlerde değiştirilemez; keşif kayıtları bu ada bağlıdır.'}><input value={draft.slug} readOnly /></Field>
        <Field label="Şehir"><input value={draft.city} onChange={e => patch({ city: e.target.value })} /></Field>
        <Field label="Dönem" hint="Zaman tünelinde aynı adlı dönemle eşleşir."><input value={draft.period} list="admin-periods" onChange={e => patch({ period: e.target.value })} /><datalist id="admin-periods">{[...new Set(artifacts.map(a => a.period))].map(p => <option key={p} value={p} />)}</datalist></Field>
        <Field label="Eser türü"><input value={draft.category} onChange={e => patch({ category: e.target.value })} /></Field>
        <Field label="Tarih"><input value={draft.year} onChange={e => patch({ year: e.target.value })} placeholder="ör. 1550–1557" /></Field>
        <Field label="Mimar / usta"><input value={draft.architect} onChange={e => patch({ architect: e.target.value })} /></Field>
        <Field label="Enlem"><input type="number" step="0.0001" value={draft.coordinates[0]} onChange={e => patch({ coordinates: [Number(e.target.value), draft.coordinates[1]] })} /></Field>
        <Field label="Boylam"><input type="number" step="0.0001" value={draft.coordinates[1]} onChange={e => patch({ coordinates: [draft.coordinates[0], Number(e.target.value)] })} /></Field>
        <Field label="Kısa açıklama" wide><textarea rows={3} value={draft.description} onChange={e => patch({ description: e.target.value })} maxLength={400} /></Field>
      </div></fieldset>
      <fieldset><legend>Hikâye bölümleri</legend><p className="admin-help">Her bölüm üç anlatım biçimi taşır. Tarihî bilgileri kısa anlatımda tut; hikâyeleştirme yaratıcı anlatım olarak etiketlenir.</p>
        {draft.chapters.map((chapter, i) => <details className="admin-chapter" key={i} open={i === 0}><summary>Bölüm {String(i + 1).padStart(2, '0')} · {chapter.title || 'Başlıksız'}</summary><div className="admin-grid">
          <Field label="Başlık" wide><input value={chapter.title} onChange={e => patchChapter(i, { title: e.target.value })} /></Field>
          <Field label="Kısa ve Öz" wide><textarea rows={3} value={chapter.short} onChange={e => patchChapter(i, { short: e.target.value })} /></Field>
          <Field label="Hikâyeleştirerek" wide><textarea rows={3} value={chapter.story} onChange={e => patchChapter(i, { story: e.target.value })} /></Field>
          <Field label="Çocuklar İçin" wide><textarea rows={3} value={chapter.child} onChange={e => patchChapter(i, { child: e.target.value })} /></Field>
        </div></details>)}
      </fieldset>
      <fieldset><legend>Mimari ayrıntı</legend><div className="admin-grid">
        <Field label="Başlık" wide><input value={draft.detail.title} onChange={e => patch({ detail: { ...draft.detail, title: e.target.value } })} /></Field>
        <Field label="Açıklama" wide><textarea rows={3} value={draft.detail.text} onChange={e => patch({ detail: { ...draft.detail, text: e.target.value } })} /></Field>
        <Field label="Odak X (%)" hint="Hikâye sahnesinin yakınlaşacağı nokta."><input type="number" min={0} max={100} value={draft.detail.focus?.[0] ?? 50} onChange={e => patch({ detail: { ...draft.detail, focus: [Number(e.target.value), draft.detail.focus?.[1] ?? 50] } })} /></Field>
        <Field label="Odak Y (%)"><input type="number" min={0} max={100} value={draft.detail.focus?.[1] ?? 50} onChange={e => patch({ detail: { ...draft.detail, focus: [draft.detail.focus?.[0] ?? 50, Number(e.target.value)] } })} /></Field>
      </div></fieldset>
      <fieldset><legend>Kaynaklar</legend><p className="admin-help">Kurumsal veya akademik kaynak ekle. Bağlantılar https:// ile başlamalı.</p>
        {draft.sourceReferences.map((source, i) => <div className="admin-source" key={i}><Field label={`Kaynak ${i + 1}`}><input value={source.title} onChange={e => patchSource(i, { title: e.target.value })} placeholder="Kurum — sayfa adı" /></Field><Field label="Bağlantı"><input type="url" value={source.url} onChange={e => patchSource(i, { url: e.target.value })} placeholder="https://" /></Field><button type="button" className="icon-button" onClick={() => setDraft(d => ({ ...d, sourceReferences: d.sourceReferences.filter((_, x) => x !== i) }))} aria-label={`Kaynak ${i + 1} sil`}><X size={17} /></button></div>)}
        <button type="button" className="text-link" onClick={() => setDraft(d => ({ ...d, sourceReferences: [...d.sourceReferences, { title: '', url: '' }] }))}><Plus size={15} /> Kaynak ekle</button>
      </fieldset>
      <Actions><button className="button dark" type="submit"><Save size={17} /> {isNew ? 'Koleksiyona ekle' : 'Değişiklikleri kaydet'}</button>
        {!isNew && <button type="button" className="text-link" onClick={() => pick(artifacts.find(a => a.id === draft.id) ?? artifacts[0])}><RotateCcw size={15} /> Kaydedilmemiş değişiklikleri geri al</button>}
        {isNew && <button type="button" className="text-link" onClick={() => pick(artifacts[0])}><X size={15} /> Vazgeç</button>}
        {base && !isNew && <button type="button" className="text-link" onClick={restore}>Varsayılan metne dön</button>}
        {!base && !isNew && <button type="button" className="text-link danger" onClick={remove}><Trash2 size={15} /> Eseri kaldır</button>}</Actions>
    </form>
  </div>;
}

function QuizPanel() {
  const { quizQuestions, artifacts, save, reset, overrides } = useLocalContent();
  const { notify } = useProgress();
  const [drafts, setDrafts] = useState<QuizQuestion[]>(() => clone(quizQuestions));
  const [open, setOpen] = useState(drafts[0]?.id ?? '');
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const [summary, setSummary] = useState<string[]>([]);
  const patch = (id: string, next: Partial<QuizQuestion>) => setDrafts(list => list.map(q => q.id === id ? { ...q, ...next } : q));
  function add() { const q: QuizQuestion = { id: `soru-${Date.now().toString(36)}`, question: '', options: ['', '', '', ''], answer: 0, explanation: '', artifactId: artifacts[0].id }; setDrafts(list => [...list, q]); setOpen(q.id); }
  function submit() {
    const ids = artifacts.map(a => a.id);
    const found = Object.fromEntries(drafts.map(q => [q.id, questionIssues(q, ids)] as const).filter(([, list]) => list.length));
    setIssues(found);
    const general = drafts.length < 3 ? ['Bir quiz turu için en az üç soru gerekli.'] : [];
    setSummary(general);
    if (Object.keys(found).length) { setOpen(Object.keys(found)[0]); return; }
    if (general.length) return;
    if (save({ quizQuestions: drafts })) notify('Quiz soruları kaydedildi.');
  }
  return <div className="admin-stack">
    <p className="admin-help">Her tur havuzdan en fazla dört soru seçer. Havuzda bu soruların yanında eser verisinden otomatik üretilen sorular (şehir, usta, yüzyıl, dönem, mimari ayrıntı) da bulunur. Soruları eser hikâyelerindeki doğrulanmış bilgilere dayandır.</p>
    <Issues list={summary} />
    {drafts.map((q, n) => <section className={`admin-card ${open === q.id ? 'open' : ''}`} key={q.id}>
      <button className="admin-card-head" onClick={() => setOpen(open === q.id ? '' : q.id)} aria-expanded={open === q.id}><i>{String(n + 1).padStart(2, '0')}</i><span>{q.question || 'Yeni soru'}</span>{issues[q.id] && <b>{issues[q.id].length} sorun</b>}<ArrowDown size={16} /></button>
      {open === q.id && <div className="admin-card-body"><Issues list={issues[q.id] ?? []} /><div className="admin-grid">
        <Field label="Soru" wide><input value={q.question} onChange={e => patch(q.id, { question: e.target.value })} /></Field>
        {q.options.map((option, i) => <div className="admin-option" key={i}><input type="radio" name={`answer-${q.id}`} checked={q.answer === i} onChange={() => patch(q.id, { answer: i })} aria-label={`${String.fromCharCode(65 + i)} seçeneği doğru cevap`} /><Field label={`${String.fromCharCode(65 + i)} seçeneği${q.answer === i ? ' · doğru cevap' : ''}`}><input value={option} onChange={e => patch(q.id, { options: q.options.map((o, x) => x === i ? e.target.value : o) })} /></Field></div>)}
        <Field label="Açıklama" wide hint="Cevaptan sonra gösterilir."><textarea rows={2} value={q.explanation} onChange={e => patch(q.id, { explanation: e.target.value })} /></Field>
        <Field label="Bağlı eser"><select value={q.artifactId} onChange={e => patch(q.id, { artifactId: e.target.value })}>{artifacts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      </div><button className="text-link danger" onClick={() => setDrafts(list => list.filter(x => x.id !== q.id))} disabled={drafts.length <= 3}><Trash2 size={15} /> Soruyu sil</button></div>}
    </section>)}
    <Actions><button className="button dark" onClick={submit}><Save size={17} /> Soruları kaydet</button><button className="text-link" onClick={add}><Plus size={15} /> Soru ekle</button>{overrides.quizQuestions && <button className="text-link" onClick={() => { reset('quizQuestions'); setDrafts(clone(baseContent.quizQuestions)); setIssues({}); notify('Quiz varsayılan sorulara döndü.'); }}><RotateCcw size={15} /> Varsayılan sorular</button>}</Actions>
  </div>;
}

function SeasonsPanel() {
  const { seasons, artifacts, save, reset, overrides } = useLocalContent();
  const { notify } = useProgress();
  const [drafts, setDrafts] = useState<Season[]>(() => clone(seasons));
  const [issues, setIssues] = useState<Record<string, string[]>>({});
  const patch = (id: string, next: Partial<Season>) => setDrafts(list => list.map(s => s.id === id ? { ...s, ...next } : s));
  const move = (season: Season, index: number, delta: number) => { const stops = [...season.artifactIds]; const [item] = stops.splice(index, 1); stops.splice(index + delta, 0, item); patch(season.id, { artifactIds: stops }); };
  function submit() {
    const ids = artifacts.map(a => a.id);
    const found = Object.fromEntries(drafts.map(s => [s.id, seasonIssues(s, ids)] as const).filter(([, list]) => list.length));
    setIssues(found);
    if (!Object.keys(found).length && save({ seasons: drafts })) notify('Keşif sezonları kaydedildi.');
  }
  return <div className="admin-stack">
    <p className="admin-help">Sezonlar, ana sayfada ve Keşfet sayfasında sıralı rotalar olarak görünür. Durak sırası rotanın anlatım sırasıdır.</p>
    {drafts.map(season => { const rest = artifacts.filter(a => !season.artifactIds.includes(a.id)); return <section className="admin-card open" key={season.id}><div className="admin-card-body">
      <Issues list={issues[season.id] ?? []} />
      <div className="admin-grid">
        <Field label="Sezon adı"><input value={season.title} onChange={e => patch(season.id, { title: e.target.value })} /></Field>
        <Field label="Kısa etiket" hint="ör. TEMATİK ROTA"><input value={season.kicker} onChange={e => patch(season.id, { kicker: e.target.value.toLocaleUpperCase('tr-TR') })} /></Field>
        <Field label="Açıklama" wide><textarea rows={2} value={season.description} onChange={e => patch(season.id, { description: e.target.value })} /></Field>
      </div>
      <ol className="admin-stops">{season.artifactIds.map((id, i) => <li key={id}><i>{String(i + 1).padStart(2, '0')}</i><span>{artifacts.find(a => a.id === id)?.name ?? id}</span><button className="icon-button" disabled={i === 0} onClick={() => move(season, i, -1)} aria-label="Yukarı taşı"><ArrowUp size={16} /></button><button className="icon-button" disabled={i === season.artifactIds.length - 1} onClick={() => move(season, i, 1)} aria-label="Aşağı taşı"><ArrowDown size={16} /></button><button className="icon-button" onClick={() => patch(season.id, { artifactIds: season.artifactIds.filter(x => x !== id) })} aria-label="Duraktan çıkar"><X size={16} /></button></li>)}</ol>
      <div className="admin-row">{rest.length > 0 && <label className="admin-field"><span>Durak ekle</span><select value="" onChange={e => e.target.value && patch(season.id, { artifactIds: [...season.artifactIds, e.target.value] })}><option value="">Eser seç…</option>{rest.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}<button className="text-link danger" onClick={() => setDrafts(list => list.filter(s => s.id !== season.id))}><Trash2 size={15} /> Sezonu sil</button></div>
    </div></section>; })}
    <Actions><button className="button dark" onClick={submit}><Save size={17} /> Sezonları kaydet</button><button className="text-link" onClick={() => setDrafts(list => [...list, { id: `sezon-${Date.now().toString(36)}`, kicker: 'TEMATİK ROTA', title: '', description: '', artifactIds: [] }])}><Plus size={15} /> Sezon ekle</button>{overrides.seasons && <button className="text-link" onClick={() => { reset('seasons'); setDrafts(clone(baseContent.seasons)); setIssues({}); notify('Keşif sezonları varsayılana döndü.'); }}><RotateCcw size={15} /> Varsayılan sezonlar</button>}</Actions>
  </div>;
}

function AchievementsPanel() {
  const { artifacts } = useLocalContent();
  return <div className="admin-stack"><p className="admin-help">Madalyon kuralları kullanıcı ilerlemesini doğrudan etkilediği için bu sürümde koddan yönetilir (<code>src/lib/progress.ts</code>). Burada yalnızca güncel kurallar listelenir.</p>
    <table className="admin-table"><thead><tr><th scope="col">Madalyon</th><th scope="col">Materyal</th><th scope="col">Koşul</th><th scope="col">Eşik</th></tr></thead><tbody>{achievements(emptyProgress(), artifacts).map(a => <tr key={a.id}><th scope="row">{a.name}</th><td>{metals[a.metal]}</td><td>{a.description}</td><td>{a.required}</td></tr>)}</tbody></table>
    <Link className="text-link" to="/basarimlar">Madalyon odasını aç <ArrowUpRight size={15} /></Link></div>;
}

function DataPanel({ onReplaced }: { onReplaced: () => void }) {
  const content = useLocalContent();
  const { notify } = useProgress();
  const [error, setError] = useState('');
  const rows: [keyof Content, string, number][] = [['artifacts', 'Eserler ve hikâyeler', content.artifacts.length], ['quizQuestions', 'Quiz soruları', content.quizQuestions.length], ['seasons', 'Keşif sezonları', content.seasons.length]];
  function download() {
    const url = URL.createObjectURL(new Blob([serializeOverrides(content.overrides)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'esik-yerel-icerik.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function upload(file: File) {
    setError('');
    if (file.size > 2 * 1024 * 1024) { setError('Dosya 2 MB sınırını aşıyor.'); return; }
    const parsed = parseOverrides(await file.text(), baseContent);
    if (!Object.keys(parsed.overrides).length) { setError('Dosyada geçerli bir EŞİK içerik kaydı bulunamadı.'); return; }
    content.replace(parsed.overrides); onReplaced(); notify('Yerel içerik dosyadan yüklendi.');
  }
  return <div className="admin-stack">
    <table className="admin-table"><thead><tr><th scope="col">İçerik</th><th scope="col">Durum</th><th scope="col">Kayıt</th></tr></thead><tbody>{rows.map(([key, label, count]) => <tr key={key}><th scope="row">{label}</th><td>{content.overrides[key] ? <span className="admin-badge">Yerel olarak düzenlendi</span> : 'Varsayılan'}</td><td>{count}</td></tr>)}</tbody></table>
    <Actions><button className="button dark" onClick={download} disabled={!Object.keys(content.overrides).length}><Download size={17} /> Düzenlemeleri indir</button>
      <label className="button upload-button"><FileUp size={17} /> JSON dosyası yükle<input type="file" accept="application/json,.json" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload(file); }} /></label>
      <button className="text-link danger" disabled={!Object.keys(content.overrides).length} onClick={() => { if (window.confirm('Tüm yerel içerik düzenlemeleri silinsin mi? Keşif pasaportun etkilenmez.')) { content.reset(); onReplaced(); notify('İçerik varsayılan koleksiyona döndü.'); } }}><RotateCcw size={15} /> Tümünü varsayılana döndür</button></Actions>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="admin-help">Dosya yalnızca bu tarayıcıda okunur; hiçbir sunucuya gönderilmez. Pasaport ve madalyon ilerlemesi ayrı tutulur.</p>
  </div>;
}

export function Admin() {
  const { readOnly } = useContent();
  if (readOnly && vakifApiEnabled()) {
    // The backend's works are managed in the admin panel (../admin), a separate app with its own sign-in.
    const panel = String(import.meta.env.VITE_ADMIN_URL ?? '').trim() || 'http://127.0.0.1:5174';
    return <Scene><div className="page-shell empty-state"><h1>Eserler yönetim panelinden düzenlenir.</h1><p>Bu koleksiyon arka uçtan gelir. Eserleri, fotoğrafları, anlatımları ve konumları yönetim panelinde düzenleyebilirsin; panel yönetici anahtarı ister.</p><a className="button dark" href={panel}>Yönetim paneline git</a></div></Scene>;
  }
  return readOnly ? <Scene><div className="page-shell empty-state"><h1>Bu koleksiyon salt okunur.</h1><p>Bu koleksiyondaki eserler yerel yönetim panelinden düzenlenemez.</p><Link className="button dark" to="/kesfet">Eserleri keşfet</Link></div></Scene> : <LocalAdmin />;
}

function LocalAdmin() {
  const [tab, setTab] = useState<Tab>('artifacts');
  const [epoch, setEpoch] = useState(0);
  const tabList = useRef<HTMLDivElement>(null);
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex(([id]) => id === tab);
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setTab(tabs[next][0]);
    tabList.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }
  const panel = { artifacts: <ArtifactsPanel />, quiz: <QuizPanel />, seasons: <SeasonsPanel />, achievements: <AchievementsPanel />, data: <DataPanel onReplaced={() => setEpoch(e => e + 1)} /> }[tab];
  return <Scene><div className="page-shell admin-page">
    <PageHeading kicker="YEREL DEMO YÖNETİM PANELİ" title={<>Koleksiyonu <em>düzenle.</em></>}>Eserleri, hikâye metinlerini, quiz sorularını ve keşif sezonlarını bu tarayıcıda dene.</PageHeading>
    <div className="demo-notice admin-notice"><ShieldAlert size={22} /><div><strong>Sunucu, hesap veya yetkilendirme yok</strong><p>Bu panel bir prototiptir. Değişiklikler yalnızca bu tarayıcının yerel deposuna kaydedilir ve başka ziyaretçilere ulaşmaz. Gerçek kullanım için sunucu, veritabanı ve yetkili kullanıcı girişi gerekir.</p></div></div>
    <div className="admin-tabs" role="tablist" aria-label="Yönetim bölümleri" ref={tabList} onKeyDown={keys}>{tabs.map(([id, label]) => <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls={`panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>{label}</button>)}</div>
    <div className="admin-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} key={`${tab}-${epoch}`}>{panel}</div>
  </div></Scene>;
}
