"""Adım 7 – PDF çıkarımını veritabanına şehirler arasında dönen turlarla yükler (plan §2 Adım 7).

Bir tur, kuyruktan (queue.json) her şehirden sıradaki `--per-city` (varsayılan 10) `waiting`/`retry` kaydını alır:
Bursa → Konya → Hatay (`--city` ile tek şehir). report.csv'de `engel` olan kayıt yüklenmez.

Her kayıt için:
  eşleşen eser   kimlik ve slug korunur; ad, TR/EN metin (source_section), sayfalar, üst eser ve fotoğraf bağları
                 (photos.json) yenilenir. Eski hâli data/backup/pdfx/<slug>.json'a yazılır, para_fix satırları bu
                 yedekte arşivlenip silinir (paragraf numaraları yeni metinde geçersizdir).
  yeni eser      eşleşmesiz kayıt, `db_new` ve hazireler `draft` olarak eklenir (source_note='pdfx'); hazire üst
                 eserine parent_id ile bağlanır. Overrides → `hazire` eşlemesi olan hazire eşleşen eser gibi yüklenir.
  emekli         overrides → `retire` kaydı, gerekçesindeki eser (ör. '(b1-0054)') bu turda yüklenirse `merged`
                 olur (review_status='draft', qa_flags 'merged'; silinmez, sohbet dizininden çıkar).
Yüklenen her esere qa_flags 'pdfx_review' ve 'pdfx_round:<n>', extraction'a pdfx_round/pdfx_id yazılır.
Türkçe sohbet parçaları textfix_db.rechunk ile (kanıt bağları korunarak), İngilizce parçalar burada yeniden kurulur;
Gemini çağrılmaz, embedding'ler boş kalır (embed_gemini.py tamamlar).

Pilot kilidi iki katlıdır: (1) yükleyici pilot ya da pilota bağlı kaydı (pilot hazire üstü, pilota paragraf taşıyan
eser) plandan çıkarır; (2) her yazma SQL'i `NOT pilot` koşulu taşır ve pilot satırı değişirse PilotLocked ile tur geri
alınır. Ayrıca turdan önce ve sonra pilotların parmak izi (satırlar, etkin metin, fotoğraflar, parçalar) karşılaştırılır.

Kullanım (pipeline klasöründen; DATABASE_URL tanımlı pencerede):
  python -m pdfx.load --report                 # sıradaki turun planı (yalnızca okur)
  python -m pdfx.load --rehearse               # gerçek veritabanında tur + ROLLBACK (hiçbir şey kalmaz)
  python -m pdfx.load --apply                  # turu yükler; queue.json ve data/pdfx/rounds/<n>.csv yazılır
  [--per-city 10] [--city bursa]
"""
import os, sys, re, csv, json, argparse, collections, datetime, hashlib, difflib
from . import OUT, ROOT
from books import BOOKS
from finalize import kind_of, slugify
from segment import norm_title

ACTOR = 'pdfx'
CITY_ORDER = ['bursa', 'konya', 'hatay']
LOADABLE = ('waiting', 'retry')
BACKUP = os.path.join(ROOT, 'data', 'backup', 'pdfx')
ROUNDS = os.path.join(OUT, 'rounds')
PANEL = '/yonetim/#/eser/'
RENAME_MAX = 0.6        # elle bağlanan kayıtta ad benzerliği bunun altındaysa ad başka esere aittir
RETIRE_ID = re.compile(r'\(([bkh]\d-\d{4}(?:-hz\d+)?)')


class PilotLocked(Exception):
    pass


# ------------------------------------------------------------------------------------------------------- girdiler
def _json(*parts, default=None):
    path = os.path.join(*parts)
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def read_inputs(out=OUT, books=None):
    """Çıkarım dosyaları: kuyruk, eserler, fotoğraflar, rapor ve overrides kararları."""
    books = books or list(BOOKS)
    works, photos, overrides = {}, collections.defaultdict(list), {}
    for b in books:
        for w in (_json(out, b, 'works.json', default={}) or {}).get('works', []):
            works[(b, w['id'])] = w
        for p in (_json(out, b, 'photos.json', default={}) or {}).get('photos', []):
            photos[(b, p['work'])].append(p)
        overrides[b] = _json(out, b, 'toc_overrides.json', default={}) or {}
    report = {}
    path = os.path.join(out, 'report.csv')
    if os.path.exists(path):
        with open(path, encoding='utf-8-sig') as f:
            report = {(r['book'], r['id']): r for r in csv.DictReader(f, delimiter=';')}
    queue = _json(out, 'queue.json')
    for it in queue_items(queue):     # overrides → set → rename: kuyruk yeniden kurulmadan da geçerli
        if ((overrides.get(it['book']) or {}).get('set') or {}).get(it['id'], {}).get('rename'):
            it['rename'] = True
    return dict(queue=queue, works=works, photos=photos, report=report, overrides=overrides, **decisions(overrides))


def decisions(overrides):
    """hazire: {(kitap, hazire id): slug}; retire: {slug: (kitap, eser id ya da None, gerekçe)}."""
    hz, retire = {}, {}
    for b, ov in overrides.items():
        for hid, e in (ov.get('hazire') or {}).items():
            if e.get('db_slug'):
                hz[(b, hid)] = e['db_slug']
        for slug, why in (ov.get('retire') or {}).items():
            m = RETIRE_ID.search(why or '')
            retire[slug] = (b, m.group(1) if m else None, why)
    return dict(hazire=hz, retire=retire)


