"""Kitapların künyesini (metin yazarları, editör, çevirmen) mevcut veritabanına yazar: source_book.credits.

Künye ilk kurulumda load_db.py ile books.py'den yüklenir; o sırada Bursa II–III ve Konya I'in künyesi books.py'de yoktu,
bu yüzden veritabanında boş kaldı. Bu betik yalnızca books.py'deki künyeyi source_book.credits alanına yazar; başka
tabloya, kitap metnine ve Gemini'ye dokunmaz. Sitede eser sayfasının kaynakçasında "Kitabın yazarları" olarak görünür.

Künyeler kitapların ilk sayfasından (kaynak_pdfs/*.txt, "METİN YAZARLARI", "EDİTÖR", "İNGİLİZCE ÇEVİRİ") alındı.
Yeni bir kitabın künyesi için önce books.py'deki girdisine authors/editor/translator yazılır.

Kullanım:
  python book_credits.py --report    # veritabanındaki ve books.py'deki künyeyi karşılaştırır (hiçbir şey yazmaz)
  python book_credits.py --apply     # farklı olanları günceller. Tekrar çalıştırılabilir; aynıysa dokunmaz.
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS


def wanted(book):
    """books.py girdisinden credits nesnesi; künyesi hiç yazılmamış kitap için None (veritabanına dokunulmaz)."""
    c = dict(authors=book.get('authors'), editor=book.get('editor'), translator=book.get('translator'))
    return c if any(c.values()) else None


def changes(rows, books=BOOKS):
    """[(slug, eski, yeni)]: veritabanındaki künyesi books.py'dekinden farklı olan kitaplar. rows: source_book satırları."""
    out = []
    for r in rows:
        book = books.get(r['slug'])
        new = wanted(book) if book else None
        old = r['credits'] if not isinstance(r['credits'], str) else json.loads(r['credits'])
        if new is not None and old != new:
            out.append((r['slug'], old, new))
    return out


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--report', action='store_true')
    g.add_argument('--apply', action='store_true')
    a = ap.parse_args()
    from db import DB
    db = DB()
    rows = db.query('SELECT slug, title, credits FROM source_book ORDER BY slug')
    todo = changes(rows)
    for r in rows:
        authors = ((r['credits'] if not isinstance(r['credits'], str) else json.loads(r['credits'])) or {}).get('authors') or []
        mark = 'değişecek' if any(s == r['slug'] for s, _, _ in todo) else 'aynı'
        print(f"{r['slug']:10} {len(authors):2} yazar  → {mark}")
    if not todo:
        print('Güncellenecek künye yok.')
        return
    for slug, old, new in todo:
        print(f'\n{slug}\n  şimdi : {json.dumps(old, ensure_ascii=False)}\n  olacak: {json.dumps(new, ensure_ascii=False)}')
    if not a.apply:
        print(f'\n{len(todo)} kitap güncellenecek. Yazmak için: python book_credits.py --apply')
        return
    for slug, _, new in todo:
        db.execute('UPDATE source_book SET credits = %(c)s::jsonb WHERE slug = %(s)s', dict(c=json.dumps(new, ensure_ascii=False), s=slug))
    print(f'\n{len(todo)} kitabın künyesi güncellendi.')


if __name__ == '__main__':
    main()
