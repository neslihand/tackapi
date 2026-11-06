"""Editörün yazdığı mobil içerik: rota süresi, üç detay, Haftanın Keşfi, soru kuyruğu, fotoğraf izni ve modül düğmeleri."""
import unittest
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from _testdb import needs_db, fresh_db, ADMINS
import details, questions, rag, weekly

NES = {'Authorization': f"Bearer {ADMINS['neslihan']}"}
CAMI = 'bursa-osmangazi-muradiye-camii'
TURBE = 'bursa-yildirim-ornek-turbesi'
TASLAK = 'bursa-osmangazi-taslak-cesme'
NOW = lambda: datetime.now(ZoneInfo('Europe/Istanbul')).date()
MONDAY = lambda weeks=0: (NOW() - timedelta(days=NOW().weekday()) + timedelta(weeks=weeks)).isoformat()
SOURCE = 'Bursa Vakıf Eserleri I, s. 77'
LONG = 'Kitapta yazan bir bilgiye dayanan yeterince uzun bir metin.'


class RulesTest(unittest.TestCase):
    def test_same_question_differently_typed_is_one(self):
        self.assertEqual(questions.normalize('  Kapısı   NE zaman yapıldı??'), questions.normalize('kapısı ne zaman yapıldı'))
        self.assertEqual(questions.normalize('KAPISI'), questions.normalize('kapısı'))
        self.assertNotEqual(questions.normalize('Kapısı ne zaman yapıldı?'), questions.normalize('Avlusu ne zaman yapıldı?'))

    def test_an_answer_needs_its_source_and_a_refusal_its_reason(self):
        self.assertTrue(questions.review_issues('answered', LONG, None, None))
        self.assertTrue(questions.review_issues('answered', 'kısa', SOURCE, None))
        self.assertEqual(questions.review_issues('answered', LONG, SOURCE, None), [])
        self.assertTrue(questions.review_issues('rejected', None, None, ' '))
        self.assertEqual(questions.review_issues('rejected', None, None, 'Eserle ilgisi yok.'), [])
        self.assertEqual(questions.review_issues('unresolved', None, None, None), [])

    def test_detail_and_weekly_need_a_source(self):
        self.assertTrue(details.issues(LONG, ''))
        self.assertTrue(details.issues('kısa', SOURCE))
        self.assertEqual(details.issues(LONG, SOURCE), [])
        self.assertTrue(weekly.issues('Bu hafta bir kapı', LONG, ' '))
        self.assertEqual(weekly.issues('Bu hafta bir kapı', LONG, SOURCE), [])

    def test_no_info_answer_is_recognised(self):
        self.assertTrue(rag.says_no_info(rag.NO_INFO['tr']))
        self.assertTrue(rag.says_no_info(rag.NO_INFO['en']))
        self.assertFalse(rag.says_no_info('Eser 1426 yılında yapılmıştır.'))
        self.assertFalse(rag.says_no_info(None))


@needs_db
class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        fresh_db()
        from fastapi.testclient import TestClient
        import api
        cls.api, cls.c = api, TestClient(api.app)

    def setUp(self):
        self.db = self.api.db
        for lim in self.api.visitor_router.limiters:
            lim.hits.clear()
        self.db.execute("UPDATE monument SET pilot = slug = ANY(%(p)s::text[])", dict(p=[CAMI, TURBE, TASLAK]))


