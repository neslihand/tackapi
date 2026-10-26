-- =====================================================================
-- Vakıf Eserleri – PostgreSQL + pgvector şeması (v0.2)
-- Tanımlayıcılar İngilizce (ORM/araç uyumu için), açıklamalar Türkçe.
-- İlke: Türkçe kaynak metin tek doğruluk kaynağıdır. Her yapılandırılmış
-- bilgi, dayandığı metin parçasına (chunk_id) ve alıntıya bağlanır.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector >= 0.8 (iterative scan için)
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- isim/benzer yazım araması
CREATE EXTENSION IF NOT EXISTS unaccent;   -- â/î/û ve ï gibi işaretleri normalize etmek için

-- ---------------------------------------------------------------------
-- 1. KAYNAKLAR: kitap → bölüm (bölüm = özgün, temizlenmiş tam metin)
-- ---------------------------------------------------------------------
CREATE TABLE source_book (
    id                  serial PRIMARY KEY,
    slug                text UNIQUE NOT NULL,          -- 'bursa-1', 'konya-1'
    title               text NOT NULL,                 -- 'Bursa Vakıf Eserleri I. Cilt'
    city_id             int,                           -- FK aşağıda eklenir
    volume              smallint,
    publisher           text DEFAULT 'Vakıf Katılım',
    published           date,
    isbn                text,
    isbn_set            text,
    credits             jsonb,                         -- {editor:..., authors:[...], translator:...}
    en_quality          text CHECK (en_quality IN ('usable','needs_review','unusable')),
    notes               text
);

