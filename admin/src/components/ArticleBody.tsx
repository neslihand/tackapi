import { articleBlocks } from '../lib/format';

/** Makale metninin sitedeki gibi görünüşü: ara başlıklar, paragraflar ve alıntılar (önizleme ve kuyruk kartları). */
export function ArticleBody({ body, limit }: { body: string; limit?: number }) {
  const blocks = articleBlocks(body);
  const shown = limit ? blocks.slice(0, limit) : blocks;
  if (!blocks.length) return <p className="admin-help">Metin henüz boş.</p>;
  return <div className="article-body">
    {shown.map((b, i) => b.type === 'h' ? <h3 key={i}>{b.text}</h3> : b.type === 'q' ? <blockquote key={i}>{b.text}</blockquote> : <p key={i}>{b.text}</p>)}
    {limit && blocks.length > limit && <p className="admin-help">… {blocks.length - limit} paragraf daha</p>}
  </div>;
}

export function ArticleStatusBadge({ value }: { value: 'draft' | 'pending' | 'published' | 'rejected' }) {
  const label = { draft: 'Taslak', pending: 'Onay bekliyor', published: 'Yayında', rejected: 'Reddedildi' }[value];
  return <span className={`status ${value}`}>{label}</span>;
}