class RouteDurationTest(Base):
    def setUp(self):
        super().setUp()
        self.db.execute('DELETE FROM route')
        self.db.execute('UPDATE monument SET lat = NULL, lon = NULL, geo_checked = false')

    def route(self, **body):
        rid = self.c.post('/api/admin/routes', headers=NES, json=dict(title='Muradiye yürüyüşü')).json()['id']
        self.assertEqual(self.c.put(f'/api/admin/routes/{rid}/stops', headers=NES, json=dict(slugs=[CAMI, TURBE])).status_code, 200)
        return rid

    def place(self, *slugs):
        self.db.execute('UPDATE monument SET lat = 40.19, lon = 29.05, geo_checked = true WHERE slug = ANY(%(s)s::text[])', dict(s=list(slugs)))

    def test_a_timed_route_needs_checked_stops(self):
        rid = self.route()
        self.assertEqual(self.c.patch(f'/api/admin/routes/{rid}', headers=NES, json=dict(minutes=45)).status_code, 200)        # taslakta serbest
        out = self.c.patch(f'/api/admin/routes/{rid}', headers=NES, json=dict(published=True))
        self.assertEqual(out.status_code, 422)
        self.assertIn('doğrulanmadı', out.json()['detail'])
        self.place(CAMI)
        self.assertEqual(self.c.patch(f'/api/admin/routes/{rid}', headers=NES, json=dict(published=True)).status_code, 422)     # biri eksik
        self.place(CAMI, TURBE)
        self.assertEqual(self.c.patch(f'/api/admin/routes/{rid}', headers=NES, json=dict(published=True, access_note='Avluya basamakla çıkılır.')).status_code, 200)
        shown = self.c.get('/api/routes', params=dict(auto='false')).json()[0]
        self.assertEqual((shown['minutes'], shown['access_note']), (45, 'Avluya basamakla çıkılır.'))

    def test_an_unplaced_stop_cannot_join_a_published_timed_route(self):
        self.place(CAMI, TURBE)
        rid = self.route()
        self.c.patch(f'/api/admin/routes/{rid}', headers=NES, json=dict(minutes=20, published=True))
        self.db.execute('UPDATE monument SET geo_checked = false WHERE slug = %(s)s', dict(s=TURBE))
        self.assertEqual(self.c.put(f'/api/admin/routes/{rid}/stops', headers=NES, json=dict(slugs=[CAMI, TURBE])).status_code, 422)
        self.assertEqual(self.c.put(f'/api/admin/routes/{rid}/stops', headers=NES, json=dict(slugs=[CAMI])).status_code, 422)   # tek durak

    def test_only_the_planned_durations(self):
        rid = self.route()
        self.assertEqual(self.c.patch(f'/api/admin/routes/{rid}', headers=NES, json=dict(minutes=30)).status_code, 422)
        self.assertEqual(self.c.patch(f'/api/admin/routes/{rid}', headers=NES, json=dict(minutes=360)).status_code, 200)

    def test_a_route_without_duration_stays_a_themed_list(self):
        rid = self.route()
        self.assertEqual(self.c.patch(f'/api/admin/routes/{rid}', headers=NES, json=dict(published=True)).status_code, 200)    # konum aranmaz
        self.assertIsNone(self.c.get('/api/routes', params=dict(auto='false')).json()[0]['minutes'])


class WorkDetailTest(Base):
    def setUp(self):
        super().setUp()
        self.db.execute('DELETE FROM work_detail')

    def save(self, kind='why', **over):
        return self.c.put(f'/api/admin/monuments/{CAMI}/details/{kind}', headers=NES, json={**dict(body_tr=LONG, source=SOURCE, published=True), **over})

    def shown(self, lang='tr'):
        return self.c.get(f'/api/monuments/{CAMI}', params=dict(lang=lang)).json()['details']

    def test_a_detail_needs_a_source_and_the_panel(self):
        self.assertEqual(self.save(source='').status_code, 422)
        self.assertEqual(self.c.put(f'/api/admin/monuments/{CAMI}/details/why', json=dict(body_tr=LONG, source=SOURCE)).status_code, 401)
        self.assertEqual(self.c.put(f'/api/admin/monuments/{CAMI}/details/baska', headers=NES, json=dict(body_tr=LONG, source=SOURCE)).status_code, 422)
        self.assertEqual(self.shown(), [])

    def test_only_published_details_reach_the_visitor_in_order(self):
        self.save('today'); self.save('why'); self.save('look', published=False)
        self.assertEqual([d['kind'] for d in self.shown()], ['why', 'today'])
        self.assertEqual(self.shown()[0]['source'], SOURCE)
        self.save('look')
        self.assertEqual([d['kind'] for d in self.shown()], ['why', 'look', 'today'])
        self.assertEqual(self.c.delete(f'/api/admin/monuments/{CAMI}/details/look', headers=NES).status_code, 204)
        self.assertEqual([d['kind'] for d in self.shown()], ['why', 'today'])

    def test_english_falls_back_to_the_turkish_text(self):
        self.save('why'); self.save('look', body_en='A long enough English text about the door.')
        self.assertEqual([d['body'] for d in self.shown('en')], [LONG, 'A long enough English text about the door.'])

    def test_a_saved_pack_notices_the_new_detail(self):
        path = f'/api/routes/sehir-bursa/manifest'
        before = self.c.get(path, params=dict(pilot='true')).json()['version']
        self.save()
        self.assertNotEqual(before, self.c.get(path, params=dict(pilot='true')).json()['version'])


