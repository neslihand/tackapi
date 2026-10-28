"""Yönetici asistanı: takvim, yıl dönümleri, davranış kuralları, tarama, taslak ve uygulama, duyurular."""
import datetime as dt, unittest, uuid
from unittest import mock
from _testdb import needs_db, fresh_db, ADMINS
import agent as A

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
TURBE = 'bursa-yildirim-ornek-turbesi'
KONYA = 'konya-meram-ornek-camii'
TODAY = dt.date(2026, 10, 28)


class OccurrenceTest(unittest.TestCase):
    def row(self, **kw):
        return dict(dict(on_date=None, month=None, day=None, days=1), **kw)

    def test_yearly_and_single(self):
        self.assertEqual(A.next_occurrence(self.row(month=11, day=10), TODAY), dt.date(2026, 11, 10))
        self.assertEqual(A.next_occurrence(self.row(month=3, day=18), TODAY), dt.date(2027, 3, 18))   # geçti → gelecek yıl
        self.assertEqual(A.next_occurrence(self.row(month=10, day=26, days=4), TODAY), dt.date(2026, 10, 26))  # sürüyor
        self.assertIsNone(A.next_occurrence(self.row(on_date=dt.date(2026, 3, 20), days=3), TODAY))
        self.assertIsNone(A.next_occurrence(self.row(month=2, day=29), TODAY))          # 2027'de 29 Şubat yok

    def test_years_text(self):
        self.assertEqual(A.years_text('[1425,1427)'), '1425–1426')
        self.assertEqual(A.years_text('[1426,1427)'), '1426')
        self.assertIsNone(A.years_text(None))


