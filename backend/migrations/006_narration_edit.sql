-- Kayıtlı anlatımı panelden elle düzeltme (yazım hatası vb.). Elle düzenlenmiş anlatımı narrations.py toplu üretimde
-- (--force verilmedikçe) değiştirmez; eski ve yeni metin admin_log'a yazılır.
ALTER TABLE narration ADD COLUMN IF NOT EXISTS edited_by text;
ALTER TABLE narration ADD COLUMN IF NOT EXISTS edited_at timestamptz;
