"""Aşama 4 – PostgreSQL'e yükleme (psql ile; Python sürücüsü gerektirmez).

Kullanım:
  python load_db.py --dsn postgresql://user:pass@host:5432/vakif [--init] [--no-vector]

--init         : schema.sql'i çalıştırır (tabloları oluşturur)
--no-vector    : pgvector olmayan test ortamı için (embedding sütunu real[] olur)
--reset --yes  : veritabanında veri varken çalıştırmak için zorunlu (yoksa betik hiçbir şey yapmadan durur)

Yükleme idempotent değildir: önce tabloları boşaltır (TRUNCATE ... CASCADE) sonra yükler.
Embedding'ler ve çıkarımlar da silinir; bu yüzden dolu veritabanında koruma devrededir.
Gemini çıkarım sonuçları (extract_gemini.py) ayrıca load_extractions.py ile yüklenir.
"""
import json, os, sys, argparse, subprocess, tempfile, re
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS, CITY
from periods import PERIODS

ROOT = os.path.join(os.path.dirname(__file__), '..')
DATA = os.path.join(ROOT, 'data')
OUT = os.path.join(DATA, 'load')


def rng(r):
    """(lo, hi) → int4range metni"""
    if not r:
        return None
    return f'[{int(r[0])},{int(r[1])})'


def page_rng(p):
    if not p:
        return None
    return f'[{p[0]},{p[-1] + 1})'


def write_jsonl(name, rows):
    path = os.path.join(OUT, name + '.jsonl')
    with open(path, 'w', encoding='utf-8') as f:
        for r in rows:
            # \copy CSV hilesi: satır içinde yeni satır olmamalı
            f.write(json.dumps(r, ensure_ascii=False).replace('\n', '\\n') + '\n')
    return path