def queue_items(queue):
    return [i for c in CITY_ORDER for i in (queue or {}).get('cities', {}).get(c, [])]


def target_slug(item):
    """Kaydın veritabanındaki eseri: önceki turda yüklenmişse onun slug'ı, yoksa kuyruk eşleşmesi."""
    return item.get('loaded_slug') or item.get('db_slug')


# ---------------------------------------------------------------------------------------------------- veritabanı
def connect(dsn=None):
    import psycopg
    from psycopg.rows import dict_row
    dsn = dsn or os.environ.get('DATABASE_URL')
    if not dsn:
        raise SystemExit('DATABASE_URL tanımlı değil. Önce: $env:DATABASE_URL = "postgresql://kullanici:sifre@localhost:5432/vakif"')
    return psycopg.connect(dsn, row_factory=dict_row, autocommit=True)


class Tx:
    """Tek bağlantı: rechunk gibi db.query/db.execute bekleyen yardımcılar da aynı işlemin içinde çalışır."""
    def __init__(self, conn):
        self.conn = conn

    def query(self, sql, params=None):
        with self.conn.cursor() as cur:
            cur.execute(sql, params or {})
            return cur.fetchall() if cur.description else []

    def execute(self, sql, params=None):
        self.query(sql, params)


def has_table(db, name):
    return db.query('SELECT to_regclass(%(t)s) IS NOT NULL AS ok', dict(t=name))[0]['ok']


def db_index(db):
    """{slug: satır} – yalnızca okur."""
    rows = db.query("""SELECT m.id, m.slug, m.name_tr, m.name_en, m.pilot, m.is_synthetic, m.review_status, m.section_id,
                              m.parent_id, 'merged' = ANY(m.qa_flags) AS merged, p.pilot AS parent_pilot
                       FROM monument m LEFT JOIN monument p ON p.id = m.parent_id""")
    return {r['slug']: r for r in rows}


def pilot_feeders(db):
    """Pilot esere paragraf taşıyan pilot dışı eserler: {slug: [pilot slug]}. Bunların metni değişirse pilotun etkin
    metni de değişir; yükleyici onlara dokunmaz."""
    if not has_table(db, 'para_fix'):
        return {}
    out = collections.defaultdict(list)
    for r in db.query("""SELECT s.slug, t.slug AS pilot FROM para_fix f JOIN monument s ON s.id = f.monument_id
                         JOIN monument t ON t.id = f.target_monument_id
                         WHERE f.decision = 'move' AND t.pilot AND NOT s.pilot"""):
        out[r['slug']].append(r['pilot'])
    return out


def pilot_fingerprint(db):
    """Pilotların ve onlara bağlı her şeyin özeti: satırlar, kitap bölümü, etkin metin, fotoğraflar, parçalar, alt eserler."""
    import textfix_db
    parts = ["SELECT m::text AS r FROM monument m WHERE m.pilot",
             "SELECT s::text FROM source_section s JOIN monument m ON m.section_id = s.id WHERE m.pilot",
             """SELECT (i.id, i.monument_id, i.sort, i.is_cover, i.review_status, i.edited, i.alt_tr)::text
                FROM image i JOIN monument m ON m.id = i.monument_id WHERE m.pilot""",
             """SELECT (c.id, c.lang, c.seq, c.content, c.is_retrievable, c.embedding IS NULL)::text
                FROM chunk c JOIN monument m ON m.id = c.monument_id WHERE m.pilot""",
             "SELECT (k.id, k.slug, k.parent_id)::text FROM monument k JOIN monument m ON m.id = k.parent_id WHERE m.pilot"]
    if has_table(db, 'para_fix'):
        parts.append("SELECT f::text FROM para_fix f JOIN monument m ON m.id = f.monument_id WHERE m.pilot")
    rows = db.query(f"SELECT md5(coalesce(string_agg(r, '|' ORDER BY r), '')) AS h, count(*) AS n FROM ({' UNION ALL '.join(parts)}) x")
    h = hashlib.md5(rows[0]['h'].encode())
    for p in db.query('SELECT id FROM monument WHERE pilot ORDER BY id'):
        h.update((textfix_db.effective_text(db, p['id']) or '').encode())
    return h.hexdigest(), rows[0]['n']


