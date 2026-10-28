import { useEffect, useState } from 'react';
import '../journey.css';

// The home page's four steps, after the entrance: be moved, understand, discover, take part. A slim rail on the right
// marks the step being read and jumps to the start of any other; it stays out of the way during the entrance, whose
// own scene rail is on screen then.
const STEPS: [string, string[]][] = [
  ['Etkilen', ['giris']],
  ['Anla', ['vizyon']],
  ['Keşfet', ['featured', 'araclar', 'eserin-ici', 'rotalar']],
  ['Katıl', ['pasaport', 'gunun-kesfi', 'kapanis']],
];

export function JourneyRail() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    // The last section whose top has passed the middle of the screen decides the step.
    let frame = 0;
    const check = () => {
      frame = 0;
      let current = 0;
      STEPS.forEach(([, ids], i) => ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= window.innerHeight / 2) current = i;
      }));
      setStep(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(check); };
    check();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Pinned scenes and late images move the sections without a scroll event.
    const grown = new ResizeObserver(schedule);
    grown.observe(document.body);
    return () => { cancelAnimationFrame(frame); grown.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, []);
  // The step's name shows for a moment when the step changes, then only on hover, so it never sits over the content.
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!step) return;
    setFlash(true);
    const timer = setTimeout(() => setFlash(false), 1800);
    return () => clearTimeout(timer);
  }, [step]);
  function go(i: number) {
    const el = STEPS[i][1].map(id => document.getElementById(id)).find(Boolean);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 70, behavior: 'smooth' });
  }
  return <nav className={`journey ${step === 0 ? 'away' : ''} ${flash ? 'flash' : ''}`} aria-label="Sayfa yolculuğu">
    <ol>{STEPS.map(([label], i) => <li key={label} className={i === step ? 'on' : i < step ? 'done' : ''}>
      <button onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}><i aria-hidden="true" /><span>{label}</span></button>
    </li>)}</ol>
  </nav>;
}
