-- Bir Eser, Üç Detay (master plan M03): Neden yapıldı, Neye dikkat etmelisin, Bugün neden önemli. Editör panelde kaynağıyla
-- yazar, yapay zekâ yazmaz. Yayımlanmamış ya da kaynaksız detay ziyaretçiye gitmez. Sohbet kaynağı değildir.
CREATE TABLE IF NOT EXISTS work_detail (
    id                  serial PRIMARY KEY,
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    kind                text NOT NULL CHECK (kind IN ('why', 'look', 'today')),
    body_tr             text NOT NULL,
    body_en             text,
    source              text NOT NULL,                                -- kitap ve sayfa ya da başka kaynak
    published           boolean NOT NULL DEFAULT false,
    created_by          text,
    updated_at          timestamptz,
    UNIQUE (monument_id, kind)
);
