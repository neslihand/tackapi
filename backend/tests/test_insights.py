"""Veriyle gelişen döngü: profiller, öneriler, popüler eserler, ayarlar, panel analitiği ve deneme verisi."""
import io, uuid, unittest
from contextlib import redirect_stdout
from _testdb import needs_db, fresh_db, ADMINS
import insights as I

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
TURBE = 'bursa-yildirim-ornek-turbesi'
KONYA = 'konya-meram-ornek-camii'
BASE = dict(events=1, views=0, m_story=0, m_child=0, m_short=0, deep_reads=0, chats=0, maps=0, cameras=0, photos=0,
            games=0, stamps=0, contributions=0)


class SegmentTest(unittest.TestCase):
    def f(self, **kw):
        return dict(BASE, **kw)

    def test_rules(self):
        self.assertEqual(I.segments(self.f(views=1)), ['browser'])
        self.assertEqual(I.segments(self.f(views=3, m_story=3))[0], 'story')
        self.assertEqual(I.segments(self.f(m_child=1, games=1))[0], 'family')
        self.assertIn('family', I.segments(self.f(views=1), dict(purposes=['family'])))   # beyan da sayılır
        self.assertEqual(I.segments(self.f(chats=3, m_short=1))[0], 'research')
        self.assertEqual(I.segments(self.f(maps=4))[0], 'route')
        self.assertEqual(I.segments(self.f(cameras=1))[0], 'visual')
        self.assertEqual(set(I.segments(self.f(games=3, m_child=0))), {'family', 'player'})


