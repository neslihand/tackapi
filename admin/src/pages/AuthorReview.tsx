// Yazar metinleri (editör tarafı): yazarlar kendi panelinde (../yazar-paneli) yazar; editör burada gönderilen metni okur,
// notlarla karşılaştırır, onaylar ya da düzeltme ister. Editör yazarın metnini ve notlarını değiştirmez.
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, BookMarked, Check, ClipboardCopy, GitCompareArrows, KeyRound, Lightbulb, Pencil, Plus, UserRoundCheck, UserRoundX } from 'lucide-react';
import { authorApi, CERTAINTY_LABELS, paragraphsOf, segments, TOPIC_LABELS, WORK_STATUS_LABELS, type AuthorAccount, type AuthorWorkRow,
  type WorkDetail, type WorkStatus } from '../lib/author';
import { formatDate } from '../lib/format';
import { Link } from '../lib/navigation';
import { Field, PageHead, useLoad, useToast } from '../components/UI';

export function WorkStatusBadge({ value }: { value: WorkStatus }) {
  return <span className={`status author-${value}`}>{WORK_STATUS_LABELS[value]}</span>;
}

// ---------------------------------------------------------------------------------------------- liste
export function AuthorWorksPage() {
  const [status, setStatus] = useState<WorkStatus | ''>('submitted');
  const list = useLoad(() => authorApi.works(status), [status]);
  const data = list.data;
  const tabs: [WorkStatus | '', string][] = [['submitted', 'Onay bekleyen'], ['changes', 'Düzeltmede'], ['approved', 'Onaylanan'], ['', 'Bütün dosyalar']];
  return <>
    <PageHead kicker="YAZAR PANELİ" title="Yazar metinleri" actions={<Link className="button line" to="/yazarlar"><KeyRound size={16} /> Yazar hesapları</Link>}>
      Envanter yazarları metinlerini kendi panellerinde (<code>/yazar/</code>) yazar ve editöre gönderir. Burada metni notlarla karşılaştırıp onaylar ya da düzeltme istersiniz.
    </PageHead>
    {data && !data.enabled ? <div className="empty-panel"><strong>Yazar paneli henüz açılmadı.</strong>Veritabanına yeni tablolar eklenmeli: <code>python migrate.py --apply</code> (göç 018).</div> : <>
      <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k || 'all'} role="tab" aria-selected={status === k} onClick={() => setStatus(k)}>
        {l}{k && data?.counts[k] ? <small>{data.counts[k]}</small> : null}</button>)}</div>
      {list.error && <p className="form-error" role="alert">{list.error}</p>}
      {!data ? <p role="status">Yükleniyor…</p> : !data.items.length ? <div className="empty">Bu listede dosya yok.</div>
        : <ul className="author-works">{data.items.map(w => <WorkRow key={w.id} w={w} />)}</ul>}
    </>}
  </>;
}

function WorkRow({ w }: { w: AuthorWorkRow }) {
  return <li><Link to={`/yazar-metni/${w.id}`} className="author-work-card">
    <span className="author-work-icon" aria-hidden="true"><BookMarked size={20} /></span>
    <span className="author-work-main"><strong>{w.title}</strong><small>{[w.author, w.city_tr, w.monument_tr ? `kayıt: ${w.monument_tr}` : null].filter(Boolean).join(' · ')}</small></span>
    <span className="author-work-counts"><span><b>{w.notes}</b> not</span><span><b>{w.sources}</b> kaynak</span></span>
    <span className="author-work-status"><WorkStatusBadge value={w.status} /><small>{formatDate(w.status === 'submitted' ? w.submitted_at : w.updated_at)}</small></span>
  </Link></li>;
}

