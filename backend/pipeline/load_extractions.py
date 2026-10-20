"""Aşama 5b – Gemini çıkarımlarını (data/extractions/*.json) ilişkisel tablolara yükle.

Kişiler şehirler arası tekilleştirilir (normalize ad). Her kişi/olay/sanat eseri/vakıf satırı,
alıntının geçtiği metin parçasına (chunk_id) bağlanır.

Kullanım: python load_extractions.py --dsn ... [--src data/extractions]
"""
import json, os, sys, re, glob, argparse, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from segment import ascii_fold, norm_title
from periods import PERIODS, main_period
from load_db import write_jsonl, OUT, psql

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')
TITLES = r'^(sultan|hz\.?|hazreti|şeyh|seyh|hattat|mimar|vali|hacı|haci|emir|molla|prof\.?|dr\.?)\s+'


def person_key(name):
    n = ascii_fold(name or '')
    n = re.sub(r'[’\'`]', '', n)
    prev = None
    while prev != n:
        prev = n
        n = re.sub(TITLES.replace('ş', 's'), '', n)
    n = re.sub(r'\b(efendi|pasa|bey|han|hatun|aga|celebi|dede|baba)\b$', lambda m: m.group(0), n)
    return re.sub(r'[^a-z0-9]+', '-', n).strip('-')


def period_from_text(txt, city):
    if not txt:
        return None
    f = ascii_fold(txt)
    table = [('karaman', 'karamanogullari'), ('esref', 'esrefogullari'), ('selcuk', 'anadolu-selcuklu'),
             ('beylik', 'beylikler'), ('bizans', 'bizans'), ('roma', 'roma'), ('memluk', 'memluk'),
             ('erken osmanli', 'erken-osmanli'), ('klasik', 'klasik-osmanli'), ('tanzimat', 'tanzimat-ve-son-donem'),
             ('cumhuriyet', 'cumhuriyet'), ('osmanli', 'osmanli')]
    for k, slug in table:
        if k in f:
            return slug
    return None


def rng(a, b):
    if a is None:
        return None
    b = b if b is not None else a
    return f'[{min(a, b)},{max(a, b) + 1})'


