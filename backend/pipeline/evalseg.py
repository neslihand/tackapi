"""Bölümleme kalite ölçümü.
start_ok : TR metnin ilk 2 paragrafından biri konum cümlesi ya da eser adını içeriyor
leak     : TR metnin içinde (ilk paragraf dışında) başka bir eserin açılış kalıbı var
           ('Cami, Meram, ...', 'Osmangazi ilçesi, ... Mahallesi ... yer almaktadır')
"""
import json, sys, re, os
sys.path.insert(0, os.path.dirname(__file__))
from segment import title_tokens, ascii_fold
from books import BOOKS, DISTRICTS

def opener(p, city):
    d = '|'.join(DISTRICTS[city])
    h = p[:220]
    a = re.match(rf"^(Cami|Mescit|Mescid|Türbe|Kümbet|Yapı|Eser|Han|Hamam|Medrese|Çeşme|Tekke|Zaviye|Dergâh|Kilise|Hazire|Bedesten|Arasta)[ ,]+({d})\b", h)
    b = re.match(rf"^({d})(\s+ilçesi)?,\s+[^.]{{0,120}}(Mahalle|Köyü|Caddesi|Sokak)[^.]{{0,160}}(yer al|bulun|konumlan)", h)
    return bool(a or b)

def loc(p):
    h = re.split(r'(?<=[.])\s', p[:350])[0]
    return bool(re.search(r'(Mahalle|Cadde|Sokak|ilçe|İlçe|Köyü|köyü|merkez|Mıntıka)', h) and re.search(r'(yer al|bulun|konumlan|inşa)', h))

def ev(book, show=0):
    city = BOOKS[book]['city']
    d = json.load(open(os.path.join(os.path.dirname(__file__), f'../data/{book}/segments.json'), encoding='utf-8'))
    mons = [s for s in d['sections'] if s['kind'] == 'monument']
    n = len(mons); ok = 0; leaks = []; bad = []
    for m in mons:
        tr = m['paras_tr']
        toks = title_tokens(m['title_tr'], m['title_en'])
        first2 = tr[:2]
        if any(loc(p) or any(t in ascii_fold(p[:250]) for t in toks) for p in first2):
            ok += 1
        else:
            bad.append(m)
        for p in tr[1:]:
            if opener(p, city) and not any(t in ascii_fold(p[:200]) for t in toks):
                leaks.append((m, p[:90])); break
    print(f"{book}: n={n} start_ok={ok/n:.0%} leak={len(leaks)} ({len(leaks)/n:.0%})")
    for m in bad[:show]:
        print('   START?', m.get('heading_line'), m['title_tr'][:40], '|', (m['paras_tr'][0] if m['paras_tr'] else '')[:80])
    for m, p in leaks[:show]:
        print('   LEAK  ', m.get('heading_line'), m['title_tr'][:40], '|', p)
    return n, ok, len(leaks)

if __name__ == '__main__':
    show = int(os.environ.get('SHOW', '0'))
    tot = [0, 0, 0]
    for b in (sys.argv[1:] or list(BOOKS)):
        r = ev(b, show)
        tot = [x + y for x, y in zip(tot, r)]
    print(f"TOTAL n={tot[0]} start_ok={tot[1]/tot[0]:.1%} leak={tot[2]/tot[0]:.1%}")