def build():
    os.makedirs(OUT, exist_ok=True)
    mons = json.load(open(os.path.join(DATA, 'monuments_all.json'), encoding='utf-8'))
    secs = json.load(open(os.path.join(DATA, 'sections_all.json'), encoding='utf-8'))
    chunks = [json.loads(l) for l in open(os.path.join(DATA, 'chunks.jsonl'), encoding='utf-8')]
    cities = [dict(slug=k, **v) for k, v in CITY.items()]
    books = []
    for b, c in BOOKS.items():
        books.append(dict(slug=b, title=c['title'], city=c['city'], volume=c['volume'], published=c.get('published'),
                          isbn=c.get('isbn'), isbn_set=c.get('isbn_set'), en_quality=c['en_quality'],
                          credits=dict(authors=c.get('authors'), editor=c.get('editor'), translator=c.get('translator'))))
    periods = [dict(slug=s, parent=p, city=c, name_tr=a, name_en=b, years=f'[{x},{y})') for s, p, c, a, b, x, y in PERIODS]
    sections = []
    seq = 0
    for m in mons:
        if m.get('synthetic'):
            continue
        seq += 1
        sections.append(dict(key=f"{m['book']}:{m['slug']}", book=m['book'], kind='monument', title_tr=m['title_tr'],
                             title_en=m.get('title_en') or None, page_start=(m.get('pages') or [None])[0],
                             page_end=(m.get('pages') or [None, None])[-1], seq=seq,
                             text_tr='\n\n'.join(m['paras_tr']), text_en='\n\n'.join(m.get('paras_en') or []),
                             page_map=[dict(p=i, pages=pg) for i, pg in enumerate(m.get('ppages_tr') or [])],
                             monument_slug=m['slug']))
    for i, s in enumerate(secs):
        kind = {'intro': 'chapter_intro'}.get(s['kind'], s['kind'])
        sections.append(dict(key=f"{s['book']}:sec:{i}", book=s['book'], kind=kind, title_tr=s['title_tr'], title_en=None,
                             page_start=(s.get('pages') or [None])[0], page_end=(s.get('pages') or [None, None])[-1],
                             seq=10000 + i, text_tr='\n\n'.join(s['paras_tr']), text_en='\n\n'.join(s.get('paras_en') or []),
                             page_map=[dict(p=i2, pages=pg) for i2, pg in enumerate(s.get('ppages_tr') or [])],
                             monument_slug=None, sec_title=s['title_tr']))
    monuments = []
    for m in mons:
        monuments.append(dict(
            slug=m['slug'], parent_slug=m.get('parent_slug'), city=m['city'], book=m['book'], district=m.get('district'),
            kind=m['kind'], name_tr=m['title_tr'], name_en=m.get('title_en') or None, period=m.get('period'),
            built_years=rng(m.get('built_years')), date_basis=m.get('date_basis') or 'unknown',
            pages=page_rng(m.get('pages')), heading_path=m.get('heading_path'), title_source=m.get('title_source'),
            toc_title=m.get('toc_title'), toc_page=m.get('toc_page'), is_synthetic=bool(m.get('synthetic')),
            en_usable=bool(m.get('en_usable')), qa_flags=m.get('qa_flags') or [],
            section_key=None if m.get('synthetic') else f"{m['book']}:{m['slug']}"))
    # parça → bölüm anahtarı
    sec_by_title = {(s['book'], s.get('sec_title')): s['key'] for s in sections if s['monument_slug'] is None}
    rows = []
    for c in chunks:
        if c['monument_slug']:
            key = f"{c['book']}:{c['monument_slug']}"
        else:
            title = c['heading_path'].split(' › ', 1)[1]
            key = sec_by_title.get((c['book'], title))
        rows.append(dict(section_key=key, book=c['book'], seq=c['seq'], lang=c['lang'], kind=c['kind'], topic=c['topics'],
                         city=c['city'], monument_slug=c['monument_slug'], complex_slug=c['complex_slug'],
                         periods=c['periods'], years=rng(c['years']), page_start=c['page_start'], page_end=c['page_end'],
                         heading_path=c['heading_path'], content=c['content'], content_for_embed=c['content_for_embed'],
                         content_hash=c['content_hash'], is_retrievable=c['kind'] != 'glossary'))
    import glossary
    terms = glossary.terms()
    seed = json.load(open(os.path.join(DATA, 'editorial_notes_seed.json'), encoding='utf-8'))
    files = {n: write_jsonl(n, r) for n, r in [('cities', cities), ('books', books), ('periods', periods),
                                                ('sections', sections), ('monuments', monuments), ('chunks', rows),
                                                ('terms', terms), ('notes_seed', seed)]}
    return files, dict(cities=len(cities), books=len(books), periods=len(periods), sections=len(sections),
                       monuments=len(monuments), chunks=len(rows), terms=len(terms))