# ---------------------------------------------------------------------------------------------------------- plan
def pick(inputs, per_city=10, city=None, dbi=None, feeders=None):
    """Turun kayıtları. Döner: (plan, atlananlar). plan: [{item, work, slug, row, hazires:[...]}]."""
    dbi, feeders = dbi or {}, feeders or {}
    plan, skipped = [], []
    hz_taken = set(inputs['hazire'].values())
    for c in ([city] if city else CITY_ORDER):
        n = 0
        for it in (inputs['queue'] or {}).get('cities', {}).get(c, []):
            if n >= per_city:
                break
            if it['status'] not in LOADABLE:
                continue
            key = (it['book'], it['id'])
            w, rep = inputs['works'].get(key), inputs['report'].get(key)
            slug = target_slug(it)
            row = dbi.get(slug) if slug else None
            why = None
            if w is None:
                why = 'works.json kaydı yok'
            elif rep is None:
                why = 'report.csv satırı yok'
            elif rep['status'] == 'engel':
                why = f"engel: {rep['flags']}"
            elif slug and dbi and row is None:
                why = f'veritabanında yok: {slug}'
            elif row and row['pilot']:
                why = 'pilot kilidi'
            elif slug in feeders:
                why = 'pilota paragraf taşıyor: ' + ', '.join(feeders[slug])
            elif slug in inputs['retire']:
                why = f'emekli listesinde: {slug}'
            if why:
                skipped.append(dict(item=it, why=why))
                continue
            entry = dict(item=it, work=w, slug=slug, row=row, hazires=[])
            for hw in [x for (b, _), x in inputs['works'].items() if b == it['book'] and x.get('kind') == 'hazire'
                       and x.get('parent') == it['id']]:
                hslug = inputs['hazire'].get((it['book'], hw['id'])) or (it.get('hazires') or {}).get(hw['id'])
                hrow = dbi.get(hslug) if hslug else None
                if hslug and dbi and hrow is None:
                    skipped.append(dict(item=dict(it, id=hw['id']), why=f'hazire eşlemesi veritabanında yok: {hslug}'))
                    continue
                if hrow and hrow['pilot']:
                    skipped.append(dict(item=dict(it, id=hw['id']), why='hazire pilot'))
                    continue
                entry['hazires'].append(dict(work=hw, slug=hslug, row=hrow))
            plan.append(entry)
            n += 1
    for e in plan:     # bir hedef iki kez kullanılmasın (kuyruk bire bir, ama hazire eşlemesi ayrı bir liste)
        if e['slug'] and e['slug'] in hz_taken:
            raise SystemExit(f"Hata: {e['slug']} hem kuyrukta hem hazire eşlemesinde hedef.")
    return plan, skipped


def retire_for(inputs, plan):
    """Bu turda emekliye ayrılacak slug'lar: gerekçesindeki eser (ya da hazire) bu turda yükleniyorsa."""
    ids = {(e['item']['book'], e['item']['id']) for e in plan}
    ids |= {(e['item']['book'], h['work']['id']) for e in plan for h in e['hazires']}
    targets = {e['slug'] for e in plan} | {h['slug'] for e in plan for h in e['hazires']}
    out = []
    for slug, (book, wid, why) in sorted(inputs['retire'].items()):
        if (book, wid) in ids:
            if slug in targets:
                raise SystemExit(f'Hata: {slug} hem emekli listesinde hem bu turun hedefi.')
            out.append((slug, why))
    return out


def rename_needed(db_name, w, item, by_override=False):
    """Eşleşen eserde veritabanındaki ad korunur (24 ve 29 Ekim'de onarıldı; geliştirici kararı 4 Kasım 2026). PDF adı
    yalnızca overrides'ta `"rename": true` verilmişse ya da kayıt elle bağlanmış (db_slug / hazire eşlemesi) ve adı yeni
    adla neredeyse hiç örtüşmüyorsa yazılır ('Town Hall' → 'Belediye Binası')."""
    if not db_name or item.get('rename'):
        return True
    if not (by_override or item.get('db_match') == 'override'):
        return False
    return difflib.SequenceMatcher(None, norm_title(db_name), norm_title(w['name_tr'])).ratio() < RENAME_MAX


# --------------------------------------------------------------------------------------------------- yazma işleri
def _paras(w, lang):
    return [p for p in w['paras_' + lang] if p['text'].strip()]


def section_values(w):
    tr, en = _paras(w, 'tr'), _paras(w, 'en')
    return dict(t=('\n\n'.join(p['text'] for p in tr) or None), e=('\n\n'.join(p['text'] for p in en) or None),
                pm=json.dumps([dict(p=i, pages=[p['page']]) for i, p in enumerate(tr)]),
                ps=w['pages'][0], pe=w['pages'][1], ttr=w['name_tr'], ten=w['name_en'],
                au=w.get('authors') or None)


def backup_of(db, mid):
    """Eserin yüklemeden önceki hâli (yedek dosyası için)."""
    q = lambda sql: db.query(sql, dict(m=mid))
    out = dict(monument=q('SELECT to_jsonb(m) AS j FROM monument m WHERE id = %(m)s')[0]['j'],
               section=(q('SELECT to_jsonb(s) AS j FROM source_section s JOIN monument m ON m.section_id = s.id WHERE m.id = %(m)s')
                        or [dict(j=None)])[0]['j'],
               images=q('SELECT id, sha1, sort, is_cover, review_status, edited FROM image WHERE monument_id = %(m)s ORDER BY sort, id'),
               chunks=q('SELECT id, lang, seq, content FROM chunk WHERE monument_id = %(m)s ORDER BY lang, seq'))
    if has_table(db, 'para_fix'):
        out['para_fix'] = q('SELECT to_jsonb(f) AS j FROM para_fix f WHERE monument_id = %(m)s ORDER BY para_no')
        out['incoming_moves'] = q("""SELECT s.slug, f.para_no FROM para_fix f JOIN monument s ON s.id = f.monument_id
                                     WHERE f.decision = 'move' AND f.target_monument_id = %(m)s""")
    return json.loads(json.dumps(out, default=str))


