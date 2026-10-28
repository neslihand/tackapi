import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { useAccount } from '../lib/account';
import { sessionId, track } from '../lib/analytics';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';
import { vakifApiEnabled } from '../lib/vakifApi';
import './visitor.css';

type Rec = { slug: string; reason: string | null };

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
  if (!personal.length && !trending.length) return null;
  const upper = (s: string) => s[0].toLocaleUpperCase('tr-TR') + s.slice(1);
  return <div className="v-discover">
    {personal.length > 0 && <section aria-labelledby="for-you"><p className="v-eyebrow">SENİN İÇİN</p>
      <h2 id="for-you">Keşfine göre <em>sıradaki kapılar</em>{mine?.segments[0] && <small> · {mine.segments[0].name}</small>}</h2>
      <ul className="v-tiles">{personal.map((r, i) => <li key={r.slug}>
        <Tile artifact={find(r.slug)!} note={r.reason ? upper(r.reason) : 'Önerilen'}
          onOpen={() => track('recommendation_click', r.slug, { list: 'for_you', rank: i + 1 })} /></li>)}</ul></section>}
    {trending.length > 0 && <section aria-labelledby="popular"><p className="v-eyebrow">EN ÇOK MERAK EDİLENLER</p>
      <h2 id="popular">Bu hafta <em>en çok bakılanlar</em></h2>
      <ul className="v-tiles">{trending.map((p, i) => <li key={p.slug}>
        <Tile artifact={find(p.slug)!} rank={i + 1} note={`${p.visitors.toLocaleString('tr-TR')} ziyaretçi baktı`}
          onOpen={() => track('recommendation_click', p.slug, { list: 'popular', rank: i + 1 })} /></li>)}</ul></section>}
  </div>;
}

function Tile({ artifact, note, rank, onOpen }: { artifact: DiscoveryArtifact; note: string; rank?: number; onOpen: () => void }) {
  return <Link className="v-tile" to={`/eser/${artifact.slug}`} onClick={onOpen}>
    <span className="v-tile-art" aria-hidden="true">{artifact.image && <img src={artifact.image} alt="" loading="lazy" />}</span>
    <span className="v-tile-body">
      <small>{rank ? `${rank}. · ` : ''}{artifact.city.toLocaleUpperCase('tr-TR')}</small>
      <b>{artifact.name}</b>
      <span>{note}</span>
    </span>
    <ArrowUpRight className="v-tile-go" size={16} aria-hidden="true" />
  </Link>;
}