LOAD_SQL = r"""
\set ON_ERROR_STOP on
BEGIN;
TRUNCATE chunk, editorial_note, term, waqf_link, waqf, artwork, event, monument_person, person,
         monument, source_section, period, source_book, city RESTART IDENTITY CASCADE;
CREATE TEMP TABLE stg(doc jsonb);

-- şehir
\copy stg FROM '{cities}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO city(slug, name_tr, name_en, historic_names, lat, lon)
SELECT doc->>'slug', doc->>'name_tr', doc->>'name_en',
       ARRAY(SELECT jsonb_array_elements_text(doc->'historic_names')), (doc->>'lat')::numeric, (doc->>'lon')::numeric
FROM stg;
TRUNCATE stg;

-- kitap
\copy stg FROM '{books}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO source_book(slug, title, city_id, volume, published, isbn, isbn_set, credits, en_quality)
SELECT doc->>'slug', doc->>'title', c.id, (doc->>'volume')::smallint, (doc->>'published')::date,
       doc->>'isbn', doc->>'isbn_set', doc->'credits', doc->>'en_quality'
FROM stg JOIN city c ON c.slug = doc->>'city';
TRUNCATE stg;

-- dönem
\copy stg FROM '{periods}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO period(slug, city_id, name_tr, name_en, years)
SELECT doc->>'slug', c.id, doc->>'name_tr', doc->>'name_en', (doc->>'years')::int4range
FROM stg LEFT JOIN city c ON c.slug = doc->>'city';
UPDATE period p SET parent_id = pp.id FROM stg, period pp
 WHERE stg.doc->>'slug' = p.slug AND pp.slug = stg.doc->>'parent';
TRUNCATE stg;

-- bölümler (özgün metin)
CREATE TEMP TABLE sec_key(key text PRIMARY KEY, id int);
\copy stg FROM '{sections}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
WITH ins AS (
  INSERT INTO source_section(book_id, kind, title_tr, title_en, page_start, page_end, seq, text_tr, text_en, page_map, monument_slug)
  SELECT b.id, doc->>'kind', doc->>'title_tr', doc->>'title_en', (doc->>'page_start')::int, (doc->>'page_end')::int,
         (doc->>'seq')::int, replace(doc->>'text_tr', E'\\n', E'\n'), replace(doc->>'text_en', E'\\n', E'\n'),
         doc->'page_map', doc->>'monument_slug'
  FROM stg JOIN source_book b ON b.slug = doc->>'book'
  RETURNING id, book_id, seq)
INSERT INTO sec_key SELECT s.doc->>'key', ins.id FROM ins
  JOIN source_book b ON b.id = ins.book_id
  JOIN stg s ON s.doc->>'book' = b.slug AND (s.doc->>'seq')::int = ins.seq;
TRUNCATE stg;

-- eserler
\copy stg FROM '{monuments}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO monument(slug, city_id, district, kind, name_tr, name_en, period_id, built_years, date_basis,
                     section_id, book_id, pages, heading_path, title_source, toc_title, toc_page, is_synthetic,
                     en_usable, qa_flags, review_status)
SELECT doc->>'slug', c.id, doc->>'district', doc->>'kind', doc->>'name_tr', doc->>'name_en', p.id,
       (doc->>'built_years')::int4range, doc->>'date_basis', sk.id, b.id, (doc->>'pages')::int4range,
       doc->>'heading_path', doc->>'title_source', doc->>'toc_title', (doc->>'toc_page')::int,
       (doc->>'is_synthetic')::boolean, (doc->>'en_usable')::boolean,
       ARRAY(SELECT jsonb_array_elements_text(doc->'qa_flags')),
       'published'  -- resmî envanter kitabından gelen kayıtlar yayında başlar; panelden eklenenler 'draft'
FROM stg JOIN city c ON c.slug = doc->>'city'
JOIN source_book b ON b.slug = doc->>'book'
LEFT JOIN period p ON p.slug = doc->>'period'
LEFT JOIN sec_key sk ON sk.key = doc->>'section_key';
UPDATE monument m SET parent_id = par.id FROM stg, monument par
 WHERE stg.doc->>'slug' = m.slug AND par.slug = stg.doc->>'parent_slug';
TRUNCATE stg;

-- parçalar
\copy stg FROM '{chunks}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO chunk(section_id, book_id, seq, lang, kind, topic, city_id, monument_id, complex_id, period_ids, years,
                  page_start, page_end, heading_path, content, content_for_embed, content_hash, is_retrievable)
SELECT sk.id, b.id, (doc->>'seq')::int, doc->>'lang', doc->>'kind', ARRAY(SELECT jsonb_array_elements_text(doc->'topic')),
       c.id, m.id, cx.id,
       COALESCE((SELECT array_agg(p.id) FROM period p WHERE p.slug IN (SELECT jsonb_array_elements_text(doc->'periods'))), '{{}}'),
       (doc->>'years')::int4range, (doc->>'page_start')::int, (doc->>'page_end')::int, doc->>'heading_path',
       replace(doc->>'content', E'\\n', E'\n'), replace(doc->>'content_for_embed', E'\\n', E'\n'), doc->>'content_hash',
       (doc->>'is_retrievable')::boolean
FROM stg JOIN source_book b ON b.slug = doc->>'book'
JOIN city c ON c.slug = doc->>'city'
JOIN sec_key sk ON sk.key = doc->>'section_key'
LEFT JOIN monument m ON m.slug = doc->>'monument_slug'
LEFT JOIN monument cx ON cx.slug = doc->>'complex_slug';

-- terim sözlüğü
TRUNCATE stg;
\copy stg FROM '{terms}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO term(term_tr, term_en, wrong_en, definition_tr, definition_child_tr, definition_en, origin)
SELECT DISTINCT ON (lower(doc->>'term_tr')) doc->>'term_tr', coalesce(doc->>'term_en', doc->>'term_tr'),
       ARRAY(SELECT jsonb_array_elements_text(doc->'wrong_en')), doc->>'definition_tr', doc->>'definition_child_tr',
       doc->>'definition_en', doc->>'origin'
FROM stg;

-- bilinen kaynak sorunları (editör notları); needle → ilgili parçalar
TRUNCATE stg;
\copy stg FROM '{notes_seed}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO editorial_note(kind, chunk_ids, note_tr, model_instruction, status)
SELECT doc->>'kind',
       COALESCE((SELECT array_agg(c.id) FROM chunk c JOIN source_book b ON b.id = c.book_id
                 WHERE b.slug = doc->>'book' AND doc->>'needle' IS NOT NULL AND position(doc->>'needle' IN c.content) > 0), '{{}}'),
       doc->>'note', doc->>'instruction', 'confirmed'
FROM stg;
-- parça kimlikleri yeniden üretildi: önbellekteki cevaplar ve kaynak bağlantıları geçersiz
DO $$ BEGIN IF to_regclass('answer_cache') IS NOT NULL THEN TRUNCATE answer_cache; END IF; END $$;
COMMIT;
ANALYZE;
SELECT 'city' t, count(*) FROM city UNION ALL SELECT 'book', count(*) FROM source_book
UNION ALL SELECT 'period', count(*) FROM period UNION ALL SELECT 'section', count(*) FROM source_section
UNION ALL SELECT 'monument', count(*) FROM monument UNION ALL SELECT 'chunk', count(*) FROM chunk
UNION ALL SELECT 'term', count(*) FROM term
UNION ALL SELECT 'editorial_note(seed)', count(*) FROM editorial_note;
"""