def update_existing(db, row, w, rnd, parent_id, extra_flags=(), rename=False):
    """Eşleşen eser: metin, sayfalar, üst eser; ad yalnızca rename ise. Pilotsa PilotLocked (SQL koşulu)."""
    mid = row['id']
    flags = ['pdfx_review', f'pdfx_round:{rnd}', *extra_flags]
    got = db.query("""UPDATE monument SET name_tr = CASE WHEN %(rn)s THEN %(n)s ELSE name_tr END,
                             name_en = CASE WHEN %(rn)s THEN %(ne)s ELSE name_en END, pages = %(pg)s::int4range, toc_title = %(tt)s,
                             toc_page = coalesce(%(tp)s::int, toc_page), en_usable = %(eu)s,
                             parent_id = coalesce(%(par)s::int, parent_id),
                             qa_flags = array(SELECT DISTINCT x FROM unnest(array_remove(qa_flags, 'merged') || %(f)s::text[]) x
                                              WHERE x NOT LIKE 'pdfx_round:%%' OR x = %(rf)s),
                             extraction = coalesce(extraction, '{}'::jsonb) || %(ex)s::jsonb
                      WHERE id = %(i)s AND NOT pilot RETURNING id""",
                   dict(rn=rename, n=w['name_tr'], ne=w['name_en'], pg=f"[{w['pages'][0]},{w['pages'][1] + 1})",
                        tt=w.get('toc_name') or w['name_tr'], tp=w.get('toc_page'), eu=bool(_paras(w, 'en')),
                        par=parent_id, f=flags, rf=f'pdfx_round:{rnd}', i=mid,
                        ex=json.dumps(dict(pdfx_round=rnd, pdfx_id=w['id']))))
    if not got:
        raise PilotLocked(row['slug'])
    v = section_values(w)
    if row['section_id']:
        n = db.query("""UPDATE source_section s SET title_tr = %(ttr)s, title_en = %(ten)s, page_start = %(ps)s, page_end = %(pe)s,
                               text_tr = %(t)s, text_en = %(e)s, page_map = %(pm)s::jsonb, authors = coalesce(%(au)s::text[], authors)
                        WHERE id = %(s)s AND NOT EXISTS (SELECT 1 FROM monument m WHERE m.section_id = s.id AND m.pilot)
                        RETURNING id""", dict(v, s=row['section_id']))
        if not n:
            raise PilotLocked(row['slug'])
    elif v['t'] or v['e']:
        new_section(db, row['slug'], w, mid)
    if has_table(db, 'para_fix'):
        db.execute("""DELETE FROM para_fix f USING monument m WHERE m.id = f.monument_id AND f.monument_id = %(m)s
                      AND NOT m.pilot""", dict(m=mid))
    return mid


def new_section(db, slug, w, mid):
    v = section_values(w)
    sid = db.query("""INSERT INTO source_section(book_id, kind, title_tr, title_en, authors, page_start, page_end, seq,
                                                 text_tr, text_en, page_map, monument_slug)
                      SELECT b.id, %(k)s::text, %(ttr)s::text, %(ten)s::text, %(au)s::text[], %(ps)s::int, %(pe)s::int,
                             (SELECT coalesce(max(seq), 0) + 1 FROM source_section WHERE book_id = b.id),
                             %(t)s::text, %(e)s::text, %(pm)s::jsonb, %(slug)s::text
                      FROM source_book b WHERE b.slug = %(b)s RETURNING id""",
                   dict(v, k='complex_intro' if w['level'] == 'complex' else 'monument', slug=slug, b=w['book']))[0]['id']
    db.execute('UPDATE monument SET section_id = %(s)s WHERE id = %(m)s AND NOT pilot', dict(s=sid, m=mid))


def new_slug(db, city, w):
    base = '-'.join(x for x in (city, slugify(w.get('district') or ''), slugify(w['name_tr'])) if x)[:90].strip('-')
    slug, k = base, 1
    while db.query('SELECT 1 FROM monument WHERE slug = %(s)s', dict(s=slug)):
        k += 1
        slug = f'{base}-{k}'
    return slug


def kind_for(w):
    if w['level'] == 'complex':
        return 'complex'
    if w.get('kind') == 'hazire':
        return 'graveyard'
    return kind_of(w['name_tr'], w['name_en'])


def insert_new(db, w, rnd, parent_id, heading_path, city):
    slug = new_slug(db, city, w)
    mid = db.query("""INSERT INTO monument(slug, parent_id, city_id, district, kind, name_tr, name_en, book_id, pages,
                                           heading_path, title_source, toc_title, toc_page, en_usable, qa_flags, extraction,
                                           review_status, source_note, created_by)
                      SELECT %(slug)s::text, %(par)s::int, c.id, %(d)s::text, %(k)s::text, %(n)s::text, %(ne)s::text, b.id,
                             %(pg)s::int4range, %(hp)s::text, 'pdfx', %(tt)s::text, %(tp)s::int, %(eu)s::boolean,
                             %(f)s::text[], %(ex)s::jsonb, 'draft', 'pdfx', %(a)s::text
                      FROM source_book b JOIN city c ON c.slug = %(city)s WHERE b.slug = %(b)s RETURNING id""",
                   dict(slug=slug, par=parent_id, d=w.get('district'), k=kind_for(w), n=w['name_tr'], ne=w['name_en'],
                        pg=f"[{w['pages'][0]},{w['pages'][1] + 1})", hp=heading_path, tt=w.get('toc_name') or w['name_tr'],
                        tp=w.get('toc_page'), eu=bool(_paras(w, 'en')), f=['pdfx_review', f'pdfx_round:{rnd}'],
                        ex=json.dumps(dict(pdfx_round=rnd, pdfx_id=w['id'])), a=ACTOR, city=city, b=w['book']))[0]['id']
    if _paras(w, 'tr') or _paras(w, 'en'):
        new_section(db, slug, w, mid)
    return mid, slug


