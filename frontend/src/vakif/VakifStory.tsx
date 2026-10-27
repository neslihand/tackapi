import { useEffect, useState } from 'react';
import { Check, Heart, Stamp } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { useContent } from '../lib/contentStore';
import { useProgress } from '../lib/store';
import { Link } from '../lib/navigation';
import { fetchMonument, vakifItem } from '../lib/vakifApi';
import { AskArtifact } from '../components/AskArtifact';
import { NextDoor } from '../components/ArtifactCard';
import { MonumentSections, MonumentView } from './MonumentView';
import { toImmersive } from './immersive';
import { Contributions } from './Contributions';
import { track } from '../lib/analytics';
import { ImmersiveStory } from '../pages/Story';
import type { PublicDetail, PublicItem } from './model';
import './public.css';

/**
 * Arka uçtaki bir eserin sayfası. Kitap metni ve kayıtlı hikâye/çocuk anlatımları varsa sitenin sinematik hikâye
 * sayfası açılır (anlatımlar bölümlere ayrılır, yeni metin üretilmez; immersive.ts) ve altında fotoğraflar, tarihçe,
 * süsleme ve harita gösterilir. Anlatımları hazır olmayan eserde aşağıdaki sade sayfa açılır.
 * Sade sayfa: künye, kitaptaki metin ("Detaylı Anlatım"), kayıtlı hikâye ve çocuk anlatımları,
 * fotoğraflar, tarihçe, süsleme, harita ve kaynakça GET /api/monuments/{slug}'tan gelir (yapay zekâ sayfa açılınca
 * çağrılmaz). Favori, pasaport mührü ve "Esere Sor" sitenin kendi araçlarıdır.
 */
export function VakifStory({ artifact }: { artifact: DiscoveryArtifact }) {
  const { artifacts } = useContent();
  const { progress, markDiscovered, toggleFavorite, notify } = useProgress();
  const [detail, setDetail] = useState<PublicDetail | null>(null);
  const [error, setError] = useState('');
  const item = vakifItem(artifact.slug) as PublicItem | undefined;
  useEffect(() => { track('monument_view', artifact.slug); }, [artifact.slug]);
  useEffect(() => {
    let alive = true;
    setDetail(null); setError('');
    fetchMonument<PublicDetail>(artifact.slug).then(d => { if (alive) setDetail(d); }, e => { if (alive) setError((e as Error).message); });
    return () => { alive = false; };
  }, [artifact.slug]);
  const stamped = Boolean(progress.discovered[artifact.id]);
  const favorite = progress.favorites.includes(artifact.id);
  const next = artifacts[(artifacts.findIndex(a => a.id === artifact.id) + 1) % artifacts.length];
  if (error || !item) return <div className="page-shell empty-state" role="alert"><h1>Eser açılamadı.</h1><p>{error || 'Bu eserin bilgisi bulunamadı.'}</p><Link className="button dark" to="/kesfet">Eserlere dön</Link></div>;
  if (!detail) return <div className="page-shell loading-state" role="status">{artifact.name} hazırlanıyor…</div>;
  const immersive = toImmersive(item, detail);
  if (immersive) return <ImmersiveStory artifact={immersive}
    extras={<><section className="vakif-extras pv" aria-label="Eserin fotoğrafları, tarihçesi ve konumu"><div className="pv-body"><MonumentSections item={item} detail={detail} lang="tr" /></div></section>
      <Contributions slug={artifact.slug} name={artifact.name} /></>} />;
  const actions = <>
    <AskArtifact artifact={artifact} mode="short" />
    <button className="story-save" onClick={() => toggleFavorite(artifact.id)} aria-pressed={favorite}><span className="story-save-icon" aria-hidden="true"><Heart size={16} fill={favorite ? 'currentColor' : 'none'} /></span><span>Favori</span></button>
    <button className={`button ${stamped ? 'stamped' : 'gold'}`} disabled={stamped} onClick={() => { markDiscovered(artifact.id); notify('Keşfin miras pasaportuna mühürlendi.'); }}>
      {stamped ? <><Check size={17} /> Pasaportuna mühürlendi</> : <><Stamp size={17} /> Pasaportuma mühürle</>}</button>
  </>;
  return <div className="vakif-story">
    <MonumentView item={item} detail={detail} lang="tr" backHref="#/kesfet" actions={actions} />
    <Contributions slug={artifact.slug} name={artifact.name} />
    {next && next.id !== artifact.id && <NextDoor artifact={next} />}
  </div>;
}
