"""Kitaba özgü yapılandırma.

Satır numaraları 1 tabanlıdır (ham .txt dosyasındaki satır no). Bölüm aralıkları
elle, metin incelenerek belirlendi; bu, sezgisel tespitten daha güvenilir ve
tekrar üretilebilir. Yeni bir kitap eklenirken yalnızca bu dosya güncellenir.

part türleri:
  skip          – künye, takdim, içindekiler (kullanılmaz)
  intro         – kitabın genel girişi / kategori tanıtımları (bağlam olarak kullanılır)
  city_history  – şehir tarihi
  entries       – eser kayıtları (otomatik başlık tespiti)
  subsections   – tek bir külliyenin alt yapıları; TR ve EN alt başlıkları ayrı akışta
  conclusion    – değerlendirme / sonuç
  glossary      – terimler sözlüğü
  bibliography  – kaynakça
  parcel_list   – Hatay'daki bölüm sonu ada/parsel listeleri (ilçe bilgisi için ayrıştırılır)
"""

BOOKS = {
    'bursa-1': dict(
        file='bursa-envanteri-cilt-1.txt', city='bursa', volume=1,
        title='Bursa Vakıf Eserleri I. Cilt', published='2026-04-01', heading_pos='after',
        isbn='978-625-99247-6-2', isbn_set='978-625-99247-5-5',
        en_quality='usable',
        authors=['Prof. Dr. Hasan Basri Öcalan', 'Dr. Öğr. Üyesi Doğan Yavaş',
                 'Dr. Öğr. Üyesi Sezai Sevim', 'Fikret Alkan', 'Aziz Elbas'],
        editor='Emine Şule Demirtaş', translator='Ahmet Tunç Demirtaş',
        parts=[
            ('skip', 1, 1137, None),
            ('intro', 1138, 1813, 'Giriş'),
            ('city_history', 1814, 2456, 'Bursa Tarihi'),
            ('entries', 2457, 15677, None),
        ]),
    'bursa-2': dict(
        file='bursa-envanteri-cilt-2.txt', city='bursa', volume=2,
        title='Bursa Vakıf Eserleri II. Cilt', en_quality='usable',
        parts=[
            ('skip', 1, 772, None),
            ('entries', 773, 16022, None),
        ]),
    'bursa-3': dict(
        file='bursa-envanteri-cilt-3.txt', city='bursa', volume=3,
        title='Bursa Vakıf Eserleri III. Cilt', en_quality='usable',
        parts=[
            ('skip', 1, 711, None),
            ('entries', 712, 10962, None),
            ('bibliography', 10963, 11910, 'Kaynakça'),
        ]),
    'konya-1': dict(
        file='konya_envanteri_1_cilt.txt', city='konya', volume=1,
        title='Konya Vakıf Eserleri I. Cilt', en_quality='unusable', heading_pos='before', toc_lines=(201, 905),
        parts=[
            ('skip', 1, 905, None),
            ('city_history', 906, 1825, 'Konya Tarihi'),
            ('subsections', 1826, 2851, 'Mevlâna Külliyesi'),
            ('entries', 2852, 15357, None),
        ]),
    'konya-2': dict(
        file='konya_envanteri_2_cilt.txt', city='konya', volume=2,
        title='Konya Vakıf Eserleri II. Cilt', published='2024-11-01',
        isbn='978-625-99247-4-8', isbn_set='978-625-99247-2-4',
        en_quality='unusable',
        authors=['Prof. Dr. Ali Boran', 'Prof. Dr. Hasan Bahar', 'Prof. Dr. Tolga Bozkurt',
                 'Doç. Dr. Razan Aykaç', 'Dr. Erdal Elmas', 'Dr. Naci Bakırcı',
                 'Dr. Mehmet Mutlu', 'Burhan Öztürk', 'Sema Şentürk'],
        editor='Emine Şule Demirtaş', translator='Ahmet Tunç Demirtaş',
        parts=[
            ('skip', 1, 494, None),
            ('entries', 495, 7983, None),
            ('conclusion', 7984, 9402, 'Değerlendirme ve Sonuç'),
            ('bibliography', 9403, 10459, 'Kaynakça'),
        ]),
    'hatay-1': dict(
        file='hatay-vakif-eserleri.txt', city='hatay', volume=1,
        title='Hatay İli Vakıf Eserleri', en_quality='needs_review', toc_lines=(205, 305), heading_pos='after', boundary_mode='heading',
        authors=['Halil Agah', 'Prof. Dr. Nusret Çam', 'Berica Nevin Berberoğlu Şen'],
        editor='Özlem Çelik', translator='Zeynep Burçak Tarlan',
        parts=[
            ('skip', 1, 1246, None),
            ('city_history', 1247, 1375, 'Hatay İlinin Konumu ve Tarihçesi'),
            ('entries', 1376, 3305, None),
            ('parcel_list', 3306, 3338, None),
            ('entries', 3339, 6107, None),
            ('parcel_list', 6108, 6648, None),
            ('entries', 6649, 7274, None),
            ('parcel_list', 7275, 7445, None),
            ('entries', 7446, 7822, None),
            ('parcel_list', 7823, 7884, None),
            ('entries', 7885, 8314, None),
            ('parcel_list', 8315, 8426, None),
            ('entries', 8427, 8595, None),
            ('parcel_list', 8596, 8657, None),
            ('glossary', 8658, 8863, 'Terimler Sözlüğü'),
            ('bibliography', 8864, 8969, 'Kaynakça'),
        ]),
}

