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
    {s && <div className="stat-grid">
      <div className="stat alert"><strong>{count(s.images, 'draft')}</strong><span>Kontrol bekleyen fotoğraf</span><Link to="/fotograflar?status=draft">Kuyruğa git →</Link></div>
      <div className="stat"><strong>{s.images_unassigned}</strong><span>Hiçbir esere bağlı olmayan fotoğraf</span><Link to="/fotograflar?status=&unassigned=1">Esere bağla →</Link></div>
      <div className="stat"><strong>{s.monuments_without_image}</strong><span>Yayında fotoğrafı olmayan eser</span><Link to="/eserler?has_image=0">Listele →</Link></div>
      <div className="stat"><strong>{count(s.monuments, 'published')}</strong><span>Yayındaki eser</span><Link to="/eserler?status=published">Listele →</Link></div>
      <div className="stat"><strong>{count(s.monuments, 'draft') + count(s.monuments, 'reviewed')}</strong><span>Taslak eser (sitede görünmez)</span><Link to="/eserler?status=draft">Listele →</Link></div>
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
