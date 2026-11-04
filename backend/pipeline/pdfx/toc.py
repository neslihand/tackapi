"""Adım 2 – İçindekiler (TOC) → hiyerarşik eser listesi: data/pdfx/<kitap>/toc.json.

Kaynak pages.jsonl'deki `toc` rollü satırlardır (books.py → pdfx.toc_pages). İki biçim var:

  sütunlu (Bursa, Konya): her kayıt TR adı (1–3 satır) + EN adı; sayfa no ayrı, sağa yaslı bir sütunda ve TR adının
      son satırıyla aynı y'de. Kayıtlar arası boşluk satır aralığından büyüktür. BÜYÜK HARFLİ satırlar ilçe/bölüm/
      külliye başlığıdır.
  noktalı (Hatay): '• TR AD / EN AD ......... 177' tek satır; madde imi olmayanlar bölüm başlığıdır. Sayfa no
      çoğunlukla yazılmamış ya da kesik: bulunamayanlar gövdedeki başlıktan aranır (page_src='heading').

Düzey (level): district | section | complex | monument. Külliye altındaki eserler `parent` (külliye kaydının id'si)
alır; her kayda o anki `district` ve `section` adı da yazılır.

Elle düzeltme: data/pdfx/<kitap>/toc_overrides.json
  {"set":    {"<id>": {"name_tr": "...", "page": 123, "level": "monument", "parent": "<id>"|null,
                       "db_slug": "<veritabanı slug'ı>" (kuyrukta eşleşmeyi zorlar),
                       "db_new": true (otomatik eşleşme yapılmaz, yeni eser; pilot kilidi yine kalkmaz),
                       "rename": true (yükleyici veritabanındaki adı PDF adıyla değiştirir; yoksa ad korunur), ...}},
   "hazire": {"<üst>-hz1": {"_was": "...", "db_slug": "..."}}   # hazire alt eseri → eski kayıt (report, load)
   "retire": {"<eski slug>": "neden"}                             # metni başka eserde kalan eski kayıt → merged
   "delete": ["<id>", ...],
   "add":    [{"after": "<id>", "name_tr": "...", "name_en": "...", "page": 45, "level": "monument", ...}],
   "ok":     ["<id>", ...]}                       # incelendi ve doğru; şüpheli listesinden düşer
Kimlik (`id`) kitap içi sıra no'dur ('b1-0042'). Ayrıştırma değişip sıra kayarsa düzeltme yanlış kayda gitmesin diye
`set` kaydına eski TR ad yazılır (`"_was": "Hamam"`); ad uyuşmazsa düzeltme atlanır ve uyarı basılır. Düzeltmeler
her çalıştırmada yeniden uygulanır. `_` ile başlayan alanlar not ya da denetimdir, kayda yazılmaz.

Kullanım (pipeline klasöründen):
  python -m pdfx.toc [--book bursa-1]   # toc.json + konsol özeti
"""
import os, sys, re, json, argparse, collections, statistics
from . import out_dir, OUT, ROOT
from .layout import load_pages, tr_upper, heading_lang
from books import BOOKS, DISTRICTS
from segment import norm_title
import clean

SECTION_WORDS = re.compile(r'(LER|LAR|LERİ|LARI|YAPILARI|MİMARİ|GİRİŞ|TARİHİ|TARİHÇESİ|KAYNAKÇA|SÖZLÜĞÜ|SONUÇ|'
                           r'SUNUŞ|ÖNSÖZ|TAKDİM|DEĞERLENDİRME)$')
COMPLEX_WORD = re.compile(r'KÜLLİYESİ(?![’\'\w])')   # 'Külliyesi’nde Medrese' külliye değil, üyesidir
SHORT_NAMES = {'han', 'hamam', 'cami', 'arasta', 'imaret', 'medrese', 'kervansaray', 'mescit', 'turbe', 'hazire'}


def is_upper(s):
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and all(not c.islower() for c in letters)


