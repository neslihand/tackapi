"""Keşif rotaları: şehir başına otomatik rotalar, panelde yazılan rotalar ve GET /api/routes."""
import unittest
from _testdb import needs_db, fresh_db, ADMINS

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
TURBE = 'bursa-yildirim-ornek-turbesi'
KONYA = 'konya-meram-ornek-camii'
TASLAK = 'bursa-osmangazi-taslak-cesme'


@needs_db
class RoutesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.c = api, TestClient(api.app)

    def setUp(self):
        self.api.db.execute('DELETE FROM route')
        self.api.db.execute("UPDATE monument SET pilot = slug = ANY(%(p)s::text[])", dict(p=[CAMI, TURBE, KONYA, TASLAK]))

    def test_city_routes_only_say_what_the_records_say(self):
        auto = self.c.get('/api/routes', params={'pilot': 'true'}).json()
        self.assertEqual([r['id'] for r in auto], ['sehir-bursa', 'sehir-konya'])
        bursa = auto[0]
        self.assertEqual(bursa['title'], 'Bursa rotası')
        self.assertTrue(bursa['auto'])
        self.assertEqual(bursa['artifactIds'], [CAMI, TURBE])            # taslak eser durak olmaz; ilçe sırası
        self.assertEqual(bursa['description'], '2 durak. İlçeler: Osmangazi ve Yıldırım. Dönemler: Erken Osmanlı.')
        self.assertEqual(self.c.get('/api/routes', params={'auto': 'false'}).json(), [])

    def test_written_route_from_panel(self):
        r = self.c.post('/api/admin/routes', headers=NES, json={'title': 'Erken Osmanlı Bursa', 'kicker': 'TEMATİK ROTA',
                                                                 'description': 'Yöneticinin yazdığı açıklama.'})
        self.assertEqual(r.status_code, 201, r.text)
        rid, slug = r.json()['id'], r.json()['slug']
        self.assertEqual(slug, 'erken-osmanli-bursa')
        self.assertEqual(self.c.put(f'/api/admin/routes/{rid}/stops', headers=NES, json={'slugs': [TURBE, CAMI, TASLAK]}).status_code, 200)
        self.assertEqual(self.c.put(f'/api/admin/routes/{rid}/stops', headers=NES, json={'slugs': ['yok-boyle']}).status_code, 422)
        # yayımlanmadan sitede görünmez
        self.assertNotIn(slug, [x['id'] for x in self.c.get('/api/routes').json()])
        self.c.patch(f'/api/admin/routes/{rid}', headers=NES, json={'published': True})
        site = self.c.get('/api/routes', params={'pilot': 'true'}).json()
        self.assertEqual(site[0]['id'], slug)                              # yazılan rotalar önce
        self.assertEqual(site[0]['artifactIds'], [TURBE, CAMI])           # sıra korunur, taslak eser düşer
        self.assertEqual((site[0]['kicker'], site[0]['auto']), ('TEMATİK ROTA', False))
        listed = self.c.get('/api/admin/routes', headers=NES).json()
        self.assertEqual([s['slug'] for s in listed['routes'][0]['stops']], [TURBE, CAMI, TASLAK])
        self.assertTrue(listed['auto'])
        self.assertEqual(self.c.delete(f'/api/admin/routes/{rid}', headers=NES).status_code, 204)
        self.assertEqual(self.q("SELECT count(*) AS n FROM admin_log WHERE action LIKE 'route.%%'")[0]['n'] >= 4, True)

    def test_route_without_published_stops_is_hidden(self):
        rid = self.c.post('/api/admin/routes', headers=NES, json={'title': 'Boş rota', 'published': True}).json()['id']
        self.c.put(f'/api/admin/routes/{rid}/stops', headers=NES, json={'slugs': [TASLAK]})
        self.assertNotIn('bos-rota', [x['id'] for x in self.c.get('/api/routes').json()])

    def q(self, sql, **p):
        return self.api.db.query(sql, p)


if __name__ == '__main__':
    unittest.main()
