-- Ziyaretçi hesapları, katkılar ve davranış olayları ("Veriyle Gelişen Döngü", docs/backend/kullanici-ve-analitik-plani.md).
-- Kişisel veri en azdır: ad-soyad ve doğum tarihi yok; profil bilgileri isteğe bağlıdır. IP saklanmaz.

-- Hesap: e-posta + şifre (scrypt özeti). Hesap silinince kişisel alanlar boşaltılır, deleted_at dolar.
CREATE TABLE IF NOT EXISTS app_user (
    id                  serial PRIMARY KEY,
    email               text UNIQUE,                   -- küçük harf; silinen hesapta NULL
    password_hash       text,
    display_name        text,                          -- takma ad; katkılarda görünür
    age_range           text CHECK (age_range IN ('13-17','18-24','25-44','45-64','65+')),
    home_city           text,                          -- yaşadığı şehir (beyan)
    purposes            text[] NOT NULL DEFAULT '{}',  -- ziyaret amaçları (beyan)
    interests           text[] NOT NULL DEFAULT '{}',  -- ilgi alanları (beyan)
    consent_version     text NOT NULL,                 -- kabul edilen aydınlatma metninin sürümü
    consent_at          timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz,
    deleted_at          timestamptz
);

-- Oturum: tarayıcıdaki anahtarın yalnızca sha256 özeti saklanır.
CREATE TABLE IF NOT EXISTS user_session (
    token_hash          text PRIMARY KEY,
    user_id             int NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS user_session_user ON user_session (user_id);

-- Pasaport, favoriler, yarışma ve oyun sonuçları (sitedeki Progress biçimi); cihazlar arasında birleştirilir.
CREATE TABLE IF NOT EXISTS user_progress (
    user_id             int PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
    progress            jsonb NOT NULL,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Ziyaretçi katkısı: fotoğraf ya da metin. Yönetici onayından sonra eser sayfasında ayrı bölümde görünür;
-- sohbet asistanının kaynağı değildir.
CREATE TABLE IF NOT EXISTS contribution (
    id                  serial PRIMARY KEY,
    user_id             int REFERENCES app_user(id) ON DELETE SET NULL,
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    kind                text NOT NULL CHECK (kind IN ('photo', 'text')),
    text_kind           text CHECK (text_kind IN ('memory', 'info', 'correction')),   -- anı, bilgi, düzeltme önerisi
    body                text,                          -- metin ya da fotoğraf açıklaması
    file                text,                          -- media/ altındaki WebP (fotoğrafta)
    width               int,
    height              int,
    status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reject_reason       text,
    reviewed_by         text,
    reviewed_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (kind = 'photo' OR (body IS NOT NULL AND text_kind IS NOT NULL)),
    CHECK (kind = 'text' OR file IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS contribution_monument ON contribution (monument_id, status);
CREATE INDEX IF NOT EXISTS contribution_status ON contribution (status, created_at);

-- Davranış olayı (yalnızca izin veren ziyaretçiler). session_id tarayıcıda üretilen rastgele kimliktir.
CREATE TABLE IF NOT EXISTS analytics_event (
    id                  bigserial PRIMARY KEY,
    at                  timestamptz NOT NULL DEFAULT now(),
    session_id          text NOT NULL,
    user_id             int REFERENCES app_user(id) ON DELETE SET NULL,
    type                text NOT NULL,
    monument_slug       text,
    path                text,
    props               jsonb NOT NULL DEFAULT '{}',
    demo                boolean NOT NULL DEFAULT false -- sunum için üretilmiş deneme verisi (gerçek veriden ayrı)
);
CREATE INDEX IF NOT EXISTS analytics_event_at ON analytics_event (at);
CREATE INDEX IF NOT EXISTS analytics_event_session ON analytics_event (session_id, at);
CREATE INDEX IF NOT EXISTS analytics_event_type ON analytics_event (type, at);
CREATE INDEX IF NOT EXISTS analytics_event_monument ON analytics_event (monument_slug, type) WHERE monument_slug IS NOT NULL;

-- Site ayarları (varsayılan anlatım biçimi, öne çıkan rota…). 'auto' değeri veriden hesaplanır.
CREATE TABLE IF NOT EXISTS site_setting (
    key                 text PRIMARY KEY,
    value               text NOT NULL,
    updated_by          text,
    updated_at          timestamptz NOT NULL DEFAULT now()
);
