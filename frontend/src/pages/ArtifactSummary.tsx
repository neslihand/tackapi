import { ArrowLeft, ArrowUpRight, Check, Heart, Puzzle, Stamp } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { imageAlt, PLACEHOLDER_IMAGE } from '../lib/content';
import { narrationModes, useNarrationMode } from '../lib/preferences';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';
import { useProgress } from '../lib/store';
import { PageHeading, Scene } from '../components/UI';
import { NextDoor } from '../components/ArtifactCard';
import { AskArtifact } from '../components/AskArtifact';

export function ArtifactSummary({ artifact }: { artifact: DiscoveryArtifact }) {
  const { artifacts } = useContent();
  const { progress, markDiscovered, toggleFavorite, notify } = useProgress();
  const [mode, setMode] = useNarrationMode('short');
  const available = narrationModes.filter(([key]) => artifact.chapters.length > 0 && artifact.chapters.every(chapter => chapter[key]));
  const activeMode = available.some(([key]) => key === mode) ? mode : 'short';
  const stamped = Boolean(progress.discovered[artifact.id]);
  const favorite = progress.favorites.includes(artifact.id);
  const next = artifacts[(artifacts.findIndex(a => a.id === artifact.id) + 1) % artifacts.length];
  return <Scene className="summary-scene"><article className="page-shell artifact-summary">
    <Link className="back-link" to="/kesfet"><ArrowLeft size={17} aria-hidden="true" /> Koleksiyona dön</Link>
    <PageHeading kicker={`${artifact.city} · ${artifact.period}`} title={artifact.name}>{artifact.description}</PageHeading>
    <div className="artifact-summary-layout">
      <div>
        <figure className="artifact-summary-image"><img src={artifact.image} alt={artifact.imageAlt && artifact.image !== PLACEHOLDER_IMAGE ? `${artifact.name} görseli` : imageAlt(artifact)} /><figcaption>{artifact.image === PLACEHOLDER_IMAGE ? 'Bu eser için görsel henüz eklenmedi.' : artifact.imageAlt ? <><span className="sr-only">Görsel betimlemesi: </span>{artifact.imageAlt}</> : 'Eser görseli'}</figcaption></figure>
        <dl className="story-facts"><div><dt>DÖNEM</dt><dd>{artifact.period}</dd></div><div><dt>MİMAR / USTA</dt><dd>{artifact.architect}</dd></div><div><dt>TARİH</dt><dd>{artifact.year}</dd></div><div><dt>TÜR</dt><dd>{artifact.category}</dd></div></dl>
        <button className="button gold" aria-pressed={favorite} onClick={() => toggleFavorite(artifact.id)}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} />{favorite ? 'Favorilerimde' : 'Favorilere ekle'}</button>
        <AskArtifact artifact={artifact} mode={activeMode} />
        {artifact.image !== PLACEHOLDER_IMAGE && <p><Link className="text-link" to={`/oyun/oyunlar?oyun=yapboz&eser=${encodeURIComponent(artifact.id)}`}><Puzzle size={16} aria-hidden="true" /> Bu eserin yapbozunu çöz</Link></p>}
        {artifact.coordinates ? <p><Link className="text-link" to="/harita">Haritada keşfet <ArrowUpRight size={16} /></Link></p> : <p className="page-note">Bu eser için konum bilgisi henüz eklenmedi.</p>}
      </div>
      <div className="artifact-summary-content">
        {artifact.chapters.length > 0 ? <>
          {available.length > 1 && <div className="segmented" role="group" aria-label="Anlatım biçimi">{available.map(([value, label]) => <button key={value} className={activeMode === value ? 'active' : ''} aria-pressed={activeMode === value} onClick={() => setMode(value)}>{label}</button>)}</div>}
          {activeMode === 'story' && <p className="narrative-note">Hikâyeleştirilmiş anlatım yaratıcı yorum içerebilir; kaynaklar aşağıda yer alır.</p>}
          {artifact.chapters.map((chapter, index) => <section key={index} id={`chapter-${index}`}><h2>{chapter.title}</h2><p className="artifact-summary-text">{chapter[activeMode]}</p></section>)}
        </> : <p className="page-note">Bu eser için bölüm bölüm anlatım henüz eklenmedi. Mevcut açıklamayı okuyabilir ve aşağıdaki kaynakları inceleyebilirsin.</p>}
        {artifact.detail && <section><h2>{artifact.detail.title}</h2><p className="artifact-summary-text">{artifact.detail.text}</p></section>}
        <section><h2>Eserin kaynakları</h2><ul className="artifact-summary-sources">{artifact.sourceReferences.map((source, index) => <li key={index}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} <ArrowUpRight size={16} /></a> : source.title}</li>)}</ul></section>
        <section className="artifact-summary-stamp"><span className={`story-seal ${stamped ? 'on' : ''}`} aria-hidden="true"><Stamp size={26} /></span><h2>Bu keşif senin olsun.</h2><p>Bu mühür dijital keşfini temsil eder; fiziksel ziyaret kaydı değildir.</p><button className="button dark" disabled={stamped} onClick={() => { markDiscovered(artifact.id); notify('Keşfin miras pasaportuna mühürlendi.'); }}>{stamped ? <><Check size={17} /> Pasaportuna mühürlendi</> : <><Stamp size={17} /> Pasaportuma mühürle</>}</button>{stamped && <Link className="text-link" to="/pasaport">Pasaportumu gör <ArrowUpRight size={16} /></Link>}</section>
      </div>
    </div>
    {next && next.id !== artifact.id && <NextDoor artifact={next} />}
  </article></Scene>;
}