# Hatay kitabındaki tasarım notları (metne karışmış), atılır
JUNK_LINES = {'LİSTEDE TURBE BURDA MAKAM', 'LİSTEDE TURBE BURDA ZIYARET'}

CITY = {
    'bursa': dict(name_tr='Bursa', name_en='Bursa', historic_names=['Prusa', 'Prusa ad Olympum', 'Hüdavendigâr'], lat=40.1828, lon=29.0667),
    'konya': dict(name_tr='Konya', name_en='Konya', historic_names=['Ikonion', 'Iconium', 'Darülmülk'], lat=37.8746, lon=32.4932),
    'hatay': dict(name_tr='Hatay', name_en='Hatay', historic_names=['Antiokheia', 'Antakya', 'Antioch'], lat=36.2021, lon=36.1600),
}

# İlçe adları (dikey/boşluklu harf başlıklarını doğrulamak için)
DISTRICTS = {
    'bursa': ['Osmangazi', 'Yıldırım', 'Nilüfer', 'Gemlik', 'İnegöl', 'İznik', 'Karacabey', 'Keles', 'Kestel',
              'Mudanya', 'Mustafakemalpaşa', 'Orhaneli', 'Orhangazi', 'Yenişehir', 'Büyükorhan', 'Gürsu', 'Harmancık'],
    'konya': ['Meram', 'Karatay', 'Selçuklu', 'Ahırlı', 'Akören', 'Akşehir', 'Altınekin', 'Beyşehir', 'Bozkır',
              'Cihanbeyli', 'Çeltik', 'Çumra', 'Derbent', 'Derebucak', 'Doğanhisar', 'Emirgazi', 'Ereğli', 'Güneysınır',
              'Hadim', 'Halkapınar', 'Hüyük', 'Ilgın', 'Kadınhanı', 'Karapınar', 'Kulu', 'Sarayönü', 'Seydişehir',
              'Taşkent', 'Tuzlukçu', 'Yalıhüyük', 'Yunak'],
    'hatay': ['Antakya', 'Defne', 'İskenderun', 'Arsuz', 'Samandağ', 'Reyhanlı', 'Kırıkhan', 'Altınözü',
              'Yayladağı', 'Belen', 'Dörtyol', 'Erzin', 'Payas', 'Hassa', 'Kumlu'],
}
