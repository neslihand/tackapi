"""Şehir kuyruğu: data/pdfx/queue.json (Bursa = I + II + III, Konya = I + II, Hatay; içindekiler sırasıyla).

Kuyruğa eser düzeyindeki kayıtlar girer (monument, complex); ilçe ve bölüm başlıkları girmez. Turlar şehirler arasında
döner (Bursa → Konya → Hatay → Bursa …; yükleyici pdfx/load.py, sonraki adım). Kayıt durumu:
  waiting → loaded → approved   ya da   pilot_locked (zaten pilot, hiç dokunulmaz) / failed / retry

Pilot kilidi için veritabanı **yalnızca okunur** (SELECT; `DATABASE_URL`). Eşleşme: aynı kitap + normalleştirilmiş ad
(`toc_title` ya da `name_tr`) + sayfa kesişimi. Veritabanı adresi yoksa pilot denetimi atlanır ve bu dosyada
`pilot_check: "skipped"` yazar; o hâlde kuyruk yüklemede kullanılmamalıdır.

Yeniden çalıştırıldığında `waiting`/`pilot_locked` dışındaki durumlar (loaded, approved, failed, retry) korunur.

Kullanım (pipeline klasöründen):
  python -m pdfx.cityqueue            # toc.json'lardan kuyruk + rapor (toc.json yoksa üretir)
  python -m pdfx.cityqueue --no-db    # veritabanına hiç bağlanmadan
"""
import os, sys, json, argparse, collections, difflib, datetime
from . import OUT, ROOT
from books import BOOKS, DISTRICTS
from segment import norm_title

CITY_ORDER = ['bursa', 'konya', 'hatay']
WORK_LEVELS = ('monument', 'complex')
KEEP = {'loaded', 'approved', 'failed', 'retry'}

DB_SQL = """
SELECT m.slug, m.name_tr, m.toc_title, b.slug AS book, m.pilot, m.review_status,
       lower(m.pages) AS p0, upper(m.pages) - 1 AS p1
FROM monument m JOIN source_book b ON b.id = m.book_id
WHERE NOT m.is_synthetic
"""


def load_toc(book):
    path = os.path.join(OUT, book, 'toc.json')
    if not os.path.exists(path):
        from . import toc
        return toc.build(book, verbose=False)
    return json.load(open(path, encoding='utf-8'))


def db_rows():
    """Veritabanındaki kitap eserleri (yalnızca okuma). Adres yoksa None."""
    if not os.environ.get('DATABASE_URL'):
        return None
    from db import DB
    return DB().query(DB_SQL)


def page_overlap(rec, row, tol=1):
    if not rec.get('page') or row.get('p0') is None:
        return None
    p1 = row['p1'] if row.get('p1') is not None else row['p0']
    return row['p0'] - tol <= rec['page'] <= p1 + tol


def bare(name, book):
    """Karşılaştırma için ad: baştaki ilçe adı atılır ('Beyşehir Eşrefoğlu Bedesteni' → 'esrefoglu bedesteni')."""
    s = norm_title(name)
    for d in sorted(DISTRICTS[BOOKS[book]['city']], key=len, reverse=True):
        d = norm_title(d) + ' '
        if s.startswith(d):
            return s[len(d):]
    return s


def match(rec, rows, toc_unique=False):
    """TOC kaydına karşılık gelen veritabanı eseri (ya da None) ve eşleşme türü.

    toc_unique: bu ad kitabın içindekilerinde bir kez geçiyor. O zaman veritabanında da tek olan ad, sayfa aralığı
    tutmasa da eşleşir ('name(page≠)'): panelde düzeltilen eserlerin (pilotlar) sayfaları etkin paragraflardan yeniden
    hesaplandığı için içindekiler sayfasıyla kesişmeyebilir."""
    key = bare(rec['name_tr'], rec['book'])
    cands = [r for r in rows if r['book'] == rec['book']]
    exact = [r for r in cands if key in (bare(r.get('toc_title') or '', r['book']), bare(r['name_tr'], r['book']))]
    if exact:
        paged = [r for r in exact if page_overlap(rec, r)]
        if len(paged) == 1:
            return paged[0], 'name+page'
        if len(exact) == 1 and page_overlap(rec, exact[0]) is not False:
            return exact[0], 'name'
        if paged:
            return paged[0], 'name+page?'
        if len(exact) == 1 and toc_unique:
            return exact[0], 'name(page≠)'
    best, score = None, 0
    for r in cands:
        if not page_overlap(rec, r):
            continue
        s = max(difflib.SequenceMatcher(None, key, bare(t, r['book'])).ratio() for t in (r.get('toc_title') or '', r['name_tr']))
        if s > score:
            best, score = r, s
    if best and score >= 0.85:
        return best, f'fuzzy{score:.2f}'
    return None, None