def join_lines(parts):
    """Sarılmış adı birleştirir: 'Dön Baba-' + 'Pir Ahi Sultan)' → 'Dön Baba-Pir Ahi Sultan)'."""
    out = ''
    for p in parts:
        p = p.strip()
        if not out:
            out = p
        elif out.endswith('-') and not out.endswith(' -'):
            out += p
        else:
            out += ' ' + p
    return re.sub(r'\s+', ' ', out).strip()


def district_of(name, city):
    low = clean.tr_lower(name.strip(' .'))
    for d in DISTRICTS[city]:
        if clean.tr_lower(d) == low:
            return d
    return None


def level_of(name, city, upper_hint=None):
    """TR adından düzey: district | section | complex | monument."""
    up = is_upper(name) if upper_hint is None else upper_hint
    if district_of(name, city):
        return 'district'
    U = tr_upper(name).strip(' .')
    if COMPLEX_WORD.search(U) and 'KÜLLİYELER' not in U:
        return 'complex'
    if up and SECTION_WORDS.search(U.split()[-1] if U.split() else ''):
        return 'section'
    return 'monument'


# ----------------------------------------------------------------------------
# sütunlu içindekiler (Bursa, Konya)

def toc_lines(book, pages):
    cfg = BOOKS[book]['pdfx']
    a, b = cfg['toc_pages']
    out = []
    for p in pages[a:b + 1]:
        for l in p['lines']:
            if l['role'] != 'toc':
                continue
            if cfg.get('toc_style') != 'dotted' and not (9.5 <= l['size'] <= 10.5 and re.search(r'Light|Medium', l['font'])):
                continue
            t = l['text'].strip()
            if not t or re.fullmatch(r'(?i)i̇?içindekiler|içindekiler|c o n t e n t s|contents|İÇİNDEKİLER / CONTENTS', t):
                continue
            out.append(dict(l, page_i=p['i'], text=t))
    return out


def number_columns(nums):
    """Sayfa no sütunlarının sağ kenarları: {(pdf_sayfa, yarı): [x1, ...]}."""
    cols = collections.defaultdict(list)
    for n in sorted(nums, key=lambda n: n['x1']):
        k = (n['page_i'], n['half'])
        if cols[k] and abs(cols[k][-1][-1] - n['x1']) < 6:
            cols[k][-1].append(n['x1'])
        else:
            cols[k].append([n['x1']])
    return {k: [max(c) for c in v] for k, v in cols.items()}


def parse_columns(book, pages):
    lines = toc_lines(book, pages)
    nums = [l for l in lines if re.fullmatch(r'\d{1,3}', l['text'])]
    edges = number_columns(nums)
    texts = []
    for l in lines:
        if l in nums:
            continue
        m = re.fullmatch(r'(.*\S)\s+(\d{1,3})', l['text'])
        ed = edges.get((l['page_i'], l['half']), [])
        if m and any(abs(l['x1'] - e) < 4 for e in ed):    # sayı sütununa değecek kadar uzun ad: no aynı satırda
            nums.append(dict(l, text=m.group(2), x0=l['x1'] - 15))
            l = dict(l, text=m.group(1), x1=l['x1'] - 20)
        texts.append(l)
    # her metin satırı, sağındaki ilk sayı sütununa aittir
    for l in texts:
        ed = sorted(e for e in edges.get((l['page_i'], l['half']), []) if e > l['x0'] + 20)
        l['col'] = ed[0] if ed else 9999
    for n in nums:
        n['col'] = n['x1']
        n['yc'] = (n['y0'] + n['y1']) / 2
    groups = []
    keyf = lambda l: (l['page_i'], l['half'], l['col'])
    by_col = collections.defaultdict(list)
    for l in texts:
        by_col[keyf(l)].append(l)
    for k in sorted(by_col, key=lambda k: (k[0], k[1], k[2])):
        ls = sorted(by_col[k], key=lambda l: l['y0'])
        diffs = [b['y0'] - a['y0'] for a, b in zip(ls, ls[1:]) if 0 < b['y0'] - a['y0'] < 16]
        pitch = statistics.median(diffs) if diffs else 13.8
        cur = [ls[0]]
        for a, b in zip(ls, ls[1:]):
            if b['y0'] - a['y0'] > pitch * 1.18:
                groups.append(cur)
                cur = []
            cur.append(b)
        groups.append(cur)
    used = set()
    entries = []
    for g in groups:
        k = keyf(g[0])
        hit = None
        for n in nums:
            if id(n) in used or (n['page_i'], n['half']) != k[:2] or abs(n['x1'] - k[2]) > 4:
                continue
            for j, l in enumerate(g):
                if abs(n['yc'] - (l['y0'] + l['y1']) / 2) < 4:
                    hit = (j, int(n['text']))
                    used.add(id(n))
                    break
            if hit:
                break
        entries.append(split_entry(g, hit))
    for n in nums:
        if id(n) not in used:
            entries.append(dict(orphan_page=int(n['text']), page_i=n['page_i'], half=n['half'], x0=n['x0'], y0=n['y0'],
                                lines_tr=[], lines_en=[]))
    return entries