def bind_photos(db, mid, photos, owner_of):
    """Fotoğrafları esere bağlar (sha1). Panelde dokunulmuş (edited) ve pilot eserdeki fotoğraflara dokunmaz. Eserde
    kalıp photos.json'a göre başka esere ait olan kitap fotoğrafları bağlantısız kalır (sahibi yüklenince bağlanır).
    Döner: (bağlanan, yeni eklenen, ayrılan)."""
    bound = added = 0
    mine = set()
    for k, p in enumerate(sorted(photos, key=lambda p: (p['pdf_page'], p.get('sort') or 0)), 1):
        if p.get('pilot_locked'):
            continue
        mine.add(p['sha1'])
        r = db.query("""UPDATE image i SET monument_id = %(m)s, sort = %(s)s, match_method = %(mm)s,
                               is_cover = i.is_cover AND i.monument_id IS NOT DISTINCT FROM %(m)s,
                               alt_tr = coalesce(mo.name_tr || ' – ', '') || b.title || coalesce(', s. ' || i.printed_page, ''),
                               alt_en = coalesce(coalesce(mo.name_en, mo.name_tr) || ' – ', '') || 'photo from ' || b.title
                                        || coalesce(', p. ' || i.printed_page, '')
                        FROM monument mo, source_book b
                        WHERE i.sha1 = %(h)s AND mo.id = %(m)s AND NOT mo.pilot AND b.id = i.book_id AND NOT i.edited
                          AND (i.monument_id IS NULL OR i.monument_id NOT IN (SELECT id FROM monument WHERE pilot))
                        RETURNING i.id""", dict(m=mid, s=k, mm='pdfx:' + p['method'], h=p['sha1']))
        if r:
            bound += 1
        elif not db.query('SELECT 1 FROM image WHERE sha1 = %(h)s', dict(h=p['sha1'])):
            db.execute("""INSERT INTO image(monument_id, city_id, book_id, source, sha1, file, width, height, pdf_page,
                                            printed_page, match_method, sort, alt_tr, alt_en, review_status)
                          SELECT mo.id, b.city_id, b.id, 'book', %(h)s::text, %(file)s::text, %(w)s::int, %(hh)s::int,
                                 %(pp)s::int, %(pr)s::int, %(mm)s::text, %(s)s::int,
                                 mo.name_tr || ' – ' || b.title || coalesce(', s. ' || %(pr)s::int, ''),
                                 coalesce(mo.name_en, mo.name_tr) || ' – photo from ' || b.title || coalesce(', p. ' || %(pr)s::int, ''),
                                 'draft'
                          FROM monument mo, source_book b WHERE mo.id = %(m)s AND NOT mo.pilot AND b.slug = %(b)s""",
                       dict(m=mid, h=p['sha1'], file=p['file'], w=p['width'], hh=p['height'], pp=p['pdf_page'],
                            pr=p['printed_page'], mm='pdfx:' + p['method'], s=k, b=p['book']))
            added += 1
    # eserde kalan, photos.json'a göre başka yere ait kitap fotoğrafları
    stray = [r['id'] for r in db.query("""SELECT i.id, i.sha1 FROM image i JOIN monument m ON m.id = i.monument_id
                                          WHERE i.monument_id = %(m)s AND i.source = 'book' AND NOT i.edited AND NOT m.pilot""",
                                       dict(m=mid)) if r['sha1'] not in mine and r['sha1'] in owner_of]
    if stray:
        db.execute("""UPDATE image SET monument_id = NULL, is_cover = false WHERE id = ANY(%(ids)s::int[]) AND NOT edited
                      AND monument_id NOT IN (SELECT id FROM monument WHERE pilot)""", dict(ids=stray))
    return bound, added, len(stray)


def set_covers(db, ids):
    db.execute("""UPDATE image i SET is_cover = true
                  FROM (SELECT DISTINCT ON (monument_id) id FROM image
                        WHERE monument_id = ANY(%(ids)s::int[]) AND review_status = 'published'
                          AND monument_id NOT IN (SELECT monument_id FROM image WHERE is_cover AND monument_id IS NOT NULL)
                          AND monument_id NOT IN (SELECT id FROM monument WHERE pilot)
                        ORDER BY monument_id, sort, id) c
                  WHERE i.id = c.id""", dict(ids=ids))