def make_queue(tocs, rows, old=None):
    """tocs: {kitap: toc kayıtları}; rows: veritabanı eserleri ya da None; old: önceki queue.json. Döner: {şehir: [...]}."""
    old_items = {}
    for items in (old or {}).get('cities', {}).values():
        for it in items:
            old_items[(it['book'], it['key'])] = it
    cities = collections.OrderedDict((c, []) for c in CITY_ORDER)
    for book in sorted(tocs, key=lambda b: (CITY_ORDER.index(BOOKS[b]['city']), BOOKS[b]['volume'])):
        names = collections.Counter(bare(r['name_tr'], book) for r in tocs[book] if r['level'] in WORK_LEVELS)
        for r in tocs[book]:
            if r['level'] not in WORK_LEVELS:
                continue
            it = dict(id=r['id'], book=book, city=BOOKS[book]['city'], key=r['key'], level=r['level'],
                      name_tr=r['name_tr'], name_en=r['name_en'], page=r['page'], parent=r['parent'],
                      district=r['district'], section=r['section'], status='waiting', db_slug=None, db_match=None)
            if rows is not None:
                if r.get('db_slug'):           # toc_overrides.json → set: {"db_slug": "..."} (elle eşleme)
                    m, kind = next((x for x in rows if x['slug'] == r['db_slug']), None), 'override'
                else:
                    m, kind = match(r, rows, toc_unique=names[bare(r['name_tr'], book)] == 1)
                if m:
                    it['db_slug'], it['db_match'] = m['slug'], kind
                    if m['pilot']:
                        it['status'] = 'pilot_locked'
            prev = old_items.get((book, it['key']))
            if prev and prev.get('status') in KEEP and it['status'] != 'pilot_locked':
                it['status'] = prev['status']
            cities[it['city']].append(it)
    return cities


def build(use_db=True, verbose=True):
    rows = db_rows() if use_db else None
    path = os.path.join(OUT, 'queue.json')
    old = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else None
    cities = make_queue({b: load_toc(b) for b in BOOKS}, rows, old)
    data = dict(generated=datetime.date.today().isoformat(), pilot_check='db' if rows is not None else 'skipped',
                city_order=CITY_ORDER, cities=cities)
    os.makedirs(OUT, exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    if verbose:
        report(data, rows)
        print(f'→ {os.path.relpath(path, ROOT)}')
    return data, rows


def report(data, rows):
    if rows is None:
        print('UYARI: DATABASE_URL yok, pilot denetimi atlandı (pilot_check=skipped).')
    for city, items in data['cities'].items():
        st = collections.Counter(i['status'] for i in items)
        print(f"{city:6} {len(items):4} eser  " + ', '.join(f'{k} {v}' for k, v in st.most_common()))
    if rows is not None:
        pilots = [r for r in rows if r['pilot']]
        locked = {i['db_slug'] for items in data['cities'].values() for i in items if i['status'] == 'pilot_locked'}
        miss = [r['slug'] for r in pilots if r['slug'] not in locked]
        print(f'pilot eser: {len(pilots)}, kuyrukta kilitlenen: {len(locked)}')
        by_slug = collections.defaultdict(list)
        for items in data['cities'].values():
            for i in items:
                if i['status'] == 'pilot_locked':
                    by_slug[i['db_slug']].append(i)
        for slug, its in sorted(by_slug.items()):
            for i in its:
                warn = '  ! birden çok kayıt aynı pilota bağlandı' if len(its) > 1 else ''
                print(f"  kilit  {slug:<55} ← {i['id']} s.{i['page'] or '-':<4} {i['db_match']:<12} {i['name_tr'][:40]}{warn}")
        for s in miss:
            print(f'  ! içindekilerle eşleşmeyen pilot: {s} (overrides ile eşlenmeli; yükleyici yine de dokunmaz)')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--no-db', action='store_true')
    a = ap.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    build(use_db=not a.no_db)


if __name__ == '__main__':
    main()
