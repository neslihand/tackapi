"""Eser konumları: geocode.py (sorgu merdiveni, sonuç denetimi, kaldığı yerden devam), panelden düzeltme/onay ve
herkese açık eser sayfasındaki konum (doğrulanmamış konum "yaklaşık" gelir). Nominatim'e hiç istek gönderilmez."""
import io, os, sys, csv, json, tempfile, unittest
from contextlib import redirect_stdout
from unittest import mock
from _testdb import needs_db, fresh_db, ADMINS
import geocode as G

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
TURBE = 'bursa-yildirim-ornek-turbesi'
KONYA = 'konya-meram-ornek-camii'


def hit(lat, lon, rank=30, name='Muradiye Camii', district='Osmangazi', province='Bursa'):
    return dict(lat=str(lat), lon=str(lon), place_rank=rank, name=name, category='amenity', type='place_of_worship',
                osm_type='way', osm_id=1, display_name=f'{name}, {district}, {province}, Türkiye',
                address=dict(amenity=name, town=district, province=province, country='Türkiye'))


class OfflineCache:
    """Önbellekten cevap veren sahte Nominatim; önbellekte olmayan sorgu 'sonuç yok' döner ve sayılır."""

    def __init__(self, answers):
        self.answers, self.asked, self.sent = answers, [], 0

    def search(self, q):
        self.asked.append(q)
        return self.answers.get(q, [])


class PureTest(unittest.TestCase):
    def test_precision_from_place_rank(self):
        self.assertEqual(G.precision_of(dict(place_rank=30)), 'building')
        self.assertEqual(G.precision_of(dict(place_rank=26)), 'street')
        self.assertEqual(G.precision_of(dict(place_rank=22)), 'neighborhood')
        self.assertIsNone(G.precision_of(dict(place_rank=12)))      # ilçe/şehir: kaydedilmez

    def test_name_variants_and_query_ladder(self):
        self.assertEqual(G.name_variants('Habib-i Neccar Camii ve Külliyesi'),
                         ['Habib-i Neccar Camii ve Külliyesi', 'Habib-i Neccar Camii', 'Habib-i Camii'])
        self.assertEqual(G.name_variants('Ördekli Hamam (Eski/Yeni Hamam)'), ['Ördekli Hamam'])
        q = [x for x, _ in G.queries(dict(name_tr='Muradiye Camii', alt_names=['Hüdavendigâr Camii'], district='Osmangazi',
                                          neighborhood='Muradiye', address='2. Murat Cad.', city='Bursa'))]
        self.assertEqual(q[0], 'Muradiye Camii, Muradiye, Osmangazi, Bursa')
        self.assertIn('Hüdavendigâr Camii, Osmangazi, Bursa', q)
        self.assertEqual(q[-2:], ['2. Murat Cad., Muradiye, Osmangazi, Bursa', 'Muradiye, Osmangazi, Bursa'])

    def test_check_rejects_other_province_and_warns(self):
        m = dict(name_tr='Muradiye Camii', district='Osmangazi', city='Bursa')
        self.assertFalse(G.check(hit(1, 1, province='Manisa'), m, True)[0])
        ok, warn = G.check(hit(1, 1, district='Yıldırım'), m, True)
        self.assertTrue(ok)
        self.assertEqual(warn, ['ilçe adresle uyuşmuyor'])
        self.assertIn('ad uyuşmuyor', G.check(hit(1, 1, name='Ulu Cami'), m, True)[1][0])
        self.assertEqual(G.check(hit(1, 1, name='Yıldırım Camii', district='YILDIRIM'),
                                 dict(name_tr='Yıldırım Bayezid Camii', district='Yıldırım', city='Bursa'), True), (True, []))

    def test_locate_takes_first_acceptable_result(self):
        m = dict(name_tr='Muradiye Camii', district='Osmangazi', neighborhood=None, city='Bursa')
        nom = OfflineCache({'Muradiye Camii, Osmangazi, Bursa': [hit(38.6, 27.4, province='Manisa'), hit(40.19, 29.04)]})
        r = G.locate(m, nom)
        self.assertEqual((r['lat'], r['lon'], r['precision']), (40.19, 29.04, 'building'))
        self.assertEqual(r['detail']['status'], 'found')
        r = G.locate(dict(m, name_tr='Bilinmeyen Yapı'), OfflineCache({}))
        self.assertEqual((r['precision'], r['detail']['status']), (None, 'not_found'))

    def test_public_location_never_shows_unchecked_as_exact(self):
        self.assertIsNone(G.public_location(dict(lat=None, lon=None)))
        self.assertEqual(G.public_location(dict(lat=40.1, lon=29.0, geo_checked=True, geo_precision='building')),
                         dict(lat=40.1, lon=29.0, approximate=False, radius_m=None))
        self.assertEqual(G.public_location(dict(lat=40.1, lon=29.0, geo_checked=False, geo_precision='street'))['radius_m'], 300)
        self.assertTrue(G.public_location(dict(lat=40.1, lon=29.0, geo_checked=False, geo_precision='building'))['approximate'])
        self.assertIsNone(G.public_location(dict(lat=40.1, lon=29.0, geo_checked=False, geo_precision=None)))
        # göç 012 uygulanmamışsa koordinat yalnızca panelden elle girilmiş olabilir
        self.assertFalse(G.public_location(dict(lat=40.1, lon=29.0))['approximate'])

    def test_cache_is_reused_and_saved(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'c.json')
            with open(path, 'w', encoding='utf-8') as fh:
                json.dump({'Muradiye Camii, Osmangazi, Bursa': [hit(40.19, 29.04)]}, fh)
            nom = G.Nominatim(path, offline=True)
            self.assertEqual(nom.search('Muradiye Camii, Osmangazi, Bursa')[0]['lat'], '40.19')
            self.assertIsNone(nom.search('başka sorgu'))     # çevrim dışı ve önbellekte yok: ağa çıkılmaz
            self.assertEqual(nom.sent, 0)


