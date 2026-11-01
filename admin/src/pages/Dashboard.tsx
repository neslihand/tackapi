import type { ReactNode } from 'react';
import { ArrowRight, BookA, Building2, CheckCircle2, EyeOff, ImageOff, Images, Link2Off, Newspaper, SplitSquareVertical, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Link } from '../lib/navigation';
import { PageHead, useLoad } from '../components/UI';
import { describe } from './AuditLog';

// Panodaki sayı kartı: kartın tamamı ilgili listeye götürür; "alert" kartları bir kişinin bakmasını bekleyen işlerdir.
function Stat({ n, label, to, action, icon, alert = false }: { n: number; label: string; to: string; action: string; icon: ReactNode; alert?: boolean }) {
  return <Link to={to} className={`stat ${alert ? 'alert' : ''} ${alert && n === 0 ? 'clear' : ''}`}>
    <span className="stat-icon" aria-hidden="true">{icon}</span>
    <strong>{n.toLocaleString('tr-TR')}</strong><span>{label}</span><small>{action} <ArrowRight size={13} aria-hidden="true" /></small></Link>;
}

export function Dashboard() {
  const stats = useLoad(() => api.stats(), []);
  const log = useLoad(() => api.log(), []);
  const s = stats.data;
  const count = (list: { review_status: string; n: number }[] | undefined, key: string) => list?.find(c => c.review_status === key)?.n ?? 0;
  return <>
    <PageHead kicker="Genel durum" title={<>Koleksiyonun <em>durumu.</em></>}>Yayındaki eserler herkese açık sitede görünür. Taslak fotoğraflar, otomatik eşleştirmenin emin olamadığı ve bir kişinin onayını bekleyen fotoğraflardır.</PageHead>
    {stats.error && <p className="form-error" role="alert">{stats.error}</p>}
    {s?.pilot && s.pilot.some(p => p.target || p.n) && <section className="pilot-panel" aria-labelledby="pilot-title">
      <h2 id="pilot-title">MVP pilot seçkisi</h2>
      <div className="pilot-cities">{s.pilot.filter(p => p.target || p.n).map(p => <Link key={p.city} to={`/eserler?city=${p.city}&pilot=1`} className={p.target && p.n >= p.target ? 'done' : ''}>
        <span>{p.city.toLocaleUpperCase('tr-TR')}</span><strong>{p.n}{p.target ? <small> / {p.target}</small> : null}</strong>
        {p.target ? <i aria-hidden="true"><b style={{ width: `${Math.min(100, (100 * p.n) / p.target)}%` }} /></i> : null}</Link>)}</div>
      <p className="admin-help">Eser sayfasındaki "Pilot seçkide" kutusuyla ya da <code>python pilot.py --suggest</code> önerileriyle seçilir. Görselle arama ve anlatımlar önce bu eserler için üretilir: <code>python visual_search.py --pilot</code>, <code>python narrations.py --pilot</code>.</p>
    </section>}
    {s && <>
      <h2 className="section-title">Bakılmayı bekleyenler</h2>
      <div className="stat-grid">
        <Stat alert n={count(s.images, 'draft')} label="Kontrol bekleyen fotoğraf" to="/fotograflar?status=draft" action="Kuyruğa git" icon={<Images size={19} />} />
        <Stat alert n={s.segmentation_pending} label="Başka esere ait görünen, bakılacak paragraf" to="/bolumleme" action="Bölümleme kontrolüne git" icon={<SplitSquareVertical size={19} />} />
        {(s.articles_pending ?? 0) > 0 && <Stat alert n={s.articles_pending ?? 0} label="Onay bekleyen ziyaretçi makalesi" to="/makaleler?durum=pending" action="İncele" icon={<Newspaper size={19} />} />}
        {(s.terms_pending ?? 0) > 0 && <Stat alert n={s.terms_pending ?? 0} label="Onay bekleyen terim önerisi" to="/terimler?durum=pending" action="İncele" icon={<BookA size={19} />} />}
        <Stat n={s.images_unassigned} label="Hiçbir esere bağlı olmayan fotoğraf" to="/fotograflar?status=&unassigned=1" action="Esere bağla" icon={<Link2Off size={19} />} />
        <Stat n={s.monuments_without_image} label="Yayında fotoğrafı olmayan eser" to="/eserler?has_image=0" action="Listele" icon={<ImageOff size={19} />} />
      </div>
      <h2 className="section-title">Koleksiyon</h2>
      <div className="stat-grid">
        <Stat n={count(s.monuments, 'published')} label="Yayındaki eser" to="/eserler?status=published" action="Listele" icon={<Building2 size={19} />} />
        <Stat n={count(s.monuments, 'draft') + count(s.monuments, 'reviewed')} label="Taslak eser (sitede görünmez)" to="/eserler?status=draft" action="Listele" icon={<EyeOff size={19} />} />
        {count(s.monuments, 'removed') > 0 && <Stat n={count(s.monuments, 'removed')} label="Kaldırılan eser (geri getirilebilir)" to="/eserler?status=removed" action="Listele" icon={<Trash2 size={19} />} />}
        <Stat n={count(s.images, 'published')} label="Yayındaki fotoğraf" to="/fotograflar?status=published" action="Göster" icon={<CheckCircle2 size={19} />} />
      </div>
    </>}
    <h2 className="section-title">Son değişiklikler</h2>
    {log.data && (log.data.length
      ? <table className="admin-table"><thead><tr><th>Zaman</th><th>Kişi</th><th>İşlem</th></tr></thead><tbody>
        {log.data.slice(0, 10).map((r, i) => <tr key={i}><td>{formatDate(r.at)}</td><td>{r.actor}</td><td>{describe(r)}</td></tr>)}
      </tbody></table>
      : <div className="empty">Henüz panelden bir değişiklik yapılmadı.</div>)}
    {log.data && log.data.length > 10 && <p style={{ marginTop: 12 }}><Link className="text-link" to="/kayit">Tüm kayıt →</Link></p>}
  </>;
}
