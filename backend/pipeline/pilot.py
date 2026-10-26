"""MVP pilot seçkisi: demoda gösterilecek eserleri seçmek ve hazırlığını izlemek.

Pilot eserler monument.pilot ile işaretlenir (göç 009_pilot.sql; panelde eser sayfasından da işaretlenebilir).
Görselle arama embedding'leri ve hikâye/çocuk anlatımları önce bu eserler için üretilir:
  python visual_search.py --pilot
  python narrations.py --pilot

Kullanım:
  python pilot.py --suggest                 # şehir başına en hazır eserler: data/review/pilot_onerileri.csv
  python pilot.py --add slug1 slug2 …       # pilota ekle
  python pilot.py --file secki.txt          # dosyadaki slug'ları ekle (satır başına bir slug; # ile başlayan satır not)
  python pilot.py --remove slug1 …          # pilottan çıkar
  python pilot.py --status                  # hedefe göre sayılar ve her pilot eserin hazırlığı

Hedef: Bursa 30, Konya 20, Hatay 10 (--targets bursa=30,konya=20,hatay=10 ile değiştirilebilir).
"""
import os, sys, csv, json, argparse
sys.path.insert(0, os.path.dirname(__file__))

ROOT = os.path.join(os.path.dirname(__file__), '..')
TARGETS = {'bursa': 30, 'konya': 20, 'hatay': 10}

# Hazırlık: sitede ve demoda iyi görünmesi için gerekenler. Puan yalnızca sıralama içindir.
READINESS_SQL = """
SELECT m.id, m.slug, m.name_tr, m.kind, c.slug AS city, m.district, m.pilot, m.qa_flags,
       m.summary_tr IS NOT NULL AND m.summary_tr <> '' AS has_summary, m.built_years IS NOT NULL AS has_date,
       coalesce(length(s.text_tr), 0) AS text_len,
       (SELECT count(*) FROM image i WHERE i.monument_id = m.id AND i.review_status = 'published') AS photos,
       (SELECT count(*) FROM image i WHERE i.monument_id = m.id AND i.review_status IN ('draft', 'reviewed')) AS photos_pending,
       (SELECT count(*) FROM image i WHERE i.monument_id = m.id AND i.review_status <> 'rejected' AND i.embedding IS NOT NULL) AS photos_embedded,
       (SELECT count(*) FROM artwork a WHERE a.monument_id = m.id) AS artworks,
       (SELECT count(*) FROM event e WHERE e.monument_id = m.id) AS events,
       (SELECT count(*) FROM chunk ch WHERE ch.monument_id = m.id AND ch.embedding IS NOT NULL) AS chunks_embedded
       {narr}
FROM monument m JOIN city c ON c.id = m.city_id LEFT JOIN source_section s ON s.id = m.section_id
WHERE m.review_status = 'published' AND NOT m.is_synthetic {where}
"""
NARR_COLS = """, EXISTS (SELECT 1 FROM narration n WHERE n.monument_id = m.id AND n.mode = 'story' AND n.lang = 'tr') AS story_tr,
       EXISTS (SELECT 1 FROM narration n WHERE n.monument_id = m.id AND n.mode = 'child' AND n.lang = 'tr') AS child_tr"""
RISKY_FLAGS = {'duplicate_title', 'en_misaligned', 'toc_mismatch', 'merged'}


def score(r):
    s = 2 * min(r['photos'], 6) + min(r['artworks'], 4) + min(r['events'], 3)
    s += 3 if r['text_len'] >= 1500 else (1 if r['text_len'] >= 600 else -4)
    s += 2 * r['has_summary'] + 2 * r['has_date']
    s -= 3 * len(RISKY_FLAGS & set(r['qa_flags'] or []))
    s -= 6 if r['chunks_embedded'] == 0 else 0      # sohbet kaynak bulamaz
    return s


def rows(db, pilot_only=False):
    narr = NARR_COLS if db.query("SELECT to_regclass('narration') IS NOT NULL AS ok")[0]['ok'] else ''
    out = db.query(READINESS_SQL.format(narr=narr, where='AND m.pilot' if pilot_only else ''))
    for r in out:
        r['score'] = score(r)
    return out


def suggest(db, targets, factor=1.5):
    """Şehir başına hedefin 1,5 katı kadar aday; en hazırdan başlayarak. CSV'ye ve ekrana yazar."""
    data = rows(db)
    path = os.path.join(ROOT, 'data', 'review', 'pilot_onerileri.csv')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    cols = ['sehir', 'sira', 'slug', 'ad', 'tur', 'ilce', 'puan', 'fotograf', 'bekleyen_fotograf', 'metin_uzunlugu', 'tarih',
            'ozet', 'susleme', 'olay', 'bayraklar', 'pilot']
    with open(path, 'w', encoding='utf-8-sig', newline='') as fh:   # utf-8-sig: Excel Türkçe karakterleri doğru açsın
        w = csv.writer(fh, delimiter=';')
        w.writerow(cols)
        for city, n in targets.items():
            cand = sorted((r for r in data if r['city'] == city), key=lambda r: (-r['score'], r['name_tr']))[:round(n * factor)]
            print(f'\n{city.upper()} (hedef {n}, {len(cand)} aday)')
            for i, r in enumerate(cand, 1):
                w.writerow([city, i, r['slug'], r['name_tr'], r['kind'], r['district'] or '', r['score'], r['photos'],
                            r['photos_pending'], r['text_len'], 'evet' if r['has_date'] else 'hayır',
                            'evet' if r['has_summary'] else 'hayır', r['artworks'], r['events'],
                            ','.join(r['qa_flags'] or []), 'evet' if r['pilot'] else ''])
                mark = '★' if r['pilot'] else ' '
                print(f"  {mark}{i:3}. {r['name_tr'][:46]:46} {r['photos']:2} foto  {r['text_len']:6} krk  puan {r['score']}")
    print(f'\nListe: {os.path.relpath(path, ROOT)}  (★ = zaten pilotta)')
    return path


