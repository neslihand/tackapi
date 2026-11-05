-- Haftanın Keşfi (master plan M09): bir eser, bir detay, gerekiyorsa bir rota. Editör panelde takvimler, yapay zekâ yazmaz.
-- Hafta Türkiye saatiyle pazartesi başlar; bir haftaya tek kayıt. Günlük katılım istemez, kaçırılınca kaybolan bir şey yoktur.
CREATE TABLE IF NOT EXISTS weekly_discovery (
    id                  serial PRIMARY KEY,
    week                date NOT NULL UNIQUE CHECK (extract(isodow FROM week) = 1),
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    hook                text NOT NULL,                                -- merak cümlesi
    detail              text NOT NULL,                                -- eserde bakılacak tek detay
    source              text NOT NULL,
    route_slug          text,                                         -- isteğe bağlı: /api/routes kimliği
    published           boolean NOT NULL DEFAULT false,
    created_by          text,
    updated_at          timestamptz
);
