-- Yönetim paneli (pipeline/admin.py) için:
-- 1. Fotoğraflar 'rejected' (atıldı) olarak işaretlenebilir; kitap fotoğrafları silinmez, yeniden yüklemede geri gelmez.
-- 2. Eserlerde serbest kaynak notu (panelden eklenen eserlerin kaynağı) ve kim/ne zaman değiştirdi bilgisi.
-- 3. admin_log: panelden yapılan her değişikliğin denetim kaydı (moderasyon izi).
ALTER TABLE image DROP CONSTRAINT IF EXISTS image_review_status_check;
ALTER TABLE image ADD CONSTRAINT image_review_status_check
      CHECK (review_status IN ('draft','reviewed','published','rejected'));

ALTER TABLE monument ADD COLUMN IF NOT EXISTS source_note text;
ALTER TABLE monument ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE monument ADD COLUMN IF NOT EXISTS updated_at timestamptz;

CREATE TABLE IF NOT EXISTS admin_log (
    id                  bigserial PRIMARY KEY,
    at                  timestamptz NOT NULL DEFAULT now(),
    actor               text NOT NULL,
    action              text NOT NULL,
    target              text NOT NULL,
    detail              jsonb
);
CREATE INDEX IF NOT EXISTS admin_log_at ON admin_log (at DESC);
