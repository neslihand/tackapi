"""İngilizce ad onarımı (fix_names_en.py): kesik adlar Türkçe addan kurulur, diğerlerinde yalnızca yazım düzelir.
Veritabanı gerekmez; örnekler gerçek kayıtlardan."""
import unittest
import _testdb  # noqa: F401  (pipeline/ klasörünü yola ekler)
import fix_names_en as F


class TruncatedNames(unittest.TestCase):
    def test_rebuilt_from_the_turkish_name(self):
        self.assertEqual(F.fixed('Mahmut Çelebi Camii (Yakup Ecezade Mescidi)', 'Ecezade Masjid)'),
                         ('Mahmut Çelebi Mosque (Yakup Ecezade Masjid)', 'kesik'))
        self.assertEqual(F.fixed('Vakıf İş Hanı (Vakıflar Bölge Müdürlüğü Hizmet Binası)', 'Directorate of Foundations Service Building)')[0],
                         'Vakıf İş Han (Regional Directorate of Foundations Service Building)')

    def test_proper_names_are_not_translated(self):
        # 'Cami-i Atik' is a name: only the standalone 'Camii' becomes 'Mosque'.
        self.assertEqual(F.rebuild('Cami-i Atik (Eski Hacı Ali Mağribî Halil Ağa Camii)'), 'Cami-i Atik (Eski Hacı Ali Mağribî Halil Ağa Mosque)')


class Spelling(unittest.TestCase):
    def test_turkish_letters_and_capitals_come_back(self):
        self.assertEqual(F.fixed('Kasım Efendi (Yenice) Camii', 'Kasim Efendi (yenice) Mosque'), ('Kasım Efendi (Yenice) Mosque', 'yazım'))
        self.assertEqual(F.fixed('Laz-Hacı Hafız (Lazlar) Camii', 'Laz-haci Hafiz (lazlar) Mosque')[0], 'Laz-Hacı Hafız (Lazlar) Mosque')

    def test_translation_is_kept(self):
        # English words stay; the Turkish ones get their spelling, a lower-case word after '(' its capital.
        self.assertEqual(F.fixed('Balıkpazarı (Yeni) Camii', 'Balikpazari (yeni) Mosque (panagia Pazariotissa)')[0],
                         'Balıkpazarı (Yeni) Mosque (Panagia Pazariotissa)')
        self.assertEqual(F.fixed('Karyer-Şeyh Hıdır Türbesi', 'Karyer-sheikh Hidir Tomb')[0], 'Karyer-Sheikh Hıdır Tomb')

    def test_double_spelling_and_stray_spaces(self):
        self.assertEqual(F.fixed('Yeşil (İmaret-Çandarlı Halil Paşa) Camii', 'Yeşil/green (imaret-çandarlı Halil Paşa) Mosque')[0],
                         'Yeşil (İmaret-Çandarlı Halil Paşa) Mosque')
        self.assertEqual(F.fixed('Hançerli Fatma Sultan (Yıldırım-Yukarı İmaret) Camii', 'Hançerli Fatma Sultan (yildirim-yukari İmaret ) Mosque')[0],
                         'Hançerli Fatma Sultan (Yıldırım-Yukarı İmaret) Mosque')

    def test_good_names_and_a_second_run_change_nothing(self):
        self.assertEqual(F.fixed('Muradiye Camii', 'Muradiye Mosque'), (None, None))
        self.assertEqual(F.fixed('Kasım Efendi (Yenice) Camii', 'Kasım Efendi (Yenice) Mosque'), (None, None))
        self.assertEqual(F.fixed('Town Hall', None), (None, None))
        # The Persian '-i' of a name stays lower case, also when the name is fixed a second time.
        tr = 'Cami-i Atik (Eski Hacı Ali Mağribî Halil Ağa Camii)'
        self.assertEqual(F.fixed(tr, F.rebuild(tr)), (None, None))


if __name__ == '__main__':
    unittest.main()
