-- Bilgi yarışması soruları ("Tarihin İzinde"): yönetici panelde yazar, her soru bir esere bağlıdır.
-- Sitede yalnızca yayımlanmış sorular ve yayındaki eserlerin soruları görünür. Bunlara ek olarak site eser künyesinden
-- kendi sorularını da üretir (frontend/src/lib/quiz.ts). Sorular yapay zekâyla yazılmaz.
CREATE TABLE IF NOT EXISTS quiz_question (
    id                  serial PRIMARY KEY,
    monument_id         int NOT NULL REFERENCES monument(id) ON DELETE CASCADE,
    question            text NOT NULL,
    options             text[] NOT NULL CHECK (cardinality(options) = 4),
    answer              int NOT NULL CHECK (answer BETWEEN 0 AND 3),   -- doğru seçeneğin sırası (0'dan)
    explanation         text NOT NULL,                                -- cevaptan sonra gösterilir; kaynağa dayanmalı
    published           boolean NOT NULL DEFAULT false,
    created_by          text,
    updated_at          timestamptz
);
CREATE INDEX IF NOT EXISTS quiz_question_monument ON quiz_question (monument_id);