def split_entry(g, hit):
    """Grubu TR ve EN adlarına ayırır. Sayfa no TR adının son satırındadır; numarasızsa başlıkta BÜYÜK HARF / font,
    yoksa satırların yarısı."""
    texts = [l['text'] for l in g]
    flags = []
    if hit:
        k = hit[0] + 1
    elif is_upper(texts[0]):
        k = 1
        while k < len(g) and is_upper(texts[k]) and g[k]['font'] == g[0]['font']:
            k += 1
    else:
        k = (len(g) + 1) // 2
        if len(g) > 2:
            flags.append('split_guess')
    return dict(lines_tr=texts[:k], lines_en=texts[k:], page=hit[1] if hit else None, page_i=g[0]['page_i'],
                half=g[0]['half'], x0=g[0]['x0'], y0=g[0]['y0'], upper=is_upper(texts[0]),
                font=g[0]['font'], flags=flags)


# ----------------------------------------------------------------------------
# noktalı içindekiler (Hatay)

def parse_dotted(book, pages):
    entries = []
    for l in toc_lines(book, pages):
        t = l['text']
        if not (13.5 <= l['size'] <= 15.5):
            continue
        bullet = t.startswith('•')
        t = t.lstrip('•· ').strip()
        m = re.fullmatch(r'(.*?)\s*\.+\s*(\d{1,3})?\s*', t)
        name, page = (m.group(1), m.group(2)) if m else (t, None)
        tr, en = (name.split(' / ', 1) + [''])[:2] if ' / ' in name else (name, '')
        entries.append(dict(lines_tr=[tr.strip()], lines_en=[en.strip()] if en.strip() else [],
                            page=int(page) if page else None, page_i=l['page_i'], half=l['half'], x0=l['x0'],
                            y0=l['y0'], upper=True, bullet=bullet, font=l['font'], flags=[]))
    return entries


# ----------------------------------------------------------------------------

