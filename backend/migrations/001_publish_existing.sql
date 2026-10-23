-- Resmî envanter kitaplarından yüklenmiş eserler yayında başlar (2026-10-24, geliştirici onayıyla).
-- Bu göç yalnızca bu tarihten önce kurulmuş veritabanında bir kez çalışır; o anda bütün kayıtlar kitaptan gelmiştir.
-- Yeni kurulumlarda load_db.py kitap kayıtlarını zaten 'published' yükler ve schema.sql bu göçü uygulanmış sayar.
-- Yönetim panelinden eklenen kayıtlar 'draft' başlar; yayınlanana kadar herkese açık uçlarda görünmez.
UPDATE monument SET review_status = 'published' WHERE review_status = 'draft';