class WeeklyTest(Base):
    def setUp(self):
        super().setUp()
        self.db.execute('DELETE FROM weekly_discovery')

    def make(self, **over):
        return self.c.post('/api/admin/weekly', headers=NES, json={**dict(week=NOW().isoformat(), monument=CAMI, hook='Bu kapı neden dar?', detail=LONG, source=SOURCE, published=True), **over})

    def test_this_weeks_only_and_any_day_means_its_monday(self):
        self.assertEqual(self.c.get('/api/weekly').json(), dict(available=False))
        made = self.make()
        self.assertEqual(made.status_code, 201, made.text)
        self.assertEqual(made.json()['week'], MONDAY())
        now = self.c.get('/api/weekly').json()
        self.assertEqual((now['available'], now['slug'], now['source'], now['route']), (True, CAMI, SOURCE, None))
        self.assertEqual(self.make().status_code, 409)                                                # haftaya tek kayıt
        self.assertEqual(self.make(week=MONDAY(1)).status_code, 201)
        self.assertEqual(self.c.get('/api/weekly').json()['week'], MONDAY())                          # gelecek hafta açılmaz

    def test_draft_and_removed_work_are_not_shown(self):
        wid = self.make(published=False).json()['id']
        self.assertFalse(self.c.get('/api/weekly').json()['available'])
        self.assertEqual(self.c.patch(f'/api/admin/weekly/{wid}', headers=NES, json=dict(published=True)).status_code, 200)
        self.assertTrue(self.c.get('/api/weekly').json()['available'])
        self.db.execute("UPDATE monument SET review_status = 'draft' WHERE slug = %(s)s", dict(s=CAMI))
        try:
            self.assertFalse(self.c.get('/api/weekly').json()['available'])
        finally:
            self.db.execute("UPDATE monument SET review_status = 'published' WHERE slug = %(s)s", dict(s=CAMI))

    def test_publishing_needs_a_visible_work_and_a_real_route(self):
        self.assertEqual(self.make(source='').status_code, 422)
        self.assertEqual(self.make(monument=TASLAK).status_code, 422)                                 # yayında değil
        self.assertEqual(self.make(monument=TASLAK, published=False).status_code, 201)                # taslak olarak yazılır
        self.assertEqual(self.make(week=MONDAY(1), route='yok').status_code, 422)
        self.assertEqual(self.make(week=MONDAY(1), route='sehir-bursa').json()['route'], 'sehir-bursa')
        self.db.execute('UPDATE monument SET pilot = false WHERE slug = %(s)s', dict(s=CAMI))
        self.assertEqual(self.make(week=MONDAY(2)).status_code, 422)                                  # uygulamada görünmezdi

    def test_the_panel_only(self):
        self.assertEqual(self.c.post('/api/admin/weekly', json=dict(week=NOW().isoformat(), monument=CAMI, hook='x' * 20, detail=LONG, source=SOURCE)).status_code, 401)


