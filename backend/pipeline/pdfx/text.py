"""Adım 4 – Çapadan çapaya TR / EN paragraflar → data/pdfx/<kitap>/works.json.

Bir eserin Türkçe metni kendi Türkçe çapasından (başlığından) bir sonraki kaydın Türkçe çapasına kadardır; İngilizce
metni İngilizce çapasından (anchor.en, yoksa Türkçe çapa) bir sonrakinin İngilizce çapasına kadar. İki dil ayrı akar
(Bursa/Konya'da İngilizce başlık çoğu zaman bir iki sayfa sonradır).

Okuma sırası: PDF sayfası → yarı (L, R) → sütun (anchor.col_of) → y. Satırlar `lang`'e göre iki akışa ayrılır.
Gövdeye giren roller: body, quote ve çapa olmayan ara başlıklar (heading_tr/heading_en; geliştirici kararı, 2 Kasım
2026: Mevlâna Külliyesi bölümleri, Hatay külliye üyeleri gibi alt başlıklar ana eserin metninde ara başlık olarak kalır
→ `kind='heading'`). Yazar satırları ('Prof. Dr. …') metne girmez, `authors` alanına yazılır. Başlıklar, ilçe/bölüm
ayraçları, sayfa noları, kenar şeridi, fotoğraf altı, parsel ve kaynakça (`biblio`) satırları girmez. `note` rolü
(10 pt) kitaplarda dipnot için değil, bir eserin küçük puntolu gövdesi (Konya I s. 241) ve Konya II kaynakçası için
kullanılmış; gövdeye girer, kaynakça kendi bölüm kaydına düşer.

Paragraf: aynı sütunda iki satırın üst kenarları arası > 1,45 × punto ise yeni paragraf (satır aralığı 1,07–1,18,
paragraf aralığı 1,75–2 × punto; harf kutuları punto boyundan uzun olduğu için boşluk değil aralık ölçülür). Sütun/sayfa geçişinde önceki satır cümle sonuyla
(. ! ? : ”) bitmiyorsa ya da sonraki satır küçük harfle başlıyorsa paragraf sürer. Satır sonu tirelemesi yalnızca
'-' + küçük harfle başlayan sonraki satırda birleştirilir ('over-' + 'looking' → 'overlooking'; 'Girçık- Bekârlar'
korunur).

Çıktı (eser başına): id, level, kind, origin, parent, name_tr/name_en (okunur ad), district, section, pages [ilk, son],
paras_tr / paras_en [{text, page, kind: body|quote|heading}], authors, notes (dipnot satırı sayısı), flags:
  empty_tr  Türkçe metin yok          en_ratio  EN/TR karakter oranı 0,6–1,6 dışında
  empty_en  İngilizce metin yok       para_count_diff  TR ve EN paragraf sayıları çok farklı

Kullanım (pipeline klasöründen; önce layout, toc, anchor):
  python -m pdfx.text [--book bursa-1]
  python -m pdfx.text --show bursa-1 b1-0012      # bir eserin paragrafları
"""
import os, sys, re, json, bisect, argparse, collections, datetime
from . import out_dir, OUT, ROOT
from .layout import load_pages
from .anchor import pos_of, anchor_pos, AUTHOR
from books import BOOKS

BODY_ROLES = ('body', 'quote', 'note')   # note: 10 pt gövde (Konya I s. 241); kitaplarda dipnot yok
HEAD_ROLES = ('heading_tr', 'heading_en')
PARA_PITCH = 1.45       # × punto: aynı sütunda satır başları arası bu kadardan büyükse yeni paragraf
SENT_END = re.compile(r'[.!?:”"]\s*$')


def load_anchors(book):
    path = os.path.join(OUT, book, 'anchors.json')
    if not os.path.exists(path):
        from . import anchor
        return anchor.build(book, verbose=False)
    with open(path, encoding='utf-8') as f:
        return json.load(f)


# ----------------------------------------------------------------------------
# satırlar

def anchor_blocks(pages, recs):
    """Çapa olarak kullanılan başlık bloklarının (i, yarı, blok) kümesi: bunlar metne girmez."""
    marks = set()
    for a in recs:
        anc = a.get('anchor')
        if not anc:
            continue
        for pos in (anc, anc.get('en')):
            if pos:
                marks.add((pos['i'], pos['half'], round(pos['y'])))
    out = set()
    for p in pages:
        tops = {}
        for l in p['lines']:
            k = (l['half'], l['block'])
            tops[k] = min(tops.get(k, 1e9), l['y0'])
        for (half, b), y in tops.items():
            if (p['i'], half, round(y)) in marks:
                out.add((p['i'], half, b))
    return out