@needs_db
class AgentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.db, cls.c = api, api.db, TestClient(api.app)
        cls.db.execute("UPDATE monument SET pilot = slug = ANY(%(p)s::text[])", dict(p=[CAMI, TURBE, KONYA]))

    def setUp(self):
        for t in ('agent_suggestion', 'announcement', 'calendar_day', 'analytics_event', 'site_setting'):
            self.db.execute(f'DELETE FROM {t}')
        self.db.execute('DELETE FROM event')
        self.db.execute('DELETE FROM route')
        for lim in self.api.visitor_router.limiters:
            lim.hits.clear()

    def open_items(self):
        return self.db.query("SELECT * FROM agent_suggestion WHERE status = 'open' ORDER BY id")

    def test_calendar_seed_once_and_upcoming(self):
        n = A.seed_calendar(self.db)
        self.assertGreater(n, 10)
        self.assertFalse(self.db.query("SELECT 1 FROM calendar_day WHERE title LIKE '%%Hatay%%'"))   # şehir yoksa eklenmez
        self.db.execute('DELETE FROM calendar_day')
        self.assertEqual(A.seed_calendar(self.db), 0)              # bir kez: silinenler geri gelmez
        self.db.execute("DELETE FROM site_setting")
        A.seed_calendar(self.db)
        found = {s['evidence']['occasion']: s for s in A.calendar_rules(self.db, TODAY)}
        self.assertIn("Atatürk'ü Anma Günü", found)
        self.assertIn('Cumhuriyet Bayramı', found)
        self.assertNotIn('Çanakkale Zaferi ve Şehitleri Anma Günü', found)            # 45 günden uzak
        regaib = found['Regaib Kandili']
        self.assertIn('doğrulanmadı', regaib['detail'])
        self.assertEqual(set(regaib['monuments']), {CAMI, KONYA})                      # cami türü
        mevlana = found["Hz. Mevlânâ'yı anma törenleri (Şeb-i Arûs)"]
        self.assertEqual(mevlana['monuments'], [KONYA])                                 # yalnızca Konya
        self.assertEqual(mevlana['due_on'], dt.date(2026, 12, 17))
        self.assertIn('route', found['Cumhuriyet Bayramı']['drafts'])

    def test_anniversary_from_book_event(self):
        self.db.execute("""INSERT INTO event(monument_id, city_id, kind, years, date_text, basis, description_tr)
                           SELECT id, city_id, 'construction', '[1426,1427)', '830 (1426)', 'inscription', 'yapıldı'
                           FROM monument WHERE slug = %(s)s""", dict(s=CAMI))
        self.db.execute("""INSERT INTO event(monument_id, city_id, kind, years, basis, description_tr)
                           SELECT id, city_id, 'construction', '[1400,1500)', 'style', 'yapıldı' FROM monument WHERE slug = %(s)s""",
                        dict(s=TURBE))
        out = A.anniversary_rules(self.db, TODAY)
        self.assertEqual([s['title'] for s in out], ['2026: Muradiye Camii yapımının 600. yılı'])   # aralıklı yıl sayılmaz
        self.assertIn('830 (1426)', out[0]['detail'])
        self.assertIn('kitâbesine göre', out[0]['detail'])

    def test_scan_is_repeatable_and_respects_decisions(self):
        first = A.scan(self.db, TODAY)
        self.assertGreater(first['new'], 0)
        again = A.scan(self.db, TODAY)
        self.assertEqual(again['new'], 0)
        sid = self.open_items()[0]['id']
        r = self.c.patch(f'/api/admin/agent/{sid}', json={'status': 'dismissed'}, headers=NES)
        self.assertEqual(r.status_code, 200, r.text)
        A.scan(self.db, TODAY)
        self.assertEqual(self.db.query('SELECT status FROM agent_suggestion WHERE id = %(i)s', dict(i=sid))[0]['status'], 'dismissed')
        # takvim günü kapatılınca önerisi süresi geçmiş olur
        cal = self.db.query("SELECT id FROM agent_suggestion WHERE key LIKE 'cal:%%' AND status = 'open' LIMIT 1")[0]['id']
        cid = self.db.query("SELECT (evidence->>'calendar_id')::int AS c FROM agent_suggestion WHERE id = %(i)s", dict(i=cal))[0]['c']
        self.db.execute('UPDATE calendar_day SET active = false WHERE id = %(c)s', dict(c=cid))
        A.scan(self.db, TODAY)
        self.assertEqual(self.db.query('SELECT status FROM agent_suggestion WHERE id = %(i)s', dict(i=cal))[0]['status'], 'expired')

    def test_behaviour_rules_from_events(self):
        sids = [str(uuid.uuid4()) for _ in range(40)]
        for i, sid in enumerate(sids):
            events = [dict(type='page_view', path='/')]
            if i % 2:
                events.append(dict(type='monument_view', slug=CAMI))
            if i < 4:
                events.append(dict(type='client_error', path='/kesfet', props={'message': 'TypeError: x is undefined (ali@ornek.com 12345678)'}))
            if i < 6:
                events.append(dict(type='page_perf', path='/eser', props={'load_ms': 6500, 'ttfb_ms': 800}))
            for lim in self.api.visitor_router.limiters:
                lim.hits.clear()
            r = self.c.post('/api/events', json=dict(session_id=sid, events=events))
            self.assertEqual(r.status_code, 204, r.text)
        msg = self.db.query("SELECT props->>'message' AS m FROM analytics_event WHERE type = 'client_error' LIMIT 1")[0]['m']
        self.assertNotIn('ali@', msg)
        self.assertNotIn('12345678', msg)
        out, demo = A.behaviour_rules(self.db, TODAY)
        titles = [s['title'] for s in out]
        self.assertFalse(demo)
        self.assertTrue(any(t.startswith('Sitede tekrarlayan hata (4 kez)') for t in titles), titles)
        self.assertTrue(any(t.startswith('Sayfa yavaş açılıyor: /eser') for t in titles), titles)
        bounce = next(s for s in out if s['key'].startswith('ret:bounce'))
        self.assertIn('%50', bounce['title'])
        self.assertIn('announcement', bounce['drafts'])

    def test_draft_apply_route_announcement_summary(self):
        A.seed_calendar(self.db)
        A.scan(self.db, TODAY)
        sug = self.db.query("""SELECT id, monuments FROM agent_suggestion WHERE evidence->>'occasion' = 'Regaib Kandili'""")[0]
        r = self.c.post(f"/api/admin/agent/{sug['id']}/draft", json={'kind': 'route'}, headers=NES)
        self.assertEqual(r.status_code, 200, r.text)
        d = r.json()
        self.assertFalse(d['ai'])                                   # sahte model boş döner → kayıttan şablon
        self.assertEqual(set(d['draft']['stops']), set(sug['monuments']))
        r = self.c.post(f"/api/admin/agent/{sug['id']}/apply", json={'kind': 'route', 'draft': dict(d['draft'], stops=d['draft']['stops'] + ['uydurma'])},
                        headers=NES)
        self.assertEqual(r.status_code, 200, r.text)
        route = self.db.query('SELECT id, published FROM route WHERE slug = %(s)s', dict(s=r.json()['result_ref'].split(':', 1)[1]))[0]
        self.assertFalse(route['published'])                        # onaysız yayınlanmaz
        self.assertEqual(self.db.query('SELECT count(*) AS n FROM route_stop WHERE route_id = %(r)s', dict(r=route['id']))[0]['n'], 2)
        self.assertEqual(self.db.query('SELECT status FROM agent_suggestion WHERE id = %(i)s', dict(i=sug['id']))[0]['status'], 'done')

        # duyuru: taslak oluşur, yayımlanınca ve tarihi sürerken sitede görünür
        ann = self.db.query("""SELECT id FROM agent_suggestion WHERE evidence->>'occasion' = 'Cumhuriyet Bayramı'""")[0]['id']
        d = self.c.post(f'/api/admin/agent/{ann}/draft', json={'kind': 'announcement'}, headers=NES).json()
        aid = int(self.c.post(f'/api/admin/agent/{ann}/apply', json={'kind': 'announcement', 'draft': dict(d['draft'], starts_on=None)},
                              headers=NES).json()['result_ref'].split(':')[1])
        self.assertEqual(self.c.get('/api/announcements').json(), [])
        r = self.c.patch(f'/api/admin/announcements/{aid}', json={'published': True}, headers=NES)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertTrue(r.json()['ai_draft'])
        public = self.c.get('/api/announcements').json()
        self.assertEqual([a['id'] for a in public], [aid])
        self.db.execute("UPDATE monument SET review_status = 'draft' WHERE slug = %(s)s", dict(s=public[0]['monuments'][0]))
        hidden = public[0]['monuments'][0]
        self.assertNotIn(hidden, self.c.get('/api/announcements').json()[0]['monuments'])   # yayında olmayan eser gösterilmez
        self.db.execute("UPDATE monument SET review_status = 'published'")
        self.c.patch(f'/api/admin/announcements/{aid}', json={'starts_on': '2020-01-01', 'ends_on': '2020-01-02'}, headers=NES)
        self.assertEqual(self.c.get('/api/announcements').json(), [])

        # özet: yalnızca öneriye bağlı esere yazılır
        sid = self.db.query("""INSERT INTO agent_suggestion(key, kind, title, detail, monuments, drafts)
                               VALUES ('t:summary', 'content', 'Okunmadan bırakılıyor', 'deneme', %(m)s, '{summary}') RETURNING id""",
                            dict(m=[CAMI]))[0]['id']
        d = self.c.post(f'/api/admin/agent/{sid}/draft', json={'kind': 'summary'}, headers=NES).json()
        self.assertEqual(d['draft'], {'summary': 'Özet TR', 'slug': CAMI})          # kayıttaki özet
        bad = self.c.post(f'/api/admin/agent/{sid}/apply', json={'kind': 'summary', 'draft': {'slug': KONYA, 'summary': 'Başka esere yazılmamalı.'}},
                          headers=NES)
        self.assertEqual(bad.status_code, 422)
        ok = self.c.post(f'/api/admin/agent/{sid}/apply', json={'kind': 'summary', 'draft': {'slug': CAMI, 'summary': 'Çinileriyle bilinen bir cami.'}},
                         headers=NES)
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertEqual(self.db.query('SELECT summary_tr FROM monument WHERE slug = %(s)s', dict(s=CAMI))[0]['summary_tr'],
                         'Çinileriyle bilinen bir cami.')
        self.db.execute("UPDATE monument SET summary_tr = 'Özet TR' WHERE slug = %(s)s", dict(s=CAMI))

    def test_ai_draft_is_checked_against_sources(self):
        sid = self.db.query("""INSERT INTO agent_suggestion(key, kind, title, detail, monuments, drafts, evidence)
                               VALUES ('t:ann', 'calendar', 'Deneme', 'deneme', %(m)s, '{announcement}', '{"occasion": "Deneme Günü"}')
                               RETURNING id""", dict(m=[CAMI, KONYA]))[0]['id']
        fake = dict(title='Deneme Günü', monuments=[CAMI, 'uydurma'],
                    body='Muradiye Camii seni bekliyor. Cami 1999 yılında yeniden yapıldı. Çinilerine yakından bak.')
        with mock.patch.object(A.G, 'generate', return_value=fake):
            d = self.c.post(f'/api/admin/agent/{sid}/draft', json={'kind': 'announcement'}, headers=NES).json()
        self.assertTrue(d['ai'])
        self.assertNotIn('1999', d['draft']['body'])                 # kaynakta olmayan yıl çıkarılır
        self.assertIn('Çinilerine', d['draft']['body'])
        self.assertEqual(d['draft']['monuments'], [CAMI])            # yalnızca verilen eserler
        self.assertTrue(any('1999' in w for w in d['warnings']))
        with mock.patch.object(A.G, 'generate', side_effect=RuntimeError('kota')):
            d = self.c.post(f'/api/admin/agent/{sid}/draft', json={'kind': 'announcement'}, headers=NES).json()
        self.assertFalse(d['ai'])
        self.assertIn('Muradiye Camii', d['draft']['body'])          # şablon, kayıttaki adlarla

    def test_calendar_crud_validation(self):
        bad = self.c.post('/api/admin/calendar', json={'title': 'X günü', 'kind': 'other', 'month': 2, 'day': 31}, headers=NES)
        self.assertEqual(bad.status_code, 422)
        both = self.c.post('/api/admin/calendar', json={'title': 'X günü', 'kind': 'other'}, headers=NES)
        self.assertEqual(both.status_code, 422)
        r = self.c.post('/api/admin/calendar', json={'title': 'Bursa günü', 'kind': 'city', 'city': 'bursa', 'month': 11, 'day': 20,
                                                     'monument_kinds': ['tomb', 'uydurma']}, headers=NES)
        self.assertEqual(r.status_code, 201, r.text)
        row = r.json()
        self.assertEqual(row['monument_kinds'], ['tomb'])
        r = self.c.patch(f"/api/admin/calendar/{row['id']}", json={'on_date': '2026-11-25'}, headers=NES)
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIsNone(r.json()['month'])
        listed = {d['id']: d for d in self.c.get('/api/admin/calendar', headers=NES).json()['days']}
        if dt.date.today() <= dt.date(2026, 11, 25):
            self.assertEqual(listed[row['id']]['next'], '2026-11-25')
        self.assertEqual(self.c.delete(f"/api/admin/calendar/{row['id']}", headers=NES).status_code, 204)

    def test_panel_list_scans_when_stale_and_needs_admin(self):
        self.assertEqual(self.c.get('/api/admin/agent').status_code, 401)
        r = self.c.get('/api/admin/agent', headers=NES).json()
        self.assertTrue(r['enabled'])
        self.assertIsNotNone(r['last_scan'])                         # ilk açılışta tarandı
        self.assertTrue(r['items'])
        self.assertEqual(self.c.get('/api/admin/stats', headers=NES).json()['agent_open'], len(r['items']))


if __name__ == '__main__':
    unittest.main()