def build_tree(book, raw):
    """Ham kayıtlar → düzey, üst kayıt, ilçe ve bölüm bağlamı."""
    cfg = BOOKS[book]['pdfx']
    city = BOOKS[book]['city']
    prefix = re.sub(r'[^a-z0-9]', '', book.split('-')[0])[0] + book.split('-')[-1]
    order = cfg.get('toc_order', 'district>section')
    out = []
    district = section = None
    cx = None            # etkin külliye: dict(id, x0, col, child_x0)
    for e in raw:
        if 'orphan_page' in e:
            if out:
                out[-1].setdefault('flags', []).append(f"orphan_page:{e['orphan_page']}")
            continue
        name_tr, name_en = join_lines(e['lines_tr']), join_lines(e['lines_en'])
        if not name_en and out and not e['lines_tr']:
            continue
        # sütun başında yalnızca İngilizce satırlar: önceki kaydın EN adının devamı
        if e['page'] is None and not e.get('bullet') and out and not e['upper'] and heading_lang(name_tr) == 'en' \
                and out[-1]['level'] == 'monument':
            out[-1]['name_en'] = join_lines([out[-1]['name_en'], name_tr, name_en])
            out[-1]['flags'].append('en_continued')
            continue
        if cfg.get('toc_style') == 'dotted':     # madde imli satır eserdir; Hatay'da külliye üyeleri ayrı kayıt değil
            level = ('complex' if COMPLEX_WORD.search(tr_upper(name_tr)) else 'monument') if e['bullet'] else 'section'
        else:
            level = level_of(name_tr, city, e['upper'])
        rec = dict(id=f'{prefix}-{len(out) + 1:04d}', book=book, level=level, name_tr=name_tr, name_en=name_en,
                   page=e['page'], page_src='toc' if e['page'] else None, parent=None, district=district,
                   section=section, toc_pdf_page=e['page_i'], flags=list(e.get('flags', [])))
        if level == 'district':
            district = district_of(name_tr, city)
            rec['district'] = district
            cx = None
            if order == 'district>section':
                section = None
                rec['section'] = None
        elif level == 'section':
            section = name_tr
            rec['section'] = section
            cx = None
            if order == 'section>district':
                district = None
                rec['district'] = None
        elif level == 'complex' and cfg.get('toc_style') != 'dotted':
            cx = dict(id=rec['id'], x0=e['x0'], key=(e['page_i'], e['half']), child_x0=None)
        elif cx:
            same_col = (e['page_i'], e['half']) == cx['key'] and abs(e['x0'] - cx['x0']) < 60
            if same_col and cx['child_x0'] is None:
                cx['child_x0'] = e['x0']
            # girintili külliyede (Bursa) külliye hizasına dönen kayıt külliyeden çıkar
            if same_col and cx['child_x0'] is not None and cx['child_x0'] > cx['x0'] + 10 and e['x0'] <= cx['x0'] + 5:
                cx = None
            else:
                rec['parent'] = cx['id']
        if e['upper'] and level == 'monument':
            rec['flags'].append('upper_title')
        # Konya: sayfa no ilçe satırında; altındaki ilk eser numarasızdır ve o sayfada başlar
        if level in ('monument', 'complex') and not rec['page'] and out and out[-1]['level'] in ('district', 'section') \
                and out[-1]['page']:
            rec['page'], rec['page_src'] = out[-1]['page'], 'toc_heading'
        out.append(rec)
    return out


def check_pages(recs):
    """Sayfa noları kitap sırasıyla artmalı. Artan en uzun dizinin dışında kalan (kesik ya da baskı hatası) no
    'page_suspect' olur ve kullanılmaz; sayfa sonra gövdedeki başlıktan aranır."""
    idx = [k for k, r in enumerate(recs) if r['page']]
    keep = set(longest_nondecreasing([recs[k]['page'] for k in idx]))
    for j, k in enumerate(idx):
        if j not in keep:
            recs[k]['flags'].append(f"page_suspect:{recs[k]['page']}")
            recs[k]['page'], recs[k]['page_src'] = None, None


def longest_nondecreasing(xs):
    """Artan (azalmayan) en uzun alt dizinin konumları."""
    import bisect
    tails, tails_i, prev = [], [], [-1] * len(xs)
    for i, x in enumerate(xs):
        j = bisect.bisect_right(tails, x)
        if j == len(tails):
            tails.append(x)
            tails_i.append(i)
        else:
            tails[j], tails_i[j] = x, i
        prev[i] = tails_i[j - 1] if j else -1
    out, k = [], tails_i[-1] if tails_i else -1
    while k >= 0:
        out.append(k)
        k = prev[k]
    return out[::-1]


