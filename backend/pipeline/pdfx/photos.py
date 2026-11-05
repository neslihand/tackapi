"""Adım 5 – Fotoğrafları çapaya göre eserlere bağlama → data/pdfx/<kitap>/photos.json.

(Plandaki adı `pdfx/images.py`; üst klasördeki images.py ile karışmasın diye photos.py.)

Eleme kuralları images.py ile aynıdır ve oradan alınır: kısa kenarı 150 px'ten küçük ya da sayfanın %0,8'inden azını
kaplayan görseller, 4'ten fazla sayfada tekrarlanan süsler, neredeyse tek renkli dokular ve sha1 kopyaları elenir.
Dosya adı da aynıdır (`books/<kitap>/<pdf sayfa>-<sha1[:10]>.webp`): mevcut WebP'ler sha1 ile tanınır, yeniden
üretilmez.

Bağlama (sayfa aralığıyla değil, çapayla; anchors.json):
  konum   fotoğrafın (PDF sayfası, yarı, dikey orta noktası) hangi iki çapa arasındaysa o kayıt. Çapalar Türkçe
          başlığın yeridir; hazireler (`<üst>-hz1`) kendi başlıklarından sonra gelen fotoğrafları alır.
  baslik_ustu  aynı yarım sayfada fotoğrafın altında bir eser başlığı var ve arada metin yoksa o eser (kitapta
          fotoğraf başlığın üstünde durur; Bursa hazireleri: fotoğraf, 'X CAMİİ HAZİRESİ', metin).
  acilis  hiç metin satırı olmayan yarım sayfadaki fotoğraf, bir sonraki eser aynı açılımda daha sonra başlıyorsa o
          eseri açar (images.py'deki 'acilis' kuralı). Sonraki eser hemen sonraki PDF sayfasında başlıyorsa fotoğraf
          önceki eserde kalır ama `fotograf_sayfasi` ile kontrole düşer (Hatay'da eserin kendi fotoğraf sayfası).
  bolum   son çapa bir bölüm ya da ilçe ayracıysa fotoğraf o bölümündür (eser fotoğrafı olarak gösterilmez).
  giris   ilk eserden önceki fotoğraflar (kapak, sunuş, şehir tarihi) → bağlanmamış.
Kontrol (`review`): eserin başlık sayfası ile metin sayfalarından (works.json → pages) 2 sayfadan uzak
(`aralik_disi`; Hatay'da büyük fotoğraf dikey başlık sayfasında, metin 2–3 sayfa sonra başlar), açılış fotoğrafı,
metinsiz fotoğraf sayfası (`fotograf_sayfasi`) ve çapası tahmini olan eser. Pilot eserlerin fotoğrafları `pilot_locked` işaretlenir; yükleyici onlara dokunmaz.

Karşılaştırma: eski bağlama (data/images.jsonl → monument_slug) ile yeni bağlama, kuyruktaki db_slug üzerinden.

Kullanım (pipeline klasöründen; önce layout, toc, cityqueue, anchor, text):
  python -m pdfx.photos [--book bursa-1]   # photos.json + konsol özeti + data/pdfx/photos_report.csv
  python -m pdfx.photos --write            # eksik WebP'leri media/ altına üretir (veritabanına yazmaz)
"""
import os, sys, json, csv, bisect, hashlib, argparse, collections, datetime
from . import out_dir, OUT, ROOT
from .layout import open_pdf, load_pages
from books import BOOKS
import images as old_images

TEXT_ROLES = ('body', 'quote', 'note')
WORK_LEVELS = ('monument', 'complex')
FAR_PAGES = 2


def load_json(book, name):
    with open(os.path.join(OUT, book, name), encoding='utf-8') as f:
        return json.load(f)


def old_rows():
    path = os.path.join(ROOT, 'data', 'images.jsonl')
    if not os.path.exists(path):
        return {}
    with open(path, encoding='utf-8') as f:
        return {r['sha1']: r for r in (json.loads(l) for l in f if l.strip())}


def queue_items():
    path = os.path.join(OUT, 'queue.json')
    if not os.path.exists(path):
        return {}
    with open(path, encoding='utf-8') as f:
        q = json.load(f)
    return {(i['book'], i['id']): i for items in q['cities'].values() for i in items}


def text_lines(pages):
    """Metin satırlarının üst kenarları, yarım sayfa başına: {(i, 'L'|'R'): [y0, ...]}."""
    out = collections.defaultdict(list)
    for p in pages:
        for l in p['lines']:
            if l['role'] in TEXT_ROLES and l['text'].strip():
                out[(p['i'], l['half'])].append(l['y0'])
    return out


