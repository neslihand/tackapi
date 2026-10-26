-- Görselle arama (pipeline/visual_search.py): kitap ve panel fotoğraflarının görsel embedding'i. Ziyaretçinin yüklediği
-- fotoğrafın embedding'i bunlarla karşılaştırılır; yüklenen fotoğraf saklanmaz.
ALTER TABLE image ADD COLUMN IF NOT EXISTS embedding vector(1536);   -- gemini-embedding-2, görsel girdi
ALTER TABLE image ADD COLUMN IF NOT EXISTS embedding_model text;
CREATE INDEX IF NOT EXISTS image_embedding_hnsw ON image USING hnsw (embedding vector_cosine_ops);
