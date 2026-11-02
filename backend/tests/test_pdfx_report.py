"""PDF'ten çıkarım, Adım 6: doğrulama raporu (veritabanı gerekmez; geçici klasörde sentetik dosyalarla)."""
import os, json, shutil, tempfile, unittest
from unittest import mock
from _testdb import ROOT  # noqa: F401  (pipeline klasörünü sys.path'e ekler)
from pdfx import report as R
from pdfx.gold import norm, shingles

TEXT_A = ('Cami Osmangazi ilçesinde yer almaktadır ve kesme taştan yapılmıştır. Son cemaat yeri üç bölümlüdür ve '
          'kubbelerle örtülüdür. Minaresi tek şerefelidir.')
TEXT_H = 'Hazirede on iki mezar taşı bulunmaktadır ve en eskisi on altıncı yüzyıla aittir.'


def work(id_, paras, pages=(10, 11), level='monument', kind=None, parent=None, flags=()):
    return dict(id=id_, level=level, kind=kind or level, origin='heading' if kind == 'hazire' else 'toc',
                parent=parent, name_tr=id_, name_en=id_, pages=list(pages), flags=list(flags),
                paras_tr=[dict(text=p, kind='body', page=pages[0]) for p in paras],
                paras_en=[dict(text='English text of the work.', kind='body', page=pages[0])])


class ReportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        d = os.path.join(self.tmp, 'bursa-1')
        os.makedirs(d)
        toc = [dict(id='a', level='monument'), dict(id='b', level='monument'), dict(id='c', level='complex'),
               dict(id='p', level='monument')]
        anchors = dict(records=[dict(id='a', flags=[]), dict(id='b', flags=['anchor_guess']), dict(id='c', flags=[]),
                                dict(id='p', flags=[])], untracked=[])
        works = dict(works=[work('a', [TEXT_A]), work('a-hz1', [TEXT_H], kind='hazire', parent='a'),
                            work('b', ['Kısa metin burada duruyor ve devam ediyor.'], pages=(30, 30)),
                            work('c', [], level='complex', flags=['empty_tr', 'empty_en']),
                            work('p', [TEXT_A], pages=(50, 51))])
        for name, data in (('toc.json', toc), ('anchors.json', anchors), ('works.json', works)):
            with open(os.path.join(d, name), 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
        self.queue = dict(pilot_check='db', cities=dict(bursa=[
            dict(book='bursa-1', id='a', status='waiting', db_slug='old-hazire', db_match='fuzzy0.86'),
            dict(book='bursa-1', id='b', status='waiting', db_slug=None),
            dict(book='bursa-1', id='c', status='waiting', db_slug=None),
            dict(book='bursa-1', id='p', status='pilot_locked', db_slug='pilot-slug')]))
        with open(os.path.join(self.tmp, 'queue.json'), 'w', encoding='utf-8') as f:
            json.dump(self.queue, f)
        self.patches = [mock.patch.object(R, 'OUT', self.tmp),
                        mock.patch.object(R, 'out_dir', lambda b: os.path.join(self.tmp, b)),
                        mock.patch.object(R, 'old_texts', lambda: {'old-hazire': ('eski', [TEXT_H])}),
                        mock.patch.object(R, 'old_records', lambda: {'bursa-1': [
                            dict(slug='old-camii', p0=10, p1=10, sh=shingles(norm(TEXT_A))),
                            dict(slug='old-hazire', p0=11, p1=11, sh=shingles(norm(TEXT_H)))]})]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        shutil.rmtree(self.tmp)

    def rows(self, mark=False):
        return {r['id']: r for r in R.run(['bursa-1'], mark=mark, verbose=False)}

    def test_statuses_and_flags(self):
        rows = self.rows()
        self.assertEqual(rows['b']['status'], 'engel')                      # başlık bulunamadı
        self.assertEqual(rows['c']['status'], 'tamam')                      # girişi olmayan külliye bilgi sayılır
        self.assertIn('complex_no_intro', rows['c']['flags'])
        self.assertIn('pilot_locked', rows['p']['flags'])
        self.assertEqual(rows['p']['old_parts'], '')                        # pilotta metin denetimi yapılmaz

    def test_wrong_match_is_suspect_and_suggests_text_owner(self):
        a = self.rows()['a']
        self.assertIn('changed_vs_db', a['flags'])
        self.assertIn('match_suspect', a['flags'])          # kuyruk hazire kaydına bağlamış, metin cami kaydında
        self.assertEqual(a['suggest_db_slug'], 'old-camii')
        self.assertEqual(a['status'], 'kontrol')

    def test_hazire_child_finds_its_old_record(self):
        h = self.rows()['a-hz1']
        self.assertEqual((h['queue'], h['suggest_db_slug']), ('yeni', ''))  # old-hazire kuyrukta a'ya bağlı: boşta değil
        self.assertTrue(h['old_parts'].startswith('old-hazire'))

    def test_mark_failed_and_clear(self):
        self.rows(mark=True)
        with open(os.path.join(self.tmp, 'queue.json'), encoding='utf-8') as f:
            q = R.queue_index(json.load(f))
        self.assertEqual((q[('bursa-1', 'b')]['status'], q[('bursa-1', 'b')]['failed_by']), ('failed', 'report'))
        self.assertEqual(q[('bursa-1', 'p')]['status'], 'pilot_locked')
        # engel kalkınca rapor kendi koyduğu failed'ı geri alır
        with open(os.path.join(self.tmp, 'bursa-1', 'anchors.json'), encoding='utf-8') as f:
            an = json.load(f)
        an['records'][1]['flags'] = []
        with open(os.path.join(self.tmp, 'bursa-1', 'anchors.json'), 'w', encoding='utf-8') as f:
            json.dump(an, f)
        self.rows(mark=True)
        with open(os.path.join(self.tmp, 'queue.json'), encoding='utf-8') as f:
            q = R.queue_index(json.load(f))
        self.assertEqual(q[('bursa-1', 'b')]['status'], 'waiting')

    def test_decisions_from_overrides(self):
        """hazire eşlemesi ve emekli kayıt: öneri ve absorbs_old kalkar."""
        ov = dict(set=dict(a=dict(_was='a', db_slug='old-camii')), hazire={'a-hz1': dict(_was='a-hz1', db_slug='old-hazire')},
                  retire={'old-x': 'metni a'})
        with open(os.path.join(self.tmp, 'bursa-1', 'toc_overrides.json'), 'w', encoding='utf-8') as f:
            json.dump(ov, f)
        self.queue['cities']['bursa'][0]['db_slug'] = 'old-camii'      # cityqueue override'ı uygulamış gibi
        with open(os.path.join(self.tmp, 'queue.json'), 'w', encoding='utf-8') as f:
            json.dump(self.queue, f)
        rows = self.rows()
        self.assertNotIn('match_suspect', rows['a']['flags'])
        self.assertEqual((rows['a-hz1']['db_slug'], rows['a-hz1']['match'], rows['a-hz1']['suggest_db_slug']),
                         ('old-hazire', 'override', ''))
        self.assertEqual(rows['a-hz1']['vs_db'], '1.000')
        self.assertEqual(R.decisions(['bursa-1'])[1], {'old-x'})

    def test_toc_count_mismatch_blocks(self):
        with open(os.path.join(self.tmp, 'bursa-1', 'toc.json'), 'w', encoding='utf-8') as f:
            json.dump([dict(id='a', level='monument')], f)
        self.assertTrue(all(r['status'] == 'engel' for r in self.rows().values()))


if __name__ == '__main__':
    unittest.main()
