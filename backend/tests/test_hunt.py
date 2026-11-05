"""Detay Avı: görev editörden gelir, cevap oyun bitmeden gitmez, gün Türkiye saatiyle, yayın kuralları sunucuda."""
import json, unittest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from _testdb import needs_db, fresh_db, ADMINS
import hunt
import users as U

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
TURBE = 'bursa-yildirim-ornek-turbesi'
TODAY = lambda days=0: (datetime.now(ZoneInfo('Europe/Istanbul')) + timedelta(days=days)).date().isoformat()


class RulesTest(unittest.TestCase):
    base = dict(question='Bu süsleme hangi esere ait?', options=['A', 'B', 'C', 'D'], answer=1, hints=['ipucu'], explanation='Kaynakta yazıyor.')

    def test_valid(self):
        self.assertEqual(hunt.issues(self.base), [])

    def test_elimination_cannot_always_win(self):
        self.assertEqual(hunt.max_attempts(['A', 'B', 'C', 'D']), 3)
        self.assertEqual(hunt.max_attempts(['A', 'B', 'C', 'D', 'E', 'F']), 4)

    def test_bad_input(self):
        for bad in (dict(question='kısa'), dict(options=['A', 'B', 'C']), dict(options=['A', 'a', 'B', 'C']), dict(answer=None),
                    dict(answer=4), dict(explanation=''), dict(hints=['1', '2', '3'])):
            self.assertTrue(hunt.issues({**self.base, **bad}), bad)


class ProgressTest(unittest.TestCase):
    def test_two_devices_are_one_player(self):
        a = dict(hunt={'2026-11-05': dict(attempts=1, solved=False, at='2026-11-05T09:00:00Z', wrong=[0])})
        b = dict(hunt={'2026-11-05': dict(attempts=2, solved=True, at='2026-11-05T10:00:00Z', wrong=[1, 'x', 9])})
        merged = U.merge_progress(a, b)['hunt']['2026-11-05']
        self.assertEqual((merged['attempts'], merged['solved'], merged['wrong']), (2, True, [0, 1]))
        self.assertEqual(U.merge_progress(b, a)['hunt']['2026-11-05']['solved'], True)

    def test_the_work_of_a_finished_game_survives_the_merge(self):
        a = dict(hunt={'2026-11-05': dict(attempts=1, solved=False, at='2026-11-05T09:00:00Z', wrong=[])})
        b = dict(hunt={'2026-11-05': dict(attempts=2, solved=True, at='2026-11-05T10:00:00Z', wrong=[], work='eser-a')})
        self.assertEqual(U.merge_progress(a, b)['hunt']['2026-11-05']['work'], 'eser-a')
        self.assertEqual(U.merge_progress(b, a)['hunt']['2026-11-05']['work'], 'eser-a')
        self.assertNotIn('work', U.merge_progress(a, a)['hunt']['2026-11-05'])
        self.assertNotIn('work', U.clean_progress(dict(hunt={'2026-11-05': dict(attempts=1, solved=False, at='x', work=5)}))['hunt']['2026-11-05'])

    def test_bad_records_are_dropped(self):
        clean = U.clean_progress(dict(hunt={'dun': dict(attempts=1, solved=False, at='x'), '2026-11-05': dict(attempts=99, solved=False, at='x'),
                                            '2026-11-06': dict(attempts=2, solved='evet', at='x')}))['hunt']
        self.assertEqual(list(clean), ['2026-11-06'])
        self.assertEqual(clean['2026-11-06']['solved'], False)


