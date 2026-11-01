import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { useAccount } from '../lib/account';
import { sessionId, track } from '../lib/analytics';
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
 * Kendi küçük kartlarını kullanır: keşfet listesinin kartları (ex-card) tam genişlik satır olarak tasarlandı,
 * dar ızgara hücresinde çok uzuyordu.
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
  return <div className="v-discover">
    {personal.length > 0 && <section aria-labelledby="for-you"><p className="v-eyebrow">{t('SENİN İÇİN', 'FOR YOU')}</p>
      <h2 id="for-you">{t('Keşfine göre', 'Next doors')} <em>{t('sıradaki kapılar', 'for your discovery')}</em>{mine?.segments[0] && <small> · {mine.segments[0].name}</small>}</h2>
      <ul className="v-tiles">{personal.map((r, i) => <li key={r.slug}>
        <Tile artifact={find(r.slug)!} note={r.reason ? upper(r.reason) : t('Önerilen', 'Recommended')}
          onOpen={() => track('recommendation_click', r.slug, { list: 'for_you', rank: i + 1 })} /></li>)}</ul></section>}
    {trending.length > 0 && <section aria-labelledby="popular">{busy
        ? <><p className="v-eyebrow">{t('EN ÇOK MERAK EDİLENLER', 'MOST WONDERED ABOUT')}</p>
          <h2 id="popular">{t('Bu hafta', 'Most viewed')} <em>{t('en çok bakılanlar', 'this week')}</em></h2></>
        : <><p className="v-eyebrow">{t('KOLEKSİYONDAN', 'FROM THE COLLECTION')}</p>
          <h2 id="popular">{t('Bu hafta', 'Featured')} <em>{t('öne çıkanlar', 'this week')}</em></h2></>}
      <ul className="v-tiles">{trending.map((p, i) => <li key={p.slug}>
        <Tile artifact={find(p.slug)!} rank={busy ? i + 1 : undefined} note={p.visitors >= POPULAR_MIN_VISITORS ? t(`${p.visitors.toLocaleString('tr-TR')} ziyaretçi baktı`, `${p.visitors.toLocaleString('en-GB')} visitors looked`) : undefined}
          onOpen={() => track('recommendation_click', p.slug, { list: 'popular', rank: i + 1 })} /></li>)}</ul></section>}
  </div>;
}

function Tile({ artifact, note, rank, onOpen }: { artifact: DiscoveryArtifact; note?: string; rank?: number; onOpen: () => void }) {
  return <Link className="v-tile" to={`/eser/${artifact.slug}`} onClick={onOpen}>
    <span className="v-tile-art" aria-hidden="true">{artifact.image && <img src={artifact.image} alt="" loading="lazy" />}</span>
    <span className="v-tile-body">
      <small>{rank ? `${rank}. · ` : ''}{artifact.city.toLocaleUpperCase(locale())}</small>
      <b>{artifact.name}</b>
      {note && <span>{note}</span>}
    </span>
    <ArrowUpRight className="v-tile-go" size={16} aria-hidden="true" />
  </Link>;
}
