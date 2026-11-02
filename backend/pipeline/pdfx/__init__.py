"""PDF'ten doğrudan eser çıkarımı (plan: docs/pdf-cikarim-plani.md).

Modüller `pipeline` klasöründen çalıştırılır: `python -m pdfx.layout`, `python -m pdfx.toc`, `python -m pdfx.queue`.
Çıktılar `data/pdfx/<kitap>/` altına yazılır; veritabanına bu paketteki hiçbir modül yazmaz.
"""
import os, sys

PIPELINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PIPELINE not in sys.path:
    sys.path.insert(0, PIPELINE)

ROOT = os.path.dirname(PIPELINE)
OUT = os.path.join(ROOT, 'data', 'pdfx')


def out_dir(book):
    d = os.path.join(OUT, book)
    os.makedirs(d, exist_ok=True)
    return d
