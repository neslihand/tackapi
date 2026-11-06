import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { currentLang, locale, t } from '../lib/i18n';
import { createNarrator, listenMinutes, type Narrator, type NarratorState, type Synth, type Utterance } from '../lib/speech';

const synth = (): Synth | null => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
  ? window.speechSynthesis as unknown as Synth : null;

/**
 * "Dinle": the telling on screen read aloud by the browser's voice (lib/speech.ts), like the app's Sesli Rehber.
 * Play/pause, stop, and how far it has got. Not shown when there is nothing to read or the browser has no voice.
 * `label` names the telling for screen readers ("Listen: Story").
 */
export function ListenButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<NarratorState>('idle');
  const [ratio, setRatio] = useState(0);
  const narrator = useRef<Narrator | null>(null);
  // a new telling (or language) is a new reading: the old voice stops
  useEffect(() => () => { narrator.current?.stop(); narrator.current = null; setState('idle'); setRatio(0); }, [text]);
  const voice = synth();
  if (!text || !voice) return null;

  function toggle() {
    if (state === 'playing') { narrator.current?.pause(); return; }
    if (!narrator.current) {
      narrator.current = createNarrator(voice!, s => new SpeechSynthesisUtterance(s) as unknown as Utterance, text, currentLang(),
        { onState: setState, onProgress: setRatio });
    }
    narrator.current.play();
  }
  function stop() { narrator.current?.stop(); narrator.current = null; }

  const percent = Math.round(ratio * 100);
  const playing = state === 'playing';
  const action = playing ? t('Duraklat', 'Pause') : state === 'paused' ? t('Sürdür', 'Resume') : t('Dinle', 'Listen');
  const minutes = listenMinutes(text).toLocaleString(locale());
  return <div className={`story-listen ${state}`} role="group" aria-label={t('Sesli dinleme', 'Listen aloud')}>
    <button type="button" className="story-sound" onClick={toggle} aria-pressed={playing}
      aria-label={`${action}: ${label}`} title={t(`Yaklaşık ${minutes} dakika`, `About ${minutes} min`)}>
      <span className="story-save-icon" aria-hidden="true">{playing ? <Pause size={16} /> : <Play size={16} />}</span>
      <span>{action}</span>
    </button>
    {state !== 'idle' && <>
      <span className="story-listen-bar" role="progressbar" aria-label={t('Dinleme ilerlemesi', 'Listening progress')}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={t(`Yüzde ${percent}`, `${percent} percent`)}>
        <span style={{ transform: `scaleX(${ratio})` }} />
      </span>
      <button type="button" className="story-listen-stop" onClick={stop} aria-label={t('Dinlemeyi durdur', 'Stop listening')}>
        <Square size={13} aria-hidden="true" fill="currentColor" />
      </button>
    </>}
    <span className="sr-only" aria-live="polite">{playing ? t(`${label} okunuyor`, `Reading ${label}`) : state === 'paused' ? t('Duraklatıldı', 'Paused') : ''}</span>
  </div>;
}
