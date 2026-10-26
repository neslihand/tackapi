import json, os, collections
DATA = os.path.join(os.path.dirname(__file__), '..', 'data')
mons = [m for m in json.load(open(os.path.join(DATA, 'monuments_all.json'), encoding='utf-8'))
        if not m.get('synthetic') and m['paras_tr']]
done = {f[:-5] for f in os.listdir(os.path.join(DATA, 'extractions')) if f.endswith('.json')}
tot, ok, rej = collections.Counter(), collections.Counter(), collections.Counter()
for m in mons:
    tot[m['book']] += 1
    if m['slug'] in done:
        ok[m['book']] += 1
        try:
            e = json.load(open(os.path.join(DATA, 'extractions', m['slug'] + '.json'), encoding='utf-8'))
            rej[m['book']] += len(e.get('_validation', {}).get('rejected', []))
        except Exception:
            print('BOZUK DOSYA:', m['slug'])
for b in tot:
    print(f"{b:8}  {ok[b]:4}/{tot[b]:<4} tamamlandı   reddedilen öğe: {rej[b]}")
print(f"TOPLAM    {sum(ok.values())}/{sum(tot.values())}  —  kalan: {sum(tot.values()) - sum(ok.values())}")
nxt = next((m for m in mons if m['slug'] not in done), None)
print('Sıradaki eser:', nxt['slug'] if nxt else 'yok, hepsi bitti')