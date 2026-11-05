-- Cevabı Bekleyen Sorular (master plan M16): Esere Sor kaynakta cevap bulamayınca kişi takip etmeyi seçer, soru editör
-- kuyruğuna düşer. Cevap kaynağıyla yazılır ve soran kişinin Sorularım ekranına gelir. Herkese açık değildir, sohbet kaynağı
-- da değildir. Aynı soruyu takip eden herkes aynı cevabı alır (monument_id + question_norm).
CREATE TABLE IF NOT EXISTS question_ticket (
    id                  serial PRIMARY KEY,
    user_id             int NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    question            text NOT NULL,
    question_norm       text NOT NULL,
    lang                text NOT NULL DEFAULT 'tr' CHECK (lang IN ('tr', 'en')),
    status              text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'researching', 'answered', 'unresolved', 'rejected')),
    answer              text,
    answer_source       text,
    note                text,                                         -- çözülemedi ya da reddedildi: kişiye gösterilen gerekçe
    reviewed_by         text,
    answered_at         timestamptz,                                  -- kapanış zamanı (cevap, çözülemedi ya da ret)
    seen_at             timestamptz,                                  -- kişi kapanışı gördü
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, monument_id, question_norm),
    CHECK (status <> 'answered' OR (answer IS NOT NULL AND answer_source IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS question_ticket_status ON question_ticket (status, created_at);
CREATE INDEX IF NOT EXISTS question_ticket_user ON question_ticket (user_id, created_at DESC);
