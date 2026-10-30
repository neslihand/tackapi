"""Görselle arama: ziyaretçinin çektiği fotoğrafı kitap fotoğraflarıyla karşılaştırıp eseri bulur.

Yöntem: her eser fotoğrafının görsel embedding'i image.embedding sütununda tutulur. Varsayılan model yereldir
(local_vision.py, DINOv2; API ve kota yok); VAKIF_VISUAL_BACKEND=gemini ile gemini-embedding-2 kullanılır. Arama
yalnızca etkin modelin vektörleriyle yapılır (embedding_model etiketi); model değişince fotoğraflar yeniden gömülür. Yüklenen fotoğrafın embedding'i çıkarılır, pgvector ile en yakın fotoğraflar bulunur ve eser
bazında toplanır. Benzerlik eşiği ve ikinci adayla arası yeterliyse eser önerilir (confident); değilse en yakın
adaylar "emin değiliz" diye gösterilir. Uydurma yok kuralının görsel karşılığı: düşük güvenle tek eser söylenmez.

Yüklenen fotoğraf diske yazılmaz ve saklanmaz; yalnızca bellekte küçültülüp embedding'i çıkarılır.

Kullanım:
  python visual_search.py --limit 3          # önce birkaç fotoğrafla dene (yerel model ilk seferde indirilir)
  python visual_search.py                    # eksik embedding'leri tamamlar (kaldığı yerden devam eder)
  python visual_search.py --pilot            # yalnızca MVP pilot seçkisindeki eserlerin fotoğrafları (pilot.py)
  python visual_search.py --eval             # birini-dışarıda-bırak doğruluk ölçümü ve eşik önerisi (model çağrılmaz)
  python visual_search.py --query foto.jpg   # bir fotoğrafla arama

VAKIF_VISUAL_BACKEND local (varsayılan, local_vision.py) ya da gemini
VAKIF_VISUAL_MIN    eşleşme için en düşük kosinüs benzerliği (varsayılan yerelde 0.70, Gemini'de 0.75; --eval ile ayarlanmalı)
VAKIF_VISUAL_MARGIN birinci aday ikinciden en az bu kadar önde olmalı (varsayılan 0.03)
"""
import io, os, sys, time, argparse
sys.path.insert(0, os.path.dirname(__file__))
import gemini_client as G
import local_vision as LV
from db import vec_literal, VEC_CAST

MEDIA_DIR = os.environ.get('VAKIF_MEDIA_DIR', os.path.join(os.path.dirname(__file__), '..', 'media'))
BACKEND = os.environ.get('VAKIF_VISUAL_BACKEND', 'local')
if BACKEND not in ('local', 'gemini'):
    raise SystemExit(f'VAKIF_VISUAL_BACKEND local ya da gemini olmalı: {BACKEND}')
MIN_SIM = float(os.environ.get('VAKIF_VISUAL_MIN', '0.70' if BACKEND == 'local' else '0.75'))
MARGIN = float(os.environ.get('VAKIF_VISUAL_MARGIN', '0.03'))
MAX_SIDE = 1024          # embedding için görsel bu boyuta küçültülür (istek boyutu ve hız)
MIN_SIDE = 200           # bundan küçük görsel eşleştirme için yetersiz
MAX_PIXELS = 50_000_000  # 48-50 MP telefon fotoğrafı geçer; küçük dosyalı dev PNG belleği doldurmadan reddedilir
UPLOAD_TYPES = {'JPEG', 'PNG', 'WEBP'}
MODEL_TAG = (f'local:{LV.MODEL}' if BACKEND == 'local' else f'{G.EMBED_MODEL}@{G.EMBED_DIM}') + ':image' + (
    '-FAKE' if G.FAKE else '')


class BadImage(ValueError):
    """Okunamayan, desteklenmeyen ya da çok küçük görsel."""