def rebuild_en_chunks(db, ids):
    """İngilizce parçalar: eskiler silinir, kitap İngilizcesi gösterilebiliyorsa yenileri eklenir (embedding'siz)."""
    from chunk import chunk_paras
    ids = [r['id'] for r in db.query('SELECT id FROM monument WHERE id = ANY(%(ids)s::int[]) AND NOT pilot', dict(ids=ids))]
    old = [r['id'] for r in db.query("""SELECT id FROM chunk WHERE monument_id = ANY(%(ids)s::int[]) AND lang = 'en'
                                        AND kind = 'monument_part'""", dict(ids=ids))]
    if old:
        for t in ('event', 'artwork', 'monument_person', 'waqf', 'waqf_link', 'term'):
            if has_table(db, t):
                db.execute(f'UPDATE {t} SET chunk_id = NULL WHERE chunk_id = ANY(%(c)s::bigint[])', dict(c=old))
        db.execute('UPDATE chunk SET parent_chunk_id = NULL WHERE parent_chunk_id = ANY(%(c)s::bigint[])', dict(c=old))
        db.execute('DELETE FROM chunk WHERE id = ANY(%(c)s::bigint[])', dict(c=old))
    n = 0
    for m in db.query("""SELECT m.id, m.city_id, m.section_id, m.book_id, m.parent_id, coalesce(m.heading_path, m.name_tr) AS hp,
                                s.text_en, s.page_start, s.page_end
                         FROM monument m JOIN source_section s ON s.id = m.section_id
                         WHERE m.id = ANY(%(ids)s::int[]) AND m.en_usable AND s.text_en IS NOT NULL""", dict(ids=ids)):
        paras = [p for p in m['text_en'].split('\n\n') if p.strip()]
        for k, (text, pages, topics) in enumerate(chunk_paras(paras, None)):
            cfe = f"title: {m['hp']} | text: {text}"
            db.execute("""INSERT INTO chunk(section_id, book_id, seq, lang, kind, topic, city_id, monument_id, complex_id,
                                            page_start, page_end, heading_path, content, content_for_embed, content_hash)
                          VALUES (%(s)s, %(b)s, %(q)s, 'en', 'monument_part', %(t)s, %(c)s, %(m)s, %(cx)s, %(ps)s, %(pe)s,
                                  %(hp)s, %(x)s, %(cfe)s, %(h)s)""",
                       dict(s=m['section_id'], b=m['book_id'], q=k, t=topics, c=m['city_id'], m=m['id'],
                            cx=m['parent_id'] or m['id'], ps=m['page_start'], pe=m['page_end'], hp=m['hp'], x=text,
                            cfe=cfe, h=hashlib.sha1(cfe.encode()).hexdigest()))
            n += 1
    return n


def retire(db, slug, why, rnd):
    got = db.query("""UPDATE monument SET review_status = 'draft', updated_at = now(),
                             qa_flags = array_append(array_remove(qa_flags, 'merged'), 'merged')
                      WHERE slug = %(s)s AND NOT pilot RETURNING id, (SELECT count(*) FROM monument k WHERE k.parent_id = monument.id) AS kids""",
                   dict(s=slug))
    if not got:
        return None
    db.execute('UPDATE chunk SET is_retrievable = false WHERE monument_id = %(i)s', dict(i=got[0]['id']))
    log(db, 'monument.retire', slug, dict(reason=why, round=rnd))
    return got[0]


def log(db, action, target, detail):
    if has_table(db, 'admin_log'):
        db.execute('INSERT INTO admin_log(actor, action, target, detail) VALUES (%(a)s, %(x)s, %(t)s, %(d)s::jsonb)',
                   dict(a=ACTOR, x=action, t=target, d=json.dumps(detail, ensure_ascii=False, default=str)))


# ------------------------------------------------------------------------------------------------------------- tur
def heading_path(city_name, w, parent_name=None):
    return ' › '.join(x for x in (city_name, w.get('district'), parent_name, w['name_tr']) if x)


