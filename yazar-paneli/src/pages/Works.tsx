import { useState } from 'react';
import { AlertTriangle, BookMarked, FileText, NotebookPen, Plus, ScrollText, Send, Sparkles } from 'lucide-react';
import { authorApi, formatDate, WORK_STATUS_LABELS, type AuthorWorkRow, type Me, type SimilarHit, type WorkStatus } from '../lib/author';
import { Link, navigate } from '../lib/navigation';
import { Field, PageHead, useLoad, useToast } from '../components/UI';

export function WorkStatusBadge({ value }: { value: WorkStatus }) {
  return <span className={`status author-${value}`}>{WORK_STATUS_LABELS[value]}</span>;
}

const STEPS = [
  { icon: <NotebookPen size={18} />, title: 'Notlarınızı toplayın', text: 'Kaynak, sayfa ve kesinlikle; Word’den ya da defterinizden toplu yapıştırın.' },
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
      Sistemde henüz kaydı olmayan eserlerin “eser hakkında” bölümünü yazarken araştırma notlarınızı, kaynakçanızı ve taslağınızı tek yerde tutun.
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
      <small>{w.city || 'Şehir seçilmedi'}</small></span>
    <span className="author-work-counts"><span><b>{w.notes}</b> not</span><span><b>{w.sources}</b> kaynak</span><span><FileText size={13} /> {w.drafts ? `${w.drafts} sürüm` : 'taslak yok'}</span></span>
    <span className="author-work-status"><WorkStatusBadge value={w.status} /><small>{formatDate(w.updated_at)}</small></span>
  </Link></li>;
}

function NewWork({ onClose }: { onClose: () => void }) {
  const notify = useToast();
  const provinces = useLoad(() => authorApi.provinces(), []);
  const [title, setTitle] = useState('');
  const [city, setCity] = useState('');
  const [similar, setSimilar] = useState<SimilarHit[] | null>(null);   // dolu: uyarı gösterildi, ikinci tık dosyayı açar
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sorted = [...(provinces.data ?? [])].sort((a, b) => a.localeCompare(b, 'tr'));
  async function create() {
    if (title.trim().length < 2) { setError('Eserin adını yazın.'); return; }
    setBusy(true); setError('');
    try {
      if (!similar) {   // sistemde aynı adla eser varsa önce uyarılır; yazar yine de açabilir
        const hits = await authorApi.similar(title.trim(), city || undefined);
        if (hits.length) { setSimilar(hits); return; }
      }
      const d = await authorApi.create({ title: title.trim(), city: city || undefined });
      notify('Yazım dosyası açıldı.'); navigate(`/dosya/${d.work.id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="side-card author-new" aria-label="Yeni yazım dosyası">
    <h2>Yeni yazım dosyası</h2>
    <p className="admin-help">Bu panel sistemde kaydı olmayan eserler içindir. Şehir olarak Türkiye’nin 81 ilinden birini seçebilirsiniz.</p>
    <div className="admin-grid">
      <Field label="Eserin adı"><input autoFocus maxLength={200} value={title} onChange={e => { setTitle(e.target.value); setSimilar(null); }} placeholder="ör. Kale Camii" /></Field>
      <Field label="İl"><select value={city} onChange={e => { setCity(e.target.value); setSimilar(null); }}><option value="">Seçilmedi</option>
        {sorted.map(p => <option key={p} value={p}>{p}</option>)}</select></Field>
    </div>
    {provinces.error && <p className="form-error" role="alert">{provinces.error}</p>}
    {similar && <div className="author-banner warn" role="alert"><AlertTriangle size={18} />
      <div><strong>Bu adla sistemde kayıtlı {similar.length === 1 ? 'bir eser' : `${similar.length} eser`} var</strong>
        <p>{similar.map(m => [m.name_tr, [m.city, m.district].filter(Boolean).join(' / ')].join(' — ')).join('; ')}</p>
        <small>Yazdığınız eser bundan farklıysa dosyayı yine de açabilirsiniz.</small></div></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-actions"><button className="button dark" disabled={busy} onClick={create}><Plus size={16} /> {similar ? 'Yine de dosyayı aç' : 'Dosyayı aç'}</button>
      <button className="text-link" onClick={onClose}>Vazgeç</button></div>
  </section>;
}