def key_of(i, half, y):
    return (i, 0 if half == 'L' else 1, y)


def bind(recs, i, half, bbox, texts):
    """(kayıt ya da None, yöntem, ek bayraklar). recs: çapası olan kayıtlar, kitap sırasıyla; 'both' sol yarı sayılır.

    Sıra: (1) başlık üstü: aynı yarım sayfada fotoğrafın altında bir eser başlığı var ve aradaki boşlukta metin yoksa
    fotoğraf o eserindir (kitapta fotoğraf başlığın üstünde durur: Akbıyık Haziresi s. 246); (2) açılış: metinsiz yarım
    sayfadaki fotoğraf, aynı açılımda daha sonra başlayan eseri açar; (3) konum: önceki son çapa."""
    side = 'L' if half == 'both' else half
    y0, y1 = bbox[1], bbox[3]
    keys = [key_of(a['anchor']['i'], a['anchor']['half'], a['anchor']['y']) for a in recs]
    k = bisect.bisect_right(keys, key_of(i, side, (y0 + y1) / 2)) - 1
    rec = recs[k] if k >= 0 else None
    nxt = next((a for a in recs[k + 1:] if a['level'] in WORK_LEVELS), None)
    if nxt and nxt['anchor']['i'] == i and nxt['anchor']['half'] == side and nxt['anchor']['y'] >= y1 - 5 \
            and not any(y1 - 5 <= y < nxt['anchor']['y'] for y in texts.get((i, side), [])):
        return nxt, 'baslik_ustu', []
    halves = [(i, 'L'), (i, 'R')] if half == 'both' else [(i, side)]
    extra = []
    if not any(h in texts for h in halves) and nxt:
        ai, ah = nxt['anchor']['i'], nxt['anchor']['half']
        if ai == i and half != 'both' and key_of(ai, ah, 0) > key_of(i, side, 0):
            return nxt, 'acilis', ['acilis']
        if ai == i + 1:
            extra = ['fotograf_sayfasi']    # metinsiz sayfa, sonraki eser hemen sonraki sayfada: önceki eserde kalır
    if rec is None:
        return None, 'giris', []
    if rec['level'] not in WORK_LEVELS:
        return rec, 'bolum', []
    return rec, 'konum', extra


def scan(book, write=False):
    pages = load_pages(book)
    data = load_json(book, 'anchors.json')
    recs = [a for a in data['records'] if a['anchor']]
    works = {w['id']: w for w in load_json(book, 'works.json')['works']}
    texts = text_lines(pages)
    olds, queue = old_rows(), queue_items()
    doc = open_pdf(book)
    pps = old_images.printed_pages(doc)
    uses = collections.Counter(x[0] for pg in doc for x in pg.get_images())
    seen, rows, order = set(), [], collections.Counter()
    for i, page in enumerate(doc):
        W, H = page.rect.width, page.rect.height
        for info in sorted(page.get_image_info(xrefs=True), key=lambda x: ((x['bbox'][0] + x['bbox'][2]) / 2 >= W / 2,
                                                                          x['bbox'][1])):
            xref, (x0, y0, x1, y1) = info['xref'], info['bbox']
            cover = (x1 - x0) * (y1 - y0) / (W * H)
            if not xref or min(info['width'], info['height']) < old_images.MIN_SIDE or cover < old_images.MIN_COVER \
                    or uses[xref] > old_images.MAX_REPEAT:
                continue
            raw = doc.extract_image(xref)
            sha = hashlib.sha1(raw['image']).hexdigest()
            if sha in seen or old_images.is_flat(raw['image']):
                continue
            seen.add(sha)
            half = 'both' if (x1 - x0) > W * 0.6 else ('L' if (x0 + x1) / 2 < W / 2 else 'R')
            printed = pps[i][0] if half in ('L', 'both') else pps[i][1]
            rec, method, flags = bind(recs, i, half, (x0, y0, x1, y1), texts)
            work = rec if rec and rec['level'] in WORK_LEVELS else None
            if work:
                wp = works.get(work['id'], {}).get('pages')
                if wp and printed is not None:
                    first = min(wp[0], work['anchor']['printed_page'] or wp[0])
                if wp and printed is not None and not first - FAR_PAGES <= printed <= wp[1] + FAR_PAGES:
                    flags.append('aralik_disi')
                if 'anchor_guess' in work['flags']:
                    flags.append('anchor_guess')
            elif method == 'giris':
                flags.append('baglanmamis')
            q = queue.get((book, (work.get('parent') if work and work.get('kind') == 'hazire' else work['id'])
                           if work else None)) if work else None
            old = olds.get(sha)
            group = work['id'] if work else (f"_bolum/{rec['id']}" if rec else '_baglanmamis')
            order[group] += 1
            rows.append(dict(
                book=book, sha1=sha, pdf_page=i + 1, printed_page=printed, half=half, width=info['width'],
                height=info['height'], coverage=round(cover, 3), bbox=[round(v, 1) for v in (x0, y0, x1, y1)],
                work=work['id'] if work else None, work_name=work['name_tr_display'] if work else None,
                section=None if work or not rec else rec['name_tr_display'], method=method, flags=flags,
                review=bool(flags), sort=order[group],
                pilot_locked=bool(q and q.get('status') == 'pilot_locked'),
                db_slug=q.get('db_slug') if q and work and work.get('kind') != 'hazire' else None,
                file=old['file'] if old else f'books/{book}/{i + 1:03d}-{sha[:10]}.webp', is_new=old is None,
                old_slug=old.get('monument_slug') if old else None, old_method=old.get('method') if old else None))
            if write and not old:
                old_images.save_webp(raw['image'], rows[-1]['file'])
    return rows


