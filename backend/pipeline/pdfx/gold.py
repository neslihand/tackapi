"""Altın küme: panelde elle düzeltilmiş pilot metinleriyle yeni çıkarımın karşılaştırılması (plan §2, Adım 6).

  python -m pdfx.gold --dump      # DATABASE_URL: pilotların etkin TR metni + kitap EN metni → data/pdfx/gold.json
                                  # (yalnızca SELECT; textfix_db.effective_paragraphs)
  python -m pdfx.gold             # gold.json ↔ works.json (çevrim dışı); hedef benzerlik ≥ %97
  python -m pdfx.gold --old       # gold yoksa: eski çıkarım (data/monuments_all.json) ile bütün eşleşen eserler

Eşleşme kuyruktan gelir (queue.json → db_slug). Ölçüler:
  benzerlik  normalleştirilmiş metinlerin sözcük dizisi üzerinde difflib oranı (sıra, tekrar ve bölünmeye duyarlı)
  kapsama    altın metindeki 5'li sözcük dizilerinin yeni metinde bulunan oranı (tekrar ve paragraf bölünmesinden
             etkilenmez; yeni metinde eksik kalan içeriği gösterir)
  fazla      yeni metindeki 5'li dizilerden altında olmayanların oranı
  paragraf   altın paragrafın yeni metinde ≥ 0,9 benzerlikli karşılığı yoksa `eksik`, tersi `fazla`
Not (3. oturum, 2 Kasım 2026): pilotların altın metni eski `.txt` dökümünden gelir ve panelde düzeltilmiş olsa da
onun izlerini taşır (iki kez geçen alıntılar, araya girmiş cümleler, eksik paragraflar). İngilizce altın metin ham
eski bölüm metnidir (`source_section.text_en`; panel düzeltmesi yok). Düşük benzerlik tek başına çıkarım hatası
değildir; `kapsama` ve farkın kendisi incelenmeli (`--diff SLUG`).
"""
import os, sys, re, json, argparse, difflib, collections
from . import OUT, ROOT
from books import BOOKS

GOLD = os.path.join(OUT, 'gold.json')

GOLD_SQL = """
SELECT m.id, m.slug, m.name_tr, b.slug AS book, s.text_en
FROM monument m JOIN source_book b ON b.id = m.book_id LEFT JOIN source_section s ON s.id = m.section_id
WHERE m.pilot ORDER BY m.slug
"""


def dump():
    """Pilotların ziyaretçinin gördüğü Türkçe metni ve kitap İngilizcesi (yalnızca okuma)."""
    if not os.environ.get('DATABASE_URL'):
        sys.exit('DATABASE_URL tanımlı değil.')
    from db import DB
    import textfix_db
    db = DB()
    out = {}
    for r in db.query(GOLD_SQL):
        paras = textfix_db.effective_paragraphs(db, r['id'])
        out[r['slug']] = dict(name_tr=r['name_tr'], book=r['book'], paras_tr=[p['text'] for p in paras],
                              paras_en=textfix_db.split_paras(r['text_en']))
    with open(GOLD, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f'{len(out)} pilot → {os.path.relpath(GOLD, ROOT)}')


def norm(s):
    s = re.sub(r'(?<=[^\W\d_])!(?=[^\W\d_]|\s|[,.;:]|$)', 'ş', s)   # eski metindeki Bursa '!' bozukluğu ('yıkılmı!')
    s = re.sub(r'[“”"‘’\'`´]', '', s.lower())
    s = re.sub(r'(\w)-\s+(\w)', r'\1\2', s)
    return re.sub(r'[^\w]+', ' ', s).split()


def ratio(a, b):
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()


def shingles(words, k=5):
    return {tuple(words[i:i + k]) for i in range(max(0, len(words) - k + 1))}


def coverage(gold_words, new_words):
    """(kapsama, fazla): altın 5'li dizilerin yenide bulunan oranı; yeni dizilerin altında olmayan oranı."""
    g, n = shingles(gold_words), shingles(new_words)
    if not g or not n:
        return (None, None)
    return len(g & n) / len(g), len(n - g) / len(n)


def para_check(gold, new):
    """(eksik, fazla): karşılığı bulunmayan paragraf sayıları."""
    g, n = [norm(p) for p in gold], [norm(p) for p in new]
    def missing(xs, ys):
        miss = 0
        for x in xs:
            if len(x) < 4:
                continue
            if not any(ratio(x, y) >= 0.9 or (len(x) < len(y) and ' '.join(x) in ' '.join(y)) for y in ys):
                miss += 1
        return miss
    return missing(g, n), missing(n, g)


def works_by_slug():
    with open(os.path.join(OUT, 'queue.json'), encoding='utf-8') as f:
        q = json.load(f)
    ids = {i['db_slug']: (i['book'], i['id']) for items in q['cities'].values() for i in items if i.get('db_slug')}
    works = {}
    for b in BOOKS:
        path = os.path.join(OUT, b, 'works.json')
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                for w in json.load(f)['works']:
                    works[(b, w['id'])] = w
    return {slug: works.get(key) for slug, key in ids.items()}


