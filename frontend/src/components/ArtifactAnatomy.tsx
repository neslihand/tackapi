import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, BookOpen, ImagePlus, Library, MessageCircle, Stamp } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { chatEndpoint } from '../lib/chatApi';
import { Link } from '../lib/navigation';
import { narrationModes } from '../lib/preferences';
import { vakifApiEnabled } from '../lib/vakifApi';
import '../anatomy.css';

// "Bir eserin içi": an artifact's page drawn as an annotated plate. A parchment page in the middle (the building in a
// round-topped door, its name, the narration switch turning by itself, the sources, the assistant, visitors' photos, the stamp)
// carries numbered marks; the notes around it explain each mark, joined to the page by fine gold rules. The page is a
// drawing, not the real page, so it is hidden from assistive technology; the notes carry the same information.
const pad = (n: number) => String(n).padStart(2, '0');
// Backend records say "Bilinmiyor" (unknown) where a fact is missing; those are left out rather than shown.
export const known = (value?: string | null) => Boolean(value && value.trim() && !/^bilinmiyor$/i.test(value.trim()));

type Part = 'anlatim' | 'kaynak' | 'sor' | 'katki' | 'muhur';
const NOTES: [Part, ReactNode, string, string][] = [
  ['anlatim', <BookOpen size={18} />, 'Üç anlatım biçimi', 'Kısa ve Öz, Hikâyeleştirerek ya da Çocuklar İçin: aynı eseri sana uyan dilde oku.'],
  ['kaynak', <Library size={18} />, 'Kaynaklarıyla bilgi', 'Bilgiler kurum kaynaklarına dayanır; kaynak bağlantıları her eserin sayfasında yer alır.'],
  ['sor', <MessageCircle size={18} />, 'Esere Sor', 'Merak ettiğini yaz; yapay zekâ rehberi eserin bilgisine dayanarak yanıtlasın.'],
  ['katki', <ImagePlus size={18} />, 'Ziyaretçi katkıları', 'Ziyaretçilerin onaylanan fotoğrafları ve anıları eserin sayfasında yer alır.'],
  ['muhur', <Stamp size={18} />, 'Pasaport mührü', 'Hikâyeyi okuduğunda eser, pasaportuna bir mühür olarak eklenir.'],
];
// A taste of each narration, written for any building so no fact is claimed.
const SAMPLES: Record<string, string> = {
  short: 'Kim yaptırdı, ne zaman, neden? Eserin hikâyesi birkaç kısa paragrafta, kaynaklarıyla.',
  story: 'Kapının önünde durduğunu düşün. Taşın serinliği, avludaki su sesi… Hikâye seni yüzyıllar öncesine götürür.',
  child: 'Hiç yüzlerce yıllık bir kapıya dokundun mu? Bu yapının da anlatacak çok güzel bir sırrı var!',
};

export function ArtifactAnatomy({ artifact }: { artifact: DiscoveryArtifact }) {
  const notes = NOTES.filter(([part]) => (part !== 'sor' || chatEndpoint()) && (part !== 'katki' || vakifApiEnabled()));
  const number = (part: Part) => notes.findIndex(([p]) => p === part) + 1;
  const ref = useRef<HTMLDivElement>(null);
  const shown = useInView(ref, { once: true, amount: 0.15 });
  const visible = useInView(ref, { amount: 0.15 });
  const still = Boolean(useReducedMotion());
  const [mode, setMode] = useState(0);
  useEffect(() => {
    // The narration switch turns by itself while the plate is on screen.
    if (still || !visible) return;
    const timer = setInterval(() => setMode(m => (m + 1) % narrationModes.length), 3200);
    return () => clearInterval(timer);
  }, [still, visible]);
  const facts = [artifact.city, artifact.category, known(artifact.year) ? artifact.year : null].filter((f): f is string => known(f));
  const badge = (part: Part) => number(part) ? <i className="aa-badge" data-part={part}>{pad(number(part))}</i> : null;
  const half = Math.ceil(notes.length / 2);
  const note = ([part, icon, title, text]: typeof NOTES[number]) => <li key={part} className="aa-note" style={{ '--n': number(part) } as CSSProperties}>
    <span className="aa-note-num">{pad(number(part))}</span>
    <span className="aa-note-icon" aria-hidden="true">{icon}</span>
    <b>{title}</b><p>{text}</p>
  </li>;
  return <div ref={ref} className={`aa ${shown || still ? 'shown' : ''}`}>
    <ol className="aa-notes left">{notes.slice(0, half).map(note)}</ol>
    <div className="aa-plate" aria-hidden="true">
      <svg className="aa-arches" viewBox="0 0 600 700" fill="none">
        <path pathLength="1" d="M60 700V250A240 210 0 0 1 540 250V700" />
        <path pathLength="1" d="M20 700V240A280 245 0 0 1 580 240V700" />
        <path pathLength="1" d="M300 -20V700" className="axis" />
      </svg>
      <div className="aa-page">
        <span className="aa-corner tl">✦</span><span className="aa-corner tr">✦</span><span className="aa-corner bl">✦</span><span className="aa-corner br">✦</span>
        <div className="aa-window"><span className="aa-arch"><img src={artifact.image} alt="" loading="lazy" /></span>{badge('muhur') && <span className="aa-stamp"><Stamp size={20} />{badge('muhur')}</span>}</div>
        <p className="aa-kicker">{facts.join(' · ').toLocaleUpperCase('tr-TR')}</p>
        <h3>{artifact.name}</h3>
        <div className="aa-modes">{badge('anlatim')}{narrationModes.map(([value, label], i) => <span key={value} className={i === mode ? 'on' : ''}>{label}</span>)}</div>
        <div className="aa-sample">{narrationModes.map(([value], i) => <p key={value} className={`${i === mode ? 'on' : ''} ${value}`}>{SAMPLES[value]}</p>)}</div>
        <div className="aa-tools">
          <span className="aa-chip">{badge('kaynak')}<Library size={14} />Kaynaklar{artifact.sourceReferences.length ? ` · ${artifact.sourceReferences.length}` : ''}</span>
          {number('sor') > 0 && <span className="aa-chip gold">{badge('sor')}<MessageCircle size={14} />Esere Sor</span>}
          {number('katki') > 0 && <span className="aa-chip">{badge('katki')}<ImagePlus size={14} />Katkılar</span>}
        </div>
      </div>
    </div>
    <ol className="aa-notes right">{notes.slice(half).map(note)}</ol>
    <div className="aa-foot"><Link className="hp-cta en-key" to={`/eser/${artifact.slug}`}><span className="en-key-label">Bu eserin sayfasını aç</span><span className="en-key-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span></Link></div>
  </div>;
}
