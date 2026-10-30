"""Görselle arama: fotoğraf embedding'leri, /api/visual-search ve ölçüm (sahte Gemini: görselin küçük hâlinden vektör)."""
import io, os, unittest
from unittest import mock
from _testdb import needs_db, fresh_db, png_header, MEDIA, ADMINS

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
TURBE = 'bursa-yildirim-ornek-turbesi'


def picture(kind, size=(640, 480), fmt='WEBP'):
    """Birbirinden ayırt edilebilen sentetik 'fotoğraflar'."""
    from PIL import Image, ImageDraw
    im = Image.new('RGB', size, (235, 225, 205))
    d = ImageDraw.Draw(im)
    w, h = size
    if kind == 'cami':        # mavi kubbe, kırmızı zemin şeritleri
        for y in range(0, h, 40):
            d.rectangle([0, y, w, y + 18], fill=(170, 40, 40))
        d.ellipse([w * .25, h * .1, w * .75, h * .6], fill=(30, 60, 160))
    elif kind == 'cami2':     # aynı yapının biraz farklı kadrajı
        for y in range(10, h, 40):
            d.rectangle([0, y, w, y + 18], fill=(165, 45, 40))
        d.ellipse([w * .3, h * .12, w * .8, h * .62], fill=(35, 60, 150))
    elif kind == 'turbe':     # yeşil daireler
        for x in range(0, w, 120):
            d.ellipse([x, h * .3, x + 100, h * .3 + 100], fill=(40, 140, 60))
    elif kind == 'taslak':
        d.rectangle([0, 0, w, h], fill=(240, 220, 40))
    elif kind == 'gurultu':   # hiçbir esere benzemeyen
        import random
        rnd = random.Random(7)
        for _ in range(400):
            x, y = rnd.randrange(w), rnd.randrange(h)
            d.rectangle([x, y, x + 25, y + 25], fill=tuple(rnd.randrange(256) for _ in range(3)))
    out = io.BytesIO()
    im.save(out, fmt)
    return out.getvalue()


