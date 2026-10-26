-- =====================================================================
-- Çok rotalı hibrit arama örneği
-- Soru: "Muradiye Camii yapıldığında Bursa'da şehir hayatı nasıldı?"
-- Parametreler: $1 = sorgu embedding'i, $2 = sorgu metni, $3 = seçili eser id
-- Her rota kendi içinde vektör + tam metin sonuçlarını RRF ile birleştirir,
-- sonra rota kotalarıyla reranker'a ~40 aday gönderilir.
-- =====================================================================

WITH target AS (
    SELECT m.id, m.city_id, coalesce(m.parent_id, m.id) AS complex_id,
           coalesce(m.built_years, p.years) AS yrs
    FROM monument m LEFT JOIN period p ON p.id = m.period_id
    WHERE m.id = $3
),
-- Rota A: seçili eser + aynı külliyedeki yapılar
route_a AS (
    SELECT c.id, 'eser' AS route,
           row_number() OVER (ORDER BY c.embedding <=> $1) AS r_vec,
           row_number() OVER (ORDER BY ts_rank_cd(c.tsv, websearch_to_tsquery('turkish', $2)) DESC) AS r_fts
    FROM chunk c, target t
    WHERE c.is_retrievable AND c.lang = 'tr'
      AND (c.monument_id = t.id OR c.complex_id = t.complex_id)
),
-- Rota B: aynı şehrin tarihi, eserin inşa yıllarıyla zaman olarak örtüşen parçalar
route_b AS (
    SELECT c.id, 'sehir_donem' AS route,
           row_number() OVER (ORDER BY c.embedding <=> $1) AS r_vec,
           row_number() OVER (ORDER BY ts_rank_cd(c.tsv, websearch_to_tsquery('turkish', $2)) DESC) AS r_fts
    FROM chunk c, target t
    WHERE c.is_retrievable AND c.lang = 'tr'
      AND c.kind IN ('city_history','chapter_intro','complex_intro')
      AND c.city_id = t.city_id
      AND c.years && int4range(lower(t.yrs) - 75, upper(t.yrs) + 75)
),
-- Rota C: ilişkili eserler (aynı bani / aynı sanatçı / vakıf bağı) – 1 adımlık graf genişlemesi
related AS (
    SELECT mp2.monument_id AS id FROM monument_person mp1
      JOIN monument_person mp2 ON mp2.person_id = mp1.person_id AND mp2.monument_id <> mp1.monument_id
     WHERE mp1.monument_id = $3 AND mp1.role IN ('patron','founder')
    UNION
    SELECT wl2.monument_id FROM waqf_link wl1
      JOIN waqf_link wl2 ON wl2.waqf_id = wl1.waqf_id AND wl2.monument_id <> wl1.monument_id
     WHERE wl1.monument_id = $3
),
route_c AS (
    SELECT c.id, 'iliskili' AS route,
           row_number() OVER (ORDER BY c.embedding <=> $1) AS r_vec,
           row_number() OVER (ORDER BY ts_rank_cd(c.tsv, websearch_to_tsquery('turkish', $2)) DESC) AS r_fts
    FROM chunk c JOIN related r ON r.id = c.monument_id
    WHERE c.is_retrievable AND c.lang = 'tr'
),
fused AS (
    SELECT id, route, 1.0/(60 + r_vec) + 1.0/(60 + r_fts) AS rrf,
           row_number() OVER (PARTITION BY route ORDER BY 1.0/(60 + r_vec) + 1.0/(60 + r_fts) DESC) AS rank_in_route
    FROM (SELECT * FROM route_a UNION ALL SELECT * FROM route_b UNION ALL SELECT * FROM route_c) u
)
SELECT f.route, f.rrf, c.id, c.heading_path, c.page_start, c.page_end, b.title AS book, c.content
FROM fused f
JOIN chunk c ON c.id = f.id
JOIN source_book b ON b.id = c.book_id
WHERE (f.route = 'eser'        AND f.rank_in_route <= 20)
   OR (f.route = 'sehir_donem' AND f.rank_in_route <= 15)
   OR (f.route = 'iliskili'    AND f.rank_in_route <= 8)
ORDER BY f.route, f.rrf DESC;
-- → bu ~40 aday cross-encoder reranker'a (ör. bge-reranker-v2-m3) gider;
--   rota başına alt kota korunarak (eser ≥3, şehir/dönem ≥2) son 8–12 parça seçilir.
