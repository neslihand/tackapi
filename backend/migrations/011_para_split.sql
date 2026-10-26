-- Paragraf içi düzeltmeler (yönetici panelde metinde seçerek yapar; kitap metni değişmez):
--   split_at / split_part: iki eserin metni tek paragrafta birleşmişse paragraf yöneticinin seçtiği karakterden sanal
--     olarak bölünür; karar (move/hide) yalnızca split_part kısmına uygulanır ('tail' = sonrası, 'head' = öncesi).
--   hidden_spans: paragrafın içinde gizlenen kısımlar ([[başlangıç, bitiş], …], kitap metnindeki karakter konumları;
--     metne karışmış başlıklar ve kırıntılar). Kararla birlikte ya da tek başına ('keep') kullanılabilir.
ALTER TABLE para_fix ADD COLUMN IF NOT EXISTS split_at int CHECK (split_at IS NULL OR split_at > 0);
ALTER TABLE para_fix ADD COLUMN IF NOT EXISTS split_part text CHECK (split_part IS NULL OR split_part IN ('head', 'tail'));
ALTER TABLE para_fix ADD COLUMN IF NOT EXISTS hidden_spans jsonb NOT NULL DEFAULT '[]';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'para_fix_split_check') THEN
    ALTER TABLE para_fix ADD CONSTRAINT para_fix_split_check
      CHECK ((split_at IS NULL) = (split_part IS NULL) AND (split_at IS NULL OR decision IN ('move', 'hide')));
  END IF;
END $$;