@needs_db
class InsightsApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api, demo_activity
        cls.api, cls.D, cls.c = api, demo_activity, TestClient(api.app)
        api.db.execute("UPDATE monument SET pilot = slug = ANY(%(p)s::text[])", dict(p=[CAMI, TURBE, KONYA]))

    def setUp(self):
        self.api.db.execute('DELETE FROM analytics_event')
        self.api.db.execute('DELETE FROM site_setting')
        for lim in self.api.visitor_router.limiters:
            lim.hits.clear()

    def send(self, sid, *events):
        r = self.c.post('/api/events', json=dict(session_id=sid, events=[dict(e) for e in events]))
        self.assertEqual(r.status_code, 204, r.text)

    def test_recommendations_follow_what_was_seen(self):
        sid = str(uuid.uuid4())
        empty = self.c.get('/api/recommendations', params={'session_id': sid}).json()
        self.assertFalse(empty['personal'])
        self.send(sid, dict(type='monument_view', slug=CAMI), dict(type='narration_mode', slug=CAMI, props={'mode': 'story'}),
                  dict(type='narration_mode', slug=CAMI, props={'mode': 'story'}))
        r = self.c.get('/api/recommendations', params={'session_id': sid}).json()
        self.assertTrue(r['personal'])
        self.assertEqual(r['segments'][0]['id'], 'story')
        slugs = [i['slug'] for i in r['items']]
        self.assertNotIn(CAMI, slugs)                                 # görülen önerilmez
        self.assertEqual(slugs[0], TURBE)                              # aynı şehir ve dönem önce
        self.assertTrue(r['items'][0]['reason'])

    def test_medal_tiers_come_from_the_panel_and_are_checked(self):
        new = dict(read=[2, 4, 6], onsite=[1, 2, 3], recall=[2, 4, 6], city_read=[25, 50, 100], master_onsite=40)
        try:
            r = self.c.put('/api/admin/settings', headers=NES, json={'medal_tiers': new})
            self.assertEqual(r.status_code, 200, r.text)
            self.assertEqual(self.c.get('/api/site-settings').json()['medal_tiers'], new)
            for bad in (dict(new, read=[3, 3, 5]), dict(new, onsite=[0, 1, 2]), dict(new, read=[1, 2]),
                        dict(new, city_read=[50, 80, 120]), dict(new, master_onsite=0)):
                self.assertEqual(self.c.put('/api/admin/settings', headers=NES, json={'medal_tiers': bad}).status_code, 422, bad)
            self.assertEqual(self.c.get('/api/site-settings').json()['medal_tiers'], new)
        finally:
            self.api.db.execute("DELETE FROM site_setting WHERE key = 'medal_tiers'")

    def test_popular_settings_and_demo_separation(self):
        for _ in range(3):
            self.send(str(uuid.uuid4()), dict(type='monument_view', slug=KONYA))
        self.send(str(uuid.uuid4()), dict(type='monument_view', slug=CAMI))
        pop = self.c.get('/api/popular').json()
        self.assertEqual([(p['slug'], p['visitors']) for p in pop], [(KONYA, 3), (CAMI, 1)])
        self.assertEqual(self.c.get('/api/site-settings').json(), dict(default_mode='short', featured_route=None, medal_tiers=I.MEDAL_TIERS, app_flags={}))
        for _ in range(5):
            self.send(str(uuid.uuid4()), dict(type='narration_mode', slug=CAMI, props={'mode': 'child'}))
        self.assertEqual(self.c.get('/api/site-settings').json()['default_mode'], 'child')     # veriye göre
        r = self.c.put('/api/admin/settings', headers=NES, json={'default_mode': 'story', 'featured_route': 'none'})
        self.assertEqual(r.json()['effective']['default_mode'], 'story')                          # elle
        self.assertEqual(r.json()['effective']['source']['default_mode'], 'elle')
        out = io.StringIO()
        with redirect_stdout(out):
            n = self.D.generate(self.api.db, sessions=60, days=20, seed=1, write=True)
        self.assertGreater(n, 100)
        self.assertEqual([p['slug'] for p in self.c.get('/api/popular').json()][0], KONYA)     # deneme verisi sitede yok
        with_demo = self.c.get('/api/admin/insights', headers=NES, params={'days': 30}).json()
        without = self.c.get('/api/admin/insights', headers=NES, params={'days': 30, 'demo': 'false'}).json()
        self.assertEqual(without['totals']['visitors'], 9)
        self.assertEqual(with_demo['totals']['visitors'], 69)
        self.assertGreater(with_demo['totals']['demo_events'], 0)
        with redirect_stdout(io.StringIO()):
            self.D.clear(self.api.db)
        self.assertEqual(self.api.db.query('SELECT count(*) AS n FROM analytics_event WHERE demo')[0]['n'], 0)
        self.assertEqual(self.api.db.query('SELECT count(*) AS n FROM analytics_event')[0]['n'], 9)

    def test_wmhe_counts_a_person_once_and_only_qualifying_actions(self):
        import json
        def event(sid, type_, user=None, demo=False, **props):
            self.api.db.execute("""INSERT INTO analytics_event(session_id, user_id, type, props, demo)
                                   VALUES (%(s)s, %(u)s, %(t)s, %(p)s::jsonb, %(d)s)""", dict(s=sid, u=user, t=type_, p=json.dumps(props), d=demo))
        self.api.db.execute('DELETE FROM analytics_event')
        phone, other, idle, dev, home = (str(uuid.uuid4()) for _ in range(5))
        event(phone, 'heritage_story_completed', platform='mobile', mode='brief')
        event(phone, 'heritage_story_completed', platform='mobile', mode='story')        # aynı kişi: bir sayılır
        event(phone, 'stamp', platform='mobile', stamp_type='onsite')
        event(other, 'knowledge_recalled', platform='mobile', correct=True)
        event(idle, 'page_view', platform='mobile')                                      # açmak yetmez
        event(idle, 'monument_view', platform='mobile')
        event(idle, 'knowledge_recalled', platform='mobile', correct=False)              # yanlış yanıt nitelikli değil
        event(idle, 'stamp', platform='mobile', stamp_type='learning')                   # dijital mühür tek başına sayılmaz
        event(dev, 'heritage_story_completed', platform='mobile', dev=True)              # geliştirici denemesi
        event(home, 'read_depth', depth=80)                                              # web: metnin sonuna yaklaştı
        event(str(uuid.uuid4()), 'route_completed', demo=True, platform='mobile')        # deneme verisi
        week = I.wmhe(self.api.db)[-1]
        self.assertEqual((week['explorers'], week['mobile']), (3, 2))
        self.assertEqual((week['stories'], week['onsite'], week['recalled'], week['routes']), (2, 1, 1, 0))
        self.assertEqual(I.wmhe(self.api.db, demo=True)[-1]['routes'], 1)
        self.api.db.execute('DELETE FROM analytics_event')

    def test_cohorts_count_only_meaningful_returns_and_only_full_days(self):
        import json
        def event(sid, type_, days_ago, **props):
            self.api.db.execute("""INSERT INTO analytics_event(session_id, type, props, at)
                                   VALUES (%(s)s, %(t)s, %(p)s::jsonb, now() - make_interval(days => %(d)s::int))""",
                                dict(s=sid, t=type_, p=json.dumps(props), d=days_ago))
        self.api.db.execute('DELETE FROM analytics_event')
        stays, opens_only, dev, fresh = (str(uuid.uuid4()) for _ in range(4))
        event(stays, 'monument_view', 40, platform='mobile')
        event(stays, 'heritage_story_completed', 40, platform='mobile')                 # ilk 24 saatte: aktive
        event(stays, 'knowledge_recalled', 39, platform='mobile', correct=True)         # D1
        event(stays, 'stamp', 33, platform='mobile', stamp_type='onsite')               # D7
        event(stays, 'route_completed', 10, platform='mobile')                          # D30
        event(opens_only, 'monument_view', 40, platform='mobile')
        event(opens_only, 'monument_view', 39, platform='mobile')                       # yalnızca açtı: dönüş sayılmaz
        event(opens_only, 'stamp', 33, platform='mobile', stamp_type='learning')        # dijital mühür dönüş değil
        event(dev, 'heritage_story_completed', 40, platform='mobile', dev=True)         # geliştirici denemesi
        rows = I.cohorts(self.api.db)
        self.assertEqual(sum(r['people'] for r in rows), 2)
        old = next(r for r in rows if r['people'])
        self.assertEqual((old['people'], old['activated'], old['d1_of'], old['d1'], old['d7_of'], old['d7'], old['d30_of'], old['d30']), (2, 1, 2, 1, 2, 1, 2, 1))
        self.assertEqual((old['weeks_of'], old['two_of_four']), (2, 1))
        # dün gelen için D7 ve D30'un paydası yok: oran şişmez
        event(fresh, 'heritage_story_completed', 1, platform='mobile')
        new = I.cohorts(self.api.db)[-1]
        self.assertEqual((new['people'], new['d7_of'], new['d30_of'], new['weeks_of']), (1, 0, 0, 0))
        self.api.db.execute('DELETE FROM analytics_event')

    def test_pilot_numbers_leave_out_test_events(self):
        import json
        self.api.db.execute('DELETE FROM analytics_event')
        sid, dev = str(uuid.uuid4()), str(uuid.uuid4())
        for type_, props, who in (('heritage_story_started', {}, sid), ('heritage_story_started', {}, sid), ('heritage_story_completed', {}, sid),
                                  ('knowledge_recalled', dict(repetition_step=2, correct=True), sid), ('knowledge_recalled', dict(repetition_step=3, correct=False), sid),
                                  ('knowledge_recalled', dict(repetition_step=0, correct=True), sid), ('share_initiated', {}, sid), ('notification_opt_out', {}, sid),
                                  ('heritage_story_started', dict(dev=True), dev)):
            self.api.db.execute("INSERT INTO analytics_event(session_id, type, props) VALUES (%(s)s, %(t)s, %(p)s::jsonb)", dict(s=who, t=type_, p=json.dumps(props)))
        k = I.pilot_kpis(self.api.db)
        self.assertEqual((k['stories_started'], k['stories_completed'], k['long_recalls'], k['long_recalls_right'], k['shares'], k['notification_opt_outs'], k['active_people']), (2, 1, 2, 1, 1, 1, 1))
        self.api.db.execute('DELETE FROM analytics_event')

    def test_dashboard_shape(self):
        with redirect_stdout(io.StringIO()):
            self.D.generate(self.api.db, sessions=120, days=30, seed=3, write=True)
        d = self.c.get('/api/admin/insights', headers=NES).json()
        self.assertEqual(d['totals']['visitors'], 120)
        self.assertEqual(sum(s['visitors'] for s in d['segments']), 120)
        self.assertEqual({s['id'] for s in d['segments']}, {k for k, _, _ in I.SEGMENTS})
        self.assertTrue(d['monuments'] and d['modes'] and d['daily'])
        f = d['funnel']
        self.assertTrue(f['visited'] >= f['viewed'] >= f['read'] >= 0)
        self.assertTrue(any(q['no_info'] for q in d['questions']))
        self.assertIn('kervansaray', [s['q'] for s in d['searches']])
        self.assertTrue(any(s['kind'] == 'search' for s in d['suggestions']))   # sonuçsuz arama önerisi
        for kind in ('question', 'search'):                                    # biri ötekileri dışarı itmez
            self.assertLessEqual(sum(s['kind'] == kind for s in d['suggestions']), I.PER_KIND)
        self.assertIn('effective', d['settings'])


if __name__ == '__main__':
    unittest.main()
