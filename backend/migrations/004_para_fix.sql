-- Bölümleme düzeltmeleri (pipeline/text_fixes.py, textfix_db.py): kitap metnini silmeden "bu paragraf hangi esere ait"
-- kararları. Kitap metni (source_section.text_tr) değişmez; eserin etkin metni ve sohbet parçaları bu kararlara göre üretilir.
CREATE TABLE IF NOT EXISTS para_fix (
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
    UNIQUE (monument_id, para_no),
    CHECK (decision <> 'move' OR target_monument_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS para_fix_target ON para_fix (target_monument_id) WHERE decision = 'move';
CREATE INDEX IF NOT EXISTS para_fix_pending ON para_fix (decision);