def prepare(data):
    """Görsel baytları → embedding'e gidecek JPEG baytları. EXIF yönü düzeltilir, RGB'ye çevrilir, küçültülür."""
    from PIL import Image, ImageOps, UnidentifiedImageError
    try:
        im = Image.open(io.BytesIO(data))  # yalnızca başlığı okur; pikseller load() ile açılır
        fmt = im.format
        if im.width * im.height > MAX_PIXELS:
            raise Image.DecompressionBombError(im.size)
        im.load()
    except Image.DecompressionBombError as e:
        raise BadImage(f'Fotoğraf çok büyük; en çok {MAX_PIXELS // 1_000_000} megapiksel olabilir.') from e
    except (UnidentifiedImageError, OSError) as e:
        raise BadImage('Görsel okunamadı. JPEG, PNG ya da WebP bir fotoğraf seçin.') from e
    if fmt not in UPLOAD_TYPES:
        raise BadImage('Yalnızca JPEG, PNG ve WebP fotoğraflar kabul edilir.')
    im = ImageOps.exif_transpose(im).convert('RGB')
    if min(im.size) < MIN_SIDE:
        raise BadImage(f'Fotoğraf çok küçük; kısa kenarı en az {MIN_SIDE} piksel olmalı.')
    im.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    im.save(out, 'JPEG', quality=85)
    return out.getvalue()


def embed(images, tries=5):
    """prepare() çıktısı JPEG baytları → vektörler, etkin modelle. Model hatası G.LLMError (ya da alt sınıfı) yükseltir."""
    if BACKEND == 'local':
        return LV.embed_images(images, G.EMBED_DIM)
    return G.embed_images([(d, 'image/jpeg') for d in images], tries=tries)


def search(db, data, k=40, limit=3):
    """Yüklenen fotoğraf → {'confident', 'candidates': [{slug, score, hits, image_id, file}], 'thresholds'}.
    Yalnızca yayımlanmış eserlerin yayımlanmış fotoğraflarıyla karşılaştırılır. Model hatası G.LLMError yükseltir."""
    vec = embed([prepare(data)])[0]
    return rank(db, vec, k=k, limit=limit)


def rank(db, vec, k=40, limit=3, exclude_image=None):
    rows = db.query(f"""SELECT i.id, i.file, m.slug, 1 - (i.embedding <=> %(v)s{VEC_CAST}) AS sim
                        FROM image i JOIN monument m ON m.id = i.monument_id
                        WHERE i.embedding IS NOT NULL AND i.embedding_model = %(m)s
                          AND i.review_status = 'published' AND m.review_status = 'published'
                          AND NOT m.is_synthetic AND (%(x)s::int IS NULL OR i.id <> %(x)s::int)
                        ORDER BY i.embedding <=> %(v)s{VEC_CAST} LIMIT %(k)s""",
                    dict(v=vec_literal(vec), k=k, x=exclude_image, m=MODEL_TAG))
    best = {}
    for r in rows:   # eser başına en benzer fotoğraf; aynı eserin başka fotoğrafları da yakınsa 'hits' artar
        b = best.setdefault(r['slug'], dict(slug=r['slug'], score=float(r['sim']), hits=0, image_id=r['id'], file=r['file']))
        b['hits'] += 1
    cands = sorted(best.values(), key=lambda c: (-c['score'], -c['hits']))[:limit]
    for c in cands:
        c['score'] = round(c['score'], 4)
    confident = bool(cands) and cands[0]['score'] >= MIN_SIM and (
        len(cands) == 1 or cands[0]['score'] - cands[1]['score'] >= MARGIN)
    return dict(confident=confident, candidates=cands, thresholds=dict(min=MIN_SIM, margin=MARGIN))


PILOT_FILTER = "AND monument_id IN (SELECT id FROM monument WHERE pilot)"