def heading_pages(book, pages, recs):
    """Sayfası olmayan kayıtları gövdedeki başlıktan bulur (kitap sırasıyla, bir önceki kaydın sayfasından sonra)."""
    a, b = BOOKS[book]['pdfx']['toc_pages']
    heads = []
    for p in pages[b + 1:]:
        for l in p['lines']:
            if l['role'].startswith(('title_tr', 'heading_tr')) or (l['role'] == 'body' and is_upper(l['text'])
                                                                     and 'Bold' in l['font']):
                heads.append((l['printed_page'], p['i'], l['y0'], norm_title(l['text'])))
    # sarılmış başlık: aynı sayfada art arda iki ya da üç satır birleşik de denenir
    joined = [(h[0], h[1], h[2], h[3] + ' ' + n[3]) for h, n in zip(heads, heads[1:]) if h[1] == n[1]]
    joined += [(h[0], h[1], h[2], ' '.join((h[3], n[3], m[3]))) for h, n, m in zip(heads, heads[1:], heads[2:])
               if h[1] == n[1] == m[1]]
    cands = heads + joined
    last = 0
    for r in recs:
        if r['page']:
            last = max(last, r['page'])
            continue
        if r['level'] not in ('monument', 'complex'):
            continue
        key = norm_title(r['name_tr'])
        hits = sorted(h[0] for h in cands if h[0] and h[3] == key and h[0] >= last)
        if hits:
            r['page'], r['page_src'] = hits[0], 'heading'
            last = hits[0]


def apply_overrides(book, recs):
    path = os.path.join(out_dir(book), 'toc_overrides.json')
    if not os.path.exists(path):
        return recs, 0
    ov = json.load(open(path, encoding='utf-8'))
    n = 0
    by_id = {r['id']: r for r in recs}
    for rid, fields in ov.get('set', {}).items():
        was = fields.get('_was')
        if rid in by_id and was is not None and norm_title(by_id[rid]['name_tr']) != norm_title(was):
            print(f"  UYARI {book} {rid}: düzeltme atlandı, kayıt artık '{by_id[rid]['name_tr']}' (beklenen '{was}')")
            continue
        if rid in by_id:
            by_id[rid].update({k: v for k, v in fields.items() if not k.startswith('_')})
            by_id[rid]['flags'] = [f for f in by_id[rid]['flags']] + ['override']
            if 'page' in fields:
                by_id[rid]['page_src'] = 'override'
            n += 1
    for rid in ov.get('ok', []):          # incelendi, doğru: şüpheli listesinden düşer
        if rid in by_id:
            by_id[rid]['flags'].append('reviewed')
            n += 1
    dele = set(ov.get('delete', []))
    recs = [r for r in recs if r['id'] not in dele]
    n += len(dele)
    for k, add in enumerate(ov.get('add', [])):
        rec = dict(id=add.get('id') or f"{book}-add{k + 1}", book=book, level='monument', name_en='', page=None,
                   parent=None, district=None, section=None, toc_pdf_page=None, flags=['override_added'])
        rec.update({x: y for x, y in add.items() if x != 'after'})
        rec['page_src'] = 'override' if rec.get('page') else None
        pos = next((i + 1 for i, r in enumerate(recs) if r['id'] == add.get('after')), len(recs))
        recs.insert(pos, rec)
        n += 1
    return recs, n


def suspects(recs):
    """Kontrol listesi: (kayıt, nedenler)."""
    out = []
    for r in recs:
        if 'reviewed' in r['flags']:
            continue
        why = []
        if r['level'] in ('monument', 'complex') and not r['page']:
            why.append('sayfasız')
        if r['level'] in ('monument', 'complex') and (len(norm_title(r['name_tr'])) < 6 or
                                                       norm_title(r['name_tr']) in SHORT_NAMES):
            why.append('adı çok kısa' + (' (külliye üyesi; ada külliye adı eklenmeli mi?)' if r['parent'] else ''))
        if r['level'] == 'monument' and 'upper_title' in r['flags'] and BOOKS[r['book']]['pdfx'].get('toc_style') != 'dotted':
            why.append('BÜYÜK HARF ama ilçe/bölüm değil')
        if not r['name_en'] and r['level'] != 'district':
            why.append('EN adı eksik')
        why += [f for f in r['flags'] if f.startswith(('page_suspect', 'orphan_page', 'split_guess', 'en_continued'))]
        if why:
            out.append((r, why))
    return out