PSQL = r'C:\Program Files\PostgreSQL\18\bin\psql.exe'
PSQL_ENV = {**os.environ, 'PGCLIENTENCODING': 'UTF8'}  # psql ile Python arasındaki metin hep UTF-8


def copy_names(files):
    """\\copy için dosya adları. psql, SQL içindeki yolu Windows ANSI kodlamasıyla açtığı için 'Masaüstü' gibi ASCII
    olmayan yollar bozulur; bu yüzden yalnızca dosya adı verilir ve psql OUT klasöründe çalıştırılır (bkz. psql())."""
    for v in files.values():
        if os.path.dirname(os.path.abspath(v)) != os.path.abspath(OUT):
            raise ValueError(f'{v} {OUT} klasöründe değil')
    return {k: os.path.basename(v) for k, v in files.items()}


def psql(dsn, sql_file):
    r = subprocess.run([PSQL, dsn, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', os.path.abspath(sql_file)], cwd=OUT,
                       capture_output=True, text=True,
                       encoding='utf-8', errors='replace', env=PSQL_ENV)
    if r.returncode:
        sys.stderr.write(r.stderr)
        raise SystemExit(r.returncode)
    return r.stdout


def psql_rows(dsn, sql):
    """Salt okunur sorgu: satırları '|' ile ayrılmış alan listeleri olarak döndürür."""
    r = subprocess.run([PSQL, dsn, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
                       capture_output=True, text=True, encoding='utf-8', env=PSQL_ENV)
    if r.returncode:
        sys.stderr.write(r.stderr)
        raise SystemExit(r.returncode)
    return [l.split('|') for l in r.stdout.splitlines() if l]


def existing_data(dsn):
    """Silinecek veriyi sayar (yalnızca SELECT). Şema yoksa boş sözlük döner."""
    if psql_rows(dsn, "SELECT to_regclass('public.monument') IS NOT NULL")[0][0] != 't':
        return {}
    sql = """SELECT (SELECT count(*) FROM monument), (SELECT count(*) FROM chunk),
                    (SELECT count(*) FROM chunk WHERE embedding IS NOT NULL),
                    (SELECT count(*) FROM monument_person) + (SELECT count(*) FROM event) + (SELECT count(*) FROM artwork)"""
    names = ['eser', 'parça', "embedding'li parça", 'çıkarım satırı']
    for table, label in (('answer_cache', 'önbellek cevabı'), ('image', 'fotoğraf kaydı'), ('narration', 'kayıtlı anlatım')):
        if psql_rows(dsn, f"SELECT to_regclass('public.{table}') IS NOT NULL")[0][0] == 't':
            sql += f', (SELECT count(*) FROM {table})'
            names.append(label)
    vals = [int(v) for v in psql_rows(dsn, sql)[0]]
    return {n: v for n, v in zip(names, vals) if v}


def guard(dsn, reset, yes):
    """Tabloda veri varsa yükleme ancak --reset --yes ile çalışır (TRUNCATE / DROP geri alınamaz)."""
    found = existing_data(dsn)
    if not found or (reset and yes):
        return
    sys.stderr.write('DURDURULDU: veritabanında veri var ve bu komut hepsini siler:\n')
    for k, v in found.items():
        sys.stderr.write(f'  - {v} {k}\n')
    sys.stderr.write('Çıkarım güncellemesi için load_extractions.py, eksik embedding için embed_gemini.py yeterlidir.\n'
                     'Gerçekten sıfırlamak istiyorsan önce yedek al (pg_dump), sonra --reset --yes ile çalıştır.\n')
    raise SystemExit(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--init', action='store_true')
    ap.add_argument('--reset', action='store_true',
                    help='mevcut veriyi silmeyi kabul et; --init ile tabloları da düşürür (DİKKAT, --yes ile birlikte)')
    ap.add_argument('--yes', action='store_true', help='--reset için onay')
    ap.add_argument('--no-vector', action='store_true')
    ap.add_argument('--build-only', action='store_true')
    a = ap.parse_args()
    files, counts = build()
    print('hazırlandı:', counts)
    sql = LOAD_SQL.format(**copy_names(files))
    load_path = os.path.join(OUT, 'load.sql')
    open(load_path, 'w', encoding='utf-8').write(sql)
    if a.build_only:
        return
    if not a.dsn:
        raise SystemExit('--dsn ya da DATABASE_URL gerekli')
    guard(a.dsn, a.reset, a.yes)
    if a.init:
        schema = open(os.path.join(ROOT, 'schema.sql'), encoding='utf-8').read()
        if a.reset:
            schema = ('DROP VIEW IF EXISTS monument_list, monument_city_context CASCADE;\n'
                      'DROP TABLE IF EXISTS artwork_image, narration, para_fix, admin_log, schema_migration, image, answer_cache, editorial_note, term, waqf_link, waqf, chunk, artwork, event, monument_person, '
                      'person, monument, period, source_section, source_book, city CASCADE;\n') + schema
        if a.no_vector:
            schema = schema.replace('CREATE EXTENSION IF NOT EXISTS vector;', '')
            schema = re.sub(r'vector\(\d+\)', 'real[]', schema)
            schema = '\n'.join(l for l in schema.split('\n') if 'USING hnsw' not in l)
            schema = ("CREATE OR REPLACE FUNCTION cosdist(real[], real[]) RETURNS float8 LANGUAGE sql IMMUTABLE AS $$ "
                      "SELECT 1 - (SELECT sum(x*y) FROM unnest($1,$2) t(x,y)) / NULLIF(sqrt((SELECT sum(x*x) FROM unnest($1) x)) * "
                      "sqrt((SELECT sum(y*y) FROM unnest($2) y)),0) $$;\n"
                      "DO $$ BEGIN CREATE OPERATOR <=> (LEFTARG=real[], RIGHTARG=real[], FUNCTION=cosdist); "
                      "EXCEPTION WHEN duplicate_function THEN NULL; END $$;\n") + schema
        p = os.path.join(OUT, 'schema_run.sql')
        open(p, 'w', encoding='utf-8').write(schema)
        psql(a.dsn, p)
        print('şema oluşturuldu')
    print(psql(a.dsn, load_path))


if __name__ == '__main__':
    main()
