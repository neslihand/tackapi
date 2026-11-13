# API envanteri (ESK-001)

Master planın §8.3 sözleşme gruplarının mevcut backend'deki karşılığı. Yeni uçlar paylaşım, paket, Detay Avı, Haftanın Keşfi ve soru takibi için açıldı.

## Plan → gerçek uç

| Plan | Gerçek | Durum |
|---|---|---|
| `GET /heritage` | `GET /api/monuments?pilot=&city=&kind=&period=&q=&lang=&page=&page_size=` | Var. Yalnızca `review_status='published'`, sayfalı. Mobil `pilot=true&page_size=200` ile çağırır |
| `GET /heritage/{id}` | `GET /api/monuments/{slug}?lang=` | Var. Yayında değilse 404 |
| `GET /routes` | `GET /api/routes?pilot=&auto=` | Var. Yazılan rotalar + şehir başına otomatik rotalar (`auto: true`). Yazılan rotada `minutes` (20/45/90, seyahat 60/180/360) ve `access_note`; ikisi de editörden |
| Mühür `POST /stamps` | `PUT /api/me/progress` | Mühürler pasaportun içinde. Sunucu konumu doğrulamaz; kontrol cihazda |
| Defter `/journal` | `PUT /api/me/progress`, `notebook` alanı | Bu turda eklendi. Son değişiklik kazanır |
| Hatırla `/recall` | `PUT /api/me/progress`, `recall` alanı | Bu turda eklendi. Kartlar `GET /api/quiz` ve eser kayıtlarından |
| Günlük görev `/challenges/daily` | `GET /api/hunt/today` | Cevap, ipucu, açıklama, eser adı ve görsel açıklaması gelmez. Gün Türkiye saatiyle |
| Tahmin `/challenges/{id}/attempts` | `POST /api/hunt/{id}/guess` | Sunucuda doğrulanır, IP başına dakikada 60. Kişi başına kayıt yok; denemeler pasaportta (`progress.hunt`) |
| | `GET /api/hunt/{id}/hints?seen=`, `/reveal` | Yarım kalan ya da başka cihazda biten oyun için. Yarının görevi açılmaz |
| Paylaşım sayfası | `GET /eser/{slug}?lang=` | HTML, `/api` dışında. Yayında değilse 404 sayfası |
| Sorular `/questions` | `POST /api/monuments/{slug}/questions`, `GET /api/me/questions`, `POST /api/me/questions/{id}/seen`, `DELETE /api/me/questions/{id}` | `questions.py`. Giriş gerekir, saatte 10. `POST /api/chat` artık `no_info` da döner |
| Katkı `/contributions` | `POST/GET /api/monuments/{slug}/contributions`, `GET /api/me/contributions` | Var. Mobil kullanıyor |
| Analitik `/events/batch` | `POST /api/events` | Var. Bu turda genişletildi (aşağıda) |
| Offline manifest | `GET /api/routes/{id}/manifest?pilot=&lang=` | Boyut, durak başına ve rota sürümü, `photo_urls` (yalnızca izinli fotoğraflar), `blocked_photos` |
| Eser detayı üç detay | `GET /api/monuments/{slug}` içinde `details` | Yalnızca yayımlanmış ve kaynaklı. `images[].reusable` izin bilgisi |
| Haftanın Keşfi | `GET /api/weekly` | Türkiye saatiyle bu hafta; yoksa `available: false` |

`GET /api/site-settings` artık `medal_tiers` ve `app_flags` de döner. Panel: `/api/admin/hunts`, `/api/admin/weekly`, `/api/admin/questions`, `/api/admin/monuments/{slug}/details/{kind}`, `/api/admin/books/{slug}/reuse`, `/api/admin/settings` (eşikler, modül düğmeleri).

`GET /api/monuments` kartları `has_story`, `has_child` da döner (kişiselleştirme, vaat edilen anlatımın gerçekten olması için). `GET /api/recommendations` hesabın şehrini ve hikâye, çocuk ilgilerini de sayar.