def stream(pages, recs):
    """Metne girecek satırlar, okuma sırasıyla: dict(pos, lang, kind, text, size, page, x0, y0, y1, col, block)."""
    skip = anchor_blocks(pages, recs)
    out = []
    for p in pages:
        for l in p['lines']:
            role = l['role']
            if role in BODY_ROLES:
                kind = 'quote' if role == 'quote' else 'body'
            elif role in HEAD_ROLES:
                if (p['i'], l['half'], l['block']) in skip:
                    continue
                kind = 'author' if AUTHOR.search(l['text']) else 'heading'
            else:
                continue
            lang = l['lang'] if l['lang'] in ('tr', 'en') else (role[-2:] if role in HEAD_ROLES else None)
            if not lang or not l['text'].strip():
                continue
            pos = pos_of(p['i'], l['half'], l['y0'], l['x0'])
            out.append(dict(pos=pos, lang=lang, kind=kind, text=l['text'], size=l['size'], page=l['printed_page'],
                            i=p['i'], half=l['half'], col=pos[2], y0=l['y0'], y1=l['y1'], block=l['block']))
    out.sort(key=lambda x: (x['pos'], x['y0']))
    return out


def note_lines(pages):
    """Dipnot satırları (role=note): (pos, dil)."""
    return [(pos_of(p['i'], l['half'], l['y0'], l['x0']), l['lang']) for p in pages for l in p['lines']
            if l['role'] == 'note']


# ----------------------------------------------------------------------------
# paragraflar

def join(a, b):
    """Satır birleştirme: satır sonu tirelemesi ('ara-' + 'sında') yalnızca küçük harfle süren satırda kalkar."""
    if re.search(r'[^\W\d_]-$', a) and b[:1].islower():
        return a[:-1] + b
    return a + ' ' + b


def paragraphs(lines):
    """Bir eserin tek dildeki satırları → [{text, page, kind}]. Ara başlık kendi paragrafıdır. Düz metin ile alıntı
    (italik) arasındaki geçiş paragrafı bölmez; paragraf yalnızca tamamı alıntıysa `quote` olur."""
    paras, cur, prev = [], None, None
    for l in lines:
        heading = l['kind'] == 'heading'
        new = cur is None or heading != (cur['kind'] == 'heading') or heading and prev['block'] != l['block']
        if not new and prev is not None:
            same_col = (l['i'], l['half'], l['col']) == (prev['i'], prev['half'], prev['col'])
            if same_col and l['y0'] >= prev['y0']:
                new = l['y0'] - prev['y0'] > PARA_PITCH * max(l['size'], prev['size'])
            else:
                new = bool(SENT_END.search(prev['text'])) and not l['text'][:1].islower()
        if new:
            cur = dict(text=l['text'], page=l['page'], kind=l['kind'])
            paras.append(cur)
        else:
            cur['text'] = join(cur['text'], l['text'])
            if cur['kind'] != l['kind']:
                cur['kind'] = 'body'
        prev = l
    for p in paras:
        p['text'] = re.sub(r'\s{2,}', ' ', p['text']).strip()
    return [p for p in paras if p['text']]


def split_by_anchor(lines, recs, lang):
    """Satırları eserlere dağıtır: her satır, başlangıcı kendisinden önce gelen son kayda aittir."""
    starts = []
    for a in recs:
        anc = a.get('anchor')
        if not anc:
            continue
        pos = anchor_pos(anc)
        if lang == 'en' and anc.get('en'):
            pos = anchor_pos(anc['en'])
        starts.append((pos, a['id']))
    starts.sort()
    keys = [s[0] for s in starts]
    out = collections.defaultdict(list)
    for l in lines:
        if l['lang'] != lang:
            continue
        k = bisect.bisect_right(keys, l['pos']) - 1
        if k >= 0:
            out[starts[k][1]].append(l)
    return out