@needs_db
class VisualSearchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api, visual_search, gemini_client
        cls.api, cls.VS, cls.G = api, visual_search, gemini_client
        cls.c = TestClient(api.app)
        db = api.db
        # örnek verideki fotoğrafların dosyalarını gerçek görsellerle yaz; türbeye bir fotoğraf ekle
        files = {r['sha1']: r['file'] for r in db.query('SELECT sha1, file FROM image')}
        for sha, kind in (('a1', 'cami'), ('a2', 'cami2'), ('a3', 'taslak'), ('a4', 'cami')):
            path = os.path.join(MEDIA, files[sha])
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'wb') as f:
                f.write(picture(kind))
        os.makedirs(os.path.join(MEDIA, 'books', 'bursa-1'), exist_ok=True)
        with open(os.path.join(MEDIA, 'books', 'bursa-1', '090-t1.webp'), 'wb') as f:
            f.write(picture('turbe'))
        db.execute("""INSERT INTO image(monument_id, city_id, book_id, source, sha1, file, review_status)
                      VALUES (4, 1, 1, 'book', 't1', 'books/bursa-1/090-t1.webp', 'published')""")
        cls.embedded = visual_search.embed_pending(db)

    def setUp(self):
        self.api._hits.clear()

    def post(self, data, name='foto.jpg', mime='image/jpeg'):
        return self.c.post('/api/visual-search', files={'file': (name, data, mime)})

    def test_embeds_assigned_images_once(self):
        # a1, a2, a3 (taslak da: onaylanınca hazır olsun) ve türbe; esere bağlı olmayan a4 hariç
        self.assertEqual(self.embedded, 4)
        rows = self.api.db.query('SELECT sha1, embedding IS NOT NULL AS e, embedding_model FROM image ORDER BY sha1')
        self.assertEqual({r['sha1']: r['e'] for r in rows}, {'a1': True, 'a2': True, 'a3': True, 'a4': False, 't1': True})
        self.assertTrue(all(r['embedding_model'].endswith(':image-FAKE') for r in rows if r['e']))
        self.assertEqual(self.VS.embed_pending(self.api.db), 0)                      # kaldığı yerden: iş kalmadı

    def test_confident_match_for_monument_photo(self):
        r = self.post(picture('cami', size=(1200, 900), fmt='JPEG'))               # farklı boyut ve biçim
        self.assertEqual(r.status_code, 200, r.text)
        d = r.json()
        self.assertTrue(d['confident'])
        self.assertEqual(d['match']['slug'], CAMI)
        self.assertEqual(d['match'], d['candidates'][0]['item'])                    # liste kartıyla aynı biçim
        self.assertTrue(d['candidates'][0]['photo']['thumb'].startswith('/media/thumbs/'))
        self.assertEqual(d['candidates'][1]['item']['slug'], TURBE)
        self.assertGreater(d['candidates'][0]['score'], d['candidates'][1]['score'])

    def test_unrelated_photo_is_not_confident(self):
        d = self.post(picture('gurultu', fmt='PNG'), 'x.png', 'image/png').json()
        self.assertFalse(d['confident'])
        self.assertIsNone(d['match'])
        self.assertTrue(d['candidates'])                                             # adaylar yine gösterilir

    def test_only_published_photos_and_monuments(self):
        d = self.post(picture('taslak', fmt='JPEG')).json()                          # taslak fotoğrafa benzeyen
        self.assertNotIn('021-a3', str(d))
        self.api.db.execute(f"UPDATE monument SET review_status = 'draft' WHERE slug = '{TURBE}'")
        try:
            d = self.post(picture('turbe', fmt='JPEG')).json()
            self.assertNotIn(TURBE, [c['item']['slug'] for c in d['candidates']])
        finally:
            self.api.db.execute(f"UPDATE monument SET review_status = 'published' WHERE slug = '{TURBE}'")

    def test_validation(self):
        self.assertEqual(self.post(b'bu bir resim degil').status_code, 422)
        self.assertEqual(self.post(picture('cami', size=(120, 90), fmt='JPEG')).status_code, 422)     # çok küçük
        self.assertEqual(self.post(picture('cami', fmt='GIF'), 'x.gif', 'image/gif').status_code, 422)
        with mock.patch.object(self.api, 'VISUAL_MAX', 1000):
            self.assertEqual(self.post(picture('cami', fmt='JPEG')).status_code, 413)
        self.assertEqual(self.c.post('/api/visual-search').status_code, 422)          # dosya yok

    def test_pixel_bomb_is_refused_before_decoding(self):
        for side in (12000, 20000):   # bizim sınırımızın ve Pillow'un kendi sınırının üstü: pikseller açılmaz
            r = self.post(png_header(side), 'dev.png', 'image/png')
            self.assertEqual(r.status_code, 422)
            self.assertIn('megapiksel', r.json()['detail'])

    def test_llm_error_becomes_503(self):
        with mock.patch.object(self.VS, 'embed', side_effect=self.G.LLMError('429 RESOURCE_EXHAUSTED')):
            r = self.post(picture('cami', fmt='JPEG'))
        self.assertEqual(r.status_code, 503)
        self.assertIn('retry-after', r.headers)

    def test_other_model_vectors_ignored(self):
        # başka modelle gömülmüş fotoğraflar (ör. eski Gemini vektörleri) aramada ve ölçümde kullanılmaz
        db = self.api.db
        db.execute("UPDATE image SET embedding_model = 'eski-model:image' WHERE sha1 = 'a2'")
        try:
            r = self.VS.rank(db, self.G._fake_image_vec(picture('cami2'), self.G.EMBED_DIM))
            a2 = db.query("SELECT id FROM image WHERE sha1 = 'a2'")[0]['id']
            self.assertNotIn(a2, [c['image_id'] for c in r['candidates']])
            self.assertIsNone(self.VS.evaluate(db))          # camide tek uygun fotoğraf kaldı
            self.assertEqual(self.VS.embed_pending(db), 1)    # eski modelli fotoğraf yeniden gömülür
        finally:
            db.execute(f"UPDATE image SET embedding_model = '{self.VS.MODEL_TAG}' WHERE sha1 = 'a2'")

    def test_rate_limit(self):
        codes = [self.post(picture('cami', fmt='JPEG')).status_code for _ in range(6)]
        self.assertEqual(codes, [200] * 5 + [429])

    def test_evaluate(self):
        r = self.VS.evaluate(self.api.db)
        self.assertEqual(r['total'], 2)                                              # yalnızca camide iki fotoğraf var
        self.assertEqual(r['top1'], 2)                                               # a1 ↔ a2 birbirini bulur

    def test_panel_upload_is_embedded_immediately(self):
        r = self.c.post(f'/api/admin/monuments/{TURBE}/images', headers=NES,
                        files={'file': ('t.png', picture('turbe', size=(800, 600), fmt='PNG'), 'image/png')},
                        data={'alt_tr': 'Örnek Türbesi, yeni fotoğraf'})
        self.assertEqual(r.status_code, 201, r.text)
        row = self.api.db.query('SELECT embedding IS NOT NULL AS e FROM image WHERE id = %(i)s', dict(i=r.json()['id']))[0]
        self.assertTrue(row['e'])


if __name__ == '__main__':
    unittest.main()
