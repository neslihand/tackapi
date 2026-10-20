-- Testler için küçük, uydurma örnek veri (gerçek kitap metni değildir).
INSERT INTO city(slug, name_tr, name_en) VALUES ('bursa', 'Bursa', 'Bursa'), ('konya', 'Konya', 'Konya');
INSERT INTO source_book(slug, title, city_id) VALUES ('bursa-1', 'Bursa Vakıf Eserleri I', 1), ('konya-1', 'Konya Vakıf Eserleri I', 2);
INSERT INTO period(slug, name_tr, name_en, years) VALUES
  ('osmanli', 'Osmanlı', 'Ottoman', '[1299,1923)'), ('selcuklu', 'Selçuklu', 'Seljuk', '[1077,1308)');
INSERT INTO period(slug, parent_id, name_tr, name_en, years) VALUES ('erken-osmanli', 1, 'Erken Osmanlı', 'Early Ottoman', '[1299,1453)');

INSERT INTO monument(slug, city_id, district, neighborhood, kind, name_tr, name_en, alt_names, period_id, built_years,
                     date_basis, book_id, pages, is_synthetic, summary_tr, summary_en, status) VALUES
  ('bursa-ii-murad-kulliyesi', 1, 'Osmangazi', NULL, 'complex', 'II. Murad Külliyesi', 'Complex of Murad II', NULL, 3, NULL,
   'unknown', 1, NULL, true, NULL, NULL, NULL),
  ('bursa-osmangazi-muradiye-camii', 1, 'Osmangazi', 'Muradiye', 'mosque', 'Muradiye Camii', 'Muradiye Mosque',
   '{"Hüdavendigâr Camii"}', 3, '[1425,1427)', 'inscription', 1, '[75,82)', false, 'Özet TR', 'Summary EN', 'standing'),
  ('bursa-osmangazi-muradiye-camii-haziresi', 1, 'Osmangazi', NULL, 'graveyard', 'Muradiye Camii Haziresi', NULL, NULL, 3,
   NULL, 'parent', 1, '[82,84)', false, NULL, NULL, 'standing'),
  ('bursa-yildirim-ornek-turbesi', 1, 'Yıldırım', NULL, 'tomb', 'Örnek Türbesi', NULL, NULL, 3, '[1400,1500)', 'style', 1,
   '[90,91)', false, NULL, NULL, 'ruined'),
  ('bursa-gizli-sentetik', 1, 'Yıldırım', NULL, 'mosque', 'Gizli Sentetik', NULL, NULL, NULL, NULL, 'unknown', 1, NULL, true,
   NULL, NULL, NULL),
  ('konya-meram-ornek-camii', 2, 'Meram', NULL, 'mosque', 'Örnek Camii', NULL, NULL, 2, '[1220,1221)', 'waqfiyya', 2,
   '[10,12)', false, NULL, NULL, 'standing');
UPDATE monument SET parent_id = 1 WHERE slug = 'bursa-osmangazi-muradiye-camii';
UPDATE monument SET parent_id = 2 WHERE slug = 'bursa-osmangazi-muradiye-camii-haziresi';
INSERT INTO artwork(monument_id, kind, description_tr) VALUES (3, 'gravestone', 'mezar taşı');

INSERT INTO source_section(book_id, kind, title_tr, seq, text_tr, monument_slug) VALUES
  (1, 'monument', 'Muradiye Camii', 1, 'Örnek metin.', 'bursa-osmangazi-muradiye-camii'),
  (1, 'city_history', 'Bursa Tarihi', 2, 'Örnek şehir tarihi.', NULL);
UPDATE monument SET section_id = 1 WHERE slug = 'bursa-osmangazi-muradiye-camii';
INSERT INTO chunk(section_id, book_id, seq, lang, kind, city_id, monument_id, complex_id, years, page_start, page_end,
                  heading_path, content, content_for_embed, content_hash) VALUES
  (1, 1, 1, 'tr', 'monument_part', 1, 2, 1, '[1425,1427)', 75, 76, 'Bursa › Osmangazi › Muradiye Camii',
   'Caminin kitâbesine göre yapımı 1426 yılında tamamlanmıştır. Mihrabı çinilerle süslüdür.',
   'title: Muradiye Camii | text: Caminin kitâbesine göre yapımı 1426 yılında tamamlanmıştır.', 'h1'),
  (2, 1, 1, 'tr', 'city_history', 1, NULL, NULL, '[1400,1450)', 20, 21, 'Bursa › Bursa Tarihi',
   'Bursa bu dönemde ipek ticaretinin merkeziydi.', 'title: Bursa Tarihi | text: Bursa bu dönemde ipek ticaretinin merkeziydi.', 'h2');