def set_pilot(db, slugs, value, actor='pilot.py'):
    slugs = list(dict.fromkeys(s.strip() for s in slugs if s.strip()))
    found = db.query("""UPDATE monument SET pilot = %(v)s WHERE slug = ANY(%(s)s::text[]) AND pilot <> %(v)s
                        RETURNING slug""", dict(v=value, s=slugs))
    known = {r['slug'] for r in db.query('SELECT slug FROM monument WHERE slug = ANY(%(s)s::text[])', dict(s=slugs))}
    for r in found:
        db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
                   dict(a=actor, x='monument.pilot', t=r['slug'], d=json.dumps({'pilot': value})))
    unknown = [s for s in slugs if s not in known]
    return [r['slug'] for r in found], unknown


def status(db, targets):
    data = rows(db, pilot_only=True)
    print('Şehir      pilot / hedef')
    for city, n in targets.items():
        k = sum(1 for r in data if r['city'] == city)
        print(f'  {city:8} {k:3} / {n}' + ('' if k == n else ('  (eksik)' if k < n else '  (fazla)')))
    others = sorted({r['city'] for r in data} - set(targets))
    for city in others:
        print(f"  {city:8} {sum(1 for r in data if r['city'] == city):3} (hedef yok)")
    if not data:
        print('Pilot eser yok. Önce: python pilot.py --suggest, sonra --add / --file')
        return data
    print('\nEser                                            foto vektör hikâye çocuk  not')
    has_narr = 'story_tr' in data[0]
    for r in sorted(data, key=lambda r: (r['city'], r['name_tr'])):
        notes = []
        if r['photos'] == 0:
            notes.append('yayımlanmış fotoğraf yok')
        if r['photos_pending']:
            notes.append(f"{r['photos_pending']} fotoğraf onay bekliyor")
        if r['chunks_embedded'] == 0:
            notes.append('sohbet dizini yok')
        risky = RISKY_FLAGS & set(r['qa_flags'] or [])
        if risky:
            notes.append(','.join(sorted(risky)))
        yn = lambda b: 'evet' if b else '-'
        print(f"  {r['name_tr'][:44]:44} {r['photos']:4} {r['photos_embedded']:6} "
              f"{yn(has_narr and r['story_tr']):>6} {yn(has_narr and r['child_tr']):>5}  {'; '.join(notes)}")
    todo_vec = sum(1 for r in data if r['photos_embedded'] < r['photos'])
    todo_narr = sum(1 for r in data if has_narr and not (r['story_tr'] and r['child_tr']))
    print(f'\nVektörü eksik eser: {todo_vec} → python visual_search.py --pilot')
    print(f'Anlatımı eksik eser: {todo_narr} → python narrations.py --pilot')
    return data


def parse_targets(s):
    out = {}
    for part in s.split(','):
        k, _, v = part.partition('=')
        if k.strip() and v.strip().isdigit():
            out[k.strip()] = int(v)
    return out or TARGETS


def main():
    from db import DB
    ap = argparse.ArgumentParser(description='MVP pilot seçkisi: öneri, seçim ve hazırlık durumu.')
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--targets', default='bursa=30,konya=20,hatay=10')
    ap.add_argument('--suggest', action='store_true')
    ap.add_argument('--add', nargs='+', metavar='SLUG')
    ap.add_argument('--file', help='satır başına bir slug')
    ap.add_argument('--remove', nargs='+', metavar='SLUG')
    ap.add_argument('--status', action='store_true')
    a = ap.parse_args()
    db = DB(a.dsn)
    if not db.query("""SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
                       AND table_name = 'monument' AND column_name = 'pilot') AS ok""")[0]['ok']:
        raise SystemExit('monument.pilot sütunu yok: önce python migrate.py --apply')
    targets = parse_targets(a.targets)
    if a.suggest:
        suggest(db, targets)
    add = list(a.add or [])
    if a.file:
        with open(a.file, encoding='utf-8-sig') as fh:
            add += [ln.split('#')[0].strip() for ln in fh if ln.split('#')[0].strip()]
    if add:
        changed, unknown = set_pilot(db, add, True)
        print(f'{len(changed)} eser pilota eklendi.' + (f" Bulunamayan slug: {', '.join(unknown)}" if unknown else ''))
    if a.remove:
        changed, unknown = set_pilot(db, a.remove, False)
        print(f'{len(changed)} eser pilottan çıkarıldı.' + (f" Bulunamayan slug: {', '.join(unknown)}" if unknown else ''))
    if a.status or not (a.suggest or add or a.remove):
        status(db, targets)


if __name__ == '__main__':
    main()
