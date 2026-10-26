-- Süsleme ve sanat kayıtlarının (artwork) fotoğrafları: yönetici panelden elle bağlar. Bir fotoğraf birden çok kayda
-- bağlanabilir (aynı karede mihrap ve çiniler). load_extractions.py artwork satırlarını yeniden kurarken bağları alıntıya
-- göre geri yükler.
CREATE TABLE IF NOT EXISTS artwork_image (
    artwork_id          int NOT NULL REFERENCES artwork(id) ON DELETE CASCADE,
    image_id            int NOT NULL REFERENCES image(id) ON DELETE CASCADE,
    sort                int NOT NULL DEFAULT 0,
    linked_by           text,
    linked_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (artwork_id, image_id)
);
CREATE INDEX IF NOT EXISTS artwork_image_image ON artwork_image (image_id);