-- Kitabın mantıksal bölümleri: şehir tarihi, külliye girişi, eser kaydı ...
-- Yazar bölüm düzeyinde tutulur (Konya'da her bölümün yazarı farklı).
CREATE TABLE source_section (
    id                  serial PRIMARY KEY,
    book_id             int NOT NULL REFERENCES source_book(id),
    parent_id           int REFERENCES source_section(id),   -- 'Camiler' > 'Meram' > eser
    kind                text NOT NULL CHECK (kind IN
                          ('city_history','chapter_intro','complex_intro','monument','conclusion','glossary','bibliography','other')),
    title_tr            text NOT NULL,
    title_en            text,
    authors             text[],
    page_start          int,
    page_end            int,
    seq                 int NOT NULL,                  -- kitaptaki sıra
    text_tr             text,                          -- temizlenmiş özgün Türkçe metin
    text_en             text,                          -- kitaptaki İngilizce (kalite source_book.en_quality)
    page_map            jsonb,                         -- paragraf → sayfa: [{"p":0,"pages":[75]},...]
    monument_slug       text                           -- eser kaydı ise
);
CREATE INDEX ON source_section (book_id, seq);

-- ---------------------------------------------------------------------
-- 2. ŞEHİR ve DÖNEM (kontrollü sözlükler)
-- ---------------------------------------------------------------------
CREATE TABLE city (
    id                  serial PRIMARY KEY,
    slug                text UNIQUE NOT NULL,          -- 'bursa'
    name_tr             text NOT NULL,
    name_en             text NOT NULL,
    historic_names      text[],                        -- {'Prusa','Prusa ad Olympum','Hüdavendigâr'}
    lat numeric(9,6), lon numeric(9,6)
);
ALTER TABLE source_book ADD FOREIGN KEY (city_id) REFERENCES city(id);

-- Dönemler hiyerarşik: Osmanlı > Erken Osmanlı. city_id NULL ise genel dönem,
-- dolu ise şehre özgü (ör. Konya için 'Karamanoğlu').
CREATE TABLE period (
    id                  serial PRIMARY KEY,
    slug                text UNIQUE NOT NULL,          -- 'erken-osmanli'
    parent_id           int REFERENCES period(id),
    city_id             int REFERENCES city(id),
    name_tr             text NOT NULL,
    name_en             text NOT NULL,
    years               int4range NOT NULL             -- '[1299,1453)'  → yıl çakışmasıyla eşleştirme
);
CREATE INDEX ON period USING gist (years);

-- ---------------------------------------------------------------------
-- 3. VAKIF ESERİ (merkez tablo)
-- ---------------------------------------------------------------------
CREATE TABLE monument (
    id                  serial PRIMARY KEY,
    slug                text UNIQUE NOT NULL,          -- 'bursa-osmangazi-muradiye-camii'
    parent_id           int REFERENCES monument(id),   -- külliye → cami/medrese/türbe; cami → hazire
    city_id             int NOT NULL REFERENCES city(id),
    district            text,                          -- ilçe: ayrı tabloya gerek yok
    neighborhood        text,
    address             text,
    lat numeric(9,6), lon numeric(9,6),
    kind                text NOT NULL CHECK (kind IN
                          ('complex','mosque','masjid','madrasa','tomb','imaret','bath','fountain',
                           'han','bedesten','zawiya','tekke','graveyard','bridge','library','church',
                           'house','other')),
    name_tr             text NOT NULL,
    name_en             text,                          -- editoryal; kitaptaki çeviriye körü körüne güvenme
    alt_names           text[],                        -- {'Bulgur Tekkesi'}
    name_origin         text,                          -- adın hikâyesi (kaynaktan)
    period_id           int REFERENCES period(id),     -- inşa dönemi (ana dönem)
    built_years         int4range,                     -- olaylardan türetilir, listeleme için önbellek
    date_basis          text CHECK (date_basis IN
                          ('inscription','waqfiyya','archive','literature','style','tradition','parent','unknown')),
    current_state       text,                          -- kitaptaki "günümüzdeki durumu" cümlesi
    status              text CHECK (status IN ('standing','ruined','lost','rebuilt')),
    architecture        jsonb NOT NULL DEFAULT '{}',   -- plan, örtü, geçiş, malzeme, cephe, minare... (aşağıya bkz.)
    summary_tr          text,                          -- doğrulanmış kısa özet (kartlar için)
    summary_en          text,
    summary_en_origin   text CHECK (summary_en_origin IN ('book','machine','human')),
    section_id          int REFERENCES source_section(id),  -- eserin kitap kaydı
    book_id             int REFERENCES source_book(id),
    pages               int4range,                     -- kitaptaki sayfa aralığı
    heading_path        text,                          -- 'Bursa › Osmangazi › II. Murad Külliyesi › Muradiye Camii'
    title_source        text,                          -- heading | toc | first_line | english_title | inferred...
    toc_title           text,                          -- içindekilerdeki ad (karşılaştırma için)
    toc_page            int,
    is_synthetic        boolean NOT NULL DEFAULT false, -- metni olmayan, hiyerarşi için türetilmiş kayıt
    en_usable           boolean NOT NULL DEFAULT false, -- kitaptaki EN metin arayüzde gösterilebilir mi
    qa_flags            text[] NOT NULL DEFAULT '{}',  -- otomatik kalite bayrakları (insan kontrolü için)
    extraction          jsonb,                         -- Gemini çıkarımının ham çıktısı (denetim izi)
    review_status       text NOT NULL DEFAULT 'draft' CONSTRAINT monument_review_status_check
                          CHECK (review_status IN ('draft','reviewed','published','removed')),  -- removed: kaldırıldı (geri getirilebilir)
    source_note         text,                          -- panelden eklenen eserin kaynağı (kitap dışı)
    created_by          text,                          -- panelden ekleyen kişi (kitap kayıtlarında boş)
    updated_at          timestamptz,                   -- son panel değişikliği
    pilot               boolean NOT NULL DEFAULT false -- MVP pilot seçkisi (pilot.py): embedding ve anlatımlar önce bunlara
);
CREATE INDEX ON monument USING gin (qa_flags);
CREATE INDEX monument_pilot ON monument (city_id) WHERE pilot;
CREATE INDEX ON monument (city_id, kind);
CREATE INDEX ON monument (parent_id);
CREATE INDEX ON monument USING gist (built_years);
CREATE INDEX ON monument USING gin (architecture jsonb_path_ops);
CREATE INDEX ON monument USING gin (name_tr gin_trgm_ops);
-- architecture örneği:
-- {"plan":"tabhaneli/zaviyeli","cover":["kubbe"],"transition":["Türk üçgeni","mukarnaslı tromp"],
--  "materials":["tuğla","moloz taş"],"masonry":"almaşık","minarets":{"count":2,"material":"tuğla"},
--  "portico":"beş gözlü son cemaat yeri"}

-- ---------------------------------------------------------------------
-- 4. KİŞİLER ve rolleri
-- ---------------------------------------------------------------------
CREATE TABLE person (
    id                  serial PRIMARY KEY,
    slug                text UNIQUE NOT NULL,
    name                text NOT NULL,                 -- 'Sultan II. Murad'
    alt_names           text[],                        -- {'Murâd bin Mehmed'}
    title               text,                          -- 'Sultan','Paşa','Hattat'
    birth_years         int4range,
    death_years         int4range,
    bio_tr              text,                          -- yalnızca kaynaktan derlenmiş
    notes               text
);
CREATE INDEX ON person USING gin (name gin_trgm_ops);

-- Eser–kişi ilişkisi. Sanatçı ilişkisi ayrıca artwork.artist_id'de tutulur.
CREATE TABLE monument_person (
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    person_id           int NOT NULL REFERENCES person(id),
    role                text NOT NULL CHECK (role IN
                          ('patron','architect','builder','restorer','buried','founder','trustee','imam','sheikh',
                           'calligrapher','artist','other')),
    detail              text,
    chunk_id            bigint,                        -- kanıt (FK aşağıda)
    quote               text,
    PRIMARY KEY (monument_id, person_id, role)
);

-- ---------------------------------------------------------------------
-- 5. TARİHLER ve OLAYLAR (eser ya da şehir düzeyinde)
-- ---------------------------------------------------------------------
CREATE TABLE event (
    id                  serial PRIMARY KEY,
    monument_id         int REFERENCES monument(id) ON DELETE CASCADE,  -- NULL → şehir olayı
    city_id             int NOT NULL REFERENCES city(id),
    kind                text NOT NULL CHECK (kind IN
                          ('construction','completion','repair','restoration','addition','conversion',
                           'earthquake','fire','destruction','registration','waqf','burial','political','other')),
    years               int4range,                     -- miladi; '[1425,1427)'
    precision           text CHECK (precision IN ('day','month','year','range','century','approx')),
    date_text_hijri     text,                          -- 'Receb 828'
    date_text           text,                          -- kaynakta yazıldığı haliyle
    basis               text CHECK (basis IN
                          ('inscription','waqfiyya','archive','literature','style','tradition','unknown')),
    evidence_artwork_id int,                           -- tarihi veren kitâbe (FK aşağıda)
    person_id           int REFERENCES person(id),     -- onaran vali, emreden padişah vb.
    description_tr      text NOT NULL,
    chunk_id            bigint,
    quote               text
);
CREATE INDEX ON event (monument_id);
CREATE INDEX ON event USING gist (years);

-- ---------------------------------------------------------------------
-- 6. SANAT ESERLERİ / TEZYİNAT (kitâbe ve mezar taşı dahil)
-- Kitâbe ayrı tablo değil: hem belge hem hat sanatı eseri. Metin alanları
-- yalnızca yazılı eserlerde doludur.
-- ---------------------------------------------------------------------
CREATE TABLE artwork (
    id                  serial PRIMARY KEY,
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    kind                text NOT NULL CHECK (kind IN
                          ('inscription','calligraphy_panel','tile','hand_painted','wood_carving','kundekari',
                           'stone_carving','stucco','mother_of_pearl','stained_glass','metalwork','textile',
                           'gravestone','furnishing','other')),
    element             text,                          -- yapıdaki yeri: 'mihrap','minber','taç kapı','son cemaat yeri pencere alınlığı'
    technique           text,                          -- 'mozaik çini','sır altı','celi sülüs','kalem işi','raspa ile ortaya çıkarılmış'
    materials           text[],
    colors              text[],                        -- {'firuze','zümrüt yeşili'}
    motifs              text[],                        -- {'geometrik','bitkisel','altıgen'}
    style               text,                          -- 'Rokoko','Tebrizli ustalar'
    artist_id           int REFERENCES person(id),     -- 'Ömer Vasfi Efendi'
    years               int4range,
    date_text           text,
    is_movable          boolean NOT NULL DEFAULT false, -- Kâbe örtüsü, levha, rahle
    condition           text,                          -- 'tahrip olmuş, yerine boyama yapılmış'
    -- yazılı eserler için
    script              text,                          -- 'celi sülüs','nesih','celi talik'
    language            text,                          -- 'ar','ota','fa'
    text_original       text,                          -- transkripsiyon
    text_translation_tr text,                          -- kitaptaki meal
    text_reference      text,                          -- 'Bakara 2/149'
    description_tr      text NOT NULL,
    chunk_id            bigint,
    quote               text,
    image_refs          text[]                         -- ileride fotoğraf eşleştirmesi için
);
CREATE INDEX ON artwork (monument_id);
CREATE INDEX ON artwork (kind);
ALTER TABLE event ADD FOREIGN KEY (evidence_artwork_id) REFERENCES artwork(id);

-- ---------------------------------------------------------------------
-- 7. VAKIF İLİŞKİLERİ: vakfiye + (gelir kaynağı / tahsis edilen) bağlantıları
-- Bir hamam başka bir eserin vakfına gelir sağlayabilir → eserler arası graf.
-- ---------------------------------------------------------------------
CREATE TABLE waqf (
    id                  serial PRIMARY KEY,
    founder_id          int REFERENCES person(id),
    name                text,                          -- 'Orhan Gazi Vakfı'
    deed_years          int4range,                     -- vakfiye tarihi
    deed_date_text      text,                          -- 'Cemaziyelahir 787 / Temmuz 1385'
    deed_archive        text,                          -- 'VGM Arşivi, Defter ..., s. ...' (varsa)
    conditions_tr       text,                          -- şartlar: 'Kur'an okunması', görevli maaşları
    description_tr      text,
    chunk_id            bigint,
    quote               text
);

CREATE TABLE waqf_link (
    id                  serial PRIMARY KEY,
    waqf_id             int NOT NULL REFERENCES waqf(id) ON DELETE CASCADE,
    role                text NOT NULL CHECK (role IN ('beneficiary','income_source','mentioned')),
    monument_id         int REFERENCES monument(id),   -- vakıf varlığı bir eserse
    asset_text          text,                          -- '35 dükkân', 'Çatalburgaz köyü', '32.500 akçe'
    asset_kind          text CHECK (asset_kind IN ('village','land','shop','house','bath','han','cash','garden','other')),
    chunk_id            bigint,
    quote               text,
    CHECK (monument_id IS NOT NULL OR asset_text IS NOT NULL)
);
CREATE INDEX ON waqf_link (monument_id);

-- ---------------------------------------------------------------------
-- 8. RAG: METİN PARÇALARI (chunk) + embedding aynı tabloda
-- ---------------------------------------------------------------------
CREATE TABLE chunk (
    id                  bigserial PRIMARY KEY,
    section_id          int NOT NULL REFERENCES source_section(id),
    book_id             int NOT NULL REFERENCES source_book(id),
    parent_chunk_id     bigint REFERENCES chunk(id),  -- küçük parça → üst bağlam (small-to-big)
    seq                 int NOT NULL,
    lang                text NOT NULL CHECK (lang IN ('tr','en')),
    kind                text NOT NULL CHECK (kind IN
                          ('monument_part','monument_full','city_history','complex_intro','chapter_intro',
                           'inscription','glossary','derived_card')),
    topic               text[],                        -- {'konum','tarih','bani','vakfiye','mimari_dis','mimari_ic',
                                                       --  'tezyinat','onarim','rivayet','gunumuz','sehir_yasami','ekonomi'}
    -- metadata (filtreleme için kolon; JSON içine gömülmez)
    city_id             int NOT NULL REFERENCES city(id),
    monument_id         int REFERENCES monument(id),
    complex_id          int REFERENCES monument(id),   -- külliye kardeşlerini tek filtreyle getirmek için
    period_ids          int[] NOT NULL DEFAULT '{}',
    years               int4range,                     -- parçanın anlattığı zaman aralığı
    page_start          int,
    page_end            int,
    heading_path        text NOT NULL,                 -- 'Bursa › Osmangazi › II. Murad Külliyesi › Muradiye Camii › Tezyinat'
    content             text NOT NULL,                 -- kaynaktaki metin (alıntı/atıf için)
    content_for_embed   text NOT NULL,                 -- heading_path + kısa bağlam + content
    tsv                 tsvector GENERATED ALWAYS AS
                          (to_tsvector('turkish', coalesce(heading_path,'') || ' ' || content)) STORED,
    embedding           vector(1536),                  -- gemini-embedding-2, output_dimensionality=1536
    embedding_model     text,
    content_hash        text NOT NULL,                 -- yeniden embedding gerekip gerekmediğini anlamak için
    is_retrievable      boolean NOT NULL DEFAULT true  -- ör. kalitesiz EN çeviriler false
);
CREATE INDEX ON chunk (monument_id);
CREATE INDEX ON chunk (city_id, kind);
CREATE INDEX ON chunk USING gin (period_ids);
CREATE INDEX ON chunk USING gin (topic);
CREATE INDEX ON chunk USING gist (years);
CREATE INDEX ON chunk USING gin (tsv);
CREATE INDEX ON chunk USING hnsw (embedding vector_cosine_ops);

ALTER TABLE monument_person ADD FOREIGN KEY (chunk_id) REFERENCES chunk(id);
ALTER TABLE event           ADD FOREIGN KEY (chunk_id) REFERENCES chunk(id);
ALTER TABLE artwork         ADD FOREIGN KEY (chunk_id) REFERENCES chunk(id);
ALTER TABLE waqf            ADD FOREIGN KEY (chunk_id) REFERENCES chunk(id);
ALTER TABLE waqf_link       ADD FOREIGN KEY (chunk_id) REFERENCES chunk(id);

-- ---------------------------------------------------------------------
-- 9. TERİM SÖZLÜĞÜ (editoryal) ve EDİTÖR NOTLARI (çelişki/OCR/çeviri)
-- ---------------------------------------------------------------------
-- Terimler: doğru İngilizce karşılık + çocuklara uygun açıklama.
-- Tarihî bilgi değil, kavram açıklaması; kaynağı editoryal olarak işaretlenir.
CREATE TABLE term (
    id                  serial PRIMARY KEY,
    term_tr             text UNIQUE NOT NULL,          -- 'mukarnas','puşide','kalem işi','matbah'
    term_en             text NOT NULL,                 -- 'muqarnas','tomb cover','hand-painted decoration','kitchen'
    wrong_en            text[],                        -- kitaptaki hatalı karşılıklar: {'pushchair','printing house'}
    definition_tr       text NOT NULL,
    definition_child_tr text,
    definition_en       text,
    origin              text NOT NULL DEFAULT 'editorial' CHECK (origin IN ('book','editorial')),
    chunk_id            bigint REFERENCES chunk(id)
);

CREATE TABLE editorial_note (
    id                  serial PRIMARY KEY,
    kind                text NOT NULL CHECK (kind IN ('contradiction','likely_error','ocr','translation','toc_mismatch','uncertain')),
    monument_id         int REFERENCES monument(id),
    person_id           int REFERENCES person(id),
    chunk_ids           bigint[] NOT NULL DEFAULT '{}',
    field               text,                          -- 'death_date', 'patron_name'
    note_tr             text NOT NULL,                 -- 'Mevlâna vefatı: s.X 1231, s.Y 17 Aralık 1273'
    model_instruction   text,                          -- AI'a enjekte edilecek kısa uyarı
    status              text NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','resolved','wontfix'))
);
CREATE INDEX ON editorial_note USING gin (chunk_ids);

-- ---------------------------------------------------------------------
-- 10. FOTOĞRAFLAR (envanter kitaplarından çıkarılan ya da yönetim panelinden yüklenen)
-- Bir fotoğraf ya bir esere (monument_id) ya da yalnızca şehre/kitaba (giriş, şehir tarihi) bağlıdır; ikisi de
-- boşsa 'bağlanmamış'tır ve yönetim panelinde bekler. Yalnızca 'published' olanlar herkese açık uçlarda görünür.
-- ---------------------------------------------------------------------
CREATE TABLE image (
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
    embedding           vector(1536),                  -- görselle arama: gemini-embedding-2 görsel embedding'i
    embedding_model     text,
    review_status       text NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft','reviewed','published','rejected')),  -- rejected: atıldı
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX image_monument_sort ON image (monument_id, sort);
CREATE INDEX image_embedding_hnsw ON image USING hnsw (embedding vector_cosine_ops);
CREATE UNIQUE INDEX image_one_cover ON image (monument_id) WHERE is_cover;

-- Süsleme ve sanat kayıtlarının fotoğrafları (panelden elle bağlanır; bir fotoğraf birden çok kayda bağlanabilir)
CREATE TABLE artwork_image (
    artwork_id          int NOT NULL REFERENCES artwork(id) ON DELETE CASCADE,
    image_id            int NOT NULL REFERENCES image(id) ON DELETE CASCADE,
    sort                int NOT NULL DEFAULT 0,
    linked_by           text,
    linked_at           timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (artwork_id, image_id)
);
CREATE INDEX artwork_image_image ON artwork_image (image_id);

-- Uygulanan göç (migration) dosyaları: pipeline/migrate.py
CREATE TABLE schema_migration (
    name                text PRIMARY KEY,
    applied_at          timestamptz NOT NULL DEFAULT now()
);
-- Bu şema aşağıdaki göçlerin sonucunu zaten içerir; yeni kurulumda tekrar çalışmasınlar.
-- (Yeni bir göç eklerken şemayı da güncelle ve adını buraya ekle.)
INSERT INTO schema_migration(name) VALUES ('001_publish_existing.sql'), ('002_image_table.sql'),
                                         ('003_admin.sql'), ('004_para_fix.sql'), ('005_narration.sql'),
                                         ('006_narration_edit.sql'), ('007_artwork_image.sql'),
                                         ('008_image_embedding.sql'), ('009_pilot.sql'),
                                         ('010_monument_removed.sql'), ('011_para_split.sql');

-- Bölümleme düzeltmeleri: kitap metnini silmeden "bu paragraf hangi esere ait" kararları (text_fixes.py)
CREATE TABLE para_fix (
    id                  serial PRIMARY KEY,
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    para_no             int NOT NULL CHECK (para_no >= 1),          -- kitap metnindeki paragraf (1 tabanlı, P1, P2…)
    decision            text NOT NULL CHECK (decision IN ('pending','keep','hide','merge_prev','move')),
    target_monument_id  int REFERENCES monument(id) ON DELETE SET NULL,  -- move: paragrafın asıl sahibi
    source              text NOT NULL CHECK (source IN ('auto','model','admin')),
    rule                text,                                        -- auto: baslik/bolum/ingilizce/parca/kirik; model
    reason              text,
    suggested_target_id int REFERENCES monument(id) ON DELETE SET NULL,  -- model işaretinde önerilen sahip
    decided_by          text,                                        -- panelde karar veren kişi (otomatikte boş)
    decided_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    split_at            int CHECK (split_at IS NULL OR split_at > 0),   -- bölünmüş paragraf: bölme noktası (karakter)
    split_part          text CHECK (split_part IS NULL OR split_part IN ('head', 'tail')),  -- kararın uygulandığı kısım
    hidden_spans        jsonb NOT NULL DEFAULT '[]',                -- paragraf içinde gizlenen kısımlar [[başlangıç, bitiş], …]
    UNIQUE (monument_id, para_no),
    CHECK (decision <> 'move' OR target_monument_id IS NOT NULL),
    CONSTRAINT para_fix_split_check
      CHECK ((split_at IS NULL) = (split_part IS NULL) AND (split_at IS NULL OR decision IN ('move', 'hide')))
);
CREATE INDEX para_fix_target ON para_fix (target_monument_id) WHERE decision = 'move';
CREATE INDEX para_fix_pending ON para_fix (decision);

-- Yönetim paneli denetim kaydı: kim, ne zaman, neyi değiştirdi (pipeline/admin.py)
CREATE TABLE admin_log (
    id                  bigserial PRIMARY KEY,
    at                  timestamptz NOT NULL DEFAULT now(),
    actor               text NOT NULL,
    action              text NOT NULL,                 -- monument.update, image.publish, ...
    target              text NOT NULL,                 -- eser slug'ı ya da image:<id>
    detail              jsonb                          -- değişen alanlar (önce/sonra)
);
CREATE INDEX admin_log_at ON admin_log (at DESC);

-- ---------------------------------------------------------------------
-- 11. SOHBET CEVAP ÖNBELLEĞİ (rag.py; eski veritabanlarında çalışma anında da oluşturulur)
-- load_db.py ve load_extractions.py veriyi değiştirdiğinde bu tabloyu boşaltır.
-- ---------------------------------------------------------------------
CREATE TABLE answer_cache (
    id                  bigserial PRIMARY KEY,
    monument_slug       text NOT NULL,
    mode                text NOT NULL,
    lang                text NOT NULL,
    question            text NOT NULL,
    q_embedding         vector(1536),
    result              jsonb NOT NULL,
    model               text,
    hits                int NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX answer_cache_key ON answer_cache (monument_slug, mode, lang);

-- Kayıtlı anlatımlar (narrations.py): "Hikâyeleştirerek" ve "Çocuklar İçin" metinleri bir kez üretilir, buradan okunur
CREATE TABLE narration (
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
    edited_by           text,                                        -- panelde elle düzelten kişi (yeniden üretimde boşalır)
    edited_at           timestamptz,
    UNIQUE (monument_id, mode, lang)
);

-- ---------------------------------------------------------------------
-- 12. GÖRÜNÜMLER
-- ---------------------------------------------------------------------
-- Liste ekranı: dönem/şehir/tür filtreli eser listesi
CREATE VIEW monument_list AS
SELECT m.id, m.slug, m.name_tr, m.name_en, m.kind, c.slug AS city, m.district,
       p.name_tr AS period_tr, p.name_en AS period_en, m.built_years, m.date_basis,
       pm.slug AS parent_slug, m.review_status
FROM monument m
JOIN city c        ON c.id = m.city_id
LEFT JOIN period p ON p.id = m.period_id
LEFT JOIN monument pm ON pm.id = m.parent_id;

-- Eser ile aynı zamanda şehirde olan olaylar ("dönemin şehri" bağlamı)
CREATE VIEW monument_city_context AS
SELECT m.id AS monument_id, e.id AS event_id, e.years, e.description_tr
FROM monument m
JOIN event e ON e.city_id = m.city_id AND e.monument_id IS NULL
WHERE m.built_years && int4range(lower(e.years) - 50, upper(e.years) + 50);
