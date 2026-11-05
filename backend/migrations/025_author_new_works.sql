-- Yazar paneli artık sistemde kayıtlı olmayan eserler için: yazar, envanteri henüz çıkmamış şehirlerdeki ya da sistemde
-- kaydı olmayan eserlerin "eser hakkında" metnini yazar. Bu yüzden yazım dosyası sistemdeki şehir ve eser kayıtlarına
-- bağlanmaz:
--   * şehir, Türkiye'nin 81 ilinden biri olarak metin tutulur (author.PROVINCES; sistemde kayıtlı iller de seçilebilir),
--   * "sistemdeki eser kaydına bağla" ve "envanterdeki metni not olarak al" kaldırıldı (monument_id düşer).
-- Önceden açılmış dosyaların şehri adıyla korunur; envanterden alınmış notlar (origin = 'book') olduğu gibi kalır.
ALTER TABLE author_work ADD COLUMN IF NOT EXISTS city_name text;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'author_work' AND column_name = 'city_id') THEN
        UPDATE author_work w SET city_name = c.name_tr FROM city c WHERE c.id = w.city_id AND w.city_name IS NULL;
    END IF;
END $$;

ALTER TABLE author_work DROP COLUMN IF EXISTS monument_id;
ALTER TABLE author_work DROP COLUMN IF EXISTS city_id;
