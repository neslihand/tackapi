// "Sesli Rehber": the telling read aloud by the phone's own voice (offline, no AI call). Long texts are split into
// sentences so stopping is immediate and Android's per-utterance length limit is never reached.
import * as Speech from 'expo-speech';
import { currentLang } from './i18n';

let session = 0;

export function chunks(text: string, max = 3000) {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  const out: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > max && current) { out.push(current.trim()); current = ''; }
    current += s;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function speak(text: string, onDone: () => void) {
  const mine = ++session;
  Speech.stop();
  const parts = chunks(text);
  const language = currentLang() === 'en' ? 'en-US' : 'tr-TR';
  parts.forEach((part, i) => Speech.speak(part, {
    language, rate: 0.95,
    onDone: i === parts.length - 1 ? () => { if (mine === session) onDone(); } : undefined,
    onStopped: i === parts.length - 1 ? () => { if (mine === session) onDone(); } : undefined,
    onError: () => { if (mine === session) onDone(); },
  }));
}

export function stopSpeaking() { session += 1; Speech.stop(); }
