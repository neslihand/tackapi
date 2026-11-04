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
LOAD_KEYS = ('loaded_slug', 'round', 'loaded_at', 'hazires')

DB_SQL = """
SELECT m.slug, m.name_tr, m.toc_title, b.slug AS book, m.pilot, m.review_status, m.is_synthetic,
       'merged' = ANY(m.qa_flags) AS merged,
       lower(m.pages) AS p0, upper(m.pages) - 1 AS p1
FROM monument m JOIN source_book b ON b.id = m.book_id
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
    hesaplandığı için içindekiler sayfasıyla kesişmeyebilir.

    Birleştirilmiş taslaklar (qa_flags 'merged'; review_status değil) ve türetilmiş üst kayıtlar (`is_synthetic`; Bursa külliyeleri, yalnızca
    overrides → db_slug ile bağlanır) aday olmaz; belirsiz durumda pilot öne alınır (kilit kaçmasın). Sıra: `name_tr`
    birebir → `name_tr` bulanık (sayfa kesişimiyle) → `toc_title` birebir. `toc_title` en sona kalır: eski çıkarımda bazen
    bir önceki kaydın adıdır (I. Murad Hudâvendigâr Türbesi'nde 'İmareti')."""
    key = bare(rec['name_tr'], rec['book'])
    cands = [r for r in rows if r['book'] == rec['book'] and not r.get('merged') and not r.get('is_synthetic')]
    cands.sort(key=lambda r: not r['pilot'])
    hit = by_name(rec, [r for r in cands if key == bare(r['name_tr'], r['book'])], toc_unique)
    if hit[0]:
        return hit
    best, score = None, 0
    for r in cands:
        if not page_overlap(rec, r):
            continue
        s = difflib.SequenceMatcher(None, key, bare(r['name_tr'], r['book'])).ratio()
        if s > score:
            best, score = r, s
    if best and score >= 0.85:
        return best, f'fuzzy{score:.2f}'
    m, kind = by_name(rec, [r for r in cands if key == bare(r.get('toc_title') or '', r['book'])], toc_unique)
    return (m, 'toc_title:' + kind) if m else (None, None)


def by_name(rec, exact, toc_unique):
    if not exact:
        return None, None
    paged = [r for r in exact if page_overlap(rec, r)]
    if len(paged) == 1:
        return paged[0], 'name+page'
    if len(exact) == 1 and page_overlap(rec, exact[0]) is not False:
        return exact[0], 'name'
    if paged:
        return paged[0], 'name+page?'
    if len(exact) == 1 and toc_unique:
        return exact[0], 'name(page≠)'
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
            if r.get('rename'):                # toc_overrides.json → set: {"rename": true} (yükleyici PDF adını yazar)
                it['rename'] = True
            if rows is not None:
                if r.get('db_slug'):           # toc_overrides.json → set: {"db_slug": "..."} (elle eşleme)
                    m, kind = next((x for x in rows if x['slug'] == r['db_slug']), None), 'override'
                    if not m:
                        it['db_override_missing'] = r['db_slug']
                    elif m.get('merged'):      # yükleyici birleştirmeyi geri alır (qa_flags pdfx_unmerged)
                        it['db_override_merged'] = r['db_slug']
                else:
                    m, kind = match(r, rows, toc_unique=names[bare(r['name_tr'], book)] == 1)
                    if r.get('db_new') and m and not m['pilot']:   # toc_overrides.json → set: {"db_new": true}
                        m, kind = None, None                         # yeni eser; pilot kilidi yine de kalkmaz
                        it['db_match'] = 'override_new'
                if m:
                    it['db_slug'], it['db_match'] = m['slug'], kind
                    if m['pilot']:
                        it['status'] = 'pilot_locked'
            cities[it['city']].append(it)
    one_to_one(cities)
    for items in cities.values():
        for it in items:
            prev = old_items.get((it['book'], it['key']))
            if prev and prev.get('status') in KEEP and it['status'] != 'pilot_locked':
                it['status'] = prev['status']
            if prev:      # pdfx.load'un yazdıkları: yüklenen eserin slug'ı (yeni eserde eşleşme yoktur), tur, hazireler
                it.update({k: prev[k] for k in LOAD_KEYS if k in prev})
    return cities


MATCH_RANK = ['override', 'name+page', 'name', 'name+page?', 'name(page≠)']


def match_rank(kind):
    """Küçük olan güçlü: override < name… < fuzzy (benzerliğe göre) < toc_title:…"""
    if kind in MATCH_RANK:
        return MATCH_RANK.index(kind)
    if kind.startswith('fuzzy'):
        return len(MATCH_RANK) + 1 - float(kind[5:])
    return len(MATCH_RANK) + 2 + MATCH_RANK.index(kind.split(':', 1)[1])


def one_to_one(cities):
    """Bir veritabanı eseri tek kayda bağlanır: en güçlü eşleşme kalır, diğerlerinin bağı kalkar (`db_conflict`).
    Bağı kalkan kayıt yeni eser olarak yüklenir; pilotu hiçbir durumda değiştirmez."""
    by_slug = collections.defaultdict(list)
    for items in cities.values():
        for it in items:
            if it['db_slug']:
                by_slug[it['db_slug']].append(it)
    for slug, its in by_slug.items():
        if len(its) < 2:
            continue
        its.sort(key=lambda i: match_rank(i['db_match']))
        for it in its[1:]:
            it.update(db_conflict=dict(slug=slug, match=it['db_match'], winner=its[0]['id']),
                      db_slug=None, db_match=None, status='waiting')


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
        pilot_slugs = {r['slug'] for r in pilots}
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
        for items in data['cities'].values():
            for i in items:
                if i.get('db_override_missing'):
                    print(f"  ! overrides db_slug veritabanında yok: {i['id']} → {i['db_override_missing']}")
                if i.get('db_override_merged'):
                    print(f"  · overrides db_slug birleştirilmiş (merged) bir kayıt: {i['id']} → {i['db_override_merged']}"
                          f" (yükleyici birleştirmeyi geri alır)")
                if i.get('db_conflict'):
                    c = i['db_conflict']
                    mark = '!' if c['slug'] in pilot_slugs else '·'
                    print(f"  {mark} çakışma: {i['id']} {i['name_tr'][:40]} ({c['match']}) de {c['slug']} eserine bağlanıyordu;"
                          f" {c['winner']} kaldı, bu kayıt yeni eser sayılır")
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
