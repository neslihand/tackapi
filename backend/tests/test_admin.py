"""Yönetim API'si (/api/admin/*) testleri: test veritabanı + sahte Gemini + geçici medya klasörü."""
import io, os, unittest
from _testdb import needs_db, fresh_db, MEDIA, ADMINS

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
FAT = {'Authorization': f"Bearer {ADMINS['fatmanur']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'


def png(color=(200, 30, 30), size=(64, 48)):
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', size, color).save(buf, 'PNG')
    return buf.getvalue()


@needs_db
class AdminTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.c = api, TestClient(api.app)

    def q(self, sql, **p):
        return self.api.db.query(sql, p)

    def last_log(self):
        return self.q('SELECT actor, action, target, detail FROM admin_log ORDER BY id DESC LIMIT 1')[0]

    # ----------------------------------------------------------------- kimlik doğrulama
    def test_auth(self):
        self.assertEqual(self.c.get('/api/admin/me').status_code, 401)
        self.assertEqual(self.c.get('/api/admin/me', headers={'Authorization': 'Bearer yanlis-anahtar-xxxxxxxx'}).status_code, 401)
        self.assertEqual(self.c.get('/api/admin/me', headers=NES).json(), {'name': 'neslihan'})
        self.assertEqual(self.c.get('/api/admin/me', headers=FAT).json(), {'name': 'fatmanur'})
        for method, url in (('patch', f'/api/admin/monuments/{CAMI}'), ('delete', '/api/admin/images/1'),
                            ('post', '/api/admin/images/bulk'), ('get', '/api/admin/log')):
            self.assertEqual(getattr(self.c, method)(url).status_code, 401, url)

    def test_disabled_without_tokens_and_short_tokens_ignored(self):
        import admin
        old = os.environ['VAKIF_ADMIN_TOKENS']
        try:
            os.environ['VAKIF_ADMIN_TOKENS'] = ''
            self.assertEqual(self.c.get('/api/admin/me', headers=NES).status_code, 503)
            os.environ['VAKIF_ADMIN_TOKENS'] = 'kisa:abc'
            self.assertEqual(admin.load_tokens(), {})
        finally:
            os.environ['VAKIF_ADMIN_TOKENS'] = old

    def test_cors_allows_admin_requests(self):
        r = self.c.options('/api/admin/monuments/x', headers={'Origin': 'http://localhost:5173',
                                                              'Access-Control-Request-Method': 'PATCH',
                                                              'Access-Control-Request-Headers': 'authorization,content-type'})
        self.assertEqual(r.status_code, 200)
        self.assertIn('PATCH', r.headers['access-control-allow-methods'])

    # ----------------------------------------------------------------- eser listesi ve düzenleme
    def test_list_includes_drafts_and_counts(self):
        d = self.c.get('/api/admin/monuments?city=bursa&page_size=200', headers=NES).json()
        rows = {i['slug']: i for i in d['items']}
        self.assertEqual(rows['bursa-osmangazi-taslak-cesme']['review_status'], 'draft')
        self.assertGreaterEqual(rows[CAMI]['images'], 1)
        self.assertEqual(self.c.get('/api/admin/monuments?status=draft', headers=NES).json()['total'],
                         self.q("SELECT count(*) AS n FROM monument WHERE review_status = 'draft'")[0]['n'])
        stats = self.c.get('/api/admin/stats', headers=NES).json()
        self.assertEqual(stats['images_unassigned'], self.q(
            "SELECT count(*) AS n FROM image WHERE monument_id IS NULL AND review_status <> 'rejected'")[0]['n'])
        self.assertIn('monuments_without_image', stats)

    def test_patch_monument_validates_logs_and_clears_cache(self):
        slug = 'konya-meram-ornek-camii'
        self.api.db.execute("""CREATE TABLE IF NOT EXISTS answer_cache (id bigserial, monument_slug text, mode text, lang text,
                               question text, q_embedding vector(1536), result jsonb, model text, hits int DEFAULT 0,
                               created_at timestamptz DEFAULT now())""")
        self.api.db.execute("INSERT INTO answer_cache(monument_slug, mode, lang, question, result) VALUES (%(s)s,'standard','tr','x','{}')",
                            dict(s=slug))
        body = dict(name_en='Ornek Mosque', district='Meram', built_from=1219, built_to=1221, period='selcuklu',
                    summary_tr='Kısa özet.', lat=37.87, lon=32.49)
        r = self.c.patch(f'/api/admin/monuments/{slug}', json=body, headers=FAT)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn('built', r.json()['changed'])
        m = self.c.get(f'/api/admin/monuments/{slug}', headers=FAT).json()
        self.assertEqual((m['built_from'], m['built_to'], m['period'], m['lat']), (1219, 1221, 'selcuklu', 37.87))
        self.assertIsNotNone(m['updated_at'])
        self.assertEqual(self.q('SELECT count(*) AS n FROM answer_cache WHERE monument_slug = %(s)s', s=slug)[0]['n'], 0)
        log = self.last_log()
        self.assertEqual((log['actor'], log['action'], log['target']), ('fatmanur', 'monument.update', slug))
        # herkese açık uçta da görünür
        pub = {i['slug']: i for i in self.c.get('/api/monuments?city=konya').json()['items']}
        self.assertEqual(pub[slug]['built']['label'], '1219–1221')

    def test_patch_rejects_bad_input(self):
        for bad in ({'kind': 'uzay-istasyonu'}, {'lat': 60.0}, {'built_from': 1500, 'built_to': 1400},
                    {'period': 'yok-boyle-donem'}, {'parent': CAMI.replace('camii', 'yok')}, {'bilinmeyen_alan': 1},
                    {'review_status': 'rejected'}, {'name_tr': 'x'}):
            r = self.c.patch(f'/api/admin/monuments/{CAMI}', json=bad, headers=NES)
            self.assertEqual(r.status_code, 422, (bad, r.text))
        self.assertEqual(self.c.patch('/api/admin/monuments/yok-boyle', json={}, headers=NES).status_code, 404)

    def test_book_text_is_read_only(self):
        r = self.c.put(f'/api/admin/monuments/{CAMI}/text', json={'text_tr': 'Değiştirilmiş kitap metni. ' * 3}, headers=NES)
        self.assertEqual(r.status_code, 409)
        self.assertEqual(self.c.delete(f'/api/admin/monuments/{CAMI}', headers=NES).status_code, 409)

    # ----------------------------------------------------------------- yeni eser
    def test_create_publish_and_delete_monument(self):
        text = ('Çeşme, Osmangazi ilçesinde yer almaktadır. Kitâbesine göre M. 1750 yılında yaptırılmıştır.\n\n'
                'Mermer ayna taşı ve sivri kemerli nişi vardır.')
        r = self.c.post('/api/admin/monuments', headers=NES, json=dict(
            city='bursa', name_tr='Yeni Örnek Çeşmesi', kind='fountain', district='Osmangazi', text_tr=text,
            built_from=1750, built_to=1750, date_basis='inscription', source_note='Vakıflar Genel Müdürlüğü kayıtları'))
        self.assertEqual(r.status_code, 201, r.text)
        d = r.json()
        slug = d['slug']
        self.assertEqual(slug, 'bursa-osmangazi-yeni-ornek-cesmesi')
        self.assertEqual((d['review_status'], d['chunks'], d['embedded']), ('draft', 1, 1))
        # taslak herkese açık değil
        self.assertEqual(self.c.get(f'/api/monuments/{slug}').status_code, 404)
        m = self.c.get(f'/api/admin/monuments/{slug}', headers=NES).json()
        self.assertTrue(m['text_editable'])
        self.assertEqual((m['created_by'], m['book'], m['built_from']), ('neslihan', 'Yönetim paneli girişleri', 1750))
        self.assertIn('Mermer ayna taşı', m['text_tr'])
        chunk = self.q('SELECT years::text, embedding IS NOT NULL AS emb, period_ids FROM chunk c JOIN monument m ON m.id = c.monument_id WHERE m.slug = %(s)s', s=slug)[0]
        self.assertEqual((chunk['years'], chunk['emb']), ('[1750,1751)', True))
        self.assertTrue(chunk['period_ids'])
        # aynı ad tekrar → benzersiz slug
        r2 = self.c.post('/api/admin/monuments', headers=NES, json=dict(city='bursa', name_tr='Yeni Örnek Çeşmesi',
                                                                       kind='fountain', district='Osmangazi'))
        self.assertEqual(r2.json()['slug'], slug + '-2')
        # metin güncelle → yeniden parçalanır
        r = self.c.put(f'/api/admin/monuments/{slug}/text', headers=NES, json={'text_tr': text + '\n\nÜçüncü paragraf ' * 1 + 'eklendi.'})
        self.assertEqual(r.status_code, 200, r.text)
        # yayımla → herkese açık ve sohbet edilebilir
        self.c.patch(f'/api/admin/monuments/{slug}', headers=NES, json={'review_status': 'published'})
        pub = self.c.get(f'/api/monuments/{slug}').json()
        self.assertIn('Mermer ayna taşı', pub['text'])
        self.assertEqual(self.c.post('/api/chat', json={'slug': slug, 'question': 'Ne zaman yapıldı?'}).status_code, 200)
        # sil
        self.assertEqual(self.c.delete(f'/api/admin/monuments/{slug}', headers=NES).status_code, 204)
        self.assertEqual(self.c.get(f'/api/admin/monuments/{slug}', headers=NES).status_code, 404)
        self.assertEqual(self.q('SELECT count(*) AS n FROM chunk WHERE heading_path LIKE %(h)s', h='%Yeni Örnek Çeşmesi')[0]['n'], 0)
        self.c.delete(f'/api/admin/monuments/{slug}-2', headers=NES)

    def test_create_validation(self):
        for bad in (dict(city='ankara', name_tr='Bir Cami', kind='mosque'), dict(city='bursa', name_tr='Bir Cami'),
                    dict(city='bursa', name_tr='Bir Cami', kind='mosque', text_tr='x' * 60001)):
            self.assertEqual(self.c.post('/api/admin/monuments', headers=NES, json=bad).status_code, 422, bad)

    def test_create_city(self):
        r = self.c.post('/api/admin/cities', headers=NES, json=dict(slug='kutahya', name_tr='Kütahya', name_en='Kutahya',
                                                                    lat=39.42, lon=29.98))
        self.assertEqual(r.status_code, 201, r.text)
        self.assertEqual(self.c.post('/api/admin/cities', headers=NES, json=dict(slug='kutahya', name_tr='K', name_en='K')).status_code, 422)
        self.assertEqual(self.c.post('/api/admin/cities', headers=NES, json=dict(slug='kutahya', name_tr='Kütahya', name_en='Kutahya')).status_code, 409)
        self.assertEqual(self.c.post('/api/admin/cities', headers=NES, json=dict(slug='Kötü Slug', name_tr='Xx', name_en='Xx')).status_code, 422)
        r = self.c.post('/api/admin/monuments', headers=NES, json=dict(city='kutahya', name_tr='Ulu Camii', kind='mosque'))
        self.assertEqual(r.status_code, 201)
        self.c.delete(f"/api/admin/monuments/{r.json()['slug']}", headers=NES)

    # ----------------------------------------------------------------- fotoğraflar
    def test_image_queue_assign_publish_cover(self):
        q = self.c.get('/api/admin/images?unassigned=true', headers=NES).json()
        img = next(i for i in q['items'] if i['file'].endswith('017-a4.webp'))
        self.assertIsNone(img['monument'])
        self.assertTrue(img['thumb'].startswith('/media/thumbs/'))
        slug = 'konya-meram-ornek-camii'
        # esere bağla + yayımla + kapak yap (şablon alternatif metin yeni esere göre yenilenir)
        r = self.c.patch(f"/api/admin/images/{img['id']}", headers=NES,
                         json={'monument': slug, 'review_status': 'published', 'is_cover': True})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['alt_tr'], 'Örnek Camii – Bursa Vakıf Eserleri I, s. 32')
        self.assertTrue(r.json()['edited'])
        pub = {i['slug']: i for i in self.c.get('/api/monuments?city=konya').json()['items']}
        self.assertTrue(pub[slug]['image']['src'].endswith('017-a4.webp'))
        # yayından kaldırınca kapak düşer
        self.c.patch(f"/api/admin/images/{img['id']}", headers=NES, json={'review_status': 'draft'})
        pub = {i['slug']: i for i in self.c.get('/api/monuments?city=konya').json()['items']}
        self.assertIsNone(pub[slug]['image'])
        # taslak fotoğraf kapak yapılamaz; bilinmeyen eser reddedilir
        self.assertEqual(self.c.patch(f"/api/admin/images/{img['id']}", headers=NES, json={'is_cover': True}).status_code, 409)
        self.assertEqual(self.c.patch(f"/api/admin/images/{img['id']}", headers=NES, json={'monument': 'yok'}).status_code, 422)

    def test_change_cover_and_bulk(self):
        imgs = self.c.get(f'/api/admin/monuments/{CAMI}', headers=NES).json()['images']
        second = next(i for i in imgs if not i['is_cover'] and i['review_status'] == 'published')
        self.c.patch(f"/api/admin/images/{second['id']}", headers=NES, json={'is_cover': True})
        covers = [i['id'] for i in self.c.get(f'/api/admin/monuments/{CAMI}', headers=NES).json()['images'] if i['is_cover']]
        self.assertEqual(covers, [second['id']])
        draft = next(i for i in imgs if i['review_status'] == 'draft')
        r = self.c.post('/api/admin/images/bulk', headers=NES, json={'ids': [draft['id']], 'review_status': 'published'})
        self.assertEqual(r.json(), {'updated': 1})
        gallery = self.c.get(f'/api/monuments/{CAMI}').json()['images']
        self.assertIn(draft['file'].rsplit('/', 1)[1], [g['src'].rsplit('/', 1)[1] for g in gallery])
        self.assertEqual(self.c.post('/api/admin/images/bulk', headers=NES, json={'ids': [], 'review_status': 'published'}).status_code, 422)

    def test_reject_book_image_survives_reload(self):
        imgs = self.c.get(f'/api/admin/monuments/{CAMI}', headers=NES).json()['images']
        target = imgs[-1]
        self.assertEqual(self.c.delete(f"/api/admin/images/{target['id']}", headers=NES).status_code, 204)
        row = self.q('SELECT review_status, edited FROM image WHERE id = %(i)s', i=target['id'])[0]
        self.assertEqual((row['review_status'], row['edited']), ('rejected', True))
        self.assertEqual(self.last_log()['action'], 'image.reject')

    def test_upload_image(self):
        slug = 'konya-meram-ornek-camii'
        r = self.c.post(f'/api/admin/monuments/{slug}/images', headers=NES,
                        files={'file': ('foto.png', png(), 'image/png')}, data={'alt_tr': 'Caminin kuzey cephesi'})
        self.assertEqual(r.status_code, 201, r.text)
        d = r.json()
        self.assertEqual((d['source'], d['review_status'], d['monument'], d['width']), ('upload', 'published', slug, 64))
        for path in (os.path.join(MEDIA, d['file']), os.path.join(MEDIA, 'thumbs', d['file'])):
            self.assertTrue(os.path.isfile(path), path)
        self.assertEqual(self.c.get(f"/media/{d['file']}").headers['content-type'], 'image/webp')
        # aynı dosya ikinci kez → 409; görsel olmayan → 415; alt metin zorunlu → 422; GIF kabul edilmez → 415
        dup = self.c.post(f'/api/admin/monuments/{slug}/images', headers=NES,
                          files={'file': ('foto.png', png(), 'image/png')}, data={'alt_tr': 'Tekrar'})
        self.assertEqual(dup.status_code, 409)
        self.assertEqual(self.c.post(f'/api/admin/monuments/{slug}/images', headers=NES,
                                     files={'file': ('x.png', b'gorsel degil', 'image/png')}, data={'alt_tr': 'Bozuk'}).status_code, 415)
        self.assertEqual(self.c.post(f'/api/admin/monuments/{slug}/images', headers=NES,
                                     files={'file': ('foto.png', png((1, 2, 3)), 'image/png')}).status_code, 422)
        from PIL import Image
        gif = io.BytesIO(); Image.new('RGB', (8, 8)).save(gif, 'GIF')
        self.assertEqual(self.c.post(f'/api/admin/monuments/{slug}/images', headers=NES,
                                     files={'file': ('a.gif', gif.getvalue(), 'image/gif')}, data={'alt_tr': 'Gif dosyası'}).status_code, 415)
        # yüklenen fotoğraf silinince dosyası da gider
        self.assertEqual(self.c.delete(f"/api/admin/images/{d['id']}", headers=NES).status_code, 204)
        self.assertFalse(os.path.exists(os.path.join(MEDIA, d['file'])))
        self.assertFalse(os.path.exists(os.path.dirname(os.path.join(MEDIA, d['file']))))  # boş klasör de gider
        self.assertEqual(self.q('SELECT count(*) AS n FROM image WHERE id = %(i)s', i=d['id'])[0]['n'], 0)

    def test_preview_matches_public_page_and_works_for_drafts(self):
        pub_item = next(i for i in self.c.get('/api/monuments').json()['items'] if i['slug'] == CAMI)
        pub_detail = self.c.get(f'/api/monuments/{CAMI}').json()
        p = self.c.get(f'/api/admin/preview/{CAMI}', headers=NES).json()
        self.assertEqual(p['item'], pub_item)                # ziyaretçinin gördüğü kart ile aynı
        self.assertEqual(p['detail'], pub_detail)            # ziyaretçinin gördüğü sayfa ile aynı
        self.assertEqual(p['review_status'], 'published')
        checks = {c['key']: c for c in p['checks']}
        self.assertTrue(checks['cover']['ok'] and checks['summary']['ok'] and checks['text']['ok'])
        self.assertFalse(checks['coords']['ok'])
        # taslak eser: herkese açık uçta 404, önizlemede görünür ve eksikleri listelenir
        draft = 'bursa-osmangazi-taslak-cesme'
        self.assertEqual(self.c.get(f'/api/monuments/{draft}').status_code, 404)
        p = self.c.get(f'/api/admin/preview/{draft}?lang=en', headers=NES).json()
        self.assertEqual((p['review_status'], p['item']['kind_label']), ('draft', 'Fountain'))
        self.assertFalse({c['key']: c for c in p['checks']}['cover']['ok'])
        self.assertEqual(self.c.get('/api/admin/preview/yok-boyle', headers=NES).status_code, 404)
        self.assertEqual(self.c.get(f'/api/admin/preview/{CAMI}').status_code, 401)

    def test_preview_can_include_pending_photos(self):
        self.api.db.execute("UPDATE image SET review_status = 'draft', is_cover = false WHERE sha1 = 'a3'")
        imgs = self.c.get(f'/api/admin/monuments/{CAMI}', headers=NES).json()['images']
        pending = [i for i in imgs if i['review_status'] == 'draft']
        plain = self.c.get(f'/api/admin/preview/{CAMI}', headers=NES).json()['detail']['images']
        withd = self.c.get(f'/api/admin/preview/{CAMI}?drafts=true', headers=NES).json()['detail']['images']
        self.assertEqual(len(withd), len(plain) + len(pending))
        self.assertEqual(withd[-1]['review_status'], 'draft')    # bekleyenler sona, durumuyla işaretli

    def test_books(self):
        rows = {b['slug']: b for b in self.c.get('/api/admin/books', headers=NES).json()}
        self.assertEqual(rows['bursa-1']['title'], 'Bursa Vakıf Eserleri I')
        self.assertEqual(rows['bursa-1']['images'], self.q(
            "SELECT count(*) AS n FROM image i JOIN source_book b ON b.id = i.book_id WHERE b.slug = 'bursa-1'")[0]['n'])

    def test_periods(self):
        rows = self.c.get('/api/admin/periods', headers=NES).json()
        early = next(p for p in rows if p['slug'] == 'erken-osmanli')
        self.assertEqual((early['parent'], early['start'], early['end']), ('osmanli', 1299, 1452))
        self.assertEqual(self.c.get('/api/admin/periods').status_code, 401)

    def test_log_endpoint(self):
        self.c.patch(f'/api/admin/monuments/{CAMI}', headers=NES, json={'summary_tr': 'Günlük testi özeti.'})
        rows = self.c.get(f'/api/admin/log?target={CAMI}', headers=NES).json()
        self.assertEqual(rows[0]['action'], 'monument.update')
        self.assertEqual(rows[0]['detail']['summary_tr'][1], 'Günlük testi özeti.')


if __name__ == '__main__':
    unittest.main()