class QuestionsTest(Base):
    def setUp(self):
        super().setUp()
        self.db.execute('DELETE FROM question_ticket')
        self.db.execute('DELETE FROM user_session')
        self.db.execute("DELETE FROM app_user")

    def account(self, name):
        out = self.c.post('/api/auth/register', json=dict(email=f'{name}@ornek.com', password='gizli-sifre-1', consent=True, token=True))
        self.c.cookies.clear()                                       # testte oturum yalnızca Bearer ile taşınsın
        return {'Authorization': f"Bearer {out.json()['token']}"}

    def follow(self, who, question='Kapısının ustası kimdir?', slug=CAMI):
        return self.c.post(f'/api/monuments/{slug}/questions', headers=who, json=dict(question=question))

    def queue(self, status='open'):
        return self.c.get('/api/admin/questions', headers=NES, params=dict(status=status)).json()

    def test_following_needs_an_account_and_a_published_work(self):
        self.assertEqual(self.c.post(f'/api/monuments/{CAMI}/questions', json=dict(question='Kapısının ustası kim?')).status_code, 401)
        ali = self.account('ali')
        self.assertEqual(self.follow(ali, slug=TASLAK).status_code, 404)
        self.assertEqual(self.follow(ali, question='kısa').status_code, 422)
        self.assertEqual(self.c.get('/api/admin/questions').status_code, 401)

    def test_asking_again_opens_nothing_new_and_two_people_are_one_row(self):
        ali, ayse = self.account('ali'), self.account('ayse')
        first = self.follow(ali).json()
        self.assertEqual((first['status'], first['unread']), ('submitted', False))
        self.assertEqual(self.follow(ali, question='  kapısının USTASI kimdir ').json()['id'], first['id'])
        self.follow(ayse)
        self.follow(ayse, question='Avlusu ne zaman yapıldı?')
        rows = self.queue()
        self.assertEqual(rows['total'], 2)
        self.assertEqual([r['followers'] for r in rows['items']], [2, 1])
        self.assertEqual({c['status']: c['n'] for c in rows['counts']}, {'submitted': 2})

    def test_the_answer_reaches_everyone_following_with_its_source(self):
        ali, ayse = self.account('ali'), self.account('ayse')
        qid = self.follow(ali).json()['id']
        self.follow(ayse)
        self.assertEqual(self.c.patch(f'/api/admin/questions/{qid}', headers=NES, json=dict(status='answered', answer=LONG)).status_code, 422)
        self.assertEqual(self.c.patch(f'/api/admin/questions/{qid}', headers=NES, json=dict(status='researching')).status_code, 200)
        self.assertEqual(self.queue()['items'][0]['status'], 'researching')
        done = self.c.patch(f'/api/admin/questions/{qid}', headers=NES, json=dict(status='answered', answer=LONG, answer_source=SOURCE))
        self.assertEqual(done.json()['followers'], 2)
        for who in (ali, ayse):
            mine = self.c.get('/api/me/questions', headers=who).json()[0]
            self.assertEqual((mine['status'], mine['answer'], mine['answer_source'], mine['unread']), ('answered', LONG, SOURCE, True))
        self.assertEqual(self.queue()['total'], 0)
        self.assertIsNotNone(self.queue('answered')['median_hours'])
        log = self.db.query("SELECT action, detail FROM admin_log WHERE action = 'question.answered' ORDER BY id DESC LIMIT 1")[0]
        self.assertEqual(log['detail']['followers'], 2)

    def test_seen_counts_once_and_a_new_answer_is_new_again(self):
        ali = self.account('ali')
        qid = self.follow(ali).json()['id']
        self.assertFalse(self.c.post(f'/api/me/questions/{qid}/seen', headers=ali).json()['first'])    # henüz kapanmadı
        self.c.patch(f'/api/admin/questions/{qid}', headers=NES, json=dict(status='answered', answer=LONG, answer_source=SOURCE))
        once = self.c.post(f'/api/me/questions/{qid}/seen', headers=ali).json()
        self.assertTrue(once['first'])
        self.assertIsNotNone(once['hours'])
        self.assertFalse(self.c.post(f'/api/me/questions/{qid}/seen', headers=ali).json()['first'])
        self.assertFalse(self.c.get('/api/me/questions', headers=ali).json()[0]['unread'])
        self.c.patch(f'/api/admin/questions/{qid}', headers=NES, json=dict(status='answered', answer=LONG + ' Düzeltildi.', answer_source=SOURCE))
        self.assertTrue(self.c.get('/api/me/questions', headers=ali).json()[0]['unread'])

    def test_a_refusal_tells_why_and_hides_any_old_answer(self):
        ali = self.account('ali')
        qid = self.follow(ali).json()['id']
        self.assertEqual(self.c.patch(f'/api/admin/questions/{qid}', headers=NES, json=dict(status='rejected')).status_code, 422)
        self.c.patch(f'/api/admin/questions/{qid}', headers=NES, json=dict(status='answered', answer=LONG, answer_source=SOURCE))
        self.c.patch(f'/api/admin/questions/{qid}', headers=NES, json=dict(status='rejected', note='Eserle ilgisi yok.'))
        mine = self.c.get('/api/me/questions', headers=ali).json()[0]
        self.assertEqual((mine['status'], mine['answer'], mine['note']), ('rejected', None, 'Eserle ilgisi yok.'))

    def test_someone_who_follows_late_gets_the_answer_at_once(self):
        ali, ayse = self.account('ali'), self.account('ayse')
        qid = self.follow(ali).json()['id']
        self.c.patch(f'/api/admin/questions/{qid}', headers=NES, json=dict(status='answered', answer=LONG, answer_source=SOURCE))
        late = self.follow(ayse).json()
        self.assertEqual((late['status'], late['answer'], late['unread']), ('answered', LONG, True))
        self.assertEqual(self.queue()['total'], 0)                                                     # kuyruğa yük bindirmez
        seen = self.c.post(f"/api/me/questions/{late['id']}/seen", headers=ayse).json()
        self.assertGreaterEqual(seen['hours'], 0)                                                      # cevap sorudan önce yazılmış olabilir

    def test_a_person_sees_and_removes_only_their_own(self):
        ali, ayse = self.account('ali'), self.account('ayse')
        qid = self.follow(ali).json()['id']
        self.assertEqual(self.c.get('/api/me/questions', headers=ayse).json(), [])
        self.assertFalse(self.c.post(f'/api/me/questions/{qid}/seen', headers=ayse).json()['first'])
        self.assertEqual(self.c.delete(f'/api/me/questions/{qid}', headers=ayse).status_code, 204)
        self.assertEqual(len(self.c.get('/api/me/questions', headers=ali).json()), 1)
        self.assertEqual(self.c.delete(f'/api/me/questions/{qid}', headers=ali).status_code, 204)
        self.assertEqual(self.c.get('/api/me/questions', headers=ali).json(), [])

    def test_deleting_the_account_deletes_the_questions(self):
        ali = self.account('ali')
        self.follow(ali)
        self.assertEqual(self.c.delete('/api/me', headers=ali).status_code, 204)
        self.assertEqual(self.db.query('SELECT count(*) AS n FROM question_ticket')[0]['n'], 0)

    def test_rate_limit(self):
        ali = self.account('ali')
        codes = [self.follow(ali, question=f'Kapısının ustası kimdir {i}?').status_code for i in range(11)]
        self.assertEqual(codes[:10], [201] * 10)
        self.assertEqual(codes[10], 429)

    def test_chat_says_when_the_sources_have_nothing(self):
        out = self.c.post('/api/chat', json=dict(slug=CAMI, question='Kapısının ustası kimdir?'))
        self.assertEqual(out.status_code, 200)
        self.assertIsInstance(out.json()['no_info'], bool)