def build(book, pages=None, verbose=True):
    pages = pages or load_pages(book)
    raw = parse_dotted(book, pages) if BOOKS[book]['pdfx'].get('toc_style') == 'dotted' else parse_columns(book, pages)
    recs = build_tree(book, raw)
    check_pages(recs)
    heading_pages(book, pages, recs)
    recs, n_ov = apply_overrides(book, recs)
    for i, r in enumerate(recs):
        r['order'] = i
        r['key'] = f"{norm_title(r['name_tr'])}|{r['page'] or ''}"
    path = os.path.join(out_dir(book), 'toc.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(recs, f, ensure_ascii=False, indent=1)
    if verbose:
        lv = collections.Counter(r['level'] for r in recs)
        print(f"{book}: {len(recs)} kayıt ({', '.join(f'{k} {v}' for k, v in lv.most_common())}), "
              f"düzeltme {n_ov} → {os.path.relpath(path)}")
    return recs


def existing_rows():
    """Karşılaştırma için mevcut eserler: veritabanı (yalnızca okuma; DATABASE_URL) ya da yoksa ona yüklenmiş eski
    çıkarım (data/monuments_all.json). Döner: (kaynak adı, satırlar)."""
    from .cityqueue import db_rows
    rows = db_rows()
    if rows is not None:
        return 'veritabanı', rows
    path = os.path.join(ROOT, 'data', 'monuments_all.json')
    mons = json.load(open(path, encoding='utf-8'))
    return 'monuments_all.json', [dict(slug=m['slug'], name_tr=m['title_tr'], toc_title=m.get('toc_title'), book=m['book'],
                                       pilot=False, p0=(m.get('pages') or [None])[0], p1=(m.get('pages') or [None])[-1])
                                  for m in mons if not m.get('synthetic')]


def report(books, all_recs):
    """Kitap başına özet + şüpheli satırlar; data/pdfx/toc_suspects.csv (overrides'ı birlikte doldurmak için)."""
    from .cityqueue import match
    src, rows = existing_rows()
    lines = []
    print(f'\nKarşılaştırma kaynağı: {src}')
    print(f"{'kitap':8} {'kayıt':>5} {'eser':>5} {'külliye':>7} {'bölüm':>5} {'ilçe':>4}  {'mevcut':>6} {'eşleşen':>7} "
          f"{'TOC-da yok':>10}")
    for b in books:
        recs = all_recs[b]
        lv = collections.Counter(r['level'] for r in recs)
        mine = [r for r in rows if r['book'] == b]
        hit = set()
        for r in recs:
            if r['level'] in ('monument', 'complex'):
                m, _ = match(r, mine)
                if m:
                    hit.add(m['slug'])
        print(f"{b:8} {len(recs):5} {lv['monument']:5} {lv['complex']:7} {lv['section']:5} {lv['district']:4}  "
              f"{len(mine):6} {len(hit):7} {len(mine) - len(hit):10}")
        for r, why in suspects(recs):
            lines.append((b, r, why))
    path = os.path.join(OUT, 'toc_suspects.csv')
    import csv
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['kitap', 'id', 'düzey', 'sayfa', 'ad_tr', 'ad_en', 'nedenler'])
        for b, r, why in lines:
            w.writerow([b, r['id'], r['level'], r['page'] or '', r['name_tr'], r['name_en'], ', '.join(why)])
    print(f'\nŞüpheli satır: {len(lines)} → {os.path.relpath(path)}')
    for b, r, why in lines:
        print(f"  {r['id']}  {r['level']:8} s.{str(r['page'] or '-'):>4}  {r['name_tr'][:50]:<50} | {r['name_en'][:35]:<35} "
              f"← {', '.join(why)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--book', action='append')
    ap.add_argument('--no-report', action='store_true')
    a = ap.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    books = a.book or list(BOOKS)
    recs = {b: build(b) for b in books}
    if not a.no_report:
        report(books, recs)


if __name__ == '__main__':
    main()
