"""Kitap PDF'inden sayfa görüntüsü: yönetim panelinde fotoğrafı doğru esere bağlarken kitabın o sayfasına bakmak için.

PDF sayfaları iki kitap sayfasından oluşan açılımlardır (sol + sağ). Basılı sayfa numarası → PDF sayfası eşlemesi
images.printed_pages ile bir kez hesaplanır ve bellekte tutulur. PDF'ler telifli olduğu için yalnızca yönetici uçları
kullanır; görüntü diske yazılmaz.
"""
import os, sys, functools
sys.path.insert(0, os.path.dirname(__file__))
from books import BOOKS
from images import PDF_DIR, printed_pages


class PdfMissing(LookupError):
    pass


def pdf_path(book):
    if book not in BOOKS or not BOOKS[book].get('pdf'):
        raise PdfMissing(f'Bu kitabın PDF dosyası tanımlı değil: {book}')
    path = os.path.join(PDF_DIR, BOOKS[book]['pdf'])
    if not os.path.exists(path):
        raise PdfMissing(f"PDF bulunamadı: {BOOKS[book]['pdf']} (klasör: VAKIF_PDF_DIR)")
    return path


@functools.lru_cache(maxsize=8)
def page_map(book):
    """{basılı sayfa: PDF sayfa dizini (0 tabanlı)}"""
    import pymupdf
    with pymupdf.open(pdf_path(book)) as doc:
        out = {}
        for i, (left, right, _) in enumerate(printed_pages(doc)):
            for p in (left, right):
                if p is not None:
                    out.setdefault(p, i)
        return out


def render(book, printed, width=1400):
    """Basılı sayfayı içeren açılımın JPEG görüntüsü. Döner: (bayt, {sol, sağ, pdf_sayfası})."""
    import pymupdf
    i = page_map(book).get(printed)
    if i is None:
        raise KeyError(f'{book}: s. {printed} PDF\'te bulunamadı')
    pages = sorted(p for p, j in page_map(book).items() if j == i)
    with pymupdf.open(pdf_path(book)) as doc:
        page = doc[i]
        zoom = width / page.rect.width
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
        return pix.tobytes('jpeg', jpg_quality=80), dict(pages=pages, pdf_page=i + 1)