def run_round(db, inputs, plan, rnd, retire_list):
    """Turu bir işlem içinde yükler. Döner: (satırlar, yedekler, özet). Pilot değişirse PilotLocked."""
    import textfix_db
    fp0 = pilot_fingerprint(db)
    owner_of = {p['sha1'] for ps in inputs['photos'].values() for p in ps}
    cities = {r['slug']: r['name_tr'] for r in db.query('SELECT slug, name_tr FROM city')}
    queue_slug = {(i['book'], i['id']): target_slug(i) for i in queue_items(inputs['queue'])}
    rows, backups, touched, loaded = [], {}, [], {}
    stats = collections.Counter()

    def parent_of(book, pid):
        """Üst eser kimliği ve adı: bu turda yüklenen ya da veritabanındaki eser."""
        if not pid:
            return None, None
        slug = loaded.get((book, pid)) or queue_slug.get((book, pid))
        r = db.query('SELECT id, name_tr FROM monument WHERE slug = %(s)s', dict(s=slug)) if slug else []
        return (r[0]['id'], r[0]['name_tr']) if r else (None, None)

    def load_one(w, slug, item, parent_key):
        city = BOOKS[w['book']]['city']
        pid, pname = parent_of(w['book'], parent_key)
        cur = db.query("""SELECT id, slug, name_tr, section_id, pilot, 'merged' = ANY(qa_flags) AS merged FROM monument
                          WHERE slug = %(s)s""", dict(s=slug)) if slug else []
        if w['id'] == item['id']:
            w = dict(w, toc_page=item.get('page'))
        if cur:
            r = cur[0]
            if r['pilot']:
                raise PilotLocked(slug)
            backups[slug] = dict(backup_of(db, r['id']), pdfx=dict(book=w['book'], id=w['id'], round=rnd))
            old_name = r['name_tr']
            renamed = rename_needed(old_name, w, item, by_override=w['id'] != item['id'] and slug is not None)
            update_existing(db, r, w, rnd, pid, ('pdfx_unmerged',) if r['merged'] else (), renamed)
            action, mid = ('eslesen' if not r['merged'] else 'eslesen_birlesmisten'), r['id']
        else:
            old_name, renamed = None, True
            mid, slug = insert_new(db, w, rnd, pid, heading_path(cities.get(city), w, pname), city)
            action = 'yeni'
        bound, added, stray = bind_photos(db, mid, inputs['photos'].get((w['book'], w['id']), []), owner_of)
        loaded[(w['book'], w['id'])] = slug
        touched.append(mid)
        stats[action] += 1
        rep = inputs['report'].get((w['book'], w['id'])) or {}
        b = backups.get(slug) or {}
        warn = []
        if b.get('incoming_moves'):
            warn.append('gelen_tasima:' + ','.join(sorted({x['slug'] for x in b['incoming_moves']})))
        out_moves = [f['j'] for f in b.get('para_fix') or [] if f['j'].get('decision') == 'move']
        if out_moves:
            warn.append(f'giden_tasima:{len(out_moves)}')
        if parent_key and pid is None:
            warn.append('ust_eser_yok')
        if has_table(db, 'narration') and db.query('SELECT 1 FROM narration WHERE monument_id = %(m)s LIMIT 1', dict(m=mid)):
            warn.append('anlatim_eski_metinden')
        rows.append(dict(round=rnd, city=city, book=w['book'], id=w['id'], kind=w.get('kind') or w['level'],
                         name_tr=w['name_tr'], action=action, db_slug=slug, match=item.get('db_match') or '',
                         old_name=old_name if renamed and old_name and old_name != w['name_tr'] else '',
                         name_suggest=w['name_tr'] if not renamed and old_name != w['name_tr'] else '',
                         paras_tr=len(_paras(w, 'tr')), paras_en=len(_paras(w, 'en')),
                         photos=bound + added, photos_new=added, photos_unlinked=stray,
                         para_fix_archived=len(b.get('para_fix') or []), flags=rep.get('flags', ''),
                         warnings=' '.join(warn), panel=PANEL + slug))
        return slug

    for e in plan:
        it, w = e['item'], e['work']
        slug = load_one(w, e['slug'], it, w.get('parent'))
        e['loaded_slug'] = slug
        e['loaded_hazires'] = {}
        for h in e['hazires']:
            e['loaded_hazires'][h['work']['id']] = load_one(h['work'], h['slug'], it, h['work']['parent'])
    for slug, why in retire_list:
        r = retire(db, slug, why, rnd)
        stats['emekli' if r else 'emekli_yok_ya_da_pilot'] += 1
        rows.append(dict(round=rnd, city='', book=inputs['retire'][slug][0], id=inputs['retire'][slug][1] or '',
                         kind='retire', name_tr='', action='emekli' if r else 'emekli_atlandi', db_slug=slug,
                         warnings=(f"alt_eser:{r['kids']}" if r and r['kids'] else '') + ('' if r else 'yok_ya_da_pilot'),
                         panel=PANEL + slug))
    ids = [r['id'] for r in db.query('SELECT id FROM monument WHERE id = ANY(%(ids)s::int[]) AND NOT pilot', dict(ids=touched))]
    ch = textfix_db.rechunk(db, ids, embed=False)
    stats['parca_tr'] = ch['added']
    stats['parca_en'] = rebuild_en_chunks(db, ids)
    set_covers(db, ids)
    for slug in loaded.values():
        log(db, 'pdfx.load', slug, dict(round=rnd))
    fp1 = pilot_fingerprint(db)
    if fp0 != fp1:
        raise PilotLocked(f'pilot parmak izi değişti ({fp0[1]} → {fp1[1]} satır)')
    stats['pilot_satir'] = fp1[1]
    return rows, backups, stats


ROUND_FIELDS = ['round', 'city', 'book', 'id', 'kind', 'name_tr', 'action', 'db_slug', 'match', 'old_name', 'name_suggest', 'paras_tr',
                'paras_en', 'photos', 'photos_new', 'photos_unlinked', 'para_fix_archived', 'flags', 'warnings', 'panel']


def write_round(rows, name, directory=ROUNDS):
    os.makedirs(directory, exist_ok=True)
    path = os.path.join(directory, f'{name}.csv')
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=ROUND_FIELDS, delimiter=';', extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)
    return path


