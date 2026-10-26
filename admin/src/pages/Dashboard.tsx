import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Link } from '../lib/navigation';
import { PageHead, useLoad } from '../components/UI';
import { describe } from './AuditLog';

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
    {s && <div className="stat-grid">
      <div className="stat alert"><strong>{count(s.images, 'draft')}</strong><span>Kontrol bekleyen fotoğraf</span><Link to="/fotograflar?status=draft">Kuyruğa git →</Link></div>
      <div className="stat"><strong>{s.images_unassigned}</strong><span>Hiçbir esere bağlı olmayan fotoğraf</span><Link to="/fotograflar?status=&unassigned=1">Esere bağla →</Link></div>
      <div className="stat alert"><strong>{s.segmentation_pending}</strong><span>Başka esere ait görünen, bakılacak paragraf</span><Link to="/bolumleme">Bölümleme kontrolüne git →</Link></div>
      <div className="stat"><strong>{s.monuments_without_image}</strong><span>Yayında fotoğrafı olmayan eser</span><Link to="/eserler?has_image=0">Listele →</Link></div>
      <div className="stat"><strong>{count(s.monuments, 'published')}</strong><span>Yayındaki eser</span><Link to="/eserler?status=published">Listele →</Link></div>
      <div className="stat"><strong>{count(s.monuments, 'draft') + count(s.monuments, 'reviewed')}</strong><span>Taslak eser (sitede görünmez)</span><Link to="/eserler?status=draft">Listele →</Link></div>
      {count(s.monuments, 'removed') > 0 && <div className="stat"><strong>{count(s.monuments, 'removed')}</strong><span>Kaldırılan eser (geri getirilebilir)</span><Link to="/eserler?status=removed">Listele →</Link></div>}
      <div className="stat"><strong>{count(s.images, 'published')}</strong><span>Yayındaki fotoğraf</span><Link to="/fotograflar?status=published">Göster →</Link></div>
    </div>}
    <h2 style={{ fontSize: 26, marginBottom: 14 }}>Son değişiklikler</h2>
    {log.data && (log.data.length
      ? <table className="admin-table"><thead><tr><th>Zaman</th><th>Kişi</th><th>İşlem</th></tr></thead><tbody>
        {log.data.slice(0, 10).map((r, i) => <tr key={i}><td>{formatDate(r.at)}</td><td>{r.actor}</td><td>{describe(r)}</td></tr>)}
      </tbody></table>
      : <div className="empty">Henüz panelden bir değişiklik yapılmadı.</div>)}
    {log.data && log.data.length > 10 && <p style={{ marginTop: 12 }}><Link className="text-link" to="/kayit">Tüm kayıt →</Link></p>}
  </>;
}
