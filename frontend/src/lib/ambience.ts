import { useEffect, useRef, useState } from 'react';

// Ambient sound for the story pages, synthesised in the browser (no recordings, nothing downloaded): a courtyard at
// night. Layers: a low drone (dem), wind, the trickle of a şadırvan, slow ney-like phrases in makam Hicaz, a music box
// and birds. Each scene sets how loud each layer is; changes glide. It stays silent until the reader turns it on.

type Layer = 'drone' | 'wind' | 'water' | 'ney' | 'chime' | 'birds';
type Mood = Record<Layer, number>;
const quiet: Mood = { drone: 0, wind: 0, water: 0, ney: 0, chime: 0, birds: 0 };
const mood = (m: Partial<Mood>): Mood => ({ ...quiet, ...m });

// Story: night of drawing, the living courtyard, the close look, dawn. Children: a music box under the stars.
// Short: only the fountain.
export function moodFor(mode: string, chapter: number): Mood {
  if (mode === 'child') return mood({ chime: 1, birds: .35, water: .35, wind: .15 });
  if (mode === 'short') return mood({ water: .7, drone: .25 });
  return [
    mood({ drone: .8, wind: .8, ney: .8 }),
    mood({ drone: .6, wind: .3, water: .8, ney: .7 }),
    mood({ drone: .9, wind: .15, water: .3, ney: 1 }),
    mood({ drone: .45, wind: .2, water: .45, ney: .6, birds: 1 }),
  ][Math.min(chapter, 3)];
}

// Hicaz on D: D E♭ F♯ G A B♭ C D (the closest equal-tempered pitches).
const HICAZ = [293.66, 311.13, 369.99, 392, 440, 466.16, 523.25, 587.33];
// A music box in C major pentatonic, two octaves up.
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

class Ambience {
  private ctx = new AudioContext();
  private master = this.ctx.createGain();
  private layers = {} as Record<Layer, GainNode>;
  private noise: AudioBuffer;
  private timers: number[] = [];
  private level = quiet;