// ---------------------------------------------------------------------------------------------- tek metin
export function AuthorWorkReview({ id }: { id: number }) {
  const notify = useToast();
  const load = useLoad(() => authorApi.work(id), [id]);
  const [d, setD] = useState<WorkDetail | null>(null);
  const [view, setView] = useState<'final' | 'refs'>('final');
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [flash, setFlash] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = d ?? load.data;
  const notesByNo = useMemo(() => new Map((cur?.notes ?? []).map(n => [n.no, n])), [cur?.notes]);
  const sources = useMemo(() => new Map((cur?.sources ?? []).map(s => [s.id, s])), [cur?.sources]);
  if (load.error) return <><Back /><p className="form-error" role="alert">{load.error}</p></>;
  if (!cur) return <p role="status">Yükleniyor…</p>;
  const w = cur.work, draft = cur.draft;

  async function decide(decision: 'approved' | 'changes') {
    setBusy(true);
    try { setD(await authorApi.review(w.id, decision, decision === 'changes' ? note.trim() : undefined)); setAsking(false);
      notify(decision === 'approved' ? 'Metin onaylandı; yazar panelinde görecek.' : 'Düzeltme isteği yazara iletildi.'); }
    catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText((await authorApi.exportText(w.id)).text); notify('Kaynakçalı metin panoya kopyalandı.'); }
    catch (e) { notify((e as Error).message, true); }
  }
  function showNote(no: number) {
    setFlash(no);
    requestAnimationFrame(() => document.getElementById(`note-${no}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    setTimeout(() => setFlash(f => (f === no ? null : f)), 2400);
  }

  return <>
    <Back />
    <PageHead kicker={`YAZAR METNİ${w.city_tr ? ` · ${w.city_tr.toLocaleUpperCase('tr-TR')}` : ''}`} title={w.title}
      actions={<><WorkStatusBadge value={w.status} />{w.monument && <Link className="text-link" to={`/eser/${w.monument}`}>Sistemdeki kayıt</Link>}</>}>
      {w.author} · {cur.notes.length} not · {cur.sources.length} kaynak · {w.submitted_at ? `gönderim ${formatDate(w.submitted_at)}` : `son değişiklik ${formatDate(w.updated_at)}`}
    </PageHead>

    {w.status === 'submitted' ? <div className="author-banner" role="status"><Check size={18} /><div>
      <strong>Onayınızı bekliyor</strong><p>Metni notlarla karşılaştırın; onaylayın ya da yazara ne düzeltmesi gerektiğini yazın.</p>
      {asking ? <div className="author-review-form">
        <Field label="Yazara not (ne düzeltilmeli?)"><textarea rows={3} maxLength={1000} autoFocus value={note} onChange={e => setNote(e.target.value)} /></Field>
        <div className="admin-actions"><button className="button dark small" disabled={busy || note.trim().length < 3} onClick={() => decide('changes')}>Düzeltme iste</button>
          <button className="text-link" onClick={() => setAsking(false)}>Vazgeç</button></div></div>
        : <div className="admin-actions"><button className="button gold small" disabled={busy || !draft} onClick={() => decide('approved')}><Check size={15} /> Onayla</button>
          <button className="button line small" disabled={busy} onClick={() => setAsking(true)}><Pencil size={14} /> Düzeltme iste</button></div>}
    </div></div>
      : w.review_note ? <div className={`author-banner ${w.status === 'changes' ? 'warn' : 'ok'}`}><AlertTriangle size={18} /><div>
        <strong>{w.status === 'changes' ? 'Düzeltme istendi' : 'Son değerlendirme'}</strong><small> · {w.reviewed_by}, {formatDate(w.reviewed_at)}</small><p>{w.review_note}</p></div></div>
      : w.status !== 'approved' && <p className="admin-help" style={{ marginBottom: 16 }}>Yazar bu metni henüz editöre göndermedi; aşağıda son kaydettiği sürüm görünüyor.</p>}

    <div className="author-layout review">
      <section className="author-draft" aria-label="Metin">
        <div className="author-draft-head"><h2>Eser hakkında</h2>
          {draft && <small>{draft.ai ? 'Yapay zekâ taslağı' : draft.length ? 'Notlar birleştirildi' : 'Yazar sürümü'} · {formatDate(draft.created_at)}</small>}</div>
        {!draft ? <div className="empty">Henüz taslak yok.</div> : <>
          {(draft.warnings.length > 0 || draft.conflicts.length > 0 || draft.gaps.length > 0) && <div className="author-checks"><ul style={{ paddingTop: 10 }}>
            {draft.warnings.map((x, i) => <li key={`w${i}`} className={`author-check ${x.kind === 'template' ? 'info' : 'warn'}`}><AlertTriangle size={15} /><span>{x.text}</span></li>)}
            {draft.conflicts.map((c, i) => <li key={`c${i}`} className="author-check conflict"><GitCompareArrows size={15} /><span><strong>Çelişki: {c.about}</strong> {c.detail}
              {c.notes.map(no => <button key={no} className="author-ref" onClick={() => showNote(no)}>N{no}</button>)}</span></li>)}
            {draft.gaps.map((g, i) => <li key={`g${i}`} className="author-check gap"><Lightbulb size={15} /><span>Eksik: {g}</span></li>)}
          </ul></div>}
          <div className="writer-bar"><div className="segmented" role="tablist" aria-label="Görünüm">
            <button role="tab" aria-selected={view === 'final'} onClick={() => setView('final')}>Kaynakçalı</button>
            <button role="tab" aria-selected={view === 'refs'} onClick={() => setView('refs')}>Notlarla</button></div>
            <button className="button line small" onClick={copy}><ClipboardCopy size={15} /> Kopyala</button></div>
          {view === 'final' ? <div className="author-read final">{paragraphsOf(draft.rendered ?? '').map((p, i) => <p key={i}>{p}</p>)}
            {draft.refs && draft.refs.length > 0 && <><h3>Kaynakça</h3><ul>{cur.sources.filter(s => draft.refs!.some(no => notesByNo.get(no)?.source_id === s.id))
              .sort((a, b) => a.entry.localeCompare(b.entry, 'tr')).map(s => <li key={s.id}>{s.entry}</li>)}</ul></>}</div>
            : <div className="author-read">{paragraphsOf(draft.body).map((p, i) => <p key={i}>{segments(p).map((s, j) => 'text' in s ? <span key={j}>{s.text}</span>
              : <span key={j} className="author-cites">{s.refs.map(no => { const n = notesByNo.get(no);
                return <button key={no} className={`author-ref ${n ? '' : 'bad'}`} onClick={() => n && showNote(no)} title={n?.body ?? 'Bu numarada not yok'}>N{no}</button>; })}</span>)}</p>)}</div>}
        </>}
      </section>
      <section className="author-research" aria-label="Yazarın notları">
        <h2 className="section-title">Yazarın notları ({cur.notes.length})</h2>
        {cur.coverage.missing.length > 0 && <p className="admin-help author-missing"><Lightbulb size={14} /> Notu olmayan başlıklar: {cur.coverage.missing.join(', ')}.</p>}
        <ol className="author-note-list">{cur.notes.map(n => { const src = n.source_id ? sources.get(n.source_id) : undefined;
          return <li key={n.id} id={`note-${n.no}`} className={`author-note ${flash === n.no ? 'flash' : ''}`}>
            <div className="author-note-head"><span className="author-ref">N{n.no}</span><span className="author-note-topic">{TOPIC_LABELS[n.topic]}</span>
              <span className={`author-cert ${n.certainty}`}>{CERTAINTY_LABELS[n.certainty]}</span>{n.origin === 'book' && <span className="agent-flag muted">envanterden</span>}</div>
            <p>{n.body}</p><small className={src ? '' : 'author-nosource'}>{src ? `${src.label}${n.pages ? `, s. ${n.pages}` : ''}` : n.certainty === 'own' ? 'Kaynaksız: yazarın kendi bilgisi' : 'Kaynak seçilmedi'}</small>
          </li>; })}</ol>
      </section>
    </div>
  </>;
}

const Back = () => <Link className="text-link back-link" to="/yazar-metinleri"><ArrowLeft size={15} /> Yazar metinleri</Link>;

// ---------------------------------------------------------------------------------------------- hesaplar
export function AuthorAccountsPage() {
  const notify = useToast();
  const list = useLoad(() => authorApi.accounts(), []);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ name: string; email: string; password: string } | null>(null);
  async function run(job: () => Promise<unknown>, message: string) {
    setBusy(true);
    try { await job(); notify(message); list.reload(); } catch (e) { notify((e as Error).message, true); } finally { setBusy(false); }
  }
  const panelUrl = `${window.location.origin}/yazar/`;
  return <>
    <Link className="text-link back-link" to="/yazar-metinleri"><ArrowLeft size={15} /> Yazar metinleri</Link>
    <PageHead kicker="YAZAR PANELİ" title="Yazar hesapları">
      Yazarlar yönetim paneline giremez; kendi panellerinde ({panelUrl}) e-posta ve şifreyle çalışır ve yalnızca kendi dosyalarını görür.
      Hesabı siz açarsınız, geçici şifreyi yazara iletirsiniz; yazar ilk girişte kendi şifresini belirler. Çalışma bitince hesabı kapatın, dosyalar kalır.
    </PageHead>
    {issued && <div className="author-banner ok" role="status"><KeyRound size={18} /><div>
      <strong>{issued.name} için geçici şifre</strong>
      <p>E-posta: <code>{issued.email}</code> · Şifre: <code className="author-temp">{issued.password}</code></p>
      <small>Bu şifre yalnızca şimdi gösterilir; yazara güvenli bir yoldan iletin. Panel adresi: {panelUrl}</small>
      <div className="admin-actions"><button className="text-link" onClick={() => setIssued(null)}>Kapat</button></div></div></div>}
    <section className="side-card author-new"><h2>Yeni yazar hesabı</h2>
      <div className="admin-grid">
        <Field label="Ad (künyede görüneceği gibi)"><input maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Prof. Dr. …" /></Field>
        <Field label="E-posta"><input type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></Field>
      </div>
      <div className="admin-actions"><button className="button dark" disabled={busy || name.trim().length < 3 || !email.includes('@')} onClick={() => run(async () => {
        const r = await authorApi.createAccount(name.trim(), email.trim());
        setIssued({ name: r.name, email: r.email, password: r.temp_password }); setName(''); setEmail('');
      }, 'Yazar hesabı açıldı.')}><Plus size={16} /> Hesap aç</button></div>
    </section>
    {list.error && <p className="form-error" role="alert">{list.error}</p>}
    {!list.data ? <p role="status">Yükleniyor…</p> : !list.data.length ? <div className="empty">Henüz yazar hesabı yok.</div>
      : <table className="admin-table"><thead><tr><th>Yazar</th><th>Dosya</th><th>Son giriş</th><th>Durum</th><th><span className="sr-only">İşlemler</span></th></tr></thead>
        <tbody>{list.data.map((a: AuthorAccount) => <tr key={a.id}>
          <td><strong>{a.name}</strong><br /><small>{a.email}</small></td>
          <td>{a.works}</td>
          <td>{a.last_login_at ? formatDate(a.last_login_at) : a.must_change ? 'Henüz giriş yapmadı' : '—'}</td>
          <td>{a.active ? <span className="status published">Açık</span> : <span className="status rejected">Kapalı</span>}</td>
          <td className="admin-actions">
            <button className="text-link" disabled={busy} onClick={() => { if (confirm(`${a.name} için yeni geçici şifre üretilsin mi? Eski şifre ve açık oturumlar geçersiz olur.`))
              run(async () => { const r = await authorApi.resetPassword(a.id); setIssued({ name: r.name, email: r.email, password: r.temp_password }); }, 'Yeni geçici şifre üretildi.'); }}>
              <KeyRound size={14} /> Şifre sıfırla</button>
            <button className={`text-link ${a.active ? 'danger' : ''}`} disabled={busy} onClick={() => run(() => authorApi.updateAccount(a.id, { active: !a.active }),
              a.active ? 'Hesap kapatıldı; dosyaları duruyor.' : 'Hesap yeniden açıldı.')}>
              {a.active ? <><UserRoundX size={14} /> Kapat</> : <><UserRoundCheck size={14} /> Aç</>}</button>
          </td></tr>)}</tbody></table>}
  </>;
}