def embed_pending(db, limit=None, force=False, pause=5.0, pilot=False):
    """Embedding'i olmayan (ya da model değişmiş) ve esere bağlı, atılmamış fotoğrafları işler. Kaldığı yerden devam eder.
    pilot=True: yalnızca MVP pilot seçkisindeki eserlerin fotoğrafları (pilot.py)."""
    scope = PILOT_FILTER if pilot else ''
    if force:   # hepsini bekleyen say; embedding'ler yenisi yazılana kadar aramada kullanılmaya devam eder
        db.execute(f"UPDATE image SET embedding_model = NULL WHERE embedding IS NOT NULL {scope}")
    done = fails = 0
    while True:
        n = 16 if limit is None else min(16, limit - done)
        if n <= 0:
            break
        rows = db.query(f"""SELECT id, file FROM image
                            WHERE monument_id IS NOT NULL AND review_status <> 'rejected'
                              AND (embedding IS NULL OR embedding_model IS DISTINCT FROM %(m)s)
                              AND NOT (id = ANY(%(skip)s::int[])) {scope}
                            ORDER BY id LIMIT %(n)s""",
                        dict(m=MODEL_TAG, n=n, skip=list(_skipped)))
        if not rows:
            break
        batch = []
        for r in rows:
            path = os.path.join(MEDIA_DIR, r['file'])
            try:
                with open(path, 'rb') as fh:
                    batch.append((r, prepare(fh.read())))
            except (OSError, BadImage) as e:
                print(f"  ! görsel {r['id']} atlandı ({r['file']}): {e}")
                _skipped.add(r['id'])
        if not batch:
            continue
        try:
            vecs = embed([b for _, b in batch])
        except G.LLMError as e:
            if '429' in str(e) or 'RESOURCE_EXHAUSTED' in str(e):
                fails += 1
                if fails >= 5:
                    print('Kota üst üste doldu. Daha sonra tekrar çalıştır; kaldığı yerden devam eder.')
                    break
                print('  Kota doldu, 65 sn bekleniyor…')
                time.sleep(65)
                continue
            raise
        fails = 0
        for (r, _), v in zip(batch, vecs):
            db.execute(f"UPDATE image SET embedding = %(v)s{VEC_CAST}, embedding_model = %(m)s WHERE id = %(i)s",
                       dict(v=vec_literal(v), m=MODEL_TAG, i=r['id']))
        done += len(batch)
        print(f'  {done} fotoğraf işlendi', flush=True)
        if BACKEND == 'gemini' and not G.FAKE:
            time.sleep(pause)
    return done


_skipped = set()


