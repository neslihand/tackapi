"""Aşama 8 – Envanter kitabı PDF'lerinden fotoğrafları çıkarma ve eserlere bağlama.

Yalnızca kaynak_pdfs klasöründeki envanter kitapları kullanılır (books.py → pdf). Kitaplar çift sayfa (spread) olarak
taranmıştır: her PDF sayfasında iki basılı sayfa vardır ve sayfa numaraları alt kenarda yazar. Eserlerin basılı sayfa
aralıkları (monuments_all.json → pages) bilindiği için fotoğraf, bulunduğu basılı sayfaya göre esere bağlanır.

Bağlama kuralları (sırayla):
  1. Basılı sayfa: alt kenardaki sayı(lar)dan okunur. Sayı yoksa (tam sayfa fotoğraf, ayraç) komşu sayfalardan
     doğrusal olarak tahmin edilir ve 'tahmini' olarak işaretlenir.
  2. Yarım: fotoğrafın ortası sol yarıdaysa sol sayfa, sağdaysa sağ sayfa; iki yarıya da taşıyorsa (spread) ikisi.
  3. Sayfa tek bir esere düşüyorsa → o eser.
  4. Birden çok esere düşüyorsa:
       a. Biri bitip diğeri başlıyorsa (sınır sayfası): yeni eserin başlığı sayfada aranır; başlığın üstündeki
          fotoğraf öncekine, altındaki yenisine gider. Başlık bulunamazsa → kontrol gerekli.
       b. Aralıklar iç içeyse (külliye ↔ yapı, yinelenen kayıt) → en dar aralıklı eser; yinelenen başlıkta kontrol gerekli.
  5. Hiçbir esere düşmüyor ama giriş / şehir tarihi / bölüm girişi sayfasındaysa → o bölüme (şehir ya da kitap
     galerisi; herhangi bir eserin fotoğrafı olarak gösterilmez).
  6. Hiçbirine düşmüyorsa (kapak, künye, ayraç, bölümler arası açılış fotoğrafları) → 'bağlanmamış'. Yayımlanmaz;
     yönetim panelinde bir esere, şehre bağlanır ya da atılır.
Kontrol gerektiren her fotoğraf 'draft' olarak kalır; yalnızca kesin eşleşmeler doğrudan 'published' olur.

Elenenler: kısa kenarı 400 px'ten küçük ya da sayfanın %3'ünden azını kaplayan görseller, 4'ten fazla sayfada
tekrarlanan süsler/logolar, neredeyse tek renkli dokular ve aynı görselin kopyaları.

Kullanım:
  python images.py --report            # yalnızca rapor: data/review/gorseller.csv (hiçbir şey yazmaz)
  python images.py --write [--book X]  # media/ altına WebP üretir + data/images.jsonl (kaldığı yerden devam eder)
"""
import os, sys, re, csv, json, hashlib, argparse, collections, io
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS
from segment import norm_title

ROOT = os.path.join(os.path.dirname(__file__), '..')
DATA = os.path.join(ROOT, 'data')
MEDIA = os.environ.get('VAKIF_MEDIA_DIR', os.path.join(ROOT, 'media'))
PDF_DIR = os.environ.get('VAKIF_PDF_DIR', os.path.join(os.path.expanduser('~'), 'OneDrive', 'Belgeler', 'Kok&Kod', 'kaynak_pdfs'))
MIN_SIDE, MIN_COVER, MAX_REPEAT = 400, 0.03, 4
FULL_W, THUMB_W = 1600, 480
SECTION_KINDS = ('intro', 'city_history', 'chapter_intro', 'complex_intro')


