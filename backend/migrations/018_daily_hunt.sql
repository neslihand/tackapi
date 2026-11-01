-- Detay Avı (master plan M07): her gün editörün seçtiği tek yakın çekim görseli ve tek soru. Görev eser ve kaynağına bağlıdır.
-- Yapay zekâ yazmaz. rights_confirmed: görselin bu kullanım için hakkını editör teyit etti (fotoğraflarda genel lisans alanı
-- yok, bkz. audit/permission-matrix.md); teyitsiz görev yayımlanamaz.
CREATE TABLE IF NOT EXISTS daily_hunt (
    id                  serial PRIMARY KEY,
    day                 date NOT NULL UNIQUE,                         -- Türkiye yerel yayın günü; bir güne tek görev
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    image_id            int NOT NULL REFERENCES image(id) ON DELETE RESTRICT,
    question            text NOT NULL,
    options             text[] NOT NULL CHECK (cardinality(options) BETWEEN 4 AND 6),
    answer              int NOT NULL CHECK (answer >= 0 AND answer < cardinality(options)),
    hints               text[] NOT NULL DEFAULT '{}',                 -- her yanlış tahminden sonra sıradaki
    explanation         text NOT NULL,                                -- cevaptan sonra; kaynağa dayanmalı
    rights_confirmed    boolean NOT NULL DEFAULT false,
    published           boolean NOT NULL DEFAULT false,
    created_by          text,
    updated_at          timestamptz
);