def write_backups(backups, rnd, directory=BACKUP):
    os.makedirs(directory, exist_ok=True)
    for slug, b in backups.items():
        path = os.path.join(directory, f'{slug}.json')
        if os.path.exists(path):           # ilk yedek (PDF yüklemesinden önceki eski metin) hiç ezilmez
            path = os.path.join(directory, f'{slug}.r{rnd}.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(b, f, ensure_ascii=False, indent=1)


def next_round(queue):
    return max([i.get('round') or 0 for i in queue_items(queue)] + [0]) + 1


def mark_loaded(queue, plan, rnd):
    today = datetime.date.today().isoformat()
    for e in plan:
        it = e['item']
        it.update(status='loaded', round=rnd, loaded_slug=e['loaded_slug'], loaded_at=today)
        if e['loaded_hazires']:
            it['hazires'] = e['loaded_hazires']


def follow_up(rows):
    slugs = [r['db_slug'] for r in rows if r['action'] != 'emekli' and r['kind'] != 'retire']
    print('\nSonraki adımlar (Gemini kotası harcar; pipeline klasöründen sen çalıştır):')
    print('  1) python embed_gemini.py                         # yeni TR/EN parçaların embedding\'i')
    print(f"  2) python reextract.py --only {' '.join(slugs)}")
    print('     (künye: düzeltilmiş metinden eser bazında yeniden çıkarım)')
    print('  3) Panelde "PDF\'ten gelenler" (qa_flags pdfx_review) kontrolü; doğrular pilot yapılır.')


# ------------------------------------------------------------------------------------------------------- komutlar
def show_plan(plan, skipped, retire_list, rnd, dbi):
    print(f'Tur {rnd}: {len(plan)} eser, {sum(len(e["hazires"]) for e in plan)} hazire, {len(retire_list)} emekli')
    for e in plan:
        it, w = e['item'], e['work']
        r = e['row']
        what = 'yeni' if not e['slug'] else ('eşleşen' + (' (birleştirilmişten geri alınır)' if r and r['merged'] else '')
                                             + (' (türetilmiş üst kayıt)' if r and r['is_synthetic'] else ''))
        print(f"  {it['city']:6} {it['id']:<12} {w['name_tr'][:44]:<44} → {e['slug'] or '(yeni slug)'} [{what}]")
        if r and r['name_tr'] != w['name_tr']:
            if rename_needed(r['name_tr'], w, it):
                print(f"         ad: '{r['name_tr']}' → '{w['name_tr']}'")
            else:
                print(f"         ad korunur: '{r['name_tr']}' (PDF önerisi: '{w['name_tr']}')")
        for h in e['hazires']:
            hr = h['row']
            if hr and hr['name_tr'] != h['work']['name_tr'] and rename_needed(hr['name_tr'], h['work'], it, by_override=True):
                print(f"         + hazire adı: '{hr['name_tr']}' → '{h['work']['name_tr']}'")
            print(f"         + hazire {h['work']['id']:<14} {h['work']['name_tr'][:40]:<40} → {h['slug'] or '(yeni)'}")
    for slug, why in retire_list:
        state = dbi.get(slug)
        tag = '' if not dbi else (' (veritabanında yok)' if not state else ' (pilot! atlanır)' if state['pilot']
                                  else ' (zaten birleştirilmiş)' if state['merged'] else '')
        print(f'  emekli {slug}{tag} – {why}')
    if skipped:
        print(f'atlanan {len(skipped)}:')
        for s in skipped:
            print(f"  {s['item']['id']:<12} {s['why']}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--report', action='store_true', help='sıradaki turun planı (yalnızca okur)')
    g.add_argument('--rehearse', action='store_true', help='turu yükle ve geri al (ROLLBACK)')
    g.add_argument('--apply', action='store_true', help='turu yükle')
    ap.add_argument('--per-city', type=int, default=10)
    ap.add_argument('--city', choices=CITY_ORDER)
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    a = ap.parse_args()
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    inputs = read_inputs()
    q = inputs['queue']
    if not q or q.get('pilot_check') != 'db':
        raise SystemExit('queue.json yok ya da pilot denetimi veritabanıyla yapılmamış: önce python -m pdfx.cityqueue')
    if not inputs['report']:
        raise SystemExit('report.csv yok: önce python -m pdfx.report')
    if not a.dsn:
        raise SystemExit('DATABASE_URL tanımlı değil (rapor da veritabanını okur).')
    mode = 'report' if a.report else 'rehearse' if a.rehearse else 'apply'
    conn = connect(a.dsn)
    try:
        run(conn, inputs, mode, a.per_city, a.city)
    except PilotLocked as e:
        raise SystemExit(f'PİLOT KİLİDİ: {e}. Tur geri alındı, hiçbir şey yazılmadı.')
    finally:
        conn.close()


def run(conn, inputs, mode, per_city=10, city=None, out=OUT, backup=BACKUP):
    """mode: report | rehearse | apply. Döner: {plan, skipped, retire, round, rows, stats} (report'ta rows yok)."""
    import psycopg
    db = Tx(conn)
    q = inputs['queue']
    dbi, feeders = db_index(db), pilot_feeders(db)
    plan, skipped = pick(inputs, per_city, city, dbi, feeders)
    retire_list = retire_for(inputs, plan)
    rnd = next_round(q)
    show_plan(plan, skipped, retire_list, rnd, dbi)
    res = dict(plan=plan, skipped=skipped, retire=retire_list, round=rnd)
    if mode == 'report' or not plan:
        return res
    rounds = os.path.join(out, 'rounds')
    with conn.transaction():
        res['rows'], backups, res['stats'] = run_round(db, inputs, plan, rnd, retire_list)
        if mode == 'rehearse':
            raise psycopg.Rollback()
        write_backups(backups, rnd, backup)
    print('özet:', dict(res['stats']))
    if mode == 'rehearse':
        path = write_round(res['rows'], f'{rnd}-prova', rounds)
        print(f'PROVA BAŞARILI: tur geri alındı, veritabanı değişmedi. Plan → {path}')
        return res
    mark_loaded(q, plan, rnd)
    with open(os.path.join(out, 'queue.json'), 'w', encoding='utf-8') as f:
        json.dump(q, f, ensure_ascii=False, indent=1)
    path = write_round(res['rows'], str(rnd), rounds)
    print(f'Tur {rnd} yüklendi → {path}; yedekler → {backup}')
    follow_up(res['rows'])
    return res


if __name__ == '__main__':
    main()
