-- Makaleler ve terimler sözlüğü (sitede "Makaleler" ve "Terimler"; articles.py).
--
-- Makale üç türlüdür: şehir tarihi (çoğunlukla envanter kitabının şehir tarihi bölümünden, paragraf aralığı seçilerek
-- içe aktarılır), vakıf eserleri ve vakıf kültürü. Yönetici panelde yazar ya da kitaptan içe aktarır; ziyaretçiler
-- hesaplarıyla gönderir ve yönetici onaylayınca yayına girer. Makaleler sohbet asistanının kaynağı değildir.
--
-- Terimler mevcut term tablosundadır (sohbet asistanı da kullanır). Bu göç ona yayın durumu, kategori ve yazar bilgisi
-- ekler; var olan terimler yayında kalır. Ziyaretçinin önerdiği terim 'visitor' kökenlidir: onaylanınca sözlükte
-- görünür ama sohbet asistanına gitmez (ziyaretçi katkılarıyla aynı kural).
CREATE TABLE IF NOT EXISTS article (
    id                  serial PRIMARY KEY,
    slug                text UNIQUE NOT NULL,
    kind                text NOT NULL CHECK (kind IN ('city_history', 'heritage', 'culture')),
    title_tr            text NOT NULL,
    title_en            text,
    summary_tr          text,
    summary_en          text,
    body_tr             text NOT NULL,                 -- paragraflar boş satırla ayrılır; '## ' ile başlayan satır ara başlık
    body_en             text,
    city_id             int REFERENCES city(id) ON DELETE SET NULL,
    cover_file          text,                          -- media/ altındaki WebP (yoksa ilk bağlı eserin kapak fotoğrafı)
    cover_alt           text,
    authors             text[] NOT NULL DEFAULT '{}',  -- künyede görünen yazarlar (ziyaretçide takma adı kullanılır)
    source_section_id   int REFERENCES source_section(id) ON DELETE SET NULL,
    source_paras        int4range,                     -- kitaptan içe aktarılan paragraf aralığı (0'dan)
    page_start          int,
    page_end            int,
    source_note         text,                          -- kaynak açıklaması ("Bursa Vakıf Eserleri I, s. 24–30")
    origin              text NOT NULL CHECK (origin IN ('book', 'editorial', 'visitor')),
    user_id             int REFERENCES app_user(id) ON DELETE SET NULL,
    status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'rejected')),
    reject_reason       text,
    featured            boolean NOT NULL DEFAULT false,
    created_by          text,                          -- yöneticinin adı (panel)
    reviewed_by         text,
    reviewed_at         timestamptz,
    published_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS article_status ON article (status, published_at DESC);
CREATE INDEX IF NOT EXISTS article_user ON article (user_id);
CREATE INDEX IF NOT EXISTS article_section ON article (source_section_id);

CREATE TABLE IF NOT EXISTS article_monument (
    article_id          int NOT NULL REFERENCES article(id) ON DELETE CASCADE,
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    sort                int NOT NULL DEFAULT 0,
    PRIMARY KEY (article_id, monument_id)
);

ALTER TABLE term ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE term ADD COLUMN IF NOT EXISTS category text
    CHECK (category IN ('architecture', 'decoration', 'waqf', 'title', 'daily_life', 'other'));
ALTER TABLE term ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'pending', 'published', 'rejected'));
ALTER TABLE term ADD COLUMN IF NOT EXISTS user_id int REFERENCES app_user(id) ON DELETE SET NULL;
ALTER TABLE term ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE term ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE term ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE term ADD COLUMN IF NOT EXISTS reject_reason text;
ALTER TABLE term ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE term ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE term DROP CONSTRAINT IF EXISTS term_origin_check;
ALTER TABLE term ADD CONSTRAINT term_origin_check CHECK (origin IN ('book', 'editorial', 'visitor'));

-- Terim adresi: Türkçe harfler sadeleşir ('Kündekâri' → 'kundekari'); aynı adrese düşen terime kimliği eklenir.
-- Tetikleyici, adresi verilmeden eklenen terimlere (load_db.py, eski betikler) de adres verir.
CREATE OR REPLACE FUNCTION term_slug_base(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT coalesce(nullif(trim(BOTH '-' FROM regexp_replace(lower(translate(t,
        'çğıöşüâîûêÇĞİÖŞÜÂÎÛÊ', 'cgiosuaiueCGIOSUAIUE')), '[^a-z0-9]+', '-', 'g')), ''), 'terim')
$$;
CREATE OR REPLACE FUNCTION term_fill_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := term_slug_base(NEW.term_tr);
        IF EXISTS (SELECT 1 FROM term WHERE slug = NEW.slug AND id <> NEW.id) THEN
            NEW.slug := NEW.slug || '-' || NEW.id;
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS term_slug_fill ON term;
CREATE TRIGGER term_slug_fill BEFORE INSERT OR UPDATE OF slug ON term FOR EACH ROW EXECUTE FUNCTION term_fill_slug();

WITH ranked AS (
    SELECT id, term_slug_base(term_tr) AS s, row_number() OVER (PARTITION BY term_slug_base(term_tr) ORDER BY id) AS n
    FROM term WHERE slug IS NULL
)
UPDATE term t SET slug = CASE WHEN r.n = 1 AND NOT EXISTS (SELECT 1 FROM term o WHERE o.slug = r.s) THEN r.s
                              ELSE r.s || '-' || t.id END
FROM ranked r WHERE r.id = t.id;
CREATE UNIQUE INDEX IF NOT EXISTS term_slug ON term (slug);
CREATE INDEX IF NOT EXISTS term_status ON term (status);