class ImageReuseTest(Base):
    def setUp(self):
        super().setUp()
        self.db.execute('UPDATE image SET reuse_allowed = false')

    def pack(self):
        return self.c.get('/api/routes/sehir-bursa/manifest', params=dict(pilot='true')).json()

    def test_no_permission_no_photo_in_the_pack(self):
        pack = self.pack()
        self.assertEqual((pack['photos'], pack['photo_urls']), (0, []))
        self.assertGreater(pack['blocked_photos'], 0)
        self.assertFalse(any(i['reusable'] for i in self.c.get(f'/api/monuments/{CAMI}').json()['images']))

    def test_a_book_can_be_allowed_at_once_and_the_pack_notices(self):
        before = self.pack()
        book = self.db.query("SELECT b.slug FROM source_book b JOIN image i ON i.book_id = b.id JOIN monument m ON m.id = i.monument_id WHERE m.slug = %(s)s LIMIT 1", dict(s=CAMI))[0]['slug']
        self.assertEqual(self.c.put(f'/api/admin/books/{book}/reuse', json=dict(allowed=True)).status_code, 401)
        self.assertGreater(self.c.put(f'/api/admin/books/{book}/reuse', headers=NES, json=dict(allowed=True)).json()['updated'], 0)
        after = self.pack()
        self.assertGreater(after['photos'], 0)
        self.assertEqual(len(after['photo_urls']), after['photos'])
        self.assertNotEqual(before['version'], after['version'])
        self.assertTrue(any(i['reusable'] for i in self.c.get(f'/api/monuments/{CAMI}').json()['images']))
        self.assertEqual([b['images_reuse'] > 0 for b in self.c.get('/api/admin/books', headers=NES).json() if b['slug'] == book], [True])

    def test_a_single_photo(self):
        iid = self.db.query("SELECT i.id FROM image i JOIN monument m ON m.id = i.monument_id WHERE m.slug = %(s)s AND i.review_status = 'published' LIMIT 1", dict(s=CAMI))[0]['id']
        self.assertEqual(self.c.patch(f'/api/admin/images/{iid}', headers=NES, json=dict(reuse_allowed=True)).status_code, 200)
        self.assertEqual(self.pack()['photos'], 2)   # fotoğraf ve küçüğü


