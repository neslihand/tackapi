-- Yönetici asistanı (agent.py): takvim, öneriler ve sitedeki duyurular ("Gündem").
-- Öneriyi açık kurallar bulur; yapay zekâ yalnızca yöneticinin istediği taslağı yazar. Hiçbir taslak onaysız yayınlanmaz.

-- Takvim: bayramlar, milli günler, şehir günleri. Her yıl aynı gün (month/day) ya da tek bir tarih (on_date; dinî
-- günler her yıl değişir). checked=false: tarih doğrulanmadı (öneride uyarı olarak gösterilir).
CREATE TABLE IF NOT EXISTS calendar_day (
    id                  serial PRIMARY KEY,
    title               text NOT NULL,
    kind                text NOT NULL CHECK (kind IN ('religious', 'national', 'city', 'other')),
    month               int CHECK (month BETWEEN 1 AND 12),
    day                 int CHECK (day BETWEEN 1 AND 31),
    on_date             date,
    days                int NOT NULL DEFAULT 1 CHECK (days BETWEEN 1 AND 15),   -- süre (bayram 3–4 gün)
    city_id             int REFERENCES city(id) ON DELETE CASCADE,             -- şehir günü; NULL → her şehir
    monument_kinds      text[] NOT NULL DEFAULT '{}',                          -- öne çıkarılacak eser türleri; boş → hepsi
    note                text,                                                  -- yöneticiye ve taslağa not (ör. anma dili)
    source              text,                                                  -- tarihin nereden alındığı
    checked             boolean NOT NULL DEFAULT true,
    active              boolean NOT NULL DEFAULT true,
    created_by          text,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK ((on_date IS NOT NULL) <> (month IS NOT NULL AND day IS NOT NULL))
);

-- Asistanın önerisi. key aynı öneriyi taramalar arasında tekil tutar (ör. 'cal:3:2026-12-10').
CREATE TABLE IF NOT EXISTS agent_suggestion (
    id                  serial PRIMARY KEY,
    key                 text NOT NULL UNIQUE,
    kind                text NOT NULL CHECK (kind IN ('calendar', 'anniversary', 'experience', 'content', 'engagement')),
    title               text NOT NULL,
    detail              text NOT NULL,
    action              text,
    evidence            jsonb NOT NULL DEFAULT '{}',   -- dayandığı sayılar
    monuments           text[] NOT NULL DEFAULT '{}',  -- ilgili eserler (slug)
    drafts              text[] NOT NULL DEFAULT '{}',  -- hazırlanabilecek taslaklar: route, announcement, summary
    due_on              date,
    priority            int NOT NULL DEFAULT 50,
    demo                boolean NOT NULL DEFAULT false, -- deneme verisi de hesaba girdi
    status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed', 'expired')),
    draft_kind          text CHECK (draft_kind IN ('route', 'announcement', 'summary')),
    draft               jsonb,                         -- son taslak (yönetici düzenleyip uygular)
    draft_at            timestamptz,
    result_ref          text,                          -- uygulanınca oluşan kayıt (route:slug, announcement:id, monument:slug)
    resolved_by         text,
    resolved_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    seen_at             timestamptz NOT NULL DEFAULT now()   -- kuralın bu öneriyi son bulduğu tarama
);
CREATE INDEX IF NOT EXISTS agent_suggestion_status ON agent_suggestion (status, priority DESC);

-- Sitedeki duyuru ("Gündem" bandı). Taslak başlar; yalnızca published ve tarih aralığındakiler görünür.
CREATE TABLE IF NOT EXISTS announcement (
    id                  serial PRIMARY KEY,
    title               text NOT NULL,
    body                text NOT NULL,
    monuments           text[] NOT NULL DEFAULT '{}',
    route_slug          text,
    starts_on           date,
    ends_on             date,
    published           boolean NOT NULL DEFAULT false,
    ai_draft            boolean NOT NULL DEFAULT false,   -- metni asistan önerdi (yönetici düzenlemiş olabilir)
    suggestion_id       int REFERENCES agent_suggestion(id) ON DELETE SET NULL,
    created_by          text,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
