-- Eser konumunun kaynağı ve doğrulanması (pipeline/geocode.py, panelde haritadan düzeltme).
-- geo_source:    nominatim = OpenStreetMap'ten otomatik bulundu · manual = yönetici haritada yerleştirdi ya da girdi
-- geo_precision: bulunan yerin inceliği (exact/building: yapının kendisi · street: sokak · neighborhood: mahalle)
-- geo_checked:   yönetici konumu doğruladı. Doğrulanmamış konum ziyaretçiye "yaklaşık" gösterilir, kesin gibi değil.
-- geo_detail:    denetim izi (sorgu, OSM'de bulunan yer, uyarılar; bulunamadıysa denenen sorgular)
ALTER TABLE monument ADD COLUMN IF NOT EXISTS geo_source text
    CONSTRAINT monument_geo_source_check CHECK (geo_source IN ('nominatim', 'manual'));
ALTER TABLE monument ADD COLUMN IF NOT EXISTS geo_precision text
    CONSTRAINT monument_geo_precision_check CHECK (geo_precision IN ('exact', 'building', 'street', 'neighborhood'));
ALTER TABLE monument ADD COLUMN IF NOT EXISTS geo_checked boolean NOT NULL DEFAULT false;
ALTER TABLE monument ADD COLUMN IF NOT EXISTS geo_detail jsonb;
-- Bu göçten önce koordinatlar yalnızca panelden elle girilebiliyordu
UPDATE monument SET geo_source = 'manual', geo_precision = 'exact', geo_checked = true
WHERE lat IS NOT NULL AND lon IS NOT NULL AND geo_source IS NULL;