def compare(gold, label):
    by_slug = works_by_slug()
    rows = []
    for slug, g in sorted(gold.items()):
        w = by_slug.get(slug)
        if not w:
            rows.append((slug, None, None, None, None, 'kuyrukta eşleşme yok', None, None))
            continue
        new_tr = [p['text'] for p in w['paras_tr'] if p['kind'] != 'heading']
        gw, nw = norm(' '.join(g['paras_tr'])), norm(' '.join(new_tr))
        r_tr = ratio(gw, nw)
        cov, extra_share = coverage(gw, nw)
        r_en = ratio(norm(' '.join(g['paras_en'])), norm(' '.join(p['text'] for p in w['paras_en'] if p['kind'] != 'heading'))) \
            if g.get('paras_en') else None
        miss, extra = para_check(g['paras_tr'], new_tr)
        rows.append((slug, r_tr, r_en, miss, extra, w['id'], cov, extra_share))
    ok = [r for r in rows if r[1] is not None]
    print(f"{label}: {len(rows)} eser, eşleşen {len(ok)}")
    if ok:
        tr = sorted(r[1] for r in ok)
        print(f"  TR benzerlik: ortanca {tr[len(tr) // 2]:.3f}, ≥0,97: {sum(x >= 0.97 for x in tr)}, "
              f"≥0,90: {sum(x >= 0.9 for x in tr)}, <0,90: {sum(x < 0.9 for x in tr)}")
        cv = sorted(r[6] for r in ok if r[6] is not None)
        print(f"  TR kapsama: ortanca {cv[len(cv) // 2]:.3f}, ≥0,97: {sum(x >= 0.97 for x in cv)}, "
              f"≥0,90: {sum(x >= 0.9 for x in cv)}, <0,90: {sum(x < 0.9 for x in cv)}")
        print(f"  paragraf: eksiksiz {sum(1 for r in ok if r[3] == 0)}, fazlasız {sum(1 for r in ok if r[4] == 0)}")
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--dump', action='store_true')
    ap.add_argument('--old', action='store_true')
    ap.add_argument('--worst', type=int, default=15)
    ap.add_argument('--diff', metavar='SLUG', help='bir eserin altın ↔ yeni sözcük farkı')
    ap.add_argument('--lang', default='tr')
    a = ap.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if a.dump:
        dump()
        return
    if a.old:
        with open(os.path.join(ROOT, 'data', 'monuments_all.json'), encoding='utf-8') as f:
            gold = {m['slug']: dict(name_tr=m['title_tr'], book=m['book'], paras_tr=m.get('paras_tr') or [],
                                    paras_en=m.get('paras_en') or []) for m in json.load(f) if not m.get('synthetic')}
        label = 'eski çıkarım'
    else:
        if not os.path.exists(GOLD):
            sys.exit('gold.json yok: önce python -m pdfx.gold --dump (DATABASE_URL ile)')
        with open(GOLD, encoding='utf-8') as f:
            gold = json.load(f)
        label = 'pilot altın küme'
    if a.diff:
        show_diff(gold, a.diff, a.lang)
        return
    rows = compare(gold, label)
    print(f'\n  kapsaması en düşük {a.worst}:')
    for r in sorted((r for r in rows if r[1] is not None), key=lambda r: (r[6] if r[6] is not None else 0, r[1]))[:a.worst]:
        en = f'{r[2]:.3f}' if r[2] is not None else '-'
        cv = f'{r[6]:.3f}' if r[6] is not None else '-'
        ex = f'{r[7]:.3f}' if r[7] is not None else '-'
        print(f'  kapsama {cv} fazla {ex}  benzerlik {r[1]:.3f} en {en:>5}  par. eksik {r[3]:>2} fazla {r[4]:>2}  '
              f'{r[5]:<12} {r[0]}')


def show_diff(gold, slug, lang='tr', minw=6):
    """Altın ↔ yeni metnin sözcük düzeyindeki büyük farkları (≥ minw sözcük)."""
    w = works_by_slug().get(slug)
    if not w or slug not in gold:
        sys.exit(f'{slug}: altın ya da yeni kayıt yok')
    g = norm(' '.join(gold[slug][f'paras_{lang}']))
    n = norm(' '.join(p['text'] for p in w[f'paras_{lang}'] if p['kind'] != 'heading'))
    sm = difflib.SequenceMatcher(None, g, n, autojunk=False)
    print(f'# {slug} → {w["id"]} [{lang}] benzerlik {sm.ratio():.3f}, altın {len(g)} sözcük, yeni {len(n)}')
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        if op != 'equal' and max(i2 - i1, j2 - j1) >= minw:
            print(f'  {op:7} ALTIN[{i2 - i1}]: {" ".join(g[i1:i2])[:240]}')
            print(f'          YENİ[{j2 - j1}]: {" ".join(n[j1:j2])[:240]}')


if __name__ == '__main__':
    main()
