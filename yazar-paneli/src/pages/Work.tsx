import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, BookOpen, Check, ClipboardCopy, Download, GitCompareArrows, History, Lightbulb, Lock,
  NotebookPen, Pencil, Plus, RotateCcw, Save, Send, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { authorApi, CERTAINTY_LABELS, LENGTH_LABELS, paragraphsOf, segments, SOURCE_KIND_LABELS, STATUS_STEPS, STYLE_LABELS, TOPIC_LABELS, TOPICS,
  wordsOf, type AuthorNote, type AuthorSource, type Certainty, type DraftLength, type DraftStyle, type SourceFields, type SourceKind, type Topic,
  type WorkDetail, formatDate, CORE_TOPICS } from '../lib/author';
import { Link, navigate } from '../lib/navigation';
import { Field, PageHead, useToast } from '../components/UI';
import { WorkStatusBadge } from './Works';

const CORE = CORE_TOPICS;

export function AuthorWorkPage({ id }: { id: number }) {
  const [d, setD] = useState<WorkDetail | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { authorApi.work(id).then(setD).catch((e: Error) => setError(e.message)); }, [id]);
  if (error) return <><BackLink /><p className="form-error" role="alert">{error}</p></>;
  if (!d) return <p role="status">Dosya yükleniyor…</p>;
  return <Workspace d={d} setD={setD} />;
}

const BackLink = () => <Link className="text-link back-link" to="/"><ArrowLeft size={15} /> Yazım dosyalarım</Link>;

