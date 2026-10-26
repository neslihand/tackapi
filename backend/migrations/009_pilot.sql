-- MVP pilot seçkisi (pipeline/pilot.py): demoda gösterilecek eserler. Görselle arama embedding'leri ve kayıtlı
-- anlatımlar önce bu eserler için üretilir (visual_search.py --pilot, narrations.py --pilot). Panelden işaretlenir.
ALTER TABLE monument ADD COLUMN IF NOT EXISTS pilot boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS monument_pilot ON monument (city_id) WHERE pilot;
