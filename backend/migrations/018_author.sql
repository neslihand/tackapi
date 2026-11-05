-- Yazar paneli (author.py, ../yazar-paneli): envanter kitabının yazarları (bilim kurulu üyeleri) için araştırma ve
-- yazım alanı. Yazarlar yönetim panelini görmez: kendi hesaplarıyla (e-posta + şifre) ayrı uygulamaya girer ve yalnızca
-- kendi yazım dosyalarına erişir. Hesabı yönetici açar (geçici şifre), yazar ilk girişte şifresini değiştirir.
--
-- Yazar bir eser için "yazım dosyası" açar; kaynakçasını ve araştırma notlarını (kaynak, sayfa, konu, kesinlik) toplar.
-- Yapay zekâ yalnızca yazar isteyince notlardan "eser hakkında" taslağı yazar; her cümle dayandığı notu [N3]
-- biçiminde gösterir, notlarda olmayan yıl ve adlar işaretlenir, notlar arasındaki çelişkiler çözülmez, listelenir.
-- Taslak sürümleri saklanır. Yazar metni editöre gönderir; editör yönetim panelinde onaylar ya da düzeltme ister.
-- Hiçbir şey sitede kendiliğinden yayımlanmaz; dosyalar sohbet asistanının kaynağı değildir.
CREATE TABLE IF NOT EXISTS author_account (
    id                  serial PRIMARY KEY,
    name                text NOT NULL,                       -- künyede görünecek ad ("Prof. Dr. …")
    email               text UNIQUE NOT NULL,                -- küçük harfe çevrilmiş
    password_hash       text NOT NULL,                       -- users.hash_password (scrypt)
    must_change         boolean NOT NULL DEFAULT true,       -- yöneticinin verdiği geçici şifre
    active              boolean NOT NULL DEFAULT true,       -- çalışma bitince kapatılır (dosyalar kalır)
    created_by          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    last_login_at       timestamptz
);

-- Oturum: tarayıcıdaki anahtarın yalnızca sha256 özeti saklanır.
CREATE TABLE IF NOT EXISTS author_session (
    token_hash          text PRIMARY KEY,
    account_id          int NOT NULL REFERENCES author_account(id) ON DELETE CASCADE,
    created_at          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS author_session_account ON author_session (account_id);

CREATE TABLE IF NOT EXISTS author_work (
    id                  serial PRIMARY KEY,
    author_id           int NOT NULL REFERENCES author_account(id),
    title               text NOT NULL,                       -- çalışılan eserin adı ("Muradiye Camii")
    city_id             int REFERENCES city(id) ON DELETE SET NULL,
    monument_id         int REFERENCES monument(id) ON DELETE SET NULL,   -- sistemdeki eser kaydı (varsa)
    status              text NOT NULL DEFAULT 'research'
                          CHECK (status IN ('research', 'writing', 'submitted', 'changes', 'approved')),
    review_note         text,                                -- editörün düzeltme isteği ya da onay notu
    reviewed_by         text,
    reviewed_at         timestamptz,
    submitted_at        timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS author_work_author ON author_work (author_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS author_work_status ON author_work (status);

-- Kaynakça: dosyaya özgü. Metin içi atıf adı yazar ve yıldan üretilir ("Ayverdi 1972").
CREATE TABLE IF NOT EXISTS author_source (
    id                  serial PRIMARY KEY,
    work_id             int NOT NULL REFERENCES author_work(id) ON DELETE CASCADE,
    kind                text NOT NULL CHECK (kind IN ('book', 'article', 'archive', 'waqfiyya', 'inscription',
                                                     'inventory', 'field', 'oral', 'web', 'other')),
    authors             text,
    year                text,                                -- '1972', 'H. 830', 't.y.'
    title               text NOT NULL,
    publisher           text,                                -- yayınevi, dergi, arşiv fonu
    url                 text,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS author_source_work ON author_source (work_id);

-- Araştırma notu. no: dosya içinde sıra numarası (taslakta [N{no}] olarak geçer, silinen notun numarası yeniden
-- kullanılmaz). certainty: belgeye dayalı / tahmin / rivayet / yazarın kendi bilgisi ya da gözlemi.
CREATE TABLE IF NOT EXISTS author_note (
    id                  serial PRIMARY KEY,
    work_id             int NOT NULL REFERENCES author_work(id) ON DELETE CASCADE,
    no                  int NOT NULL,
    topic               text NOT NULL DEFAULT 'other'
                          CHECK (topic IN ('location', 'history', 'inscription', 'architecture', 'decoration',
                                           'repairs', 'today', 'other')),
    body                text NOT NULL,
    source_id           int REFERENCES author_source(id) ON DELETE SET NULL,
    pages               text,                                -- '45', '45–47', 'vr. 12a'
    certainty           text NOT NULL DEFAULT 'documented'
                          CHECK (certainty IN ('documented', 'estimate', 'tradition', 'own')),
    origin              text NOT NULL DEFAULT 'author' CHECK (origin IN ('author', 'book')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (work_id, no)
);

-- Taslak sürümleri: en yenisi geçerli taslaktır. ai=true yapay zekânın yazdığı, false yazarın kaydettiği sürüm.
CREATE TABLE IF NOT EXISTS author_draft (
    id                  serial PRIMARY KEY,
    work_id             int NOT NULL REFERENCES author_work(id) ON DELETE CASCADE,
    body                text NOT NULL,                       -- paragraflar boş satırla; atıflar [N3] / [N3, N5]
    ai                  boolean NOT NULL DEFAULT false,
    model               text,
    length              text,                                -- short | medium | long (notlardan yazılan taslakta)
    warnings            jsonb NOT NULL DEFAULT '[]',
    conflicts           jsonb NOT NULL DEFAULT '[]',         -- [{about, notes:[no], detail}]
    gaps                jsonb NOT NULL DEFAULT '[]',         -- notlarda eksik görünen konular
    created_by          text,
    created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS author_draft_work ON author_draft (work_id, id DESC);