class PersonalTest(Base):
    def setUp(self):
        super().setUp()
        self.db.execute('DELETE FROM user_session')
        self.db.execute('DELETE FROM app_user')
        self.db.execute('DELETE FROM narration')

    def test_the_list_says_which_tellings_a_work_has(self):
        item = next(i for i in self.c.get('/api/monuments', params=dict(pilot='true')).json()['items'] if i['slug'] == CAMI)
        self.assertEqual((item['has_story'], item['has_child']), (False, False))
        mid = self.db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=CAMI))[0]['id']
        self.db.execute("INSERT INTO narration(monument_id, mode, lang, answer) VALUES (%(m)s, 'child', 'tr', 'Bir çocuk anlatımı.')", dict(m=mid))
        item = next(i for i in self.c.get('/api/monuments', params=dict(pilot='true')).json()['items'] if i['slug'] == CAMI)
        self.assertEqual((item['has_story'], item['has_child']), (False, True))

    def test_the_account_city_leads_the_suggestions_and_says_so(self):
        out = self.c.post('/api/auth/register', json=dict(email='ali@ornek.com', password='gizli-sifre-1', consent=True, token=True, home_city=' bursa '))
        self.c.cookies.clear()
        who = {'Authorization': f"Bearer {out.json()['token']}"}
        mine = self.c.get('/api/recommendations', headers=who).json()
        self.assertTrue(mine['personal'])
        self.assertTrue(mine['items'])
        self.assertTrue(all(i['reason'] == 'yaşadığın şehirde' for i in mine['items']), mine['items'])
        self.assertFalse(self.c.get('/api/recommendations').json()['personal'])                         # başkasına gitmez

    def test_a_stated_interest_counts_without_any_history(self):
        mid = self.db.query('SELECT id FROM monument WHERE slug = %(s)s', dict(s=CAMI))[0]['id']
        self.db.execute("INSERT INTO narration(monument_id, mode, lang, answer) VALUES (%(m)s, 'story', 'tr', 'Bir hikâye.')", dict(m=mid))
        out = self.c.post('/api/auth/register', json=dict(email='ayse@ornek.com', password='gizli-sifre-1', consent=True, token=True, interests=['stories']))
        self.c.cookies.clear()
        mine = self.c.get('/api/recommendations', headers={'Authorization': f"Bearer {out.json()['token']}"}).json()
        self.assertEqual(mine['items'][0]['slug'], CAMI)
        self.assertEqual(mine['items'][0]['reason'], 'hikâye anlatımını seviyorsun')

    def test_the_change_event_is_accepted(self):
        import uuid
        sid = str(uuid.uuid4())
        self.assertEqual(self.c.post('/api/events', json=dict(session_id=sid, events=[dict(type='preferences_changed', props=dict(fields=['homeCity']))])).status_code, 204)
        self.assertEqual(self.db.query('SELECT count(*) AS n FROM analytics_event WHERE session_id = %(s)s', dict(s=sid))[0]['n'], 1)


class AppFlagsTest(Base):
    def tearDown(self):
        self.db.execute("DELETE FROM site_setting WHERE key = 'app_flags'")

    def test_the_panel_can_close_a_module(self):
        self.assertEqual(self.c.get('/api/site-settings').json()['app_flags'], {})
        self.assertEqual(self.c.put('/api/admin/settings', headers=NES, json=dict(app_flags=dict(daily_hunt=False, three_details=True, pilot_only=False))).status_code, 200)
        self.assertEqual(self.c.get('/api/site-settings').json()['app_flags'], dict(daily_hunt=False, three_details=True, pilot_only=False))
        self.assertEqual(self.c.put('/api/admin/settings', headers=NES, json=dict(app_flags=dict(bilinmeyen=False))).status_code, 422)
        self.assertEqual(self.c.put('/api/admin/settings', json=dict(app_flags=dict(daily_hunt=True))).status_code, 401)