@needs_db
class HuntApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.c = api, TestClient(api.app)
        cls.image = cls.api.db.query("""SELECT i.id FROM image i JOIN monument m ON m.id = i.monument_id WHERE m.slug = %(s)s AND i.review_status = 'published' LIMIT 1""", dict(s=CAMI))[0]['id']

    def setUp(self):
        self.api.db.execute('DELETE FROM daily_hunt')

    def make(self, **over):
        body = dict(day=TODAY(), monument=CAMI, image=self.image, question='Bu süsleme hangi esere ait?', options=['Birinci', 'İkinci', 'Üçüncü', 'Dördüncü'],
                    answer=2, hints=['Bursa’da', 'Sultan yaptırdı'], explanation='Kaynakta geçen açıklama.', rights_confirmed=True, published=True)
        r = self.c.post('/api/admin/hunts', headers=NES, json={**body, **over})
        self.assertEqual(r.status_code, 201, r.text)
        return r.json()['id']

    def test_nothing_to_play(self):
        self.assertEqual(self.c.get('/api/hunt/today').json(), dict(available=False))

    def test_today_does_not_give_the_answer_away(self):
        self.make()
        d = self.c.get('/api/hunt/today').json()
        self.assertTrue(d['available'])
        self.assertEqual(d['day'], TODAY())
        self.assertEqual(d['max_attempts'], 3)
        text = json.dumps(d, ensure_ascii=False)
        for secret in ('answer', 'explanation', 'Sultan', 'Kaynakta', 'monument', 'alt', 'Muradiye'):
            self.assertNotIn(secret, text)

    def test_only_today_is_offered_and_tomorrow_cannot_be_played(self):
        tomorrow = self.make(day=TODAY(1))
        self.assertFalse(self.c.get('/api/hunt/today').json()['available'])
        self.assertEqual(self.c.post(f'/api/hunt/{tomorrow}/guess', json=dict(choice=2, attempt=1)).status_code, 404)
        self.assertEqual(self.c.get(f'/api/hunt/{tomorrow}/reveal').status_code, 404)

    def test_one_task_a_day(self):
        self.make()
        r = self.c.post('/api/admin/hunts', headers=NES, json=dict(day=TODAY(), monument=CAMI, image=self.image, question='Başka bir soru olsun?', options=['A', 'B', 'C', 'D'], answer=0, hints=[], explanation='x'))
        self.assertEqual(r.status_code, 409)

    def test_wrong_guess_gives_the_next_hint_and_no_answer(self):
        hid = self.make()
        r = self.c.post(f'/api/hunt/{hid}/guess', json=dict(choice=0, attempt=1)).json()
        self.assertEqual((r['correct'], r['finished'], r['attempts_left'], r['hint']), (False, False, 2, 'Bursa’da'))
        self.assertNotIn('reveal', r)
        r = self.c.post(f'/api/hunt/{hid}/guess', json=dict(choice=1, attempt=2)).json()
        self.assertEqual(r['hint'], 'Sultan yaptırdı')

    def test_hints_come_back_only_as_far_as_the_game_went(self):
        hid = self.make()
        self.assertEqual(self.c.get(f'/api/hunt/{hid}/hints', params={'seen': 0}).json(), [])
        self.assertEqual(self.c.get(f'/api/hunt/{hid}/hints', params={'seen': 1}).json(), ['Bursa’da'])
        self.assertEqual(self.c.get(f'/api/hunt/{hid}/hints', params={'seen': 5}).json(), ['Bursa’da', 'Sultan yaptırdı'])
        tomorrow = self.make(day=TODAY(1))
        self.assertEqual(self.c.get(f'/api/hunt/{tomorrow}/hints', params={'seen': 1}).status_code, 404)

    def test_right_guess_reveals_with_the_source(self):
        hid = self.make()
        r = self.c.post(f'/api/hunt/{hid}/guess', json=dict(choice=2, attempt=1)).json()
        self.assertTrue(r['correct'] and r['finished'])
        self.assertEqual(r['reveal']['answer_text'], 'Üçüncü')
        self.assertEqual(r['reveal']['monument']['slug'], CAMI)
        self.assertTrue(r['reveal']['source']['book'])
        self.assertEqual(self.c.get(f'/api/hunt/{hid}/reveal').json()['answer'], 2)

    def test_out_of_attempts_ends_and_reveals(self):
        hid = self.make()
        r = self.c.post(f'/api/hunt/{hid}/guess', json=dict(choice=0, attempt=3)).json()
        self.assertEqual((r['correct'], r['finished'], r['attempts_left'], r['hint']), (False, True, 0, None))
        self.assertEqual(r['reveal']['answer'], 2)
        self.assertEqual(self.c.post(f'/api/hunt/{hid}/guess', json=dict(choice=0, attempt=4)).status_code, 422)
        self.assertEqual(self.c.post(f'/api/hunt/{hid}/guess', json=dict(choice=9, attempt=1)).status_code, 422)

    def test_publishing_needs_rights_and_the_right_photo(self):
        hid = self.make(published=False, rights_confirmed=False)
        self.assertFalse(self.c.get('/api/hunt/today').json()['available'])
        r = self.c.patch(f'/api/admin/hunts/{hid}', headers=NES, json=dict(published=True))
        self.assertEqual(r.status_code, 422)
        self.assertIn('hakkını', r.text)
        self.assertEqual(self.c.post('/api/admin/hunts', headers=NES, json=dict(day=TODAY(2), monument=TURBE, image=self.image, question='Bu süsleme hangi esere ait?', options=['A', 'B', 'C', 'D'], answer=0, hints=[], explanation='x', rights_confirmed=True, published=True)).status_code, 422)
        self.assertEqual(self.c.patch(f'/api/admin/hunts/{hid}', headers=NES, json=dict(published=True, rights_confirmed=True)).status_code, 200)
        self.assertTrue(self.c.get('/api/hunt/today').json()['available'])

    def test_takes_down_with_its_work(self):
        hid = self.make()
        self.api.db.execute("UPDATE monument SET review_status = 'draft' WHERE slug = %(s)s", dict(s=CAMI))
        try:
            self.assertFalse(self.c.get('/api/hunt/today').json()['available'])
            self.assertEqual(self.c.post(f'/api/hunt/{hid}/guess', json=dict(choice=2, attempt=1)).status_code, 404)
        finally:
            self.api.db.execute("UPDATE monument SET review_status = 'published' WHERE slug = %(s)s", dict(s=CAMI))

    def test_panel_needs_a_token_and_lists(self):
        self.assertEqual(self.c.get('/api/admin/hunts').status_code, 401)
        hid = self.make()
        rows = self.c.get('/api/admin/hunts', headers=NES).json()
        self.assertEqual(rows['hunts'][0]['id'], hid)
        self.assertEqual(rows['hunts'][0]['answer'], 2)
        self.assertEqual(self.c.delete(f'/api/admin/hunts/{hid}', headers=NES).status_code, 204)
        self.assertEqual(self.c.get('/api/admin/hunts', headers=NES).json()['hunts'], [])


if __name__ == '__main__':
    unittest.main()
