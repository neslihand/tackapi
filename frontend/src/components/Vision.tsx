import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import type { DiscoveryArtifact } from '../lib/artifactContract';
import { centuryOf } from '../lib/games';
import { Statement } from './HomeScenes';
import '../vision.css';

// "Neden vakıf?": the culture behind the collection in one sentence that lights word by word, the collection's reach
// in three numbers counted from the live data, and the platform's vision.
const WHY: [string, boolean][] = [
  ['Bir çeşme kimse susuz kalmasın diye, bir han yolcu yolda kalmasın diye, bir medrese her çocuk okuyabilsin diye yapıldı. Yüzyıllardır şehirleri ayakta tutan bu iyilikleri tanımak, korumak ve yarına taşımak', false],
  ['hepimize emanet.', true],
];

const ROMAN: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n: number) => ROMAN.reduce((out, [value, mark]) => { while (n >= value) { out += mark; n -= value; } return out; }, '');

// A number that counts up the first time it comes into view.
function Count({ to }: { to: number }) {
  const ref = useRef<HTMLElement>(null);
  const shown = useInView(ref, { once: true, amount: 0.6 });
  const still = Boolean(useReducedMotion());
  const [value, setValue] = useState(still ? to : 0);
  useEffect(() => {
    if (still) { setValue(to); return; }
    if (!shown) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1400);
      setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [shown, still, to]);
  return <b ref={ref}>{String(value).padStart(2, '0')}</b>;
}

export function Vision({ artifacts }: { artifacts: DiscoveryArtifact[] }) {
  const cities = new Set(artifacts.map(a => a.city)).size;
  const centuries = artifacts.map(a => centuryOf(a.year)).filter((c): c is number => c !== null);
  const first = Math.min(...centuries), last = Math.max(...centuries);
  const stats: [number, string, string][] = [
    [artifacts.length, 'eser', 'Hikâyesiyle, kaynaklarıyla'],
    [cities, 'şehir', 'Anadolu’nun dört bir yanından'],
    ...(centuries.length ? [[last - first + 1, 'yüzyıl', `${roman(first)}. yüzyıldan ${roman(last)}. yüzyıla`] as [number, string, string]] : []),
  ];
  return <div className="vs">
    <Statement parts={WHY} />
    <div className="vs-foot">
      <ul className="vs-stats">{stats.map(([n, unit, note]) => <li key={unit}><Count to={n} /><span>{unit}</span><small>{note}</small></li>)}</ul>
      <figure className="vs-vision">
        <figcaption>VİZYONUMUZ</figcaption>
        <blockquote>Her vakıf eserinin hikâyesi kayda geçsin; her nesil onu <em>kendi merakıyla</em> yeniden keşfetsin.</blockquote>
      </figure>
    </div>
  </div>;
}
