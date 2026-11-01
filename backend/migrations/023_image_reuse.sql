-- Fotoğrafın telefonda çevrimdışı saklanması ve paylaşım kartına basılması için kullanım izni (master plan M06, M19, §10.2).
-- Varsayılan kapalı: izin teyit edilmeden paket fotoğrafsız iner, kart fotoğrafsız çıkar. Uygulamada ve sitede göstermek
-- bundan etkilenmez. Kitap kitap ya da fotoğraf fotoğraf panelden açılır.
ALTER TABLE image ADD COLUMN IF NOT EXISTS reuse_allowed boolean NOT NULL DEFAULT false;
