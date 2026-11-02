"""Adım 1 – PDF sayfa düzeni önbelleği: karakter → satır → blok.

PDF sayfaları çift sayfadır (1701×850 pt; sol ve sağ basılı sayfa). Karakterler `rawdict`'ten tek tek alınır ve
**koordinata göre** birleştirilir: aynı yarıda, taban çizgisi ±2 pt içinde kalanlar x sırasıyla aynı satıra girer;
büyük yatay boşluk (sütun arası, içindekilerdeki sayfa no sütunu) satırı böler. Bu yüzden PDF'in metin akışı sırası
(TR ve EN sütunlarını karıştıran) önemsizdir. Bursa I–II'deki bozuk karakterler (`%` → İ/Ş, `!` → ş) PDF'in kendisinde
de vardır; `clean.fix_glyphs` span metnine uygulanır. (PyMuPDF ile ğ/ş/İ ayrı alt küme fontunda görünmüyor; koordinatla
birleştirme yine de sırayı garanti eder.)

Her satır ve span şu etiketleri taşır (kurallar books.py → `pdfx`):
  half          L / R (basılı sayfa yarısı)
  printed_page  basılı sayfa no (images.printed_pages; numarasız sayfalarda komşudan tahmin, `est`)
  role          page_no | running (kenar şeridindeki bölüm adı) | title_tr | title_en (eser adı) | heading_tr |
                heading_en (ara başlık) | district | section | body | quote | note | caption | toc | parcel |
                biblio | vertical (Hatay dikey süs harfleri) | other
  lang          tr | en | None
  block         sayfa içi blok no (aynı yarı, yatayda örtüşen, dikey boşluğu < 1,4 satır aralığı)

Çıktı: data/pdfx/<kitap>/pages.jsonl (PDF sayfası başına bir satır; `i` 0 tabanlı PDF sayfa dizini).

Kullanım (pipeline klasöründen):
  python -m pdfx.layout --fonts bursa-1          # font/boyut/konum/örnek metin dökümü (kuralları doğrulamak için)
  python -m pdfx.layout --dump bursa-1 --page 18 # tek sayfanın satırları
  python -m pdfx.layout [--book bursa-1]         # pages.jsonl üretir (kitap verilmezse altısı)
"""
import os, sys, re, json, argparse, collections
from . import out_dir
import pymupdf
from books import BOOKS
from images import PDF_DIR, printed_pages
import clean

BASELINE_TOL = 2.0     # aynı satır: taban çizgisi farkı (pt)
GAP_SPLIT = 1.6        # satırı bölen yatay boşluk (× font boyutu)
PARA_GAP = 1.4         # yeni blok: dikey boşluk > 1,4 × satır aralığı


def pdf_path(book):
    return os.path.join(PDF_DIR, BOOKS[book]['pdf'])


def open_pdf(book):
    return pymupdf.open(pdf_path(book))


# ----------------------------------------------------------------------------
# karakterler → satırlar

