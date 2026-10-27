import { useEffect, useState } from 'react';
import { ArtifactCard } from '../components/ArtifactCard';
import { useAccount } from '../lib/account';
import { sessionId, track } from '../lib/analytics';
import { useContent } from '../lib/contentStore';
import { vakifApiEnabled } from '../lib/vakifApi';
import './visitor.css';

type Rec = { slug: string; reason: string | null };

/**
 * Yeni keşif: "Senin için" (baktıklarına, sevdiğin anlatım biçimine ve ilgilerine göre, gerekçesiyle) ve
 * "En çok merak edilenler" (son 7 gün). Önerilerin hesabı arka uçta (insights.recommend / popular).
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
  return <div className="v-discover">
    {personal.length > 0 && <section aria-labelledby="for-you"><p className="eyebrow">SENİN İÇİN</p>
      <h2 id="for-you">Keşfine göre <em>sıradaki kapılar</em>{mine?.segments[0] && <small> · {mine.segments[0].name}</small>}</h2>
      <ul className="v-cards">{personal.map((r, i) => <li key={r.slug} onClickCapture={() => track('recommendation_click', r.slug, { list: 'for_you', rank: i + 1 })}>
        <ArtifactCard artifact={find(r.slug)!} variant="compact" number={r.reason ? r.reason[0].toLocaleUpperCase('tr-TR') + r.reason.slice(1) : 'Önerilen'} /></li>)}</ul></section>}
    {trending.length > 0 && <section aria-labelledby="popular"><p className="eyebrow">EN ÇOK MERAK EDİLENLER</p>
      <h2 id="popular">Bu hafta <em>en çok bakılanlar</em></h2>
      <ul className="v-cards">{trending.map((p, i) => <li key={p.slug} onClickCapture={() => track('recommendation_click', p.slug, { list: 'popular', rank: i + 1 })}>
        <ArtifactCard artifact={find(p.slug)!} variant="compact" number={`${i + 1}. · ${p.visitors} ziyaretçi`} /></li>)}</ul></section>}
  </div>;
}