Ayrıca: `GET /api/cities`, `/api/announcements`, `/api/quiz`, `/api/site-settings`, `/api/recommendations`, `/api/popular`, `/api/profile-options`, `/api/articles`, `/api/terms`, `POST /api/visual-search`, hesap uçları (`/api/auth/*`, `/api/me`). Oturum: web çerez, mobil Bearer.

## `POST /api/events` değişiklikleri

- **Tekrar koruması:** `props.event_id` varsa aynı oturumda ikinci kez yazılmaz. Olmayan (web) olaylar eskisi gibi yazılır.
- **Olay zamanı:** `props.occurred_at` geçerli, gelecekte değil ve 30 günden eski değilse olayın zamanı olur; çevrimdışı biriken olay doğru haftaya düşer.
- **Yeni türler:** `onboarding_intent_selected`, `heritage_story_started`, `heritage_story_completed`, `item_saved`, `route_started`, `route_completed`, `knowledge_recalled`, `rhythm_changed`, `share_initiated`, `share_opened`, `offline_package_downloaded`, `notification_opt_out`, `daily_hunt_started`, `daily_hunt_completed`, `heritage_detail_explored`, `question_followed`, `question_answered`, `preferences_changed` (yalnızca alan adı, değer gitmez).
- **Şema değişikliği yok:** `event_id`, `platform`, `dev` `props` içinde tutuluyor, göç gerekmedi.

## §9.1 olay eşlemesi

Web'in kullandığı tür aynı anlamdaysa o kullanıldı; panel ve öneriler mobil veriyi de okusun diye.

| Plan | Gönderilen | Not |
|---|---|---|
| `onboarding_intent_selected` | aynı | `intent`, `is_guest` |
| `heritage_item_opened` | `monument_view` | Web ile ortak |
| `heritage_story_started` / `completed` | aynı | `mode`, `completion_ratio`, `surface` (read/listen) |
| `item_saved` | aynı | `label` |
| `route_started` / `route_completed` | aynı | `verified_stop_count`, `duration_bucket`. Rota açılışı: `route_open` |
| `stamp_earned` | `stamp` | `stamp_type` (learning/onsite), `verification_method` (read_75, listen_75, manual, gps) |
| `knowledge_recalled` | aynı | `correct`, `first_attempt_correct`, `repetition_step`; yarışmada `surface: quiz` |
| `app_error` | `api_error`, `client_error` | Web ile ortak. Kırılan ekran `client_error` gönderir (`_layout.tsx`: `ErrorBoundary`) |
| `heritage_detail_explored` | aynı | `detail_id`: why, look, today. WMHE'ye girmez |
| `daily_hunt_*`, `share_*`, `notification_opt_out`, `offline_package_downloaded` | aynı | `share_opened` izin gerektirir; paylaşım sayfası kayıt tutmaz |
| `contribution_submitted` | `contribution` | Web ile ortak |
| `question_followed` / `question_answered` | aynı | `ticket_id`, `time_to_answer_hours`. Cevap süresi panelde tablodan da hesaplanır, izne bağlı değildir |
| Esere Sor | `chat_question`, `chat_answer` | Web ile ortak. Mobil önceden göndermiyordu; panel "bilgi yok" sorularını bunlardan sayıyor |
| `contribution_approved` | Gönderilmiyor | Onay sunucuda, `contribution` tablosundan sayılır |

**Anlatım adları:** mobil `text` → olayda ve panelde `short`; `brief` yeni (kısa özet), `story`, `child` aynı. Dönüşüm tek yerde: `lib/discovery.ts`.

## Hata sözleşmesi

Backend §8.3'teki durum kodlarını zaten kullanıyor. Mobil `ApiError.status` ile ayırt ediyor; `0` bağlantı yok demektir. `409` kullanılmıyor, tekrarlar sessizce yok sayılıyor.
