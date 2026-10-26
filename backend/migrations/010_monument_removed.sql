-- Kitap eserini "kaldırma": sitede, panel listelerinde, aramada, sohbette ve pilot seçkide görünmez; metni, fotoğrafları
-- ve dizini silinmez, panelden geri getirilebilir (review_status = 'removed'). Kitap eseri kalıcı olarak silinmez.
-- review_status üzerindeki eski CHECK kısıtı adı ne olursa olsun kaldırılır, yenisi adıyla eklenir.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'monument'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%review_status%'
  LOOP
    EXECUTE format('ALTER TABLE monument DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE monument ADD CONSTRAINT monument_review_status_check
    CHECK (review_status IN ('draft', 'reviewed', 'published', 'removed'));
