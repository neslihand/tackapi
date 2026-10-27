-- Keşif rotaları (sitede "Keşif Sezonları" ve "Keşif Görevleri"): yöneticinin panelde yazdığı, sıralı eser listeleri.
-- Adı ve açıklaması yönetici tarafından yazılır (yapay zekâ yok). Yalnızca published rotalar ve yayındaki eserleri sitede
-- görünür. Bunlara ek olarak site şehir başına otomatik rotalar da gösterir (routes.py; tabloya yazılmaz).
CREATE TABLE IF NOT EXISTS route (
    id                  serial PRIMARY KEY,
    slug                text UNIQUE NOT NULL,
    title               text NOT NULL,
    kicker              text,                          -- kısa etiket: 'TEMATİK ROTA', 'ŞEHİR KOLEKSİYONU'
    description         text,
    sort                int NOT NULL DEFAULT 0,
    published           boolean NOT NULL DEFAULT false,
    created_by          text,
    updated_at          timestamptz
);
CREATE TABLE IF NOT EXISTS route_stop (
    route_id            int NOT NULL REFERENCES route(id) ON DELETE CASCADE,
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    sort                int NOT NULL DEFAULT 0,
    PRIMARY KEY (route_id, monument_id)
);
