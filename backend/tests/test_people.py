"""Liste öğesindeki mimar, usta ve bânî: kitaptaki sırayla; bânî mimar alanına girmez."""
import unittest
from _testdb import needs_db, fresh_db

CAMI = 'bursa-osmangazi-muradiye-camii'


@needs_db
class PeopleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.c = api, TestClient(api.app)
        db = api.db
        for i, name in enumerate(('II. Murad', 'Hacı İvaz Paşa', 'Ali Neccâr', 'Usta Ahmed')):
            db.execute('INSERT INTO person(slug, name) VALUES (%(s)s, %(n)s)', dict(s=f'kisi-{i}', n=name))
        mid = db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=CAMI))[0]['id']
        chunk = db.query('SELECT min(id) AS c FROM chunk')[0]['c']
        rows = [('II. Murad', 'patron', None), ('Hacı İvaz Paşa', 'architect', chunk), ('Ali Neccâr', 'architect', None),
                ('Usta Ahmed', 'builder', None)]
        for name, role, ch in rows:
            db.execute("""INSERT INTO monument_person(monument_id, person_id, role, chunk_id)
                          SELECT %(m)s, id, %(r)s, %(c)s FROM person WHERE name = %(n)s""", dict(m=mid, r=role, c=ch, n=name))

    def test_list_item_people(self):
        items = {i['slug']: i for i in self.c.get('/api/monuments').json()['items']}
        cami = items[CAMI]
        self.assertEqual(cami['architect'], 'Hacı İvaz Paşa, Ali Neccâr')     # kanıtı (parçası) olan önce
        self.assertEqual(cami['builder'], 'Usta Ahmed')
        self.assertEqual(cami['patron'], 'II. Murad')
        self.assertNotIn('II. Murad', cami['architect'])
        other = items['konya-meram-ornek-camii']
        self.assertEqual((other['architect'], other['builder'], other['patron']), (None, None, None))


if __name__ == '__main__':
    unittest.main()
