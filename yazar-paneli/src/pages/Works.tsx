import { useState } from 'react';
import { BookMarked, FileText, NotebookPen, Plus, ScrollText, Send, Sparkles } from 'lucide-react';
import { authorApi, formatDate, WORK_STATUS_LABELS, type AuthorWorkRow, type Me, type WorkStatus } from '../lib/author';
import { Link, navigate } from '../lib/navigation';
import { Field, MonumentPicker, PageHead, useLoad, useToast } from '../components/UI';

export function WorkStatusBadge({ value }: { value: WorkStatus }) {
  return <span className={`status author-${value}`}>{WORK_STATUS_LABELS[value]}</span>;
}

const STEPS = [
  { icon: <NotebookPen size={18} />, title: 'Notlarınızı toplayın', text: 'Kaynak, sayfa ve kesinlikle; Word’den toplu yapıştırın ya da envanterdeki mevcut metni not olarak alın.' },
  { icon: <ScrollText size={18} />, title: 'Eksikleri görün', text: 'Konum, kitâbe, mimari, onarım… hangi başlıkta notunuz yok, tek bakışta.' },
  { icon: <Sparkles size={18} />, title: 'Taslağı yazdırın', text: 'Yapay zekâ yalnızca sizin notlarınızla yazar; her cümle dayandığı notu gösterir.' },
  { icon: <Send size={18} />, title: 'Düzenleyip gönderin', text: 'Atıflar kaynakçaya dönüşür; sürümler saklanır, editörünüz onaylar.' },
];

export function Works({ me }: { me: Me }) {
  const list = useLoad(() => authorApi.works(), []);
  const [creating, setCreating] = useState(false);
  const items = list.data?.items ?? [];
  const changes = items.filter(w => w.status === 'changes').length;
  return <>
    <PageHead kicker={me.name.toLocaleUpperCase('tr-TR')} title="Yazım dosyalarım" actions={<button className="button dark" onClick={() => setCreating(true)}><Plus size={16} /> Yeni yazım dosyası</button>}>
      Envanter kitabındaki “eser hakkında” bölümünü yazarken araştırma notlarınızı, kaynakçanızı ve taslağınızı tek yerde tutun.
    </PageHead>
    {(!items.length || creating) && <ol className="author-steps">{STEPS.map((s, i) => <li key={s.title}><span className="author-step-icon">{s.icon}</span>
      <div><strong>{i + 1}. {s.title}</strong><p>{s.text}</p></div></li>)}</ol>}
    {creating && <NewWork onClose={() => setCreating(false)} />}
    {changes > 0 && <p className="author-waiting warn"><Send size={14} /> Editörünüz {changes} dosyada düzeltme istedi.</p>}
    {list.error && <p className="form-error" role="alert">{list.error}</p>}
    {!list.data ? <p role="status">Yükleniyor…</p> : !items.length
      ? !creating && <div className="empty-panel"><strong>Henüz yazım dosyanız yok.</strong>Yazacağınız eser için bir dosya açın; notlarınızı oraya toplayın.
          <button className="button gold small" onClick={() => setCreating(true)}><Plus size={15} /> İlk dosyayı aç</button></div>
      : <ul className="author-works">{items.map(w => <WorkCard key={w.id} w={w} />)}</ul>}
  </>;
}

function WorkCard({ w }: { w: AuthorWorkRow }) {
  return <li><Link to={`/dosya/${w.id}`} className="author-work-card">
    <span className="author-work-icon" aria-hidden="true"><BookMarked size={20} /></span>
    <span className="author-work-main"><strong>{w.title}</strong>
      <small>{[w.city_tr, w.monument ? 'sistemdeki kayda bağlı' : null].filter(Boolean).join(' · ') || 'Şehir seçilmedi'}</small></span>
    <span className="author-work-counts"><span><b>{w.notes}</b> not</span><span><b>{w.sources}</b> kaynak</span><span><FileText size={13} /> {w.drafts ? `${w.drafts} sürüm` : 'taslak yok'}</span></span>
    <span className="author-work-status"><WorkStatusBadge value={w.status} /><small>{formatDate(w.updated_at)}</small></span>
  </Link></li>;
}

function NewWork({ onClose }: { onClose: () => void }) {
  const notify = useToast();
  const cities = useLoad(() => authorApi.cities(), []);
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [monument, setMonument] = useState<{ slug: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function create() {
    if (title.trim().length < 2) { setError('Eserin adını yazın.'); return; }
    setBusy(true);
    try {
      const d = await authorApi.create({ title: title.trim(), city: city || undefined, monument: monument?.slug });
      notify('Yazım dosyası açıldı.'); navigate(`/dosya/${d.work.id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="side-card author-new" aria-label="Yeni yazım dosyası">
    <h2>Yeni yazım dosyası</h2>
    <div className="admin-grid">
      <Field label="Eserin adı"><input autoFocus maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="ör. Muradiye Camii" /></Field>
      <Field label="Şehir"><select value={city} onChange={e => setCity(e.target.value)}><option value="">Seçilmedi</option>
        {(cities.data ?? []).map(c => <option key={c.slug} value={c.slug}>{c.name_tr}</option>)}</select></Field>
      <div className="wide"><MonumentPicker label="Sistemdeki eser kaydı (isteğe bağlı)" city={city || undefined} onPick={m => {
        setMonument({ slug: m.slug, name: m.name_tr }); if (!title.trim()) setTitle(m.name_tr); if (!city) setCity(m.city); }} />
        <small className="admin-help">{monument ? `Bağlanacak kayıt: ${monument.name}. Envanterdeki mevcut metnini tek tıkla not olarak alabilirsiniz.`
          : 'Yeni baskı ya da güncelleme yazıyorsanız eseri seçin; ilk kez yazılan eserlerde boş bırakın.'}</small></div>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-actions"><button className="button dark" disabled={busy} onClick={create}><Plus size={16} /> Dosyayı aç</button>
      <button className="text-link" onClick={onClose}>Vazgeç</button></div>
  </section>;
}
