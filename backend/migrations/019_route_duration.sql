-- Rota süresi (master plan M05, M20): editörün kontrol ettiği süre ve erişim notu. Boşsa rota tematik bir listedir; süresi
-- yazılan rota gerçekten yürünecek demektir ve yayımlanmadan önce durakların doğrulanmış konumu aranır (routes.walk_issues).
-- 20/45/90 kısa yürüyüş, 60/180/360 Seyahat Modu. Şehir başına otomatik rotaların süresi yoktur.
ALTER TABLE route ADD COLUMN IF NOT EXISTS minutes int CHECK (minutes IN (20, 45, 90, 60, 180, 360));
ALTER TABLE route ADD COLUMN IF NOT EXISTS access_note text;