def compare(rows):
    """Eski bağlama ile karşılaştırma: aynı / farklı / yalnız yeni / yalnız eski bağlı."""
    c = collections.Counter()
    diffs = []
    for r in rows:
        if r['is_new']:
            c['yeni_fotograf'] += 1
        elif not r['db_slug'] and not r['old_slug']:
            c['ikisi_de_eser_disi'] += 1
        elif r['db_slug'] and r['db_slug'] == r['old_slug']:
            c['ayni'] += 1
        elif r['work'] and not r['db_slug']:
            c['yeni_eser_ya_da_hazire'] += 1
        elif r['db_slug'] and not r['old_slug']:
            c['yalniz_yeni_bagli'] += 1
        elif r['old_slug'] and not r['work']:
            c['yalniz_eski_bagli'] += 1
        else:
            c['farkli'] += 1
            diffs.append(r)
    return c, diffs


def build(book, write=False, verbose=True):
    rows = scan(book, write)
    path = os.path.join(out_dir(book), 'photos.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(dict(book=book, generated=datetime.date.today().isoformat(), photos=rows), f, ensure_ascii=False,
                  indent=1)
    if verbose:
        print(f'{book}: {len(rows)} fotoğraf → {os.path.relpath(path)}')
    return rows


def summary(all_rows):
    print(f"\n{'kitap':8} {'foto':>5} {'eser':>5} {'açılış':>6} {'bölüm':>5} {'giriş':>5} {'kontrol':>7} {'pilot':>5} "
          f"{'yeni':>5} | {'aynı':>5} {'farklı':>6} {'yeni/hz':>7} {'yalnız yeni':>11} {'yalnız eski':>11}")
    report = []
    for book, rows in all_rows.items():
        m = collections.Counter(r['method'] for r in rows)
        c, diffs = compare(rows)
        print(f"{book:8} {len(rows):5} {m['konum'] + m['acilis'] + m['baslik_ustu']:5} {m['acilis']:6} {m['bolum']:5} {m['giris']:5} "
              f"{sum(r['review'] for r in rows):7} {sum(r['pilot_locked'] for r in rows):5} {c['yeni_fotograf']:5} | "
              f"{c['ayni']:5} {c['farkli']:6} {c['yeni_eser_ya_da_hazire']:7} {c['yalniz_yeni_bagli']:11} "
              f"{c['yalniz_eski_bagli']:11}")
        for r in rows:
            if r['review'] or r in diffs:
                report.append(r)
    path = os.path.join(OUT, 'photos_report.csv')
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['kitap', 'pdf_sayfa', 'basılı', 'yarı', 'eser', 'eser_adı', 'bölüm', 'yöntem', 'bayraklar',
                    'eski_slug', 'yeni_db_slug', 'dosya'])
        for r in report:
            w.writerow([r['book'], r['pdf_page'], r['printed_page'], r['half'], r['work'] or '', r['work_name'] or '',
                        r['section'] or '', r['method'], ', '.join(r['flags'] + (['eskiden_farkli'] if r['old_slug']
                        and r['db_slug'] and r['old_slug'] != r['db_slug'] else [])), r['old_slug'] or '',
                        r['db_slug'] or '', r['file']])
    print(f'\n→ {os.path.relpath(path, ROOT)} ({len(report)} satır)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--book', action='append')
    ap.add_argument('--write', action='store_true')
    a = ap.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    summary({b: build(b, a.write) for b in (a.book or BOOKS)})


if __name__ == '__main__':
    main()
