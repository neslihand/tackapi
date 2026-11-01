import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, BookOpen, ImagePlus, Library, MessageCircle, Stamp } from 'lucide-react';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { chatEndpoint } from '../lib/chatApi';
import { Link } from '../lib/navigation';
import { narrationLabel, narrationModes } from '../lib/preferences';
import { locale, t } from '../lib/i18n';
import { vakifApiEnabled } from '../lib/vakifApi';
import { known } from '../lib/content';
import '../anatomy.css';

// "Bir eserin içi": an artifact's page drawn as an annotated plate. A parchment page in the middle (the building in a
// round-topped door, its name, the narration switch turning by itself, the sources, the assistant, visitors' photos, the stamp)
// carries numbered marks; the notes around it explain each mark, joined to the page by fine gold rules. The page is a
// drawing, not the real page, so it is hidden from assistive technology; the notes carry the same information.
const pad = (n: number) => String(n).padStart(2, '0');
// Backend records say "Bilinmiyor" (unknown) where a fact is missing; those are left out rather than shown.
export { known };

type Part = 'anlatim' | 'kaynak' | 'sor' | 'katki' | 'muhur';
const notesAll = (): [Part, ReactNode, string, string][] => [
  ['anlatim', <BookOpen size={18} />, t('Üç anlatım biçimi', 'Three ways to tell it'), t('Kısa ve Öz, Hikâyeleştirerek ya da Çocuklar İçin: aynı eseri sana uyan dilde oku.', 'Short and clear, as a story or for children: read the same work in the voice that suits you.')],
  ['kaynak', <Library size={18} />, t('Kaynaklarıyla bilgi', 'Knowledge with sources'), t('Bilgiler kurum kaynaklarına dayanır; kaynak bağlantıları her eserin sayfasında yer alır.', 'The facts rest on institutional sources, linked on every work’s page.')],
  ['sor', <MessageCircle size={18} />, t('Esere Sor', 'Ask the Work'), t('Merak ettiğini yaz; yapay zekâ rehberi eserin bilgisine dayanarak yanıtlasın.', 'Write what you wonder about; the AI guide answers from what is known about the work.')],
  ['katki', <ImagePlus size={18} />, t('Ziyaretçi katkıları', 'Visitor contributions'), t('Ziyaretçilerin onaylanan fotoğrafları ve anıları eserin sayfasında yer alır.', 'Visitors’ approved photos and memories appear on the work’s page.')],
  ['muhur', <Stamp size={18} />, t('Pasaport mührü', 'Passport stamp'), t('Hikâyeyi okuduğunda eser, pasaportuna bir mühür olarak eklenir.', 'When you read the story, the work is added to your passport as a stamp.')],
];
// A taste of each narration, written for any building so no fact is claimed.
const samples = (): Record<string, string> => ({
  short: t('Kim yaptırdı, ne zaman, neden? Eserin hikâyesi birkaç kısa paragrafta, kaynaklarıyla.', 'Who had it built, when and why? The work’s story in a few short paragraphs, with sources.'),
  story: t('Kapının önünde durduğunu düşün. Taşın serinliği, avludaki su sesi… Hikâye seni yüzyıllar öncesine götürür.', 'Imagine standing before the door. The cool of the stone, water in the courtyard… The story takes you back centuries.'),
  child: t('Hiç yüzlerce yıllık bir kapıya dokundun mu? Bu yapının da anlatacak çok güzel bir sırrı var!', 'Have you ever touched a door hundreds of years old? This building has a wonderful secret to tell, too!'),
});

export function ArtifactAnatomy({ artifact }: { artifact: DiscoveryArtifact }) {
  const notes = notesAll().filter(([part]) => (part !== 'sor' || chatEndpoint()) && (part !== 'katki' || vakifApiEnabled()));
  const sample = samples();
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
  const note = ([part, icon, title, text]: ReturnType<typeof notesAll>[number]) => <li key={part} className="aa-note" style={{ '--n': number(part) } as CSSProperties}>
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
        <p className="aa-kicker">{facts.join(' · ').toLocaleUpperCase(locale())}</p>
        <h3>{artifact.name}</h3>
        <div className="aa-modes">{badge('anlatim')}{narrationModes.map(([value], i) => <span key={value} className={i === mode ? 'on' : ''}>{narrationLabel(value)}</span>)}</div>
        <div className="aa-sample">{narrationModes.map(([value], i) => <p key={value} className={`${i === mode ? 'on' : ''} ${value}`}>{sample[value]}</p>)}</div>
        <div className="aa-tools">
          <span className="aa-chip">{badge('kaynak')}<Library size={14} />{t('Kaynaklar', 'Sources')}{artifact.sourceReferences.length ? ` · ${artifact.sourceReferences.length}` : ''}</span>
          {number('sor') > 0 && <span className="aa-chip gold">{badge('sor')}<MessageCircle size={14} />{t('Esere Sor', 'Ask the Work')}</span>}
          {number('katki') > 0 && <span className="aa-chip">{badge('katki')}<ImagePlus size={14} />{t('Katkılar', 'Contributions')}</span>}
        </div>
      </div>
    </div>
    <ol className="aa-notes right">{notes.slice(half).map(note)}</ol>
    <div className="aa-foot"><Link className="hp-cta en-key" to={`/eser/${artifact.slug}`}><span className="en-key-label">{t('Bu eserin sayfasını aç', 'Open this work’s page')}</span><span className="en-key-arrow" aria-hidden="true"><ArrowUpRight size={17} /></span></Link></div>
  </div>;
}