def page_numbers(page):
    """Sayfa numaraları → {'L': n, 'R': m}. Numaralar üst ya da alt kenar şeridinin dış köşelerinde yazar;
    metnin içindeki sayılar (yıl, dipnot) karışmasın diye yalnızca oraya bakılır."""
    W, H = page.rect.width, page.rect.height
    out = {}
    for x0, y0, x1, y1, w, *_ in page.get_text('words'):
        if not re.fullmatch(r'\d{1,3}', w) or not (y1 < H * 0.1 or y0 > H * 0.9):
            continue
        if x0 < W * 0.1:
            out['L'] = int(w)
        elif x1 > W * 0.9:
            out['R'] = int(w)
    if 'L' in out and 'R' in out and out['R'] != out['L'] + 1:
        return {}  # tutarsız: komşulardan tahmin edilsin
    if 'L' in out and 'R' not in out:
        out['R'] = out['L'] + 1
    if 'R' in out and 'L' not in out:
        out['L'] = out['R'] - 1
    return out


def printed_pages(doc):
    """Her PDF sayfası için (sol, sağ, tahmini_mi). Numarasız sayfalar komşulardan tahmin edilir (sol = 2*i + k)."""
    known = {i: page_numbers(doc[i]) for i in range(len(doc))}
    offs = {i: n['L'] - 2 * i for i, n in known.items() if n}
    # komşularının çoğuyla uyuşmayan tek tük okumaları at (ör. kenara denk gelen bir rakam)
    order = sorted(offs)
    for j, i in enumerate(order):
        near = [offs[x] for x in order[max(0, j - 3):j] + order[j + 1:j + 4]]
        if near and offs[i] not in near:
            known[i] = {}
    offs = {i: n['L'] - 2 * i for i, n in known.items() if n}
    out = []
    for i in range(len(doc)):
        if known[i]:
            out.append((known[i]['L'], known[i]['R'], False))
            continue
        before = [offs[j] for j in sorted(offs) if j < i][-1:]
        after = [offs[j] for j in sorted(offs) if j > i][:1]
        cands = before + after
        if not cands:
            out.append((None, None, True))
            continue
        k = before[0] if before and (not after or before[0] == after[0]) else cands[0]
        out.append((2 * i + k, 2 * i + k + 1, True))
    return out


def load_records(book):
    mons = [m for m in json.load(open(os.path.join(DATA, 'monuments_all.json'), encoding='utf-8'))
            if m['book'] == book and not m.get('synthetic') and m.get('pages')]
    secs = [s for s in json.load(open(os.path.join(DATA, 'sections_all.json'), encoding='utf-8'))
            if s['book'] == book and s.get('pages') and {'intro': 'chapter_intro'}.get(s['kind'], s['kind']) in SECTION_KINDS]
    return mons, secs


def covering(recs, p):
    return [r for r in recs if r['pages'][0] <= p <= r['pages'][-1]]


def find_titles(doc, pps, mons):
    """Eser başlıklarını PDF'te bulur → {(pdf_sayfa, yarım): [(y, eser), ...]}.

    Başlık bloğu kısa bir bloktur ve normalleştirilmiş hâli bir eser adıyla aynıdır (BÜYÜK HARF ya da satıra bölünmüş
    olabilir). Aynı adlı birden çok eser varsa basılı sayfası en yakın olan seçilir."""
    by_title = collections.defaultdict(list)
    for m in mons:
        by_title[norm_title(m['title_tr'])].append(m)
    out = collections.defaultdict(list)
    for i in range(len(doc)):
        page = doc[i]
        W = page.rect.width
        # başlık birden çok satıra, hatta birden çok bloğa bölünebilir ('SOKULLU MEHMET PAŞA' + 'CAMİİ VE KÜLLİYESİ'):
        # her yarımın satırlarını sırayla dizip art arda gelen 1–4 satırı bir eser adıyla karşılaştır
        halves = collections.defaultdict(list)
        for x0, y0, x1, y1, text, *_ in page.get_text('blocks'):
            for line in text.split('\n'):
                if line.strip():
                    halves['L' if (x0 + x1) / 2 < W / 2 else 'R'].append((y0, line))
        found = []
        for half, lines in halves.items():
            j = 0
            while j < len(lines):
                for k in (4, 3, 2, 1):
                    t = norm_title(' '.join(l for _, l in lines[j:j + k]))
                    if t in by_title and len(t.split()) <= 9:
                        found.append((lines[j][0], half, t))
                        j += k - 1
                        break
                j += 1
        for y0, half, t in found:
            printed = pps[i][0] if half == 'L' else pps[i][1]
            cands = by_title[t]
            inside = [m for m in cands if printed is not None and m['pages'][0] - 2 <= printed <= m['pages'][-1] + 2]
            # yinelenen kayıtlarda (ör. hatalı kısa 'Ulucami' parçası) sayfayı kapsayan en uzun kayıt asıl kayıttır
            m = (max(inside, key=lambda m: m['pages'][-1] - m['pages'][0]) if inside
                 else min(cands, key=lambda m: abs(m['pages'][0] - (printed or 0))))
            if all(x[1] is not m for x in out[(i, half)]):
                out[(i, half)].append((y0, m))
    return out