def build_works(book, pages, data):
    recs = data['records']
    lines = stream(pages, recs)
    by = {lang: split_by_anchor(lines, recs, lang) for lang in ('tr', 'en')}
    notes = collections.Counter()
    note_keys = split_by_anchor([dict(pos=p, lang='tr') for p, _ in note_lines(pages)], recs, 'tr')
    for rid, ls in note_keys.items():
        notes[rid] = len(ls)
    works = []
    for a in recs:
        if a['level'] not in ('monument', 'complex'):
            continue
        tr_lines = [l for l in by['tr'].get(a['id'], []) if l['kind'] != 'author']
        en_lines = [l for l in by['en'].get(a['id'], []) if l['kind'] != 'author']
        authors = [l['text'] for lg in ('tr', 'en') for l in by[lg].get(a['id'], []) if l['kind'] == 'author']
        ptr, pen = paragraphs(tr_lines), paragraphs(en_lines)
        pp = [l['page'] for l in tr_lines or en_lines if l['page']]
        w = dict(id=a['id'], book=book, level=a['level'], kind=a.get('kind') or a['level'], origin=a.get('origin', 'toc'),
                 parent=a.get('parent'), name_tr=a['name_tr_display'], name_en=a['name_en_display'],
                 toc_name=a['name_tr'], district=a.get('district'), section=a.get('section'),
                 pages=[min(pp), max(pp)] if pp else [a['anchor']['printed_page']] * 2,
                 paras_tr=ptr, paras_en=pen, authors=authors, notes=notes.get(a['id'], 0),
                 anchor_flags=a['flags'], flags=qa_flags(ptr, pen))
        works.append(w)
    return works


def qa_flags(ptr, pen):
    flags = []
    ntr = sum(len(p['text']) for p in ptr if p['kind'] != 'heading')
    nen = sum(len(p['text']) for p in pen if p['kind'] != 'heading')
    if not ntr:
        flags.append('empty_tr')
    if not nen:
        flags.append('empty_en')
    if ntr and nen and not 0.6 <= nen / ntr <= 1.6:
        flags.append(f'en_ratio:{nen / ntr:.2f}')
    a, b = len([p for p in ptr if p['kind'] != 'heading']), len([p for p in pen if p['kind'] != 'heading'])
    if a and b and abs(a - b) > max(2, 0.3 * max(a, b)):
        flags.append(f'para_count_diff:{a}/{b}')
    return flags


# ----------------------------------------------------------------------------

def build(book, verbose=True):
    pages = load_pages(book)
    data = load_anchors(book)
    works = build_works(book, pages, data)
    path = os.path.join(out_dir(book), 'works.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(dict(book=book, generated=datetime.date.today().isoformat(), works=works), f, ensure_ascii=False,
                  indent=1)
    if verbose:
        print(f'{book}: {len(works)} eser → {os.path.relpath(path)}')
    return works


def summary(all_works):
    print(f"\n{'kitap':8} {'eser':>5} {'TR par.':>7} {'EN par.':>7} {'TR kar.':>8} {'EN kar.':>8} {'boş TR':>6} "
          f"{'boş EN':>6} {'EN oranı':>8} {'par. farkı':>10} {'ara b.':>6}")
    for book, works in all_works.items():
        fl = collections.Counter(f.split(':')[0] for w in works for f in w['flags'])
        ntr = sum(len(p['text']) for w in works for p in w['paras_tr'])
        nen = sum(len(p['text']) for w in works for p in w['paras_en'])
        heads = sum(1 for w in works for p in w['paras_tr'] if p['kind'] == 'heading')
        print(f"{book:8} {len(works):5} {sum(len(w['paras_tr']) for w in works):7} "
              f"{sum(len(w['paras_en']) for w in works):7} {ntr:8} {nen:8} {fl['empty_tr']:6} {fl['empty_en']:6} "
              f"{fl['en_ratio']:8} {fl['para_count_diff']:10} {heads:6}")


def show(book, rid):
    with open(os.path.join(OUT, book, 'works.json'), encoding='utf-8') as f:
        w = next(x for x in json.load(f)['works'] if x['id'] == rid)
    print(f"# {w['id']} {w['name_tr']} / {w['name_en']}  s. {w['pages']}  {w['flags']} {w['anchor_flags']}")
    for lang in ('tr', 'en'):
        print(f'--- {lang}')
        for p in w[f'paras_{lang}']:
            print(f"[s.{p['page']}{' ' + p['kind'] if p['kind'] != 'body' else ''}] {p['text']}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--book', action='append')
    ap.add_argument('--show', nargs=2, metavar=('KITAP', 'ID'))
    a = ap.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if a.show:
        show(*a.show)
        return
    summary({b: build(b) for b in (a.book or BOOKS)})


if __name__ == '__main__':
    main()
