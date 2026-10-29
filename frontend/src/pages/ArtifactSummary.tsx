import { ArrowLeft, ArrowUpRight, Check, Heart, Puzzle, Stamp } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { imageAlt, PLACEHOLDER_IMAGE } from '../lib/content';
import { narrationLabel, narrationModes, useNarrationMode } from '../lib/preferences';
import { useContent } from '../lib/contentStore';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
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
    <Link className="back-link" to="/kesfet"><ArrowLeft size={17} aria-hidden="true" /> {t('Koleksiyona dön', 'Back to the collection')}</Link>
    <PageHeading kicker={`${artifact.city} · ${artifact.period}`} title={artifact.name}>{artifact.description}</PageHeading>
    <div className="artifact-summary-layout">
      <div>
        <figure className="artifact-summary-image"><img src={artifact.image} alt={artifact.imageAlt && artifact.image !== PLACEHOLDER_IMAGE ? t(`${artifact.name} görseli`, `Picture of ${artifact.name}`) : imageAlt(artifact)} /><figcaption>{artifact.image === PLACEHOLDER_IMAGE ? t('Bu eser için görsel henüz eklenmedi.', 'No picture has been added for this work yet.') : artifact.imageAlt ? <><span className="sr-only">{t('Görsel betimlemesi: ', 'Picture description: ')}</span>{artifact.imageAlt}</> : t('Eser görseli', 'Picture of the work')}</figcaption></figure>
        <dl className="story-facts"><div><dt>{t('DÖNEM', 'ERA')}</dt><dd>{artifact.period}</dd></div><div><dt>{t('MİMAR / USTA', 'ARCHITECT / MASTER')}</dt><dd>{artifact.architect}</dd></div><div><dt>{t('TARİH', 'DATE')}</dt><dd>{artifact.year}</dd></div><div><dt>{t('TÜR', 'TYPE')}</dt><dd>{artifact.category}</dd></div></dl>
        <button className="button gold" aria-pressed={favorite} onClick={() => toggleFavorite(artifact.id)}><Heart size={17} fill={favorite ? 'currentColor' : 'none'} />{favorite ? t('Favorilerimde', 'In my favourites') : t('Favorilere ekle', 'Add to favourites')}</button>
        <AskArtifact artifact={artifact} mode={activeMode} />
        {artifact.image !== PLACEHOLDER_IMAGE && <p><Link className="text-link" to={`/oyun/oyunlar?oyun=yapboz&eser=${encodeURIComponent(artifact.id)}`}><Puzzle size={16} aria-hidden="true" /> {t('Bu eserin yapbozunu çöz', 'Solve this work’s puzzle')}</Link></p>}
        {artifact.coordinates ? <p><Link className="text-link" to="/harita">{t('Haritada keşfet', 'Explore on the map')} <ArrowUpRight size={16} /></Link></p> : <p className="page-note">{t('Bu eser için konum bilgisi henüz eklenmedi.', 'No location has been added for this work yet.')}</p>}
      </div>
      <div className="artifact-summary-content">
        {artifact.chapters.length > 0 ? <>
          {available.length > 1 && <div className="segmented" role="group" aria-label={t('Anlatım biçimi', 'Narration style')}>{available.map(([value]) => <button key={value} className={activeMode === value ? 'active' : ''} aria-pressed={activeMode === value} onClick={() => setMode(value)}>{narrationLabel(value)}</button>)}</div>}
          {activeMode === 'story' && <p className="narrative-note">{t('Hikâyeleştirilmiş anlatım yaratıcı yorum içerebilir; kaynaklar aşağıda yer alır.', 'The story telling may contain creative interpretation; the sources are below.')}</p>}
          {artifact.chapters.map((chapter, index) => <section key={index} id={`chapter-${index}`}><h2>{chapter.title}</h2><p className="artifact-summary-text">{chapter[activeMode]}</p></section>)}
        </> : <p className="page-note">{t('Bu eser için bölüm bölüm anlatım henüz eklenmedi. Mevcut açıklamayı okuyabilir ve aşağıdaki kaynakları inceleyebilirsin.', 'A chapter-by-chapter telling has not been added for this work yet. You can read the description and look at the sources below.')}</p>}
        {artifact.detail && <section><h2>{artifact.detail.title}</h2><p className="artifact-summary-text">{artifact.detail.text}</p></section>}
        <section><h2>{t('Eserin kaynakları', 'The work’s sources')}</h2><ul className="artifact-summary-sources">{artifact.sourceReferences.map((source, index) => <li key={index}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.title} <ArrowUpRight size={16} /></a> : source.title}</li>)}</ul></section>
        <section className="artifact-summary-stamp"><span className={`story-seal ${stamped ? 'on' : ''}`} aria-hidden="true"><Stamp size={26} /></span><h2>{t('Bu keşif senin olsun.', 'Let this discovery be yours.')}</h2><p>{t('Bu mühür dijital keşfini temsil eder; fiziksel ziyaret kaydı değildir.', 'The stamp stands for your digital discovery; it is not a record of a visit.')}</p><button className="button dark" disabled={stamped} onClick={() => { markDiscovered(artifact.id); notify(t('Keşfin miras pasaportuna mühürlendi.', 'Your discovery is stamped into your heritage passport.')); }}>{stamped ? <><Check size={17} /> {t('Pasaportuna mühürlendi', 'Stamped into your passport')}</> : <><Stamp size={17} /> {t('Pasaportuma mühürle', 'Stamp my passport')}</>}</button>{stamped && <Link className="text-link" to="/pasaport">{t('Pasaportumu gör', 'See my passport')} <ArrowUpRight size={16} /></Link>}</section>
      </div>
    </div>
    {next && next.id !== artifact.id && <NextDoor artifact={next} />}
  </article></Scene>;
}