def is_divider(page):
    """Bölüm ayracı: 'Külliyeler / COMPLEXES / O S M A N G A Z İ' gibi yalnızca kısa bir başlık taşıyan sayfa."""
    t = re.sub(r'\s+', ' ', page.get_text()).strip()
    return 0 < len(re.sub(r'\b\d{1,3}\b', '', t).strip()) < 150


def resolve(i, half, bbox, pps, titles, state, mons, secs):
    """Bir fotoğraf için (eser, bölüm_başlığı, yöntem, kontrol_gerekli, basılı_sayfa).

    Okuma sırasıyla ilerlenir; her fotoğraf o ana kadar başlamış son esere aittir. Kitapta her eser sol üstte büyük bir
    fotoğrafla açılır ve başlık fotoğrafın altındadır; bu yüzden başlığın bulunduğu yarım sayfadaki fotoğraflar o yeni
    esere bağlanır. Bölüm ayracından sonra, yeni bir başlık gelene kadar fotoğraflar hiçbir esere bağlanmaz."""
    left, right, guessed = pps[i]
    printed = left if half in ('L', 'both') else right
    here = titles.get((i, 'L' if half == 'both' else half), [])
    if here:
        if len(here) == 1:
            m, method, review = here[0][1], 'baslik', False
        else:  # aynı yarımda iki başlık: fotoğrafın hemen altındaki başlık (fotoğraf eseri açar)
            below = [t for t in here if t[0] >= bbox[1]]
            m, method, review = (min(below, key=lambda t: t[0]) if below else max(here, key=lambda t: t[0]))[1], 'baslik_coklu', True
    elif state.get('current'):
        m, method, review = state['current'], 'onceki_baslik', False
    else:
        m = None
    if m is not None:
        # çapraz kontrol: metinden çıkarılan sayfa aralığından çok uzaksa kontrol iste
        if printed is not None and not (m['pages'][0] - 4 <= printed <= m['pages'][-1] + 6):
            method, review = method + '_aralik_disi', True
        return m['slug'], None, method, review or ('duplicate_title' in (m.get('qa_flags') or [])), printed
    s = covering(secs, printed) if printed is not None else []
    if s:
        return None, s[0]['title_tr'], 'bolum', guessed, printed
    # ilk eserden önceki fotoğraflar: kitabın tematik girişi (ör. "Cami ve Mescitler") ya da açılış fotoğrafları
    return None, None, 'giris' if not state.get('started') else 'baglanmamis', True, printed


def is_flat(pix_bytes):
    """Neredeyse tek renkli (doku/arka plan) görsel mi?"""
    from PIL import Image, ImageStat
    im = Image.open(io.BytesIO(pix_bytes)).convert('L')
    im.thumbnail((64, 64))
    return ImageStat.Stat(im).stddev[0] < 12


