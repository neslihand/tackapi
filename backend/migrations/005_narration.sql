-- Kayıtlı anlatımlar (pipeline/narrations.py): eser sayfasındaki "Hikâyeleştirerek" ve "Çocuklar İçin" metinleri bir kez
-- üretilir ve buradan okunur; ziyaretçi her tıkladığında yapay zekâ çağrılmaz.
CREATE TABLE IF NOT EXISTS narration (
    id                  serial PRIMARY KEY,
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    mode                text NOT NULL CHECK (mode IN ('story','child')),
    lang                text NOT NULL CHECK (lang IN ('tr','en')),
    answer              text NOT NULL,                               -- [S#]/[F#] kaynak işaretli metin
    sources             jsonb NOT NULL DEFAULT '[]',                 -- [{ref, book, pages, heading}]
    verification        jsonb,                                       -- rag.verify: desteksiz yıl ve adlar
    text_hash           text,                                        -- üretildiği andaki etkin metnin sha1'i (eskime tespiti)
    model               text,
    generated_by        text,                                        -- panelde üreten kişi ya da 'narrations.py'
    generated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (monument_id, mode, lang)
);
