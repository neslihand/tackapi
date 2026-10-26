"""Eseri yayından kaldırma, kaldırma / geri getirme ve silme kuralları."""
import unittest
from _testdb import needs_db, fresh_db, ADMINS

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI, TURBE = 'bursa-osmangazi-muradiye-camii', 'bursa-yildirim-ornek-turbesi'


@needs_db
class RemoveTest(unittest.TestCase):
    def setUp(self):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        self.api, self.c = api, TestClient(api.app)

    def q(self, sql, **p):
        return self.api.db.query(sql, p)

    def admin_list(self, qs=''):
        return [i['slug'] for i in self.c.get(f'/api/admin/monuments{qs}', headers=NES).json()['items']]

    def test_unpublish_and_republish(self):
        self.assertEqual(self.c.patch(f'/api/admin/monuments/{TURBE}', json={'review_status': 'draft'}, headers=NES).status_code, 200)
        self.assertEqual(self.c.get(f'/api/monuments/{TURBE}').status_code, 404)
        self.c.patch(f'/api/admin/monuments/{TURBE}', json={'review_status': 'published'}, headers=NES)
        self.assertEqual(self.c.get(f'/api/monuments/{TURBE}').status_code, 200)

    def test_remove_and_restore_book_monument(self):
        self.api.db.execute(f"UPDATE monument SET pilot = true WHERE slug = '{TURBE}'")
        self.assertFalse(self.c.get(f'/api/admin/monuments/{TURBE}', headers=NES).json()['deletable'])
        self.assertEqual(self.c.delete(f'/api/admin/monuments/{TURBE}', headers=NES).status_code, 409)   # kitap eseri silinmez
        r = self.c.post(f'/api/admin/monuments/{TURBE}/remove', json={'reason': 'yinelenen kayıt'}, headers=NES)
        self.assertEqual(r.status_code, 200, r.text)
        row = self.q('SELECT review_status, pilot FROM monument WHERE slug = %(s)s', s=TURBE)[0]
        self.assertEqual((row['review_status'], row['pilot']), ('removed', False))                       # pilottan da çıkar
        self.assertEqual(self.c.get(f'/api/monuments/{TURBE}').status_code, 404)                         # sitede yok
        self.assertNotIn(TURBE, [i['slug'] for i in self.c.get('/api/monuments').json()['items']])
        self.assertNotIn(TURBE, self.admin_list())                                                       # panel listesinde yok
        self.assertEqual(self.admin_list('?status=removed'), [TURBE])                                    # "Kaldırılanlar"
        # veri silinmez: parçalar yerinde
        self.assertTrue(self.q('SELECT 1 FROM monument WHERE slug = %(s)s', s=TURBE))
        log =self.q("SELECT detail FROM admin_log WHERE action = 'monument.remove'")[0]['detail']
        self.assertEqual((log['reason'], log['review_status']), ('yinelenen kayıt', ['published', 'removed']))
        # geri getirme: taslak döner
        self.assertEqual(self.c.post(f'/api/admin/monuments/{TURBE}/restore', headers=NES).status_code, 200)
        self.assertEqual(self.q('SELECT review_status FROM monument WHERE slug = %(s)s', s=TURBE)[0]['review_status'], 'draft')
        self.assertEqual(self.c.post(f'/api/admin/monuments/{TURBE}/restore', headers=NES).status_code, 409)

    def test_delete_split_monument_returns_paragraphs(self):
        db = self.api.db
        db.execute("UPDATE source_section SET text_tr = %(t)s WHERE id = 1",
                   dict(t='Birinci paragraf burada.\n\nİkinci eserin açılışı.\n\nİkinci eserin devamı.'))
        r = self.c.post(f'/api/admin/monuments/{CAMI}/paragraphs/move', headers=NES,
                        json={'from_para': 2, 'to_para': 3, 'new': {'name_tr': 'Ayrı Türbe', 'kind': 'tomb'}})
        new = r.json()['created']
        cover = db.query("SELECT id FROM image WHERE sha1 = 'a2'")[0]['id']
        self.c.patch(f'/api/admin/images/{cover}', json={'monument': new}, headers=NES)              # kitap fotoğrafı bağla
        self.assertTrue(self.c.get(f'/api/admin/monuments/{new}', headers=NES).json()['deletable'])
        self.assertEqual(self.c.delete(f'/api/admin/monuments/{new}', headers=NES).status_code, 204)
        self.assertFalse(self.q('SELECT 1 FROM monument WHERE slug = %(s)s', s=new))
        import textfix_db
        cami_id = self.q('SELECT id FROM monument WHERE slug = %(s)s', s=CAMI)[0]['id']
        self.assertIn('İkinci eserin devamı', textfix_db.effective_text(db, cami_id))                  # paragraflar döndü
        img = self.q('SELECT monument_id, review_status FROM image WHERE id = %(i)s', i=cover)[0]
        self.assertEqual((img['monument_id'], img['review_status']), (None, 'published'))              # fotoğraf silinmedi

    def test_validation(self):
        self.assertEqual(self.c.post(f'/api/admin/monuments/{TURBE}/remove', json={}).status_code, 401)
        self.assertEqual(self.c.post('/api/admin/monuments/yok-boyle/remove', json={}, headers=NES).status_code, 404)
        self.assertEqual(self.c.patch(f'/api/admin/monuments/{TURBE}', json={'review_status': 'removed'}, headers=NES).status_code, 422)


if __name__ == '__main__':
    unittest.main()