def page_chars(page):
    """Sayfanın bütün karakterleri: (x0, y0, x1, y1, taban_y, c, font, boyut, renk)."""
    out = []
    for b in page.get_text('rawdict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                for ch in s['chars']:
                    x0, y0, x1, y1 = ch['bbox']
                    out.append((x0, y0, x1, y1, ch['origin'][1], ch['c'], s['font'], round(s['size'], 1), s['color']))
    return out


def group_lines(chars, width):
    """Karakterleri satırlara toplar. Döner: [{half, x0, y0, x1, y1, base, spans: [{text, font, size, x0, x1}]}]."""
    spread = width > 1000
    mid = width / 2
    by_half = collections.defaultdict(list)
    for c in chars:
        half = ('L' if (c[0] + c[2]) / 2 < mid else 'R') if spread else 'L'
        by_half[half].append(c)
    lines = []
    for half, cs in by_half.items():
        cs.sort(key=lambda c: (c[4], c[0]))
        rows, cur = [], []
        for c in cs:
            if cur and abs(c[4] - cur[0][4]) > BASELINE_TOL:
                rows.append(cur)
                cur = []
            cur.append(c)
        if cur:
            rows.append(cur)
        for row in rows:
            row.sort(key=lambda c: c[0])
            seg, last = [], None   # last: bölümdeki son boşluk olmayan karakterin sağ kenarı
            for c in row:
                if c[5].isspace():
                    if seg:
                        seg.append(c)
                    continue
                if last is not None and c[0] - last > GAP_SPLIT * max(c[7], 6):
                    lines.extend(make_line(half, s) for s in split_numbers(seg))
                    seg = []
                seg.append(c)
                last = c[2]
            if seg:
                lines.extend(make_line(half, s) for s in split_numbers(seg))
    return [l for l in lines if l['text'].strip()]


def split_numbers(seg):
    """Sayfa no sütunu komşu metne yakınsa ('233 SELÇUKLU', 'Türbesi 163'): yalnız sayıdan oluşan baştaki ya da sondaki
    sözcük, sözcük arasından belirgin geniş boşlukla ayrılıyorsa ayrı satır olur."""
    ink = [c for c in seg if not c[5].isspace()]
    if len(ink) < 4 or ink[0][7] > 10.6:      # yalnızca içindekiler boyutu (10 pt); gövdede iki yana yaslı satırlar bölünmesin
        return [seg]
    gaps = [(k, ink[k + 1][0] - ink[k][2]) for k in range(len(ink) - 1)]
    words = [g for g in gaps if g[1] > 0.15 * ink[g[0]][7]]
    for k, gap in words[:1] + words[-1:]:
        left, right = ''.join(c[5] for c in ink[:k + 1]), ''.join(c[5] for c in ink[k + 1:])
        if gap > 0.8 * ink[k][7] and (re.fullmatch(r'\d{1,3}', left) or re.fullmatch(r'\d{1,3}', right)):
            cut = ink[k + 1][0]
            return [[c for c in seg if c[0] < cut], [c for c in seg if c[0] >= cut]]
    return [seg]


def make_line(half, chars):
    spans, text = [], ''
    prev = None
    for c in chars:
        ch = c[5]
        if ch.isspace():
            ch = ' '
        # PDF'te boşluk karakteri olmayan sözcük araları (ayrı alt küme harfleri, sıkıştırılmış satırlar)
        if prev is not None and ch != ' ' and not text.endswith(' ') and c[0] - prev[2] > 0.22 * c[7]:
            text += ' '
            if spans:
                spans[-1]['text'] += ' '
        key = (c[6], c[7])
        if not spans or (spans[-1]['font'], spans[-1]['size']) != key:
            if ch == ' ' and spans:
                spans[-1]['text'] += ' '
                text += ' '
                prev = c
                continue
            spans.append(dict(text='', font=c[6], size=c[7], color=c[8], x0=round(c[0], 1), x1=round(c[2], 1)))
        spans[-1]['text'] += ch
        spans[-1]['x1'] = round(max(spans[-1]['x1'], c[2]), 1)
        text += ch
        prev = c
    for s in spans:
        s['text'] = clean.norm(s['text'])
    xs = [c for c in chars if not c[5].isspace()] or chars
    return dict(half=half, x0=round(min(c[0] for c in xs), 1), x1=round(max(c[2] for c in xs), 1),
                y0=round(min(c[1] for c in xs), 1), y1=round(max(c[3] for c in xs), 1),
                base=round(sum(c[4] for c in xs) / len(xs), 1), size=dominant(xs, lambda c: c[7]),
                font=dominant(xs, lambda c: c[6]), text=re.sub(r' {2,}', ' ', clean.norm(text)).strip(), spans=spans)


def split_page_numbers(lines, height):
    """Kenar şeridinde sayfa no ile bölüm adı aynı taban çizgisinde birleşmişse ('96 Su Yapıları') ayırır."""
    out = []
    for l in lines:
        sp = l['spans']
        if len(sp) > 1 and (l['base'] < height * 0.085 or l['y0'] > height * 0.925):
            for k, s in enumerate(sp):
                if re.fullmatch(r'\d{1,3}', s['text'].strip()) and (k == 0 or k == len(sp) - 1):
                    rest = sp[1:] if k == 0 else sp[:-1]
                    for part in ([s], rest):
                        t = re.sub(r' {2,}', ' ', ''.join(x['text'] for x in part)).strip()
                        out.append(dict(l, x0=part[0]['x0'], x1=part[-1]['x1'], text=t, spans=part,
                                        font=part[0]['font'], size=part[0]['size']))
                    break
            else:
                out.append(l)
        else:
            out.append(l)
    return out


def dominant(chars, key):
    return collections.Counter(key(c) for c in chars).most_common(1)[0][0]


# ----------------------------------------------------------------------------
# kitap kuralları: rol ve dil
#
# books.py → pdfx['roles']: sırayla denenen kurallar; ilk uyan kazanır.
#   dict(role=..., font=<regex>, min_size=, max_size=, lang='tr'|'en'|'weight'|'detect')
#   lang='weight'  → pdfx['lang_fonts'] (font kalınlığı: Regular → tr, Light → en)
#   lang='detect'  → bloğun metninden (gövde: clean.lang_of, başlık: eser türü sözcükleri)
# 'title' ve 'heading' rolleri dile göre title_tr/title_en, heading_tr/heading_en olur. Bir title_tr'nin hemen
# altındaki heading_en, eserin İngilizce başlığıdır → title_en.

EN_HEAD = set('MOSQUE MOSQUES MASJID TOMB TOMBS BATH MADRASA COMPLEX FOUNTAIN GRAVEYARD GRAVE LODGE SUFI INN SCHOOL '
              'CHURCH CHURCHES THEATER MANSION HOUSE HOME MILL BRIDGE BAZAAR CARAVANSERAI CARAVANSERAIS AND OF THE '
              'STRUCTURES BUILDINGS WATER COMMERCIAL CIVIL ARCHITECTURE MAUSOLEUM AREA VILLAGE NEIGHBORHOOD SHEIKH '
              'KITCHEN ROOMS CELLS GATE MINARET LIBRARY OUTBUILDINGS DISTRICT PROVINCE HISTORY INTRODUCTION MUSEUM '
              'HOLLY PLACE OLD HOSPICE IMARET BEDESTEN WORKPLACES OTHERS OUTBUILDING MAKAM MEMORIAL'.split())
TR_HEAD = set('CAMİİ CAMİ CAMİLER MESCİDİ MESCİT TÜRBESİ TÜRBELER HAMAMI MEDRESESİ KÜLLİYESİ KÜLLİYELER ÇEŞMESİ '
              'HAZİRESİ HAZİRE TEKKESİ HANI VE İMARETİ ZAVİYESİ MEKTEBİ KONAĞI KÖPRÜSÜ BEDESTENİ YAPILARI YAPILAR '
              'MİMARİ SU TİCARİ SİVİL ESERLERİ MEZARLIĞI KABRİ DERGÂHI DERGÂHIN ALANI KİLİSESİ ÇARŞISI KERVANSARAYI '
              'MAKAMI DEĞİRMENİ KONUT EVLER KONAKLAR TARİHİ GİRİŞ KÖYÜ MAHALLESİ HÜCRELERİ ODALARI MUTFAK BÖLÜMÜ '
              'KAPISI MİNARESİ ŞADIRVANI SEBİLİ KÜTÜPHANESİ'.split())


def tr_upper(s):
    return s.replace('i', 'İ').replace('ı', 'I').upper()


def heading_lang(text):
    """Başlığın dili eser türü ve bağlaç sözcüklerinden; kanıt yoksa None (çağıran komşu gövdeye bakar)."""
    words = re.findall(r"[^\W\d_]+", tr_upper(text))
    tr = sum(1 for w in words if w in TR_HEAD) + 0.5 * sum(1 for w in words if w.endswith(('Sİ', 'LERİ', 'LARI'))
                                                           and w not in TR_HEAD and w not in EN_HEAD)
    en = sum(1 for w in words if w in EN_HEAD)
    if tr != en:
        return 'tr' if tr > en else 'en'
    return None


def font_matches(font, pat):
    return re.search(pat, font) is not None


def span_role(span, cfg):
    for r in cfg.get('roles', []):
        if 'font' in r and not font_matches(span['font'], r['font']):
            continue
        if span['size'] < r.get('min_size', 0) or span['size'] > r.get('max_size', 999):
            continue
        lang = r.get('lang')
        if lang == 'weight':
            lang = next((lg for pat, lg in cfg.get('lang_fonts', []) if font_matches(span['font'], pat)), None)
        return r['role'], lang
    return 'other', None


def classify(lines, cfg, i, W, H):
    """Satırlara ve span'lara rol ve dil verir (satırın rolü/dili en çok karakterli span'ınki)."""
    toc = cfg.get('toc_pages')
    in_toc = bool(toc) and toc[0] <= i <= toc[1]
    for l in lines:
        margin = l['base'] < H * 0.085 or l['y0'] > H * 0.925
        for s in l['spans']:
            if margin and re.fullmatch(r'\d{1,3}', s['text'].strip()):
                s['role'], s['lang'] = 'page_no', None
            elif in_toc:
                s['role'], s['lang'] = 'toc', None
            else:
                s['role'], s['lang'] = span_role(s, cfg)
                if margin and s['role'] not in ('title', 'district'):
                    s['role'], s['lang'] = 'running', None   # üst/alt kenardaki bölüm adı
        weight = collections.Counter()
        for s in l['spans']:
            weight[(s['role'], s['lang'])] += len(s['text'].strip()) or 0.1
        l['role'], l['lang'] = weight.most_common(1)[0][0]


def resolve_lang(lines):
    """lang='detect' olan satırlara blok metninden dil verir; rol adlarını dile göre tamamlar."""
    blocks = collections.defaultdict(list)
    for l in lines:
        blocks[l['block']].append(l)
    # önce gövde blokları: başlıklar dillerini bulamazsa altlarındaki gövdeye bakar
    for ls in sorted(blocks.values(), key=lambda ls: ls[0]['role'] in ('title', 'heading')):
        if not any(l['lang'] == 'detect' or any(s['lang'] == 'detect' for s in l['spans']) for l in ls):
            continue
        text = ' '.join(l['text'] for l in ls)
        if ls[0]['role'] in ('title', 'heading'):
            lg = heading_lang(text) or body_below(lines, ls) or (clean.lang_of(text) or (None,))[0]
        else:
            lg = (clean.lang_of(text) or (None,))[0]
        for l in ls:
            if l['lang'] == 'detect':
                l['lang'] = lg
            for s in l['spans']:
                if s['lang'] == 'detect':
                    s['lang'] = lg
    # dili bulunamayan gövde bloğu: aynı yarıda bir önceki gövde bloğunun dili
    prev = {}
    for l in sorted(lines, key=lambda l: (l['half'], l['y0'], l['x0'])):
        if l['role'] in ('body', 'quote'):
            if l['lang'] is None and prev.get(l['half']):
                l['lang'] = prev[l['half']]
                for s in l['spans']:
                    s['lang'] = s['lang'] or l['lang']
            prev[l['half']] = l['lang'] or prev.get(l['half'])
    # Türkçe başlığın hemen altındaki ara başlık (dili Türkçe değilse) → eserin İngilizce başlığı
    for t in lines:
        if t['role'] != 'title' or t['lang'] != 'tr':
            continue
        below = [l for l in lines if l['role'] in ('heading', 'title') and l['half'] == t['half'] and l is not t
                 and 0 <= l['y0'] - t['y1'] < 3 * t['size'] and abs(l['x0'] - t['x0']) < 40]
        if not below:
            continue
        first = min(below, key=lambda l: l['y0'])
        if first['role'] == 'heading' and heading_lang(' '.join(l['text'] for l in lines if l['block'] == first['block'])) != 'tr':
            for l in lines:
                if l['block'] == first['block']:
                    for o in [l] + l['spans']:
                        if o['role'] == 'heading':
                            o['role'], o['lang'] = 'title', 'en'
    for l in lines:
        for o in [l] + l['spans']:
            if o['role'] in ('title', 'heading'):
                o['role'] = f"{o['role']}_{o['lang'] or 'tr'}"


def body_below(lines, block):
    """Başlığın altındaki ilk gövde satırının dili (aynı yarı, yatayda örtüşen)."""
    last = max(block, key=lambda l: l['y1'])
    x0, x1 = min(l['x0'] for l in block), max(l['x1'] for l in block)
    cands = [l for l in lines if l['half'] == last['half'] and l['role'] in ('body', 'quote') and l['y0'] >= last['y1'] - 2
             and min(x1, l['x1']) - max(x0, l['x0']) > 20 and l['lang'] in ('tr', 'en')]
    return min(cands, key=lambda l: l['y0'])['lang'] if cands else None


# ----------------------------------------------------------------------------
# satırlar → bloklar

def assign_blocks(lines):
    """Aynı yarıda, yatayda örtüşen ve dikey boşluğu küçük ardışık satırlar aynı bloğa girer."""
    order = sorted(range(len(lines)), key=lambda k: (lines[k]['half'], lines[k]['y0'], lines[k]['x0']))
    blocks = []  # [half, x0, x1, son_y1, boyut, rol, dil, no, font]
    for k in order:
        l = lines[k]
        pitch = l['size'] * 1.3
        best = None
        for b in reversed(blocks):
            # başlıkta font da aynı olmalı (Hatay: TR kalın, EN normal aynı boyutta alt alta)
            if b[0] != l['half'] or b[5] != l['role'] or b[6] != l['lang'] \
                    or l['role'] in ('title', 'heading') and b[8] != l['font']:
                continue
            over = min(b[2], l['x1']) - max(b[1], l['x0'])
            if over < 0.5 * min(b[2] - b[1], l['x1'] - l['x0']):
                continue
            gap = l['y0'] - b[3]
            if -0.3 * l['size'] <= gap <= PARA_GAP * pitch - l['size'] and abs(b[4] - l['size']) < 1.5:
                best = b
                break
        if best is None:
            best = [l['half'], l['x0'], l['x1'], l['y1'], l['size'], l['role'], l['lang'], len(blocks), l['font']]
            blocks.append(best)
        else:
            best[1], best[2], best[3] = min(best[1], l['x0']), max(best[2], l['x1']), l['y1']
        l['block'] = best[7]
    return lines


# ----------------------------------------------------------------------------

_VOCAB = None


def vocab():
    """clean.fix_glyphs için korpus sözlüğü (segment.py ile aynı kaynak: raw/*.txt)."""
    global _VOCAB
    if _VOCAB is None:
        paths = [os.path.join(clean.RAW, BOOKS[b]['file']) for b in BOOKS]
        _VOCAB = clean.build_vocab([p for p in paths if os.path.exists(p)])
    return _VOCAB


def page_layout(book, page, i, pp, stats=None):
    cfg = BOOKS[book].get('pdfx', {})
    W, H = page.rect.width, page.rect.height
    lines = split_page_numbers(group_lines(page_chars(page), W), H)
    if cfg.get('fix_glyphs'):
        st = stats if stats is not None else {'pct': 0, 'pct_unresolved': [], 'bang': 0, 'digit': 0}
        v = vocab()
        for l in lines:
            if re.search(r'[%!(]', l['text']):
                for s in l['spans']:
                    s['text'] = clean.fix_glyphs(s['text'], v, st)
                l['text'] = re.sub(r' {2,}', ' ', ''.join(s['text'] for s in l['spans'])).strip()
    left, right, est = pp
    for l in lines:
        l['printed_page'] = left if l['half'] == 'L' else right
        for s in l['spans']:
            s['half'], s['printed_page'] = l['half'], l['printed_page']
    classify(lines, cfg, i, W, H)
    assign_blocks(lines)
    resolve_lang(lines)
    lines.sort(key=lambda l: (l['half'], l['block'], l['y0'], l['x0']))
    return dict(i=i, width=round(W, 1), height=round(H, 1), printed=[left, right], est=est, lines=lines)


def build(book, verbose=True):
    doc = open_pdf(book)
    pps = printed_pages(doc)
    stats = {'pct': 0, 'pct_unresolved': [], 'bang': 0, 'digit': 0}
    path = os.path.join(out_dir(book), 'pages.jsonl')
    roles = collections.Counter()
    with open(path, 'w', encoding='utf-8') as f:
        for i, page in enumerate(doc):
            rec = page_layout(book, page, i, pps[i], stats)
            for l in rec['lines']:
                roles[(l['role'], l['lang'])] += len(l['text'])
            f.write(json.dumps(rec, ensure_ascii=False) + '\n')
    if verbose:
        print(f'{book}: {len(doc)} sayfa → {os.path.relpath(path)}')
        print('  karakter (rol, dil):', ', '.join(f'{r}/{lg or "-"}={n}' for (r, lg), n in roles.most_common()))
        if stats['pct'] or stats['bang']:
            print(f"  fix_glyphs: % {stats['pct']}, ! {stats['bang']}, çözülemeyen {len(stats['pct_unresolved'])}")
    return path


def load_pages(book):
    """pages.jsonl → [sayfa]. Yoksa üretir."""
    path = os.path.join(out_dir(book), 'pages.jsonl')
    if not os.path.exists(path):
        build(book, verbose=False)
    with open(path, encoding='utf-8') as f:
        return [json.loads(l) for l in f if l.strip()]


# ----------------------------------------------------------------------------
# dökümler

def font_report(book, sample=3):
    """Font + boyut başına: karakter sayısı, rol/dil, yarı dağılımı, x aralığı, örnek metinler ve sayfalar."""
    doc = open_pdf(book)
    pps = printed_pages(doc)
    agg = {}
    for i, page in enumerate(doc):
        rec = page_layout(book, page, i, pps[i])
        for l in rec['lines']:
            for s in l['spans']:
                t = s['text'].strip()
                if not t:
                    continue
                k = (s['font'], round(s['size']))
                a = agg.setdefault(k, dict(n=0, halves=collections.Counter(), roles=collections.Counter(), x=[9e9, 0],
                                           pages=[], ex=[]))
                a['n'] += len(t)
                a['halves'][s['half']] += len(t)
                a['roles'][f"{s['role']}/{s['lang'] or '-'}"] += len(t)
                a['x'] = [min(a['x'][0], s['x0']), max(a['x'][1], s['x1'])]
                if i not in a['pages']:
                    a['pages'].append(i)
                if len(a['ex']) < sample and len(t) > 3:
                    a['ex'].append(f'[{i}{s["half"]}] {t[:60]}')
    print(f'# {book}  ({BOOKS[book]["pdf"]}, {len(doc)} sayfa)')
    for (font, size), a in sorted(agg.items(), key=lambda kv: -kv[1]['n']):
        pages = a['pages']
        pr = f'{pages[0]}–{pages[-1]} ({len(pages)} sf)'
        print(f"{a['n']:>7}  {font:<28} {size:>3}  {', '.join(f'{r}={n}' for r, n in a['roles'].most_common(3))}"
              f"  yarı L/R={a['halves']['L']}/{a['halves']['R']}  x={a['x'][0]:.0f}–{a['x'][1]:.0f}  sayfa {pr}")
        for e in a['ex']:
            print('           ', e)


def dump(book, i):
    doc = open_pdf(book)
    pps = printed_pages(doc)
    rec = page_layout(book, doc[i], i, pps[i])
    print(f"# {book} PDF sayfa {i}  basılı {rec['printed']}{' (tahmini)' if rec['est'] else ''}")
    for l in rec['lines']:
        fonts = '+'.join(sorted({f"{s['font'].split('-')[-1]}{s['size']:.0f}" for s in l['spans']}))
        print(f"{l['half']} b{l['block']:<3} x{l['x0']:>6.0f}-{l['x1']:<6.0f} y{l['y0']:>5.0f} {l['role']:<9} {l['lang'] or '-':<2} "
              f"{fonts:<18} {l['text'][:90]}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--fonts', metavar='KITAP')
    ap.add_argument('--dump', metavar='KITAP')
    ap.add_argument('--page', type=int, action='append')
    ap.add_argument('--book', action='append')
    a = ap.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    if a.fonts:
        for b in (BOOKS if a.fonts == 'all' else [a.fonts]):
            font_report(b)
        return
    if a.dump:
        for p in a.page or [0]:
            dump(a.dump, p)
        return
    for b in a.book or BOOKS:
        build(b)


if __name__ == '__main__':
    main()
