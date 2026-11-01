import { normalize } from './progress.ts';

// The eras in time order, as the backend names them (backend/pipeline/periods.py), each with its parent era where it
// has one: [Turkish name, English name, parent index]. Matched on the name without "Dönemi"/"Period", so the built-in
// demo works ("Erken Osmanlı") find their place too.
const ERAS: [string, string, number?][] = [
  ['Tarih Öncesi Çağlar', 'Prehistoric Ages'], ['İlk Çağ', 'Antiquity'], ['Hitit Dönemi', 'Hittite Period', 1],
  ['Frig, Lidya ve Pers Dönemleri', 'Phrygian, Lydian and Persian Periods', 1], ['Helenistik Dönem', 'Hellenistic Period', 1],
  ['Roma Dönemi', 'Roman Period', 1], ['Bizans Dönemi', 'Byzantine Period'], ['Antakya Haçlı Prinkepsliği', 'Crusader Principality of Antioch'],
  ['Memlük Dönemi', 'Mamluk Period'], ['Anadolu Selçuklu Dönemi', 'Anatolian Seljuk Period'], ['Beylikler Dönemi', 'Period of the Anatolian Beyliks'],
  ['Karamanoğulları Dönemi', 'Karamanid Period', 10], ['Eşrefoğulları Dönemi', 'Eshrefid Period', 10], ['Osmanlı Dönemi', 'Ottoman Period'],
  ['Erken Osmanlı Dönemi', 'Early Ottoman Period', 13], ['Klasik Osmanlı Dönemi', 'Classical Ottoman Period', 13],
  ['Lale Devri ve Batılılaşma', 'Tulip Era and Westernization', 13], ['Tanzimat ve Son Dönem Osmanlı', 'Tanzimat and Late Ottoman Period', 13],
  ['Fransız Mandası ve Hatay Devleti', 'French Mandate and Hatay State'], ['Cumhuriyet Dönemi', 'Republican Period'],
];
const key = (name: string) => normalize(name).replace(/\s+(donemi|donem|period|periods)$/, '').trim();
const index = new Map(ERAS.flatMap(([tr, en], i) => [[key(tr), i], [key(en), i]] as [string, number][]));
const eraOf = (name: string) => index.get(key(name));

export type EraOption = { value: string; label: string; child: boolean };

// The era filter's options: in time order, an era's sub-eras right under it. A parent era is offered whenever a work
// belongs to it or to one of its sub-eras, so "Osmanlı Dönemi" can gather every Ottoman work. Eras not in the list
// come last, in alphabetical order.
export function eraOptions(names: string[], english = false): EraOption[] {
  const present = [...new Set(names.filter(Boolean))];
  const known = new Map<number, string>();
  const unknown: string[] = [];
  for (const name of present) { const i = eraOf(name); if (i === undefined) unknown.push(name); else known.set(i, name); }
  for (const i of [...known.keys()]) { const parent = ERAS[i][2]; if (parent !== undefined && !known.has(parent)) known.set(parent, ERAS[parent][english ? 1 : 0]); }
  const sortKey = (i: number) => { const parent = ERAS[i][2]; return parent === undefined ? [i, -1] : [parent, i]; };
  const ordered = [...known.keys()].sort((a, b) => { const [pa, ca] = sortKey(a), [pb, cb] = sortKey(b); return pa - pb || ca - cb; });
  return [...ordered.map(i => ({ value: known.get(i)!, label: known.get(i)!, child: ERAS[i][2] !== undefined && known.has(ERAS[i][2]!) })),
    ...unknown.sort((a, b) => a.localeCompare(b, 'tr')).map(name => ({ value: name, label: name, child: false }))];
}

// Whether a work of era `name` is in the chosen era: the same era, or one of its sub-eras.
export function inEra(chosen: string, name: string) {
  if (!chosen) return true;
  if (chosen === name) return true;
  const c = eraOf(chosen), n = eraOf(name);
  return c !== undefined && n !== undefined && ERAS[n][2] === c;
}
