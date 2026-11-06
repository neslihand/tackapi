// "Sesli Rehber" on the web: the telling on screen read aloud by the browser's own voice (Web Speech API; offline on
// most systems, no AI call), the same way the mobile app reads it with the phone's voice (mobile/src/lib/speech.ts).
// The text is the one the page shows for the chosen telling: a backend monument's stored narration (origin.narrations,
// the same GET /api/monuments/{slug} field the app reads) or, for a demo work, its chapters in that telling.
// Long texts go out sentence by sentence: stopping is immediate, Chrome never cuts a long utterance short, and a
// pause can pick up again at the sentence it stopped in. No React and no runtime imports here, so tests can load it.

export type Telling = 'short' | 'story' | 'child';
export type TellingSource = {
  chapters: { title: string; short: string; story: string; child: string }[];
  origin?: { narrations: { short: string; story: string; child: string } } | null;
};

/** The text read aloud for a telling; '' when the work has nothing to read in it. */
export function tellingText(artifact: TellingSource, mode: Telling) {
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
  if (artifact.origin) return clean(artifact.origin.narrations[mode]);
  return artifact.chapters.map(c => clean(c[mode]) && [clean(c.title), clean(c[mode])].filter(Boolean).join('. '))
    .filter(Boolean).join(' ');
}

/** Sentences, joined up to `max` characters a part (one long sentence stays whole). */
export function chunks(text: string, max = 240) {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  const out: string[] = [];
  let current = '';
  for (const s of sentences) {
    if ((current + s).length > max && current.trim()) { out.push(current.trim()); current = ''; }
    current += s;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export const speechLang = (lang: 'tr' | 'en') => lang === 'en' ? 'en-US' : 'tr-TR';

/** A voice that speaks the language (the system default for it first), or undefined to let the browser choose. */
export function pickVoice<V extends { lang: string; default?: boolean }>(voices: readonly V[], lang: 'tr' | 'en') {
  const of = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(lang));
  return of.find(v => v.default) ?? of[0];
}

/** Minutes, rounded up, at an unhurried reading pace (about 14 characters a second). */
export const listenMinutes = (text: string) => Math.max(1, Math.ceil(text.length / 14 / 60));

export type NarratorState = 'idle' | 'playing' | 'paused';
// The parts of the Web Speech API the narrator uses; tests hand in a fake.
export type Utterance = {
  text: string; lang: string; rate: number; voice?: unknown;
  onend: (() => void) | null; onerror: (() => void) | null; onboundary: ((e: { charIndex: number }) => void) | null;
};
export type Synth = { speak(u: Utterance): void; cancel(): void; getVoices?(): { lang: string; default?: boolean }[] };

/**
 * Reads `text` part by part. onState reports idle/playing/paused; onProgress the share of the text spoken so far
 * (0–1, moving inside a part with the voice's word boundaries where the browser reports them). Pausing cancels the
 * voice and remembers the part: resuming starts that sentence again, which every browser supports (pause() does not).
 */
export function createNarrator(synth: Synth, make: (text: string) => Utterance, text: string, lang: 'tr' | 'en',
  on: { onState?: (s: NarratorState) => void; onProgress?: (ratio: number) => void; onDone?: () => void } = {}) {
  const parts = chunks(text);
  const total = parts.reduce((sum, p) => sum + p.length, 0) || 1;
  const before = parts.map((_, i) => parts.slice(0, i).reduce((sum, p) => sum + p.length, 0));
  let index = 0;
  let state: NarratorState = 'idle';
  let session = 0;
  const set = (s: NarratorState) => { state = s; on.onState?.(s); };
  const voice = pickVoice(synth.getVoices?.() ?? [], lang);

  function say(i: number) {
    const mine = ++session;   // every part has its own turn: a late or repeated event of an older part is ignored
    if (i >= parts.length) { index = 0; set('idle'); on.onProgress?.(1); on.onDone?.(); return; }
    index = i;
    on.onProgress?.(before[i] / total);
    const u = make(parts[i]);
    u.lang = speechLang(lang); u.rate = 0.95;
    if (voice) u.voice = voice;
    u.onboundary = e => { if (mine === session) on.onProgress?.(Math.min(before[i] + e.charIndex, total) / total); };
    u.onend = () => { if (mine === session && state === 'playing') say(i + 1); };
    u.onerror = () => { if (mine === session && state === 'playing') { session += 1; synth.cancel(); set('idle'); } };
    synth.speak(u);
  }

  return {
    get state() { return state; },
    play() {
      if (!parts.length || state === 'playing') return;
      session += 1; synth.cancel();
      set('playing'); say(index);   // from the start, or again from the sentence a pause stopped in
    },
    pause() { if (state !== 'playing') return; session += 1; synth.cancel(); set('paused'); },
    stop() {
      const was = state;
      session += 1; index = 0;
      if (was === 'playing') synth.cancel();
      if (was !== 'idle') { set('idle'); on.onProgress?.(0); }
    },
  };
}
export type Narrator = ReturnType<typeof createNarrator>;
