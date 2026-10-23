-- Fotoğraf tablosu (images.py + load_images.py). Tanım schema.sql §10 ile aynıdır; mevcut veritabanlarına eklemek içindir.
CREATE TABLE IF NOT EXISTS image (
    id                  serial PRIMARY KEY,
    monument_id         int REFERENCES monument(id) ON DELETE CASCADE,
    city_id             int REFERENCES city(id),
    book_id             int REFERENCES source_book(id),
    source              text NOT NULL CHECK (source IN ('book','upload')),
    sha1                text UNIQUE NOT NULL,          -- aynı görselin kopyası iki kez eklenmez
    file                text NOT NULL,                 -- media/ altındaki göreli yol; küçüğü media/thumbs/<file>
    width               int,
    height              int,
    pdf_page            int,
    printed_page        int,                           -- kaynak gösterimi: "Bursa Vakıf Eserleri I, s. 77"
    section_title       text,                          -- esere değil bir bölüme (şehir tarihi vb.) aitse
    match_method        text,                          -- images.py bağlama yöntemi (denetim izi)
    sort                int NOT NULL DEFAULT 0,
    is_cover            boolean NOT NULL DEFAULT false,
    alt_tr              text,
    alt_en              text,
    caption_tr          text,
    edited              boolean NOT NULL DEFAULT false, -- yönetim panelinde değiştirildiyse yükleyici dokunmaz
    review_status       text NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft','reviewed','published')),
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS image_monument_sort ON image (monument_id, sort);
CREATE UNIQUE INDEX IF NOT EXISTS image_one_cover ON image (monument_id) WHERE is_cover;

-- Uygulanan göç (migration) dosyaları: pipeline/migrate.py
CREATE TABLE IF NOT EXISTS schema_migration (
    name                text PRIMARY KEY,
    applied_at          timestamptz NOT NULL DEFAULT now()
);
