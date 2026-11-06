import test from 'node:test';
import assert from 'node:assert/strict';
import { chunks, createNarrator, listenMinutes, pickVoice, speechLang, tellingText, type Synth, type Utterance } from '../src/lib/speech.ts';

const demo = { chapters: [
  { title: 'Gece', short: 'Kısa bir.', story: 'Uzun   hikâye.', child: '' },
  { title: 'Sabah', short: 'İkinci kısa.', story: 'Devamı.', child: '' },
] };

test('Okunacak metin: arka uç eserinde kayıtlı anlatım, demo eserde bölümler', () => {
  const backend = { chapters: [], origin: { narrations: { short: ' Özet ', story: 'Hikâye\nmetni.', child: '' } } };
  assert.equal(tellingText(backend, 'story'), 'Hikâye metni.');
  assert.equal(tellingText(backend, 'child'), '');
  assert.equal(tellingText(demo, 'story'), 'Gece. Uzun hikâye. Sabah. Devamı.');
  assert.equal(tellingText(demo, 'child'), '', 'anlatımı olmayan biçimde kontrol gizlenir');
});

test('Metin cümle sınırlarından parçalanır, hiçbir şey kaybolmaz', () => {
  const text = 'Bir. İki! Üç? Dört… Beş.';
  assert.deepEqual(chunks(text, 10), ['Bir. İki!', 'Üç? Dört…', 'Beş.']);
  assert.deepEqual(chunks(text), [text]);
  assert.deepEqual(chunks('Noktasız tek uzun cümle', 5), ['Noktasız tek uzun cümle']);
});

test('Dil ve ses seçimi', () => {
  assert.equal(speechLang('tr'), 'tr-TR');
  assert.equal(speechLang('en'), 'en-US');
  const voices = [{ lang: 'en-GB' }, { lang: 'tr_TR' }, { lang: 'en-US', default: true }];
  assert.equal(pickVoice(voices, 'tr'), voices[1]);
  assert.equal(pickVoice(voices, 'en'), voices[2]);
  assert.equal(pickVoice([{ lang: 'de-DE' }], 'tr'), undefined);
  assert.equal(listenMinutes('a'), 1);
  assert.equal(listenMinutes('a'.repeat(14 * 60 * 2 + 1)), 3);
});

// A fake browser voice: utterances queue up; finish() ends the one being spoken, cancel() drops them all and,
// like Chrome, fires onerror on the dropped one.
function fakeSynth() {
  const queue: Utterance[] = [];
  const spoken: string[] = [];
  const synth: Synth = {
    speak(u) { queue.push(u); spoken.push(u.text); },
    cancel() { const dropped = queue.splice(0); dropped.forEach(u => u.onerror?.()); },
    getVoices: () => [{ lang: 'tr-TR' }],
  };
  const make = (text: string): Utterance => ({ text, lang: '', rate: 1, onend: null, onerror: null, onboundary: null });
  const finish = () => { const u = queue.shift(); u?.onend?.(); };
  return { synth, make, spoken, queue, finish };
}

test('Oynat, duraklat, sürdür ve bitir: ilerleme ve durum doğru akar', () => {
  const f = fakeSynth();
  const states: string[] = [];
  const progress: number[] = [];
  let done = 0;
  const n = createNarrator(f.synth, f.make, 'Bir iki üç. Dört beş altı.', 'tr',
    { onState: s => states.push(s), onProgress: r => progress.push(r), onDone: () => { done += 1; } });
  // tek parça olmasın diye kısa sınır yok: 240'tan kısa metin tek parça
  n.play();
  assert.equal(n.state, 'playing');
  assert.equal(f.queue[0].lang, 'tr-TR');
  assert.deepEqual(f.queue[0].voice, { lang: 'tr-TR' });
  f.queue[0].onboundary?.({ charIndex: 13 });
  assert.ok(progress.at(-1)! > 0.4 && progress.at(-1)! < 0.6);
  n.pause();
  assert.equal(n.state, 'paused');
  assert.equal(f.queue.length, 0, 'duraklatma sesi hemen keser');
  n.play();
  assert.equal(n.state, 'playing');
  assert.equal(f.spoken.length, 2, 'sürdürünce kaldığı cümleden yeniden okur');
  f.finish();
  assert.equal(n.state, 'idle');
  assert.equal(progress.at(-1), 1);
  assert.equal(done, 1);
  assert.deepEqual(states, ['playing', 'paused', 'playing', 'idle']);
});

test('Uzun metin parça parça okunur; durdurunca baştan başlar, eski parçanın olayları yok sayılır', () => {
  const f = fakeSynth();
  const sentence = 'Bu cümle tam olarak yüz karakter uzunluğunda olsun diye biraz daha uzatılmış bir örnek cümledir burada. ';
  const text = sentence.repeat(6);
  const n = createNarrator(f.synth, f.make, text, 'en');
  n.play();
  assert.equal(f.queue[0].lang, 'en-US');
  assert.equal(f.queue[0].voice, undefined, 'dilde ses yoksa tarayıcı seçer');
  const first = f.queue[0];
  f.finish();
  assert.equal(f.spoken.length, 2);
  first.onend?.();                     // geç gelen eski olay ikinci kez ilerletmez
  assert.equal(f.spoken.length, 2);
  n.stop();
  assert.equal(n.state, 'idle');
  n.play();
  assert.equal(f.spoken.at(-1), f.spoken[0], 'durdurulan okuma baştan başlar');
});

test('Ses hatası okumayı sonlandırır; boş metin hiç başlamaz', () => {
  const f = fakeSynth();
  const n = createNarrator(f.synth, f.make, 'Tek cümle.', 'tr');
  n.play();
  f.queue[0].onerror?.();
  assert.equal(n.state, 'idle');
  const empty = createNarrator(f.synth, f.make, '', 'tr');
  empty.play();
  assert.equal(empty.state, 'idle');
});
