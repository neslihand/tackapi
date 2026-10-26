"""Aşama 6 – Parça embedding'leri (gemini-embedding-2, 1536 boyut).

Yalnızca embedding'i olmayan ya da metni değişmiş (content_hash) parçaları işler; tekrar çalıştırılabilir.
Belge biçimi: 'title: <bağlam yolu (dönemler)> | text: <metin>'  (chunk.content_for_embed)

Kullanım: GEMINI_API_KEY=... python embed_gemini.py --dsn ... [--batch 100]
pgvector indeksi yükleme bittikten sonra oluşturulur (schema.sql'de HNSW tanımlı).
"""
import os, sys, argparse, time
sys.path.insert(0, os.path.dirname(__file__))
import gemini_client as G
from db import DB, vec_literal, VEC_CAST


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--batch', type=int, default=100)
    ap.add_argument('--dim', type=int, default=G.EMBED_DIM)
    a = ap.parse_args()
    db = DB(a.dsn)
    model_tag = f'{G.EMBED_MODEL}@{a.dim}' + ('-FAKE' if G.FAKE else '')
    total = 0
    while True:
        rows = db.query("""SELECT id, content_for_embed FROM chunk
                           WHERE is_retrievable AND (embedding IS NULL OR embedding_model IS DISTINCT FROM %(m)s)
                           ORDER BY id LIMIT %(n)s""", dict(m=model_tag, n=a.batch))
        if not rows:
            break
        items = []
        for r in rows:
            t, _, x = r['content_for_embed'].partition(' | text: ')
            items.append((t.replace('title: ', '', 1), x))
        try:
            vecs = G.embed_documents(items, dim=a.dim)
        except Exception as e:
            if '429' in str(e) or 'RESOURCE_EXHAUSTED' in str(e):
                waited = getattr(main, '_waited', 0)
                if waited >= 5:
                    print('Kota üst üste doldu (büyük ihtimalle günlük sınır). Daha sonra tekrar çalıştır; kaldığı yerden devam eder.')
                    break
                main._waited = waited + 1
                print('Kota sınırı, 65 sn bekleniyor...', flush=True)
                time.sleep(65)
                continue
            raise
        main._waited = 0
        time.sleep(float(os.environ.get('VAKIF_EMBED_PAUSE', '20')))
        values = ','.join(f"({r['id']}, '{vec_literal(v)}')" for r, v in zip(rows, vecs))
        db.execute(f"""UPDATE chunk c SET embedding = v.e{VEC_CAST}, embedding_model = %(m)s
                       FROM (VALUES {values}) AS v(id, e) WHERE c.id = v.id""", dict(m=model_tag))
        total += len(rows)
        print(f'{total} parça gömüldü', flush=True)
    print('bitti; toplam', total)


if __name__ == '__main__':
    main()
