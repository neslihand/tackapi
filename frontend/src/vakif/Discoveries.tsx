import { useEffect, useState } from 'react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { useAccount } from '../lib/account';
import { sessionId, track } from '../lib/analytics';
import { known } from '../lib/content';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';
import { locale, t } from '../lib/i18n';
import { vakifApiEnabled } from '../lib/vakifApi';
import './visitor.css';

type Rec = { slug: string; reason: string | null };

/** Bir eserin ziyaretçi sayısı bunun altındaysa gösterilmez; en çok bakılan bile altındaysa liste "Öne çıkanlar" olur. */
export const POPULAR_MIN_VISITORS = 10;

/**
 * Yeni keşif: "Senin için" (baktıklarına, sevdiğin anlatım biçimine ve ilgilerine göre, gerekçesiyle) ve
 * "En çok merak edilenler" (son 7 gün). Önerilerin hesabı arka uçta (insights.recommend / popular).
 * Kendi kartlarını kullanır: keşfet listesinin kartları (ex-card) tam genişlik satır olarak tasarlandı, dar ızgara
 * hücresinde çok uzuyordu. Burada her eser uzun, kemerli bir görsel ve altında adı.
 */
export function Discoveries({ limit = 4 }: { limit?: number }) {
  const { artifacts } = useContent();
  const { user } = useAccount();
  const [mine, setMine] = useState<{ personal: boolean; items: Rec[]; segments: { id: string; name: string }[] } | null>(null);
  const [popular, setPopular] = useState<{ slug: string; visitors: number }[]>([]);
  useEffect(() => {
    if (!vakifApiEnabled()) return;
    const sid = sessionId();
    fetch(`/api/recommendations?limit=${limit}${sid ? `&session_id=${sid}` : ''}`, { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null).then(setMine, () => {});
    fetch(`/api/popular?limit=${limit}`).then(r => r.ok ? r.json() : []).then(setPopular, () => {});
  }, [limit, user?.id]);
  const find = (slug: string) => artifacts.find(a => a.slug === slug);
  const personal = mine?.personal ? mine.items.filter(r => find(r.slug)) : [];
  const trending = popular.filter(p => find(p.slug));
  // Küçük sayılar ("2 ziyaretçi baktı") platformu boş gösterir: sayı eşiğin altındaysa yazılmaz, sıra da verilmez.
  const busy = trending.some(p => p.visitors >= POPULAR_MIN_VISITORS);
  if (!personal.length && !trending.length) return null;
  const upper = (s: string) => s[0].toLocaleUpperCase('tr-TR') + s.slice(1);
  const segment = mine?.segments[0]?.name;
  return <div className="v-discover">
    {personal.length > 0 && <section aria-labelledby="for-you">
      <header className="dc-head"><p className="dc-kicker">{t('Senin için', 'For you')}</p>
        <h2 id="for-you">{t('Keşfine göre', 'Next doors')} <em>{t('sıradaki kapılar', 'for your discovery')}</em></h2>{segment && <span className="dc-chip">{segment}</span>}</header>
      <ul className="dc-row">{personal.map((r, i) => <li key={r.slug}>
        <Card artifact={find(r.slug)!} note={r.reason ? upper(r.reason) : t('Önerilen', 'Recommended')}
          onOpen={() => track('recommendation_click', r.slug, { list: 'for_you', rank: i + 1 })} /></li>)}</ul></section>}
    {trending.length > 0 && <section aria-labelledby="popular">
      <header className="dc-head">{busy
        ? <><p className="dc-kicker">{t('En çok merak edilenler', 'Most wondered about')}</p>
          <h2 id="popular">{t('Bu hafta', 'Most viewed')} <em>{t('en çok bakılanlar', 'this week')}</em></h2></>
        : <><p className="dc-kicker">{t('Koleksiyondan', 'From the collection')}</p>
          <h2 id="popular">{t('Bu hafta', 'Featured')} <em>{t('öne çıkanlar', 'this week')}</em></h2></>}</header>
      <ul className="dc-row">{trending.map((p, i) => <li key={p.slug}>
        <Card artifact={find(p.slug)!} rank={busy ? i + 1 : undefined} note={p.visitors >= POPULAR_MIN_VISITORS ? t(`${p.visitors.toLocaleString('tr-TR')} ziyaretçi baktı`, `${p.visitors.toLocaleString('en-GB')} ${p.visitors === 1 ? 'visitor' : 'visitors'} viewed it`) : undefined}
          onOpen={() => track('recommendation_click', p.slug, { list: 'popular', rank: i + 1 })} /></li>)}</ul></section>}
  </div>;
}

// A suggested work: its picture as a tall arch (with its place in the list when the list is ranked), then its city and
// date, its name and why it is here.
function Card({ artifact, note, rank, onOpen }: { artifact: DiscoveryArtifact; note?: string; rank?: number; onOpen: () => void }) {
  return <Link className="dc-card" to={`/eser/${artifact.slug}`} onClick={onOpen}>
    <span className="dc-art" aria-hidden="true">{artifact.image && <img src={artifact.image} alt="" loading="lazy" />}{rank && <i>{rank}</i>}</span>
    <small>{[artifact.city, artifact.year].filter(known).join(' · ').toLocaleUpperCase(locale())}</small>
    <b>{artifact.name}</b>
    {note && <span className="dc-note">{note}</span>}
  </Link>;
}
