import { ArrowUpRight, Heart, MapPin } from 'lucide-react';
import { type Artifact } from '../data/artifacts';
import { PLACEHOLDER_IMAGE } from '../lib/content';
import { Link } from '../lib/navigation';
import { useProgress } from '../lib/store';

export function ArtifactCard({ artifact, index = 0, label = 'ESER' }: { artifact: Artifact; index?: number; label?: string }) {
  const { progress, toggleFavorite } = useProgress();
  const favorite = progress.favorites.includes(artifact.id);
  return <article className="artifact-card"><div className="artifact-image"><Link to={`/eser/${artifact.slug}`} tabIndex={-1} aria-hidden="true"><img src={artifact.image} alt="" loading="lazy" width="1400" height="1000" /></Link><span className="image-tag">{artifact.period}</span><button className={`favorite ${favorite ? 'active' : ''}`} onClick={() => toggleFavorite(artifact.id)} aria-label={`${artifact.name} ${favorite ? 'favorilerden çıkar' : 'favorilere ekle'}`} aria-pressed={favorite}><Heart size={18} fill={favorite ? 'currentColor' : 'none'} /></button><span className="illustration-label">{artifact.image === PLACEHOLDER_IMAGE ? 'GÖRSEL HAZIRLANIYOR' : 'MİMARİ YORUM'}</span>{progress.discovered[artifact.id] && <span className="card-stamp" title="Pasaportuna mühürlendi">MÜHÜRLENDİ</span>}</div><div className="artifact-meta"><span><MapPin size={12} /> {artifact.city}</span><span>{artifact.year}</span></div><h3><Link to={`/eser/${artifact.slug}`}>{artifact.name}<ArrowUpRight size={21} /></Link></h3><p>{artifact.description}</p><div className="card-bottom"><span>{label} {String(index + 1).padStart(2, '0')}</span><Link to={`/eser/${artifact.slug}`}>Hikâyeyi keşfet <ArrowUpRight size={14} /></Link></div></article>;
}