def build(src):
    mons = {m['slug']: m for m in json.load(open(os.path.join(DATA, 'monuments_all.json')))}
    children = {}
    for m in mons.values():
        if m.get('parent_slug'):
            children.setdefault(m['parent_slug'], []).append(m)
    upd, persons, mp, events, arts, waqfs, links, notes = [], {}, [], [], [], [], [], []
    for path in sorted(glob.glob(os.path.join(src, '*.json'))):
        ext = json.load(open(path))
        slug = ext.get('_slug') or os.path.basename(path)[:-5]
        m = mons.get(slug)
        if not m:
            continue
        city = m['city']
        ins = ext.get('insa') or {}
        built = rng(ins.get('yil_baslangic'), ins.get('yil_bitis'))
        period = period_from_text(ins.get('donem_metinde'), city)
        if not period and ins.get('yil_baslangic'):
            period = main_period((ins['yil_baslangic'], (ins.get('yil_bitis') or ins['yil_baslangic']) + 1), city)
        rename = m.get('title_source') not in ('heading', 'subsection') and ext.get('ad_tr')
        k = ext.get('konum') or {}
        upd.append(dict(slug=slug, name_tr=ext['ad_tr'] if rename else None, name_en=ext.get('ad_en'),
                        alt_names=ext.get('diger_adlar') or [], neighborhood=k.get('mahalle'), address=k.get('adres'),
                        built_years=built, date_basis=ins.get('dayanak') if built else None, period=period,
                        architecture=ext.get('mimari') or {}, summary_tr=ext.get('ozet_tr'), summary_en=ext.get('ozet_en'),
                        current_state=ext.get('gunumuz_durumu'), status=ext.get('durum'), extraction=ext))
        for p in ext.get('kisiler') or []:
            pk = person_key(p['ad'])
            if not pk:
                continue
            persons.setdefault(pk, dict(slug=pk, name=p['ad'], title=p.get('unvan'), alt_names=set(), bio=p.get('detay')))
            persons[pk]['alt_names'].add(p['ad'])
            mp.append(dict(monument_slug=slug, person_slug=pk, role=p['rol'], detail=p.get('detay'), quote=p['alinti']))
        for e in ext.get('olaylar') or []:
            events.append(dict(monument_slug=slug, city=city, kind=e['tur'], years=rng(e.get('yil_baslangic'), e.get('yil_bitis')),
                               precision=e.get('kesinlik') if e.get('kesinlik') != 'unknown' else None,
                               hijri=e.get('hicri'), date_text=e.get('metindeki_tarih'), basis=e.get('dayanak'),
                               person_slug=person_key(e['kisi']) if e.get('kisi') else None,
                               description=e['aciklama'], quote=e['alinti'], warn=e.get('_uyari')))
        for a in ext.get('sanat_eserleri') or []:
            target = slug
            if a.get('hazireye_ait'):
                hz = [c for c in children.get(slug, []) if c['kind'] == 'graveyard']
                if hz:
                    target = hz[0]['slug']
            if a.get('sanatci'):
                pk = person_key(a['sanatci'])
                persons.setdefault(pk, dict(slug=pk, name=a['sanatci'], title=None, alt_names=set(), bio=None))
                persons[pk]['alt_names'].add(a['sanatci'])
            arts.append(dict(monument_slug=target, kind=a['tur'], element=a.get('yer'), technique=a.get('teknik'),
                             materials=a.get('malzeme') or [], colors=a.get('renkler') or [], motifs=a.get('motifler') or [],
                             style=a.get('uslup'), artist_slug=person_key(a['sanatci']) if a.get('sanatci') else None,
                             years=rng(a.get('yil'), a.get('yil')), date_text=a.get('tarih_metni'),
                             is_movable=bool(a.get('tasinabilir')), condition=a.get('durum'), script=a.get('hat_turu'),
                             language=a.get('dil'), text_original=a.get('orijinal_metin'), text_translation_tr=a.get('meal'),
                             text_reference=a.get('ayet_referansi'), description=a['aciklama'], quote=a['alinti'],
                             source_slug=slug))
        for i, w in enumerate(ext.get('vakiflar') or []):
            wk = f'{slug}#{i}'
            if w.get('vakfeden'):
                pk = person_key(w['vakfeden'])
                persons.setdefault(pk, dict(slug=pk, name=w['vakfeden'], title=None, alt_names=set(), bio=None))
            waqfs.append(dict(key=wk, founder_slug=person_key(w['vakfeden']) if w.get('vakfeden') else None,
                              deed_years=rng(w.get('yil'), w.get('yil')), deed_date_text=w.get('vakfiye_tarihi_metni'),
                              deed_archive=w.get('arsiv_kaydi'), conditions=w.get('sartlar'), quote=w['alinti'],
                              monument_slug=slug))
            links.append(dict(waqf_key=wk, role='beneficiary', monument_slug=slug, asset_text=None, asset_kind=None,
                              eser_adi=None, city=city))
            for b in w.get('baglantilar') or []:
                links.append(dict(waqf_key=wk, role=b['rol'], monument_slug=None, asset_text=b['varlik'],
                                  asset_kind=b['varlik_turu'] if b['varlik_turu'] != 'monument' else 'other',
                                  eser_adi=b.get('eser_adi'), city=city))
        q = ext.get('kalite') or {}
        for c in q.get('celiskiler') or []:
            notes.append(dict(kind='contradiction', monument_slug=slug, note=c))
        for c in q.get('olasi_ocr_hatalari') or []:
            notes.append(dict(kind='ocr', monument_slug=slug, note=c))
        if q.get('baska_esere_ait_gorunen_paragraflar'):
            notes.append(dict(kind='likely_error', monument_slug=slug,
                              note='Bölümleme kontrolü: şu paragraflar başka esere ait görünüyor: ' +
                                   ', '.join(f'P{n}' for n in q['baska_esere_ait_gorunen_paragraflar'])))
        for r in (ext.get('_validation') or {}).get('rejected', []):
            notes.append(dict(kind='uncertain', monument_slug=slug,
                              note=f"Çıkarımda alıntısı metinde bulunamayan öğe atıldı ({r['alan']}): {json.dumps(r['oge'], ensure_ascii=False)[:300]}"))
    for p in persons.values():
        p['alt_names'] = sorted(p['alt_names'] - {p['name']})
    files = {}
    for n, rows in [('x_upd', upd), ('x_person', list(persons.values())), ('x_mp', mp), ('x_event', events), ('x_art', arts),
                    ('x_waqf', waqfs), ('x_link', links), ('x_note', notes)]:
        files[n] = write_jsonl(n, rows)
    return files, {k: len(v) for k, v in [('monuments', upd), ('persons', persons), ('roles', mp), ('events', events),
                                          ('artworks', arts), ('waqfs', waqfs), ('waqf_links', links), ('notes', notes)]}