def scan(book, write=False):
    import pymupdf
    path = os.path.join(PDF_DIR, BOOKS[book]['pdf'])
    doc = pymupdf.open(path)
    mons, secs = load_records(book)
    pps = printed_pages(doc)
    titles = find_titles(doc, pps, mons)
    uses = collections.Counter(x[0] for i in range(len(doc)) for x in doc[i].get_images())
    seen, rows, order, state = set(), [], collections.Counter(), {}
    for i in range(len(doc)):
        page = doc[i]
        W, H = page.rect.width, page.rect.height
        if is_divider(page):
            state['current'] = None
        infos = page.get_image_info(xrefs=True)
        # okuma sırası: önce sol yarım, sonra sağ; her yarım bitince o yarımın son başlığı "güncel eser" olur
        for side in ('L', 'R'):
            for info in sorted(infos, key=lambda x: x['bbox'][1]):
                cx = (info['bbox'][0] + info['bbox'][2]) / 2
                if ('L' if cx < W / 2 else 'R') != side:
                    continue
                rows += scan_image(doc, i, info, W, H, uses, seen, order, pps, titles, state, mons, secs, book, write)
            if titles.get((i, side)):
                state['current'] = max(titles[(i, side)], key=lambda t: t[0])[1]
                state['started'] = True
    return rows


def scan_image(doc, i, info, W, H, uses, seen, order, pps, titles, state, mons, secs, book, write):
    """Tek bir görseli eler ya da bağlar; [satır] veya [] döndürür."""
    xref, (x0, y0, x1, y1) = info['xref'], info['bbox']
    w, h = info['width'], info['height']
    cover = (x1 - x0) * (y1 - y0) / (W * H)
    if not xref or min(w, h) < MIN_SIDE or cover < MIN_COVER or uses[xref] > MAX_REPEAT:
        return []
    raw = doc.extract_image(xref)
    sha = hashlib.sha1(raw['image']).hexdigest()
    if sha in seen or is_flat(raw['image']):
        return []
    seen.add(sha)
    half = 'both' if (x1 - x0) > W * 0.6 else ('L' if (x0 + x1) / 2 < W / 2 else 'R')
    slug, section, method, review, printed = resolve(i, half, (x0, y0, x1, y1), pps, titles, state, mons, secs)
    key = slug or (f'_bolum/{norm_title(section)[:30]}' if section else '_baglanmamis')
    order[key] += 1
    row = dict(book=book, pdf_page=i + 1, printed_page=printed, half=half, width=w, height=h,
               coverage=round(cover, 3), sha1=sha, monument_slug=slug, section=section, method=method,
               needs_review=review, sort=order[key], file=f'books/{book}/{i + 1:03d}-{sha[:10]}.webp')
    if write:
        save_webp(raw['image'], row['file'])
    return [row]


def save_webp(data, rel):
    from PIL import Image
    full = os.path.join(MEDIA, rel)
    thumb = os.path.join(MEDIA, 'thumbs', rel)
    if os.path.exists(full) and os.path.exists(thumb):
        return  # kaldığı yerden devam
    im = Image.open(io.BytesIO(data))
    im = im.convert('RGB')  # CMYK/gri tonlu JPEG'ler de web için RGB'ye
    for target, width, q in ((full, FULL_W, 82), (thumb, THUMB_W, 75)):
        os.makedirs(os.path.dirname(target), exist_ok=True)
        copy = im.copy()
        copy.thumbnail((width, width * 3))
        copy.save(target, 'WEBP', quality=q, method=5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--book', choices=list(BOOKS))
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--report', action='store_true', help='yalnızca CSV raporu (hiçbir dosya ya da tablo yazmaz)')
    g.add_argument('--write', action='store_true', help='WebP dosyalarını ve data/images.jsonl üretir')
    a = ap.parse_args()
    books = [a.book] if a.book else list(BOOKS)
    rows = []
    for b in books:
        r = scan(b, write=a.write)
        c = collections.Counter(x['method'] for x in r)
        print(f"{b}: {len(r)} fotoğraf | kontrol gerekli {sum(x['needs_review'] for x in r)} | {dict(c)}", flush=True)
        rows += r
    os.makedirs(os.path.join(DATA, 'review'), exist_ok=True)
    with open(os.path.join(DATA, 'review', 'gorseller.csv'), 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(sorted(rows, key=lambda x: (not x['needs_review'], x['book'], x['pdf_page'])))
    if a.write:
        with open(os.path.join(DATA, 'images.jsonl'), 'w', encoding='utf-8') as f:
            for r in rows:
                f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f"toplam {len(rows)} fotoğraf; rapor: data/review/gorseller.csv")


if __name__ == '__main__':
    main()