@needs_db
class GeoDbTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.c = api, TestClient(api.app)

    def setUp(self):
        self.api.db.execute("""UPDATE monument SET pilot = slug = ANY(%(p)s::text[]), lat = NULL, lon = NULL, geo_source = NULL,
                                      geo_precision = NULL, geo_checked = false, geo_detail = NULL""", dict(p=[CAMI, TURBE, KONYA]))
        self.api.db.execute("DELETE FROM admin_log WHERE action = 'monument.geocode'")

    def q(self, sql, **p):
        return self.api.db.query(sql, p)

    def run_script(self, answers, *args):
        nom = OfflineCache(answers)
        tmp = tempfile.mkdtemp()
        out = io.StringIO()
        with mock.patch.object(G, 'Nominatim', lambda: nom), \
                mock.patch.object(sys, 'argv', ['geocode.py', *args, '--csv', os.path.join(tmp, 'k.csv')]), redirect_stdout(out):
            G.main()
        with open(os.path.join(tmp, 'k.csv'), encoding='utf-8-sig') as fh:
            rows = list(csv.DictReader(fh, delimiter=';'))
        return out.getvalue(), nom, rows

    ANSWERS = {'Muradiye Camii, Muradiye, Osmangazi, Bursa': [hit(40.191063, 29.046501)],
               'Örnek Camii, Meram, Konya': [hit(37.85, 32.45, rank=26, name='Örnek Sokak', district='Meram', province='Konya')]}

    def test_dry_run_writes_csv_only_then_write_and_resume(self):
        out, nom, rows = self.run_script(self.ANSWERS, '--pilot')
        self.assertIn('Veritabanı değişmedi', out)
        self.assertEqual(self.q('SELECT count(*) AS n FROM monument WHERE lat IS NOT NULL')[0]['n'], 0)
        by = {r['slug']: r for r in rows}
        self.assertEqual(set(by), {CAMI, TURBE, KONYA})
        self.assertEqual((by[CAMI]['enlem'], by[CAMI]['kesinlik'], by[CAMI]['durum']), ('40.191063', 'building', 'bulundu'))
        self.assertEqual(by[TURBE]['durum'], 'bulunamadı')

        out, nom, rows = self.run_script(self.ANSWERS, '--pilot', '--write')
        m = self.q('SELECT lat, lon, geo_source, geo_precision, geo_checked, geo_detail FROM monument WHERE slug = %(s)s', s=CAMI)[0]
        self.assertEqual((float(m['lat']), m['geo_source'], m['geo_precision'], m['geo_checked']), (40.191063, 'nominatim', 'building', False))
        self.assertEqual(m['geo_detail']['query'], 'Muradiye Camii, Muradiye, Osmangazi, Bursa')
        t = self.q('SELECT lat, geo_source, geo_detail FROM monument WHERE slug = %(s)s', s=TURBE)[0]
        self.assertEqual((t['lat'], t['geo_source'], t['geo_detail']['status']), (None, 'nominatim', 'not_found'))
        self.assertEqual(self.q("SELECT count(*) AS n FROM admin_log WHERE action = 'monument.geocode'")[0]['n'], 3)
        self.assertNotIn(CAMI, {r['slug'] for r in self.q('SELECT slug FROM monument WHERE NOT pilot AND lat IS NOT NULL')})

        out, nom, _ = self.run_script(self.ANSWERS, '--pilot', '--write')     # kaldığı yerden: hepsi işlenmiş
        self.assertEqual(nom.asked, [])
        out, nom, _ = self.run_script(self.ANSWERS, '--pilot', '--retry')
        self.assertTrue(nom.asked)

    def test_checked_and_manual_locations_are_never_overwritten(self):
        self.api.db.execute("""UPDATE monument SET lat = 40.2, lon = 29.1, geo_source = 'nominatim', geo_precision = 'street',
                               geo_checked = true WHERE slug = %(c)s""", dict(c=CAMI))
        self.api.db.execute("""UPDATE monument SET lat = 37.9, lon = 32.5, geo_source = 'manual', geo_precision = 'exact'
                               WHERE slug = %(k)s""", dict(k=KONYA))
        out, nom, _ = self.run_script(self.ANSWERS, '--pilot', '--write', '--retry')
        self.assertEqual(nom.asked[0], 'Örnek Türbesi, Yıldırım, Bursa')
        self.assertTrue(all('Muradiye' not in q and 'Örnek Camii' not in q for q in nom.asked))
        self.assertEqual(float(self.q('SELECT lat FROM monument WHERE slug = %(s)s', s=CAMI)[0]['lat']), 40.2)
        self.assertEqual(float(self.q('SELECT lat FROM monument WHERE slug = %(s)s', s=KONYA)[0]['lat']), 37.9)

    def test_public_detail_and_panel_confirm(self):
        self.assertIsNone(self.c.get(f'/api/monuments/{CAMI}').json()['location'])
        self.run_script(self.ANSWERS, '--slug', CAMI, '--write')
        loc = self.c.get(f'/api/monuments/{CAMI}').json()['location']
        self.assertEqual(loc, dict(lat=40.191063, lon=29.046501, approximate=True, radius_m=150))
        pre = self.c.get(f'/api/admin/preview/{CAMI}', headers=NES).json()
        self.assertEqual(pre['detail']['location'], loc)                  # önizleme ile site aynı veri
        self.assertFalse(next(c for c in pre['checks'] if c['key'] == 'coords')['ok'])
        geo = self.c.get(f'/api/admin/monuments/{CAMI}', headers=NES).json()['geo']
        self.assertEqual((geo['source'], geo['precision'], geo['checked']), ('nominatim', 'building', False))

        r = self.c.patch(f'/api/admin/monuments/{CAMI}', headers=NES, json={'geo_checked': True})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertFalse(self.c.get(f'/api/monuments/{CAMI}').json()['location']['approximate'])
        self.assertTrue(next(c for c in self.c.get(f'/api/admin/preview/{CAMI}', headers=NES).json()['checks']
                             if c['key'] == 'coords')['ok'])

    def test_list_has_location_and_pilot_filter(self):
        self.run_script(self.ANSWERS, '--slug', CAMI, '--write')
        items = self.c.get('/api/monuments', params={'pilot': 'true'}).json()['items']
        self.assertEqual({i['slug'] for i in items}, {CAMI, TURBE, KONYA})
        by = {i['slug']: i for i in items}
        self.assertEqual(by[CAMI]['location'], self.c.get(f'/api/monuments/{CAMI}').json()['location'])
        self.assertTrue(by[CAMI]['location']['approximate'])
        self.assertIsNone(by[TURBE]['location'])
        others = self.c.get('/api/monuments', params={'pilot': 'false'}).json()['items']
        self.assertFalse({i['slug'] for i in others} & {CAMI, TURBE, KONYA})
        self.assertGreater(self.c.get('/api/monuments').json()['total'], len(items))

    def test_panel_move_makes_manual_and_clear_resets(self):
        self.run_script(self.ANSWERS, '--slug', CAMI, '--write')
        r = self.c.patch(f'/api/admin/monuments/{CAMI}', headers=NES, json={'lat': 40.1915, 'lon': 29.0470})
        self.assertEqual(r.status_code, 200, r.text)
        m = self.q('SELECT geo_source, geo_precision, geo_checked FROM monument WHERE slug = %(s)s', s=CAMI)[0]
        self.assertEqual(m, dict(geo_source='manual', geo_precision='exact', geo_checked=True))
        self.assertEqual(self.c.get(f'/api/monuments/{CAMI}').json()['location'],
                         dict(lat=40.1915, lon=29.047, approximate=False, radius_m=None))
        self.c.patch(f'/api/admin/monuments/{CAMI}', headers=NES, json={'lat': None, 'lon': None})
        m = self.q('SELECT lat, geo_source, geo_checked FROM monument WHERE slug = %(s)s', s=CAMI)[0]
        self.assertEqual(m, dict(lat=None, geo_source=None, geo_checked=False))
        self.assertIsNone(self.c.get(f'/api/monuments/{CAMI}').json()['location'])
        # konum yokken onay verilemez
        self.assertEqual(self.c.patch(f'/api/admin/monuments/{CAMI}', headers=NES, json={'geo_checked': True}).status_code, 422)


if __name__ == '__main__':
    unittest.main()