function Workspace({ d, setD }: { d: WorkDetail; setD: (d: WorkDetail) => void }) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'notes' | 'sources'>('notes');
  const [filter, setFilter] = useState<Topic | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const w = d.work;
  const locked = w.status === 'submitted';
  const sources = useMemo(() => new Map(d.sources.map(s => [s.id, s])), [d.sources]);

  /** İsteği çalıştırır, dönen dosyayı ekrana koyar. Başarıda true döner. */
  async function run(job: () => Promise<WorkDetail | void>, message?: string): Promise<boolean> {
    setBusy(true);
    try { const r = await job(); if (r) setD(r); if (message) notify(message); return true; }
    catch (e) { notify((e as Error).message, true); return false; }
    finally { setBusy(false); }
  }
  // Taslaktaki atfa tıklanınca not listesinde o notu gösterir
  function showNote(no: number) {
    setTab('notes'); setFilter(null); setFlash(no);
    requestAnimationFrame(() => document.getElementById(`note-${no}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    setTimeout(() => setFlash(f => (f === no ? null : f)), 2400);
  }
  const step = w.status === 'changes' ? 1 : STATUS_STEPS.findIndex(s => s.key === w.status);

  return <>
    <BackLink />
    <PageHead kicker={`YAZIM DOSYASI${w.city ? ` · ${w.city.toLocaleUpperCase('tr-TR')}` : ''}`} title={w.title} actions={<>
      <WorkStatusBadge value={w.status} />
    </>}>
      {d.notes.length} not · {d.sources.length} kaynak · son değişiklik {formatDate(w.updated_at)}
    </PageHead>
    <ol className="author-stepper" aria-label="Dosyanın aşaması">{STATUS_STEPS.map((s, i) =>
      <li key={s.key} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
        <span>{i < step ? <Check size={13} /> : i + 1}</span>{s.key === 'writing' && w.status === 'changes' ? 'Düzeltme' : s.label}</li>)}</ol>
    <ReviewBanner d={d} busy={busy} run={run} />

    <div className="author-layout">
      <section className="author-research" aria-label="Araştırma">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}><NotebookPen size={15} /> Notlar<small>{d.notes.length}</small></button>
          <button role="tab" aria-selected={tab === 'sources'} onClick={() => setTab('sources')}><BookOpen size={15} /> Kaynakça<small>{d.sources.length}</small></button>
        </div>
        {tab === 'notes' ? <NotesPanel d={d} sources={sources} busy={busy} run={run} filter={filter} setFilter={setFilter} flash={flash} />
          : <SourcesPanel d={d} busy={busy} run={run} />}
      </section>
      <DraftPanel d={d} busy={busy} setBusy={setBusy} run={run} locked={locked} showNote={showNote} sources={sources} />
    </div>

    {w.status !== 'submitted' && w.status !== 'approved' && <section className="side-card danger-zone author-danger"><button className="text-link danger" disabled={busy} onClick={() => {
      if (confirm(`“${w.title}” dosyası notları, kaynakçası ve taslak sürümleriyle birlikte kalıcı olarak silinsin mi?`))
        run(() => authorApi.remove(w.id), 'Dosya silindi.').then(ok => ok && navigate('/'));
    }}><Trash2 size={14} /> Dosyayı sil</button></section>}
  </>;
}

type Run = (job: () => Promise<WorkDetail | void>, message?: string) => Promise<boolean>;

function ReviewBanner({ d, busy, run }: { d: WorkDetail; busy: boolean; run: Run }) {
  const w = d.work;
  if (w.status === 'changes') return <div className="author-banner warn" role="status"><AlertTriangle size={18} />
    <div><strong>Editörünüz düzeltme istedi</strong>{w.reviewed_by && <small> · {formatDate(w.reviewed_at)}</small>}<p>{w.review_note}</p>
      <small>Metni düzelttikten sonra yeniden editöre gönderebilirsiniz.</small></div></div>;
  if (w.status === 'approved') return <div className="author-banner ok" role="status"><Check size={18} />
    <div><strong>Metniniz onaylandı</strong>{w.reviewed_at && <small> · {formatDate(w.reviewed_at)}</small>}{w.review_note && <p>{w.review_note}</p>}
      <small>Değiştirip kaydederseniz dosya yeniden yazım aşamasına döner ve tekrar onay gerekir.</small></div></div>;
  if (w.status !== 'submitted') return null;
  return <div className="author-banner" role="status"><Lock size={18} />
    <div><strong>Metniniz editörde</strong><small> · {formatDate(w.submitted_at)}</small>
      <p>Editörünüz değerlendirene kadar taslak kilitli. Notlarınızı eklemeye devam edebilirsiniz.</p>
      <div className="admin-actions"><button className="text-link" disabled={busy} onClick={() => run(() => authorApi.withdraw(w.id), 'Gönderim geri çekildi; taslağı düzenleyebilirsiniz.')}>
        <Undo2 size={14} /> Gönderimi geri çek</button></div>
    </div></div>;
}

// ---------------------------------------------------------------------------------------------- notlar
type NoteDraft = { body: string; topic: Topic; source_id: number | null; pages: string; certainty: Certainty };
const emptyNote = (topic: Topic | null, source: number | null): NoteDraft => ({ body: '', topic: topic ?? 'other', source_id: source, pages: '', certainty: source ? 'documented' : 'own' });

function NotesPanel({ d, sources, busy, run, filter, setFilter, flash }: { d: WorkDetail; sources: Map<number, AuthorSource>; busy: boolean; run: Run;
  filter: Topic | null; setFilter: (t: Topic | null) => void; flash: number | null }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [bulk, setBulk] = useState(false);
  const [lastSource, setLastSource] = useState<number | null>(null);
  const w = d.work;
  const shown = filter ? d.notes.filter(n => n.topic === filter) : d.notes;
  const counts = Object.fromEntries(d.coverage.topics.map(t => [t.topic, t.notes])) as Record<Topic, number>;
  return <div className="author-notes">
    <div className="author-coverage" role="group" aria-label="Konulara göre notlar (eksik başlıklar işaretli)">
      <button className={`author-topic ${!filter ? 'on' : ''}`} onClick={() => setFilter(null)}>Hepsi <b>{d.notes.length}</b></button>
      {TOPICS.map(t => <button key={t} className={`author-topic ${filter === t ? 'on' : ''} ${CORE.includes(t) && !counts[t] ? 'missing' : ''}`}
        onClick={() => setFilter(filter === t ? null : t)} title={CORE.includes(t) && !counts[t] ? 'Bu başlıkta henüz not yok' : undefined}>
        {TOPIC_LABELS[t]} <b>{counts[t] || '—'}</b></button>)}
    </div>
    {d.notes.length > 0 && d.coverage.missing.length > 0 && <p className="admin-help author-missing"><Lightbulb size={14} /> Notu olmayan başlıklar: {d.coverage.missing.join(', ')}.
      Taslak bu başlıklarda bir şey yazmaz; bilginiz varsa not olarak ekleyin.</p>}

    <div className="author-add">
      <div className="segmented" role="group" aria-label="Not ekleme biçimi">
        <button aria-pressed={!bulk} onClick={() => setBulk(false)}>Tek not</button>
        <button aria-pressed={bulk} onClick={() => setBulk(true)}>Toplu yapıştır</button></div>
    </div>
    <NoteForm key={`${bulk}-${d.notes.length}`} bulk={bulk} sources={d.sources} busy={busy} initial={emptyNote(filter, lastSource)}
      submitLabel={bulk ? 'Notlara böl ve ekle' : 'Notu ekle'} onSubmit={(n) => {
        setLastSource(n.source_id);
        return bulk ? run(() => authorApi.addNotesBulk(w.id, { text: n.body, topic: n.topic, source_id: n.source_id, pages: n.pages || null, certainty: n.certainty })
          .then(r => r), 'Notlar eklendi.')
          : run(() => authorApi.addNote(w.id, { ...n, pages: n.pages || null }), 'Not eklendi.');
      }} />

    {!d.notes.length ? <div className="empty">Henüz not yok. Okuduğunuz kaynaktan, kitâbeden ya da saha gözleminizden ilk notunuzu yazın;
      kaynakçaya eklediğiniz kaynağı seçerseniz atıf kendiliğinden oluşur.</div>
      : <ol className="author-note-list">{shown.map(n => editing === n.id
        ? <li key={n.id} id={`note-${n.no}`} className="author-note editing">
          <NoteForm sources={d.sources} busy={busy} submitLabel="Kaydet" onCancel={() => setEditing(null)}
            initial={{ body: n.body, topic: n.topic, source_id: n.source_id, pages: n.pages ?? '', certainty: n.certainty }}
            onSubmit={v => run(() => authorApi.updateNote(n.id, { ...v, pages: v.pages || null }), 'Not güncellendi.').then(ok => { if (ok) setEditing(null); return ok; })} /></li>
        : <NoteCard key={n.id} n={n} source={n.source_id ? sources.get(n.source_id) : undefined} flash={flash === n.no} busy={busy}
          onEdit={() => setEditing(n.id)} onDelete={() => { if (confirm(`N${n.no} silinsin mi? Taslaktaki [N${n.no}] atfı denetimde uyarı verir.`)) run(() => authorApi.deleteNote(n.id), 'Not silindi.'); }} />)}
        {!shown.length && <li className="empty">Bu başlıkta not yok.</li>}</ol>}
  </div>;
}

function NoteCard({ n, source, flash, busy, onEdit, onDelete }: { n: AuthorNote; source?: AuthorSource; flash: boolean; busy: boolean; onEdit: () => void; onDelete: () => void }) {
  return <li id={`note-${n.no}`} className={`author-note ${flash ? 'flash' : ''}`}>
    <div className="author-note-head">
      <span className="author-ref">N{n.no}</span>
      <span className="author-note-topic">{TOPIC_LABELS[n.topic]}</span>
      <span className={`author-cert ${n.certainty}`}>{CERTAINTY_LABELS[n.certainty]}</span>
      <span className="author-note-actions">
        <button className="icon-button" disabled={busy} onClick={onEdit} aria-label={`N${n.no} notunu düzenle`}><Pencil size={15} /></button>
        <button className="icon-button" disabled={busy} onClick={onDelete} aria-label={`N${n.no} notunu sil`}><Trash2 size={15} /></button></span>
    </div>
    <p>{n.body}</p>
    <small className={source ? '' : 'author-nosource'}>{source ? `${source.label}${n.pages ? `, s. ${n.pages}` : ''}` : n.certainty === 'own' ? 'Kaynaksız: yazarın kendi bilgisi' : 'Kaynak seçilmedi'}</small>
  </li>;
}

function NoteForm({ initial, sources, busy, bulk = false, submitLabel, onSubmit, onCancel }: { initial: NoteDraft; sources: AuthorSource[]; busy: boolean; bulk?: boolean;
  submitLabel: string; onSubmit: (n: NoteDraft) => Promise<boolean>; onCancel?: () => void }) {
  const [n, setN] = useState<NoteDraft>(initial);
  const set = <K extends keyof NoteDraft>(k: K, v: NoteDraft[K]) => setN(p => ({ ...p, [k]: v }));
  const ok = n.body.trim().length >= 3;
  const submit = () => { if (ok && !busy) onSubmit({ ...n, body: n.body.trim() }).then(done => { if (done && !onCancel) setN({ ...initial, body: '' }); }); };
  return <div className="author-note-form">
    <label className="admin-field"><span className="sr-only">{bulk ? 'Yapıştırılacak notlar' : 'Not'}</span>
      <textarea rows={bulk ? 7 : 3} maxLength={bulk ? 60000 : 4000} value={n.body} onChange={e => set('body', e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
        placeholder={bulk ? 'Word’den ya da defterinizden notlarınızı yapıştırın. Boş satırla ayrılan her paragraf ayrı bir not olur; seçtiğiniz konu, kaynak ve sayfa hepsine uygulanır.'
          : 'Notunuz… (ör. “Kapı üzerindeki kitâbeye göre yapı H. 830’da tamamlanmıştır.”)'} /></label>
    <div className="author-note-meta">
      <Field label="Konu"><select value={n.topic} onChange={e => set('topic', e.target.value as Topic)}>{TOPICS.map(t => <option key={t} value={t}>{TOPIC_LABELS[t]}</option>)}</select></Field>
      <Field label="Kaynak"><select value={n.source_id ?? ''} onChange={e => { const v = e.target.value ? Number(e.target.value) : null;
        setN(p => ({ ...p, source_id: v, certainty: v && p.certainty === 'own' ? 'documented' : !v && p.certainty === 'documented' ? 'own' : p.certainty })); }}>
        <option value="">Kaynaksız (kendi bilgim)</option>{sources.map(s => <option key={s.id} value={s.id}>{s.label} — {s.title.slice(0, 50)}</option>)}</select></Field>
      <Field label="Sayfa"><input maxLength={40} value={n.pages} onChange={e => set('pages', e.target.value)} placeholder="45–47" /></Field>
      <Field label="Kesinlik"><select value={n.certainty} onChange={e => set('certainty', e.target.value as Certainty)}>
        {(Object.keys(CERTAINTY_LABELS) as Certainty[]).map(c => <option key={c} value={c}>{CERTAINTY_LABELS[c]}</option>)}</select></Field>
    </div>
    <div className="admin-actions"><button className="button dark small" disabled={busy || !ok} onClick={submit}>{onCancel ? <Save size={14} /> : <Plus size={14} />} {submitLabel}</button>
      {onCancel ? <button className="text-link" onClick={onCancel}>Vazgeç</button> : <small className="admin-help">Ctrl + Enter ile de eklenir.</small>}</div>
  </div>;
}

// ---------------------------------------------------------------------------------------------- kaynakça
const emptySource: Required<SourceFields> = { kind: 'book', authors: '', year: '', title: '', publisher: '', url: '' };

function SourcesPanel({ d, busy, run }: { d: WorkDetail; busy: boolean; run: Run }) {
  const [editing, setEditing] = useState<number | 'new' | null>(d.sources.length ? null : 'new');
  return <div className="author-sources">
    <p className="admin-help">Notlara bağladığınız kaynaklar, taslağı dışa aktarırken metin içi atıfa (“Ayverdi 1972: 45”) ve kaynakçaya dönüşür.</p>
    {editing === 'new' ? <SourceForm busy={busy} initial={emptySource} onCancel={d.sources.length ? () => setEditing(null) : undefined}
      onSubmit={v => run(() => authorApi.addSource(d.work.id, v), 'Kaynak eklendi.').then(ok => { if (ok) setEditing(null); return ok; })} />
      : <button className="button line small" onClick={() => setEditing('new')}><Plus size={15} /> Kaynak ekle</button>}
    <ol className="author-source-list">{d.sources.map(s => <li key={s.id}>{editing === s.id
      ? <SourceForm busy={busy} initial={{ kind: s.kind, authors: s.authors ?? '', year: s.year ?? '', title: s.title, publisher: s.publisher ?? '', url: s.url ?? '' }}
        onCancel={() => setEditing(null)} onSubmit={v => run(() => authorApi.updateSource(s.id, v), 'Kaynak güncellendi.').then(ok => { if (ok) setEditing(null); return ok; })} />
      : <div className="author-source">
        <div><span className="author-source-label">{s.label}</span><span className="agent-flag muted">{SOURCE_KIND_LABELS[s.kind]}</span><small>{s.used} not</small></div>
        <p>{s.entry}</p>
        <span className="author-note-actions">
          <button className="icon-button" disabled={busy} onClick={() => setEditing(s.id)} aria-label={`${s.label} kaynağını düzenle`}><Pencil size={15} /></button>
          <button className="icon-button" disabled={busy} aria-label={`${s.label} kaynağını sil`} onClick={() => {
            if (confirm(`“${s.label}” silinsin mi?${s.used ? ` ${s.used} not kaynaksız kalacak (notlar silinmez).` : ''}`)) run(() => authorApi.deleteSource(s.id), 'Kaynak silindi.');
          }}><Trash2 size={15} /></button></span>
      </div>}</li>)}</ol>
  </div>;
}

function SourceForm({ initial, busy, onSubmit, onCancel }: { initial: Required<SourceFields>; busy: boolean; onSubmit: (v: SourceFields) => Promise<boolean>; onCancel?: () => void }) {
  const [s, setS] = useState(initial);
  const set = (k: keyof SourceFields, v: string) => setS(p => ({ ...p, [k]: v }));
  return <div className="author-source-form">
    <div className="admin-grid">
      <Field label="Tür"><select value={s.kind} onChange={e => set('kind', e.target.value as SourceKind)}>
        {(Object.keys(SOURCE_KIND_LABELS) as SourceKind[]).map(k => <option key={k} value={k}>{SOURCE_KIND_LABELS[k]}</option>)}</select></Field>
      <Field label="Yıl" hint="1972, H. 830 ya da t.y."><input maxLength={30} value={s.year} onChange={e => set('year', e.target.value)} /></Field>
      <Field label="Yazar(lar)" hint="Birden çok yazarı ; ile ayırın." wide><input maxLength={300} value={s.authors} onChange={e => set('authors', e.target.value)} placeholder="Ekrem Hakkı Ayverdi" /></Field>
      <Field label="Başlık" wide><input maxLength={400} value={s.title} onChange={e => set('title', e.target.value)} placeholder="Kitap, makale, belge ya da kitâbe adı" /></Field>
      <Field label="Yayınevi / dergi / arşiv fonu"><input maxLength={300} value={s.publisher} onChange={e => set('publisher', e.target.value)} /></Field>
      <Field label="Bağlantı"><input maxLength={500} value={s.url} onChange={e => set('url', e.target.value)} placeholder="https://…" /></Field>
    </div>
    <div className="admin-actions"><button className="button dark small" disabled={busy || s.title.trim().length < 2} onClick={() => onSubmit(s)}><Save size={14} /> Kaydet</button>
      {onCancel && <button className="text-link" onClick={onCancel}>Vazgeç</button>}</div>
  </div>;
}

// ---------------------------------------------------------------------------------------------- taslak
function DraftPanel({ d, busy, setBusy, run, locked, showNote, sources }: { d: WorkDetail; busy: boolean; setBusy: (b: boolean) => void; run: Run; locked: boolean;
  showNote: (no: number) => void; sources: Map<number, AuthorSource> }) {
  const notify = useToast();
  const draft = d.draft;
  const [text, setText] = useState(draft?.body ?? '');
  const [view, setView] = useState<'refs' | 'edit' | 'final'>('refs');
  const [length, setLength] = useState<DraftLength>('medium');
  const [style, setStyle] = useState<DraftStyle>('inventory');
  const [writing, setWriting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Yazılırken geçen süreyi göster: uzun beklemede düğme donmuş gibi görünmesin
  useEffect(() => {
    if (!writing) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [writing]);
  const saved = useRef(draft?.id);
  // Yeni bir sürüm geldiğinde (taslak yazıldı ya da kaydedildi) editörü onunla değiştir
  useEffect(() => { if (draft?.id !== saved.current) { saved.current = draft?.id; setText(draft?.body ?? ''); } }, [draft?.id, draft?.body]);
  const dirty = text.trim() !== (draft?.body ?? '').trim();
  const notesByNo = useMemo(() => new Map(d.notes.map(n => [n.no, n])), [d.notes]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function generate() {
    if (dirty && !confirm('Kaydedilmemiş değişiklikleriniz var. Yeni taslak bunların yerine geçecek (eski sürümler saklı kalır). Devam edilsin mi?')) return;
    setWriting(true);
    const ok = await run(() => authorApi.summarize(d.work.id, { length, style }));
    setWriting(false);
    if (ok) { setView('refs'); notify('Taslak hazır. Atıflara tıklayarak notlarınızla karşılaştırabilirsiniz.'); }
  }
  async function exportDraft(mode: 'copy' | 'download') {
    if (dirty) { notify('Önce değişiklikleri kaydedin; dışa aktarım kayıtlı sürümden yapılır.', true); return; }
    setBusy(true);
    try {
      const { text: out, filename } = await authorApi.exportText(d.work.id);
      if (mode === 'copy') { await navigator.clipboard.writeText(out); notify('Kaynakçalı metin panoya kopyalandı.'); }
      else {
        const url = URL.createObjectURL(new Blob([out], { type: 'text/markdown;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
      }
    } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  }
  async function openVersion(did: number) {
    if (dirty && !confirm('Kaydedilmemiş değişiklikleriniz kaybolacak. Eski sürüm açılsın mı?')) return;
    try { const v = await authorApi.version(d.work.id, did); setText(v.body); setView('edit'); notify('Eski sürüm metin kutusuna alındı; kaydederseniz yeni sürüm olur.'); }
    catch (e) { notify((e as Error).message, true); }
  }

  const words = wordsOf(text);
  return <section className="author-draft" aria-label="Taslak">
    <div className="author-draft-head"><h2><Sparkles size={18} /> Eser hakkında: taslak</h2>
      {draft && <small>{draft.ai ? `Yapay zekâ taslağı${draft.model ? ` (${draft.model})` : ''}` : draft.length ? 'Notların birleştirilmiş hâli (yapay zekâsız)' : 'Yazar sürümü'} · {draft.created_by} · {formatDate(draft.created_at)}</small>}</div>

    <div className="author-generate">
      <div className="segmented" role="group" aria-label="Uzunluk">{(Object.keys(LENGTH_LABELS) as DraftLength[]).map(l =>
        <button key={l} aria-pressed={length === l} onClick={() => setLength(l)}>{LENGTH_LABELS[l]}</button>)}</div>
      <div className="segmented" role="group" aria-label="Üslup">{(Object.keys(STYLE_LABELS) as DraftStyle[]).map(s =>
        <button key={s} aria-pressed={style === s} onClick={() => setStyle(s)}>{STYLE_LABELS[s]}</button>)}</div>
      <button className="button gold" disabled={busy || locked || !d.notes.length} onClick={generate}>
        <Sparkles size={16} /> {writing ? `Notlar birleştiriliyor… ${elapsed} sn` :draft ? 'Notlardan yeniden yaz' : 'Notlarımdan taslak yaz'}</button>
    </div>
    <p className="admin-help">Yapay zekâ yalnızca bu dosyadaki {d.notes.length} notunuzu kullanır; her cümlenin sonunda dayandığı not görünür. Notlarda olmayan yıl ve adlar
      işaretlenir, çelişen notlar çözülmeden listelenir.{d.fake ? ' Deneme modu: yapay zekâ kapalı, notlar konu sırasıyla birleştirilir.' : ''}</p>

    {!draft && !text ? <div className="empty">{d.notes.length ? 'Notlarınız hazırsa uzunluğu ve üslubu seçip “Notlarımdan taslak yaz”a basın. İsterseniz kendiniz de yazabilirsiniz.'
      : 'Taslak için önce not ekleyin.'}
      {d.notes.length > 0 && !locked && <div><button className="text-link" onClick={() => setView('edit')} style={{ marginTop: 10 }}>Boş sayfadan kendim yazacağım</button></div>}</div> : null}

    {draft && <Checks draft={draft} showNote={showNote} />}

    {(draft || text || view === 'edit') && <>
      <div className="writer-bar">
        <div className="segmented" role="tablist" aria-label="Görünüm">
          <button role="tab" aria-selected={view === 'refs'} onClick={() => setView('refs')}>Notlarla</button>
          <button role="tab" aria-selected={view === 'edit'} onClick={() => setView('edit')}>{locked ? 'Metin' : 'Düzenle'}</button>
          <button role="tab" aria-selected={view === 'final'} onClick={() => setView('final')}>Kaynakçalı</button></div>
        <small>{words.toLocaleString('tr-TR')} sözcük · {paragraphsOf(text).length} paragraf</small>
      </div>
      {view === 'edit' ? <label className="admin-field"><span className="sr-only">Taslak metni</span>
        <textarea className="writer-area author-area" value={text} readOnly={locked} onChange={e => setText(e.target.value)} spellCheck lang="tr"
          placeholder={'Paragrafları boş satırla ayırın. Atıf için cümle sonuna [N3] ya da [N3, N5] yazın.'} /></label>
        : view === 'refs' ? <div className="author-read">{paragraphsOf(text).map((p, i) => <p key={i}>{segments(p).map((s, j) => 'text' in s ? <span key={j}>{s.text}</span>
          : <span key={j} className="author-cites">{s.refs.map(no => { const n = notesByNo.get(no); const src = n?.source_id ? sources.get(n.source_id) : undefined;
            return <button key={no} className={`author-ref ${n ? '' : 'bad'}`} onClick={() => n && showNote(no)}
              title={n ? `${n.body}${src ? `\n— ${src.label}${n.pages ? `, s. ${n.pages}` : ''}` : ''}` : 'Bu numarada not yok'}>N{no}</button>; })}</span>)}</p>)}
          {!text.trim() && <p className="admin-help">Metin boş.</p>}</div>
        : <div className="author-read final">{dirty ? <p className="admin-help">Kaynakçalı görünüm kayıtlı sürümden hazırlanır; önce değişiklikleri kaydedin.</p>
          : <><FinalText text={draft?.rendered ?? ''} />
            {d.sources.some(s => s.used) && <><h3>Kaynakça</h3><ul>{d.sources.filter(s => draft?.refs?.some(no => notesByNo.get(no)?.source_id === s.id))
              .sort((a, b) => a.entry.localeCompare(b.entry, 'tr')).map(s => <li key={s.id}>{s.entry}</li>)}</ul></>}</>}</div>}

      <div className="author-draft-actions">
        {!locked && <button className="button dark" disabled={busy || !dirty || !text.trim()} onClick={() => run(() => authorApi.saveDraft(d.work.id, text), 'Yeni sürüm kaydedildi.')}>
          <Save size={16} /> {dirty ? 'Kaydet (yeni sürüm)' : 'Kaydedildi'}</button>}
        {dirty && !locked && <button className="text-link" onClick={() => setText(draft?.body ?? '')}><RotateCcw size={14} /> Değişiklikleri geri al</button>}
        <span className="author-spacer" />
        <button className="button line small" disabled={busy || !draft} onClick={() => exportDraft('copy')}><ClipboardCopy size={15} /> Kopyala</button>
        <button className="button line small" disabled={busy || !draft} onClick={() => exportDraft('download')}><Download size={15} /> İndir (.md)</button>
        {!locked && d.work.status !== 'approved' && <button className="button gold small" disabled={busy || !draft || dirty}
          title={dirty ? 'Önce kaydet' : undefined} onClick={() => { if (confirm('Kayıtlı son sürüm editörünüze gönderilsin mi? Değerlendirme bitene kadar taslak kilitlenir.'))
            run(() => authorApi.submit(d.work.id), 'Metin editöre gönderildi.'); }}><Send size={15} /> Editöre gönder</button>}
      </div>
    </>}

    {d.history.length > 1 && <details className="author-history"><summary><History size={15} /> Sürümler ({d.history.length})</summary>
      <ol>{d.history.map((v, i) => <li key={v.id}><span>{v.ai ? <Sparkles size={13} /> : <Pencil size={13} />} {v.ai ? `Yapay zekâ · ${v.length ? LENGTH_LABELS[v.length] : ''}` : v.length ? 'Notlar birleştirildi' : 'Yazar'}
        <small>{v.created_by} · {formatDate(v.created_at)} · {v.chars.toLocaleString('tr-TR')} karakter</small></span>
        {i === 0 ? <small>geçerli</small> : <button className="text-link" onClick={() => openVersion(v.id)}><GitCompareArrows size={14} /> Aç</button>}</li>)}</ol>
    </details>}
  </section>;
}

function FinalText({ text }: { text: string }) {
  return <>{paragraphsOf(text).map((p, i) => <p key={i}>{p}</p>)}</>;
}

function Checks({ draft, showNote }: { draft: NonNullable<WorkDetail['draft']>; showNote: (no: number) => void }) {
  const [open, setOpen] = useState(true);
  const items: ReactNode[] = [];
  draft.warnings.forEach((w, i) => items.push(<li key={`w${i}`} className={`author-check ${w.kind === 'template' ? 'info' : 'warn'}`}><AlertTriangle size={15} /><span>{w.text}</span></li>));
  draft.conflicts.forEach((c, i) => items.push(<li key={`c${i}`} className="author-check conflict"><GitCompareArrows size={15} />
    <span><strong>Çelişki: {c.about}</strong> {c.detail} {c.notes.map(no => <button key={no} className="author-ref" onClick={() => showNote(no)}>N{no}</button>)}</span></li>));
  draft.gaps.forEach((g, i) => items.push(<li key={`g${i}`} className="author-check gap"><Lightbulb size={15} /><span>Eksik: {g}</span></li>));
  if (!items.length) return <p className="author-allgood"><Check size={15} /> Denetim: her paragraf atıflı, notlarda olmayan yıl ya da ad bulunmadı.</p>;
  return <div className="author-checks">
    <button className="author-checks-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>Denetim ve öneriler ({items.length}) {open ? <X size={14} /> : null}</button>
    {open && <ul>{items}</ul>}
  </div>;
}
