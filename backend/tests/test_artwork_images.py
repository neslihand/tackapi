"""Süsleme ve sanat kayıtlarına panelden fotoğraf bağlama (artwork_image) ve eser sayfasında gösterim."""
import unittest
from _testdb import needs_db, fresh_db, ADMINS

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
HAZIRE = 'bursa-osmangazi-muradiye-camii-haziresi'


@needs_db
class ArtworkImageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api, load_extractions
        cls.api, cls.LE = api, load_extractions
        cls.c = TestClient(api.app)
        q = lambda sql: api.db.query(sql)
        cls.art = q("SELECT id FROM artwork WHERE kind = 'gravestone'")[0]['id']      # haziredeki mezar taşı
        cls.img = {r['sha1']: r['id'] for r in q('SELECT id, sha1 FROM image')}    # a1, a2 yayında; a3 taslak; a4 esersiz

    def setUp(self):
        self.api.db.execute('DELETE FROM artwork_image')

    def put(self, ids, art=None, headers=NES):
        return self.c.put(f'/api/admin/artworks/{art or self.art}/images', json={'image_ids': ids}, headers=headers)

    def card_art(self, slug, qs=''):
        return self.c.get(f'/api/monuments/{slug}{qs}').json()['card']['artworks']

    def test_link_and_show_on_public_page(self):
        a1, a2 = self.img['a1'], self.img['a2']
        self.assertEqual(self.card_art(HAZIRE)[0]['images'], [])
        # hazirenin mezar taşına üst yapının (caminin) fotoğrafları bağlanabilir; seçim sırası korunur
        r = self.put([a2, a1])
        self.assertEqual(r.status_code, 200, r.text)
        imgs = self.card_art(HAZIRE)[0]['images']
        self.assertEqual([i['src'] for i in imgs], ['/media/books/bursa-1/020-a2.webp', '/media/books/bursa-1/019-a1.webp'])
        self.assertEqual(set(imgs[0]), {'src', 'thumb', 'alt', 'width', 'height', 'caption', 'source'})
        # caminin sayfası alt yapının (hazire) süsleme kayıtlarını da gösterir
        self.assertEqual(len(self.card_art(CAMI)[0]['images']), 2)
        # panelde bağlı fotoğraflar görünür
        d = self.c.get(f'/api/admin/monuments/{HAZIRE}', headers=NES).json()
        self.assertEqual(d['artworks'][0]['image_ids'], [a2, a1])
        # seçicide hazirenin üst yapısının (caminin) fotoğrafları da çıkar, yapının adıyla
        cami_photos = [p for p in d['artwork_photos'] if p['monument'] == CAMI]
        self.assertTrue(cami_photos and all(p['other'] for p in cami_photos))
        self.assertNotIn(self.img['a4'], [p['id'] for p in d['artwork_photos']])
        # sırayı değiştirme ve kaldırma
        self.put([a1])
        self.assertEqual([i['src'] for i in self.card_art(HAZIRE)[0]['images']], ['/media/books/bursa-1/019-a1.webp'])
        self.put([])
        self.assertEqual(self.card_art(HAZIRE)[0]['images'], [])
        log = self.api.db.query("SELECT detail FROM admin_log WHERE action = 'artwork.images' ORDER BY id DESC LIMIT 1")[0]
        self.assertEqual(log['detail']['images'], [[a1], []])

    def test_pending_photo_only_in_preview(self):
        self.put([self.img['a3']])
        self.assertEqual(self.card_art(HAZIRE)[0]['images'], [])                    # taslak fotoğraf ziyaretçiye gitmez
        p = self.c.get(f'/api/admin/preview/{HAZIRE}?drafts=true', headers=NES).json()
        self.assertEqual(p['detail']['card']['artworks'][0]['images'][0]['review_status'], 'draft')
        plain = self.c.get(f'/api/admin/preview/{HAZIRE}', headers=NES).json()
        self.assertEqual(plain['detail'], self.c.get(f'/api/monuments/{HAZIRE}').json())   # önizleme = site

    def test_validation(self):
        self.assertEqual(self.put([self.img['a4']]).status_code, 422)               # esere bağlı olmayan fotoğraf
        other = self.api.db.query("""INSERT INTO image(monument_id, source, sha1, file, review_status)
                                     VALUES (4, 'book', 'baska', 'x.webp', 'published') RETURNING id""")[0]['id']
        self.assertEqual(self.put([other]).status_code, 422)                         # başka eserin fotoğrafı
        self.api.db.execute("UPDATE image SET review_status = 'rejected' WHERE id = %(i)s", dict(i=other))
        self.assertEqual(self.put([self.img['a1']] * 2).json()['image_ids'], [self.img['a1']])   # tekrarlar atılır
        self.assertEqual(self.put([self.img['a1']], art=999999).status_code, 404)
        self.assertEqual(self.put(list(range(1, 32))).status_code, 422)              # en çok 30
        self.assertEqual(self.put([self.img['a1']], headers={}).status_code, 401)

    def test_links_survive_extraction_reload(self):
        a1 = self.img['a1']
        self.put([a1])
        db = self.api.db
        # load_extractions.py'nin yaptığı gibi: bağları sakla, artwork satırlarını sil ve yeniden kur, bağları geri yükle
        import psycopg
        with psycopg.connect(db.dsn, autocommit=False) as c:
            c.execute(self.LE.KEEP_ART_IMG)
            c.execute('DELETE FROM artwork')
            c.execute("INSERT INTO artwork(monument_id, kind, description_tr) VALUES (3, 'gravestone', 'mezar taşı')")
            c.execute(self.LE.RESTORE_ART_IMG)
            c.commit()
        new = db.query("SELECT id FROM artwork WHERE kind = 'gravestone'")[0]['id']
        self.assertNotEqual(new, self.art)
        self.assertEqual([r['image_id'] for r in db.query('SELECT image_id FROM artwork_image WHERE artwork_id = %(a)s',
                                                          dict(a=new))], [a1])
        type(self).art = new


if __name__ == '__main__':
    unittest.main()