SQL = r"""
\set ON_ERROR_STOP on
BEGIN;
DELETE FROM editorial_note WHERE monument_id IS NOT NULL; DELETE FROM waqf_link; DELETE FROM waqf; DELETE FROM event WHERE monument_id IS NOT NULL; DELETE FROM artwork;
DELETE FROM monument_person; DELETE FROM person;
CREATE TEMP TABLE stg(doc jsonb);
-- alıntının geçtiği parçayı bul (boşluk/tırnak normalize)
CREATE OR REPLACE FUNCTION pg_temp.qnorm(t text) RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT lower(regexp_replace(translate(coalesce(t,''), '’‘“”', '''''""'), '\s+', ' ', 'g')) $$;
CREATE OR REPLACE FUNCTION pg_temp.find_chunk(mslug text, q text) RETURNS bigint LANGUAGE sql STABLE AS
$$ SELECT c.id FROM chunk c JOIN monument m ON m.id = c.monument_id
   WHERE m.slug = mslug AND c.lang = 'tr'
     AND position(left(pg_temp.qnorm(q), 60) IN pg_temp.qnorm(c.content)) > 0
   ORDER BY c.seq LIMIT 1 $$;

\copy stg FROM '{x_upd}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
UPDATE monument m SET
  name_tr = COALESCE(doc->>'name_tr', m.name_tr),
  name_en = COALESCE(NULLIF(m.name_en, ''), doc->>'name_en'),
  alt_names = ARRAY(SELECT jsonb_array_elements_text(doc->'alt_names')),
  neighborhood = doc->>'neighborhood', address = doc->>'address',
  built_years = COALESCE((doc->>'built_years')::int4range, m.built_years),
  date_basis = COALESCE(doc->>'date_basis', m.date_basis),
  period_id = COALESCE((SELECT id FROM period WHERE slug = doc->>'period'), m.period_id),
  architecture = doc->'architecture', summary_tr = doc->>'summary_tr', summary_en = doc->>'summary_en',
  summary_en_origin = CASE WHEN doc->>'summary_en' IS NOT NULL THEN 'machine' END,
  current_state = doc->>'current_state', status = NULLIF(doc->>'status', 'unknown'), extraction = doc->'extraction'
FROM stg WHERE m.slug = doc->>'slug';
TRUNCATE stg;

\copy stg FROM '{x_person}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO person(slug, name, alt_names, title, bio_tr)
SELECT doc->>'slug', doc->>'name', ARRAY(SELECT jsonb_array_elements_text(doc->'alt_names')), doc->>'title', doc->>'bio' FROM stg;
TRUNCATE stg;

\copy stg FROM '{x_mp}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO monument_person(monument_id, person_id, role, detail, chunk_id, quote)
SELECT DISTINCT ON (m.id, p.id, doc->>'role') m.id, p.id, doc->>'role', doc->>'detail', pg_temp.find_chunk(m.slug, doc->>'quote'), doc->>'quote'
FROM stg JOIN monument m ON m.slug = doc->>'monument_slug' JOIN person p ON p.slug = doc->>'person_slug';
TRUNCATE stg;

\copy stg FROM '{x_event}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO event(monument_id, city_id, kind, years, precision, date_text_hijri, date_text, basis, person_id, description_tr, chunk_id, quote)
SELECT m.id, m.city_id, doc->>'kind', (doc->>'years')::int4range, doc->>'precision', doc->>'hijri', doc->>'date_text',
       doc->>'basis', p.id, doc->>'description' || COALESCE(' [' || (doc->>'warn') || ']', ''),
       pg_temp.find_chunk(m.slug, doc->>'quote'), doc->>'quote'
FROM stg JOIN monument m ON m.slug = doc->>'monument_slug' LEFT JOIN person p ON p.slug = doc->>'person_slug';
TRUNCATE stg;

\copy stg FROM '{x_art}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO artwork(monument_id, kind, element, technique, materials, colors, motifs, style, artist_id, years, date_text,
                    is_movable, condition, script, language, text_original, text_translation_tr, text_reference,
                    description_tr, chunk_id, quote)
SELECT m.id, doc->>'kind', doc->>'element', doc->>'technique',
       ARRAY(SELECT jsonb_array_elements_text(doc->'materials')), ARRAY(SELECT jsonb_array_elements_text(doc->'colors')),
       ARRAY(SELECT jsonb_array_elements_text(doc->'motifs')), doc->>'style', p.id, (doc->>'years')::int4range, doc->>'date_text',
       (doc->>'is_movable')::boolean, doc->>'condition', doc->>'script', doc->>'language', doc->>'text_original',
       doc->>'text_translation_tr', doc->>'text_reference', doc->>'description',
       pg_temp.find_chunk(doc->>'source_slug', doc->>'quote'), doc->>'quote'
FROM stg JOIN monument m ON m.slug = doc->>'monument_slug' LEFT JOIN person p ON p.slug = doc->>'artist_slug';
-- kitâbe tarihini veren olayı kitâbeye bağla
UPDATE event e SET evidence_artwork_id = a.id FROM artwork a
 WHERE a.monument_id = e.monument_id AND a.kind = 'inscription' AND e.basis = 'inscription' AND e.evidence_artwork_id IS NULL
   AND (a.years IS NULL OR e.years IS NULL OR a.years && e.years);
TRUNCATE stg;

CREATE TEMP TABLE wkey(key text, id int);
\copy stg FROM '{x_waqf}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
WITH ins AS (
  INSERT INTO waqf(founder_id, name, deed_years, deed_date_text, deed_archive, conditions_tr, description_tr, chunk_id, quote)
  SELECT p.id, NULL, (doc->>'deed_years')::int4range, doc->>'deed_date_text', doc->>'deed_archive', doc->>'conditions',
         doc->>'key', pg_temp.find_chunk(doc->>'monument_slug', doc->>'quote'), doc->>'quote'
  FROM stg LEFT JOIN person p ON p.slug = doc->>'founder_slug' RETURNING id, description_tr)
INSERT INTO wkey SELECT description_tr, id FROM ins;
UPDATE waqf SET description_tr = NULL;
TRUNCATE stg;
\copy stg FROM '{x_link}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO waqf_link(waqf_id, role, monument_id, asset_text, asset_kind)
SELECT w.id, doc->>'role',
       COALESCE(m.id, (SELECT m2.id FROM monument m2 JOIN city c ON c.id = m2.city_id
                        WHERE c.slug = doc->>'city' AND doc->>'eser_adi' IS NOT NULL
                          AND similarity(m2.name_tr, doc->>'eser_adi') > 0.55
                        ORDER BY similarity(m2.name_tr, doc->>'eser_adi') DESC LIMIT 1)),
       doc->>'asset_text', doc->>'asset_kind'
FROM stg JOIN wkey w ON w.key = doc->>'waqf_key' LEFT JOIN monument m ON m.slug = doc->>'monument_slug'
WHERE m.id IS NOT NULL OR doc->>'asset_text' IS NOT NULL
   OR (doc->>'eser_adi' IS NOT NULL AND EXISTS (SELECT 1 FROM monument m2 JOIN city c ON c.id = m2.city_id
        WHERE c.slug = doc->>'city' AND similarity(m2.name_tr, doc->>'eser_adi') > 0.55));
TRUNCATE stg;

\copy stg FROM '{x_note}' WITH (FORMAT csv, QUOTE e'\x01', DELIMITER e'\x02')
INSERT INTO editorial_note(kind, monument_id, note_tr, model_instruction, status)
SELECT doc->>'kind', m.id, doc->>'note',
       CASE WHEN doc->>'kind' = 'contradiction' THEN 'Kaynakta çelişki var: ' || (doc->>'note') || ' — iki bilgiyi de kaynağıyla belirt, birini kesin doğru gibi sunma.' END,
       'open'
FROM stg JOIN monument m ON m.slug = doc->>'monument_slug';
COMMIT;
SELECT 'person' t, count(*) FROM person UNION ALL SELECT 'monument_person', count(*) FROM monument_person
UNION ALL SELECT 'event', count(*) FROM event UNION ALL SELECT 'artwork', count(*) FROM artwork
UNION ALL SELECT 'waqf', count(*) FROM waqf UNION ALL SELECT 'note', count(*) FROM editorial_note
UNION ALL SELECT 'quotes_linked_to_chunk', (SELECT count(*) FROM artwork WHERE chunk_id IS NOT NULL) + (SELECT count(*) FROM event WHERE chunk_id IS NOT NULL);
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--src', default=os.path.join(DATA, 'extractions'))
    a = ap.parse_args()
    files, counts = build(a.src)
    print('hazırlandı:', counts)
    p = os.path.join(OUT, 'load_extractions.sql')
    open(p, 'w').write(SQL.format(**{k: os.path.abspath(v) for k, v in files.items()}))
    print(psql(a.dsn, p))


if __name__ == '__main__':
    main()
