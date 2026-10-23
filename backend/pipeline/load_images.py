"""Aşama 8b – images.py çıktısını (data/images.jsonl) image tablosuna yükler. Tekrar çalıştırılabilir.

- Görsel sha1 ile eşlenir: yeni görsel eklenir, var olan güncellenir. Yönetim panelinde değiştirilmiş (edited) satırlara
  dokunulmaz; böylece elle yapılan düzeltmeler yeniden yüklemede kaybolmaz.
- Kesin eşleşmeler 'published', kontrol gerektirenler 'draft' olarak girer (images.py kurallarına bakın).
- Kapağı olmayan her eserin ilk yayımlanmış fotoğrafı kapak yapılır.
- Alternatif metin şablonla yazılır: "<eser adı> – <kitap>, s. <sayfa>" (görme engelli kullanıcılar ve kaynak gösterimi).

Kullanım: python load_images.py [--dsn ...]
"""
import os, sys, json, argparse
sys.path.insert(0, os.path.dirname(__file__))
from db import DB

DATA = os.path.join(os.path.dirname(__file__), '..', 'data')

UPSERT = """
INSERT INTO image (monument_id, city_id, book_id, source, sha1, file, width, height, pdf_page, printed_page,
                   section_title, match_method, sort, alt_tr, alt_en, review_status)
SELECT m.id, b.city_id, b.id, 'book', %(sha1)s, %(file)s, %(width)s, %(height)s, %(pdf_page)s, %(printed_page)s,
       %(section)s::text, %(method)s, %(sort)s,
       coalesce(m.name_tr || ' – ', '') || b.title || coalesce(', s. ' || %(printed_page)s::int, ''),
       coalesce(coalesce(m.name_en, m.name_tr) || ' – ', '') || 'photo from ' || b.title || coalesce(', p. ' || %(printed_page)s::int, ''),
       %(status)s
FROM source_book b LEFT JOIN monument m ON m.slug = %(monument_slug)s::text
WHERE b.slug = %(book)s
ON CONFLICT (sha1) DO UPDATE SET
       monument_id = EXCLUDED.monument_id, file = EXCLUDED.file, width = EXCLUDED.width, height = EXCLUDED.height,
       pdf_page = EXCLUDED.pdf_page, printed_page = EXCLUDED.printed_page, section_title = EXCLUDED.section_title,
       match_method = EXCLUDED.match_method, sort = EXCLUDED.sort, alt_tr = EXCLUDED.alt_tr, alt_en = EXCLUDED.alt_en,
       review_status = EXCLUDED.review_status
 WHERE NOT image.edited
"""

COVERS = """
UPDATE image i SET is_cover = true
  FROM (SELECT DISTINCT ON (monument_id) id FROM image
         WHERE monument_id IS NOT NULL AND review_status = 'published'
           AND monument_id NOT IN (SELECT monument_id FROM image WHERE is_cover AND monument_id IS NOT NULL)
         ORDER BY monument_id, sort, id) c
 WHERE i.id = c.id
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--src', default=os.path.join(DATA, 'images.jsonl'))
    a = ap.parse_args()
    db = DB(a.dsn)
    rows = [json.loads(l) for l in open(a.src, encoding='utf-8')]
    missing = 0
    for r in rows:
        if r['monument_slug'] and not db.query('SELECT 1 FROM monument WHERE slug = %(s)s', dict(s=r['monument_slug'])):
            missing += 1  # eser veritabanında yoksa fotoğraf bağlanmamış olarak girer
            r['monument_slug'], r['needs_review'] = None, True
        r['status'] = 'draft' if r['needs_review'] else 'published'
        db.execute(UPSERT, r)
    db.execute(COVERS)
    stats = db.query("""SELECT count(*) AS toplam,
                               count(*) FILTER (WHERE review_status = 'published') AS yayinda,
                               count(*) FILTER (WHERE monument_id IS NULL) AS esersiz,
                               count(DISTINCT monument_id) AS eser,
                               count(*) FILTER (WHERE is_cover) AS kapak FROM image""")[0]
    print(f"{len(rows)} satır işlendi; veritabanında bulunmayan eser: {missing}")
    print(stats)


if __name__ == '__main__':
    main()