  constructor() {
    const ctx = this.ctx;
    this.master.gain.value = 0;
    const out = ctx.createDynamicsCompressor();
    this.master.connect(out).connect(ctx.destination);
    for (const name of ['drone', 'wind', 'water', 'ney', 'chime', 'birds'] as Layer[]) {
      const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(this.master); this.layers[name] = gain;
    }
    // Two seconds of soft (pink-ish) noise, looped, feed the wind, the water and the breath of the ney.
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) { last = 0.97 * last + 0.03 * (Math.random() * 2 - 1); data[i] = last * 6; }
    this.drone(); this.wind(); this.water();
    this.every(() => this.nayPhrase(), 7000, 3000);
    this.every(() => this.musicBox(), 5200, 1500);
    this.every(() => this.bird(), 4200, 2000);
  }

  private source() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(); return s; }
  private every(fn: () => void, wait: number, first: number) {
    const tick = () => { fn(); this.timers.push(window.setTimeout(tick, wait * (0.7 + Math.random() * 0.6))); };
    this.timers.push(window.setTimeout(tick, first));
  }

  private drone() {
    const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 520;
    const gain = this.ctx.createGain(); gain.gain.value = 0.16;
    filter.connect(gain).connect(this.layers.drone);
    for (const [frequency, detune] of [[73.42, 0], [110, 3], [146.83, -4]]) {
      const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = frequency; osc.detune.value = detune;
      osc.connect(filter); osc.start();
    }
  }

  private wind() {
    const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420; filter.Q.value = 0.8;
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.06;
    const depth = this.ctx.createGain(); depth.gain.value = 260;
    lfo.connect(depth).connect(filter.frequency); lfo.start();
    const gain = this.ctx.createGain(); gain.gain.value = 0.32;
    this.source().connect(filter).connect(gain).connect(this.layers.wind);
  }

  private water() {
    const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 2600; filter.Q.value = 1.2;
    const trickle = this.ctx.createGain(); trickle.gain.value = 0.05;
    this.source().connect(filter).connect(trickle).connect(this.layers.water);
    // The trickle comes in small uneven pulses.
    this.timers.push(window.setInterval(() => {
      const t = this.ctx.currentTime;
      trickle.gain.setTargetAtTime(0.025 + Math.random() * 0.06, t, 0.05);
      filter.frequency.setTargetAtTime(2000 + Math.random() * 1600, t, 0.08);
    }, 120));
  }

  // A ney-like phrase: a breathy, slightly wavering tone moving stepwise through Hicaz and resting on D or A.
  private nayPhrase() {
    if (this.level.ney < 0.05) return;
    const ctx = this.ctx;
    let step = Math.random() < 0.5 ? 0 : 4;
    let t = ctx.currentTime + 0.1;
    const notes = 3 + Math.floor(Math.random() * 3);
    for (let n = 0; n < notes; n++) {
      if (n === notes - 1) step = Math.random() < 0.6 ? 0 : 4;
      const length = 1.3 + Math.random() * 1.5;
      this.nayNote(HICAZ[step], t, length);
      t += length * 0.92;
      step = Math.max(0, Math.min(HICAZ.length - 1, step + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
    }
  }

  private nayNote(frequency: number, at: number, length: number) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = frequency;
    const vibrato = ctx.createOscillator(); vibrato.frequency.value = 4.8;
    const vibratoDepth = ctx.createGain(); vibratoDepth.gain.setValueAtTime(0, at); vibratoDepth.gain.linearRampToValueAtTime(frequency * 0.008, at + length * 0.6);
    vibrato.connect(vibratoDepth).connect(osc.frequency);
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1500;
    const env = ctx.createGain(); env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.12, at + 0.35); env.gain.setTargetAtTime(0.09, at + 0.4, 0.4); env.gain.setTargetAtTime(0, at + length - 0.3, 0.18);
    osc.connect(tone).connect(env).connect(this.layers.ney);
    // Breath: noise around the pitch, strongest at the start of the note.
    const breath = ctx.createBufferSource(); breath.buffer = this.noise;
    const band = ctx.createBiquadFilter(); band.type = 'bandpass'; band.frequency.value = frequency * 2; band.Q.value = 3;
    const air = ctx.createGain(); air.gain.setValueAtTime(0, at); air.gain.linearRampToValueAtTime(0.05, at + 0.2); air.gain.setTargetAtTime(0.015, at + 0.3, 0.3); air.gain.setTargetAtTime(0, at + length - 0.3, 0.18);
    breath.connect(band).connect(air).connect(this.layers.ney);
    for (const node of [osc, vibrato, breath]) { node.start(at); node.stop(at + length + 1); }
  }

  private musicBox() {
    if (this.level.chime < 0.05) return;
    let t = this.ctx.currentTime + 0.05;
    let step = Math.floor(Math.random() * 3);
    for (let n = 0; n < 4 + Math.floor(Math.random() * 3); n++) {
      this.chime(PENTATONIC[step], t);
      t += 0.38 + Math.random() * 0.3;
      step = Math.max(0, Math.min(PENTATONIC.length - 1, step + [-1, 1, 1, 2, -2][Math.floor(Math.random() * 5)]));
    }
  }

  private chime(frequency: number, at: number) {
    for (const [ratio, level] of [[1, 0.09], [2.76, 0.025]]) {
      const osc = this.ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = frequency * ratio;
      const env = this.ctx.createGain(); env.gain.setValueAtTime(0, at); env.gain.linearRampToValueAtTime(level, at + 0.008); env.gain.exponentialRampToValueAtTime(0.0001, at + 1.6);
      osc.connect(env).connect(this.layers.chime); osc.start(at); osc.stop(at + 1.7);
    }
  }

  private bird() {
    if (this.level.birds < 0.05) return;
    let t = this.ctx.currentTime + 0.05;
    const base = 2600 + Math.random() * 1200;
    for (let n = 0; n < 2 + Math.floor(Math.random() * 3); n++) {
      const osc = this.ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(base, t); osc.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.07); osc.frequency.exponentialRampToValueAtTime(base * 1.1, t + 0.12);
      const env = this.ctx.createGain(); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.03, t + 0.015); env.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
      osc.connect(env).connect(this.layers.birds); osc.start(t); osc.stop(t + 0.15);
      t += 0.16 + Math.random() * 0.08;
    }
  }

  setMood(next: Mood) {
    this.level = next;
    const t = this.ctx.currentTime;
    for (const name of Object.keys(next) as Layer[]) this.layers[name].gain.setTargetAtTime(next[name], t, 1.2);
  }
  async start() { await this.ctx.resume(); this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 1); }
  stop() { this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); }
  close() { this.timers.forEach(id => { clearTimeout(id); clearInterval(id); }); this.ctx.close(); }
}

export function useAmbience(mode: string, chapter: number) {
  const engine = useRef<Ambience | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => { engine.current?.setMood(moodFor(mode, chapter)); }, [mode, chapter]);
  useEffect(() => () => { engine.current?.close(); engine.current = null; }, []);
  async function toggle() {
    try {
      if (!engine.current) { engine.current = new Ambience(); engine.current.setMood(moodFor(mode, chapter)); }
      if (on) engine.current.stop(); else await engine.current.start();
      setOn(!on);
    } catch { setOn(false); }
  }
  return { on, toggle };
}