def evaluate(db, k=40):
    """Birini-dışarıda-bırak ölçümü: en az iki fotoğrafı olan eserlerde her fotoğraf sorgu yapılır, kendisi hariç
    tutulur ve doğru eserin sırası bulunur. Model çağrılmaz; yalnızca etkin modelin vektörleri. Not: kitap fotoğrafları aynı çekim serisinden geldiği
    için gerçek ziyaretçi fotoğraflarından daha kolaydır; sonuç üst sınır kabul edilmeli."""
    import numpy as np
    rows = db.query("""SELECT i.id, i.embedding::text AS e, m.slug FROM image i JOIN monument m ON m.id = i.monument_id
                       WHERE i.embedding IS NOT NULL AND i.embedding_model = %(m)s
                         AND i.review_status = 'published' AND m.review_status = 'published'
                         AND NOT m.is_synthetic""", dict(m=MODEL_TAG))
    if not rows:
        print(f'{MODEL_TAG} ile gömülmüş yayımlanmış fotoğraf yok; önce python visual_search.py')
        return None
    ids = [r['id'] for r in rows]
    slugs = np.array([r['slug'] for r in rows])
    X = np.array([np.array(r['e'].strip('[]{}').split(','), dtype=np.float32) for r in rows])
    X /= np.linalg.norm(X, axis=1, keepdims=True) + 1e-9
    counts = {s: int((slugs == s).sum()) for s in set(slugs)}
    S = X @ X.T
    np.fill_diagonal(S, -2)
    top1 = top3 = total = 0
    right, wrong = [], []
    for i in range(len(ids)):
        if counts[slugs[i]] < 2:
            continue
        order = np.argsort(-S[i])[:k]
        seen, ranked = set(), []
        for j in order:
            if slugs[j] not in seen:
                seen.add(slugs[j])
                ranked.append((slugs[j], float(S[i, j])))
        total += 1
        hit = [s for s, _ in ranked].index(slugs[i]) if slugs[i] in seen else None
        top1 += hit == 0
        top3 += hit is not None and hit < 3
        margin = ranked[0][1] - ranked[1][1] if len(ranked) > 1 else 1.0
        (right if hit == 0 else wrong).append((ranked[0][1], margin))
    if not total:
        print('En az iki fotoğrafı olan eser yok.')
        return None
    print(f'{total} sorgu ({len(counts)} eser, {len(ids)} fotoğraf)')
    print(f'ilk sırada doğru: %{100 * top1 / total:.1f}   ilk üçte doğru: %{100 * top3 / total:.1f}')
    # eşik önerisi: 'emin' denen sonuçların en az %90'ı doğru olacak en düşük benzerlik
    suggestion = None
    for t in [x / 100 for x in range(50, 100)]:
        r = sum(1 for s, m in right if s >= t and m >= MARGIN)
        w = sum(1 for s, m in wrong if s >= t and m >= MARGIN)
        if r + w and r / (r + w) >= 0.9:
            suggestion = (t, r, w)
            break
    if suggestion:
        t, r, w = suggestion
        print(f'öneri: VAKIF_VISUAL_MIN={t:.2f} (margin {MARGIN}) → emin denen {r + w} sonucun %{100 * r / (r + w):.0f}\'i doğru, '
              f'sorguların %{100 * (r + w) / total:.0f}\'i emin')
    else:
        print('%90 doğruluk sağlayan bir eşik bulunamadı; adaylar her zaman "emin değiliz" olarak gösterilmeli.')
    return dict(total=total, top1=top1, top3=top3, suggestion=suggestion)


def main():
    from db import DB
    ap = argparse.ArgumentParser(description='Görselle arama: fotoğraf embedding\'leri, ölçüm ve deneme.')
    ap.add_argument('--dsn', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--limit', type=int, help='en çok bu kadar fotoğraf işle')
    ap.add_argument('--force', action='store_true', help='tüm fotoğrafları yeniden göm')
    ap.add_argument('--pause', type=float, default=float(os.environ.get('VAKIF_EMBED_PAUSE', '5')))
    ap.add_argument('--pilot', action='store_true', help='yalnızca MVP pilot seçkisindeki eserlerin fotoğrafları')
    ap.add_argument('--eval', action='store_true', help='doğruluk ölçümü (model çağrılmaz)')
    ap.add_argument('--query', help='bir fotoğraf dosyasıyla arama yap')
    a = ap.parse_args()
    db = DB(a.dsn)
    print(f'model: {MODEL_TAG}')
    if a.eval:
        evaluate(db)
    elif a.query:
        with open(a.query, 'rb') as fh:
            r = search(db, fh.read())
        print('emin' if r['confident'] else 'emin değiliz', r['thresholds'])
        for c in r['candidates']:
            print(f"  {c['score']:.3f}  {c['slug']}  ({c['hits']} yakın fotoğraf)")
    else:
        scope = PILOT_FILTER if a.pilot else ''
        if a.pilot and not db.query('SELECT 1 FROM monument WHERE pilot LIMIT 1'):
            raise SystemExit('Pilot eser yok. Önce: python pilot.py --suggest, sonra --add / --file')
        n = embed_pending(db, limit=a.limit, force=a.force, pause=a.pause, pilot=a.pilot)
        left = db.query(f"""SELECT count(*) AS n FROM image WHERE monument_id IS NOT NULL AND review_status <> 'rejected'
                            AND (embedding IS NULL OR embedding_model IS DISTINCT FROM %(m)s) {scope}""",
                        dict(m=MODEL_TAG))[0]['n']
        print(f"{n} fotoğraf gömüldü; kalan {left}{' (pilot eserlerde)' if a.pilot else ''}.")


if __name__ == '__main__':
    main()
