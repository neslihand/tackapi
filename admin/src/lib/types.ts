// Arka uç yönetim API'sinin (backend/pipeline/admin.py) yanıt ve gövde tipleri. Sözleşme: backend/README.md §9.

export type ReviewStatus = 'draft' | 'reviewed' | 'published';
// removed: kaldırılmış eser (sitede ve listelerde görünmez, geri getirilebilir)
export type MonumentStatus = ReviewStatus | 'removed';
export type ImageStatus = ReviewStatus | 'rejected';
export type Kind = 'complex' | 'mosque' | 'masjid' | 'madrasa' | 'tomb' | 'imaret' | 'bath' | 'fountain' | 'han' | 'bedesten'
  | 'zawiya' | 'tekke' | 'graveyard' | 'bridge' | 'library' | 'church' | 'house' | 'other';
export type DateBasis = 'inscription' | 'waqfiyya' | 'archive' | 'literature' | 'style' | 'tradition' | 'parent' | 'unknown';
export type MonumentState = 'standing' | 'ruined' | 'lost' | 'rebuilt';

export type Page<T> = { total: number; page: number; page_size: number; items: T[] };
export type Count = { review_status: string; n: number };
export type Stats = { monuments: Count[]; images: Count[]; images_unassigned: number; monuments_without_image: number;
  segmentation_pending: number; contributions_pending?: number; agent_open?: number; articles_pending?: number; terms_pending?: number; questions_pending?: number; author_submitted?: number;
  // MVP pilot seçkisi: şehir başına seçilen eser ve hedef (009 göçü yoksa boş)
  pilot?: { city: string; n: number; target: number | null }[] };

export type MonumentRow = {
  slug: string; name_tr: string; kind: Kind; city: string; district: string | null; review_status: MonumentStatus;
  is_synthetic: boolean; qa_flags: string[]; updated_at: string | null; created_by: string | null; from_panel: boolean;
  images: number; images_pending: number; pilot: boolean;
};

export type AdminImage = {
  id: number; file: string; source: 'book' | 'upload'; review_status: ImageStatus; is_cover: boolean; sort: number;
  alt_tr: string | null; alt_en?: string | null; caption_tr: string | null; printed_page: number | null; pdf_page: number | null;
  match_method: string | null; edited: boolean; width: number | null; height: number | null; reuse_allowed?: boolean;
  // yalnızca kuyrukta (/images) gelenler
  src?: string; thumb?: string; section_title?: string | null; monument?: string | null; monument_name?: string | null;
  book?: string | null; book_title?: string | null;
};

// Düzenlenebilir alanlar (PATCH /monuments/{slug} gövdesi; hepsi isteğe bağlı)
export type MonumentFields = {
  name_tr?: string; name_en?: string | null; alt_names?: string[]; kind?: Kind; district?: string | null;
  neighborhood?: string | null; address?: string | null; lat?: number | null; lon?: number | null; period?: string | null;
  parent?: string | null; built_from?: number | null; built_to?: number | null; date_basis?: DateBasis | null;
  page_from?: number | null; page_to?: number | null;
  status?: MonumentState | null; summary_tr?: string | null; summary_en?: string | null; current_state?: string | null;
  source_note?: string | null; review_status?: ReviewStatus; pilot?: boolean;
  geo_checked?: boolean;   // konumu onayla (geocode.py'nin otomatik bulduğu konum)
};

// Konumun kaynağı ve doğrulanması (göç 012; uygulanmamışsa geo = null)
export type GeoPrecision = 'exact' | 'building' | 'street' | 'neighborhood';
export type GeoInfo = { source: 'nominatim' | 'manual' | null; precision: GeoPrecision | null; checked: boolean;
  detail: { status?: 'found' | 'not_found'; query?: string; found?: string; warnings?: string[]; tried?: string[] } | null };

// Süsleme ve sanat kaydı (çıkarımdan); fotoğrafları panelden elle bağlanır
export type AdminArtwork = { id: number; kind: string; element: string | null; technique: string | null; script: string | null;
  date_text: string | null; description_tr: string; image_ids: number[] };

export type MonumentDetail = Required<Omit<MonumentFields, 'review_status' | 'geo_checked'>> & {
  geo: GeoInfo | null;
  slug: string; city: string; review_status: MonumentStatus; deletable: boolean; qa_flags: string[]; is_synthetic: boolean;
  created_by: string | null; updated_at: string | null; book: string | null; from_panel: boolean; text_editable: boolean;
  pages_auto: [number, number] | null;   // düzeltilmiş paragrafların sayfaları (otomatik hesap)
  text_tr: string | null; text_en: string | null; images: AdminImage[]; artworks: AdminArtwork[];
  // süsleme kayıtlarına bağlanabilecek fotoğraflar: eserin, üst ve alt yapılarının (other: başka yapının fotoğrafı)
  artwork_photos: { id: number; file: string; source: 'book' | 'upload'; review_status: ImageStatus; alt_tr: string | null;
    printed_page: number | null; monument: string; monument_name: string; other: boolean }[];
  paragraphs: { own: Paragraph[]; incoming: { para_no: number; from_slug: string; from_name: string }[] };
};

// Bölümleme düzeltmeleri: kitap metni değişmez, paragrafın hangi esere ait olduğu kararı tutulur
export type ParaDecision = 'pending' | 'keep' | 'hide' | 'merge_prev' | 'move';
export type Paragraph = { no: number; text: string; pages: number[]; id: number | null; decision: ParaDecision | null;
  source: 'auto' | 'model' | 'admin' | null; rule: string | null; reason: string | null; target_slug: string | null; decided_by: string | null;
  // bölünmüş paragraf: karar (taşı/gizle) yalnızca split_part kısmına uygulanır ('tail' = split_at'tan sonrası, 'head' = öncesi)
  split_at?: number | null; split_part?: SplitPart | null;
  // paragrafın içinde gizlenen kısımlar (kitap metnindeki karakter konumları)
  hidden_spans?: [number, number][] };
export type SplitPart = 'head' | 'tail';
export type SegItem = { id: number; para_no: number; count: number; decision: ParaDecision; source: 'auto' | 'model' | 'admin';
  rule: string | null; reason: string | null; decided_by: string | null; decided_at: string | null; monument_id: number; slug: string;
  name_tr: string; review_status: ReviewStatus; book: string | null; target_slug: string | null; target_name: string | null;
  suggested_slug: string | null; suggested_name: string | null; text: string; pages: number[]; prev: string | null; next: string | null };
export type DecisionResult = { slug: string; para_no: number; before: ParaDecision | null; after: ParaDecision; added: number; kept: number; embedded: number };

// Keşif rotası (sitede "Keşif Sezonları"): panelde yazılır; durakları sıralı eserlerdir
export type RouteStop = { slug: string; name_tr: string; city: string; review_status: string; pilot: boolean };
export type AdminRoute = { id: number; slug: string; title: string; kicker: string | null; description: string | null; sort: number;
  published: boolean; created_by: string | null; updated_at: string | null; stops: RouteStop[]; minutes: number | null; access_note: string | null };
export type AutoRoute = { id: string; kicker: string; title: string; description: string; artifactIds: string[] };

// Bilgi yarışması sorusu (sitede "Tarihin İzinde"): panelde yazılır, bir esere bağlıdır
export type QuizQuestion = { id: number; question: string; options: string[]; answer: number; explanation: string; published: boolean;
  created_by: string | null; updated_at: string | null; monument: string; monument_name: string; city: string; review_status: string; pilot: boolean };
export type Hunt = { id: number; day: string; question: string; options: string[]; answer: number; hints: string[]; explanation: string; rights_confirmed: boolean; published: boolean;
  created_by: string | null; updated_at: string | null; image: number; image_file: string; image_status: string; monument: string; monument_name: string; review_status: string };
export type HuntFields = { day?: string; monument?: string; image?: number; question?: string; options?: string[]; answer?: number; hints?: string[]; explanation?: string; rights_confirmed?: boolean; published?: boolean };
export type QuizFields = { monument?: string; question?: string; options?: string[]; answer?: number; explanation?: string; published?: boolean };

// Ziyaretçi katkısı (fotoğraf ya da metin); panelde onaylanır, sitede kitap bilgisinden ayrı görünür
export type ContributionStatus = 'pending' | 'approved' | 'rejected';
export type Contribution = { id: number; kind: 'photo' | 'text'; text_kind: 'memory' | 'info' | 'correction' | null; body: string | null;
  file: string | null; src?: string; thumb?: string; width: number | null; height: number | null; status: ContributionStatus;
  reject_reason: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string; monument: string;
  monument_name: string; author: string | null; author_deleted: boolean | null; author_total: number };

// Veriyle gelişen döngünün panosu (GET /api/admin/insights)
export type Count2 = { value: string; n: number };
export type SegmentRow = { id: string; name: string; description: string; visitors: number; any: number; modes: Record<string, number> };
export type Suggestion = { kind: 'gap' | 'drop' | 'question' | 'search' | 'segment'; slug: string | null; title: string; detail: string; action: string };
export type MedalTiers = { read: number[]; onsite: number[]; recall: number[]; city_read: number[]; master_onsite: number };
export type SiteSettings = { default_mode: string; featured_route: string | null; medal_tiers: MedalTiers; app_flags: Record<string, boolean> };
export type Insights = {
  days: number; demo: boolean;
  totals: { visitors: number; events: number; registered: number; active_users: number; demo_events: number; views_per_visitor: number };
  daily: { day: string; visitors: number; events: number }[];
  wmhe: { week: string; explorers: number; mobile: number; stories: number; onsite: number; recalled: number; routes: number; contributions: number }[];
  cohorts: { week: string; people: number; activated: number; meaningful_7d: number; d1_of: number; d1: number; d7_of: number; d7: number; d30_of: number; d30: number; weeks_of: number; two_of_four: number }[];
  kpis: { stories_started: number; stories_completed: number; long_recalls: number; long_recalls_right: number; routes_started: number; routes_completed: number; onsite_people: number; active_people: number;
    shares: number; shares_opened: number; offline_packages: number; notification_opt_outs: number; api_errors: number };
  platforms: { platform: string; visitors: number; events: number }[];
  monuments: { slug: string; name_tr: string; city: string; visitors: number; questions: number; stamps: number; favorites: number;
    avg_seconds: number | null; deep: number }[];
  modes: { mode: string; label: string; n: number }[];
  segments: SegmentRow[];
  funnel: { visited: number; viewed: number; read: number; asked: number; stamped: number; contributed: number };
  searches: { q: string; n: number; empty: number }[];
  questions: { slug: string | null; question: string; n: number; no_info: number }[];
  camera: { result: string; n: number }[];
  profile: { age_range: Count2[]; home_city: Count2[]; purposes: Count2[]; interests: Count2[] };
  suggestions: Suggestion[];
  settings: { stored: SiteSettings; effective: SiteSettings & { source: Record<string, string> } };
};

export type City = { slug: string; name_tr: string; name_en: string; lat: number | null; lon: number | null; monuments: number };
export type Book = { slug: string; title: string; city: string | null; images_draft: number; images: number; images_reuse: number };
export type WorkDetailKind = 'why' | 'look' | 'today';
export type WorkDetail = { kind: WorkDetailKind; body_tr: string; body_en: string | null; source: string; published: boolean; created_by: string | null; updated_at: string | null };
export type WeeklyItem = { id: number; week: string; hook: string; detail: string; source: string; route: string | null; published: boolean; created_by: string | null; updated_at: string | null;
  monument: string; monument_name: string; review_status: string; pilot: boolean };
export type WeeklyFields = { week?: string; monument?: string; hook?: string; detail?: string; source?: string; route?: string | null; published?: boolean };
export type QuestionStatus = 'submitted' | 'researching' | 'answered' | 'unresolved' | 'rejected';
export type QuestionRow = { id: number; question: string; lang: string; status: QuestionStatus; answer: string | null; answer_source: string | null; note: string | null; reviewed_by: string | null;
  created_at: string; answered_at: string | null; monument: string; monument_name: string; followers: number };
export type Period = { slug: string; name_tr: string; parent: string | null; city: string | null; start: number; end: number };
export type LogRow = { at: string; actor: string; action: string; target: string; detail: Record<string, unknown> };

// Eserin kitap sayfalarındaki fotoğraflar (fotoğraf eşleşmesini düzeltmek için)
export type PagePhoto = { id: number; file: string; src: string; thumb: string; review_status: ImageStatus; is_cover: boolean;
  alt_tr: string | null; printed_page: number; pdf_page: number | null; match_method: string | null; edited: boolean;
  width: number | null; height: number | null; monument: string | null; monument_name: string | null; here: boolean; in_range: boolean };
export type PagePhotos = { book: string | null; book_title?: string | null; pages: [number, number] | null; photos: PagePhoto[] };

// Yönetici asistanı (agent.py, göç 016)
export type AgentKind = 'calendar' | 'anniversary' | 'experience' | 'content' | 'engagement';
export type DraftKind = 'route' | 'announcement' | 'summary';
export type DraftTone = 'auto' | 'warm' | 'formal' | 'short' | 'kids';
export type AgentDraft = { kind: DraftKind; draft: Record<string, unknown>; ai: boolean; warnings: string[]; model: string | null; tone?: DraftTone };

// Panelin ilk sayfası (backend/pipeline/overview.py)
export type Delta = { now: number; prev: number };
export type FeedItem = { id: number; at: string; type: string; slug: string | null; name_tr: string | null; city: string | null;
  platform: string; member: boolean; text: string | null; result: string | null };
export type Overview = {
  demo: boolean; generated_at: string; last_event: string | null; published: number; registered: number;
  live: { m15: number; m60: number };
  compare: { day: Record<'visitors' | 'views' | 'reads' | 'questions' | 'stamps' | 'searches', Delta>;
    week: Record<'visitors' | 'views' | 'reads' | 'questions' | 'stamps' | 'searches' | 'signups', Delta> };
  hourly: { hour: string; visitors: number; views: number; prev: number }[];
  daily: { day: string; visitors: number; views: number }[];
  top: { slug: string; name_tr: string; city: string; kind: Kind; visitors: number; visitors_prev: number; questions: number; stamps: number;
    avg_seconds: number | null; thumb: string | null }[];
  cities: { slug: string; city: string; visitors: number; views: number }[];
  platforms: { platform: string; visitors: number }[];
  feed: FeedItem[];
  searches: { q: string; n: number; empty: number }[];
};
export type AgentSuggestion = { id: number; key: string; kind: AgentKind; title: string; detail: string; action: string | null;
  evidence: Record<string, unknown>; monuments: string[]; monument_names: string[]; drafts: DraftKind[]; due_on: string | null;
  priority: number; demo: boolean; status: 'open' | 'done' | 'dismissed' | 'expired'; draft_kind: DraftKind | null; draft: AgentDraft | null;
  draft_at: string | null; result_ref: string | null; resolved_by: string | null; resolved_at: string | null; created_at: string; seen_at: string };
export type CalendarKind = 'religious' | 'national' | 'city' | 'other';
export type CalendarDay = { id: number; title: string; kind: CalendarKind; month: number | null; day: number | null; on_date: string | null;
  days: number; city: string | null; city_name?: string | null; monument_kinds: string[]; note: string | null; source: string | null;
  checked: boolean; active: boolean; next?: string | null; in_days?: number | null };
export type CalendarFields = Partial<Omit<CalendarDay, 'id' | 'city_name' | 'next' | 'in_days'>>;
export type Announcement = { id: number; title: string; body: string; monuments: string[]; monument_names?: string[]; route_slug: string | null;
  starts_on: string | null; ends_on: string | null; published: boolean; ai_draft: boolean; suggestion_id: number | null;
  created_by: string | null; updated_at: string };
export type AnnouncementFields = Partial<Pick<Announcement, 'title' | 'body' | 'monuments' | 'route_slug' | 'starts_on' | 'ends_on' | 'published'>>;

// Makaleler ve terimler sözlüğü (backend/pipeline/articles.py, göç 017)
export type ArticleKind = 'city_history' | 'heritage' | 'culture';
export type ArticleStatus = 'draft' | 'pending' | 'published' | 'rejected';
export type ArticleOrigin = 'book' | 'editorial' | 'visitor';
export type ArticleCover = { src: string; thumb: string; alt: string; own: boolean } | null;
export type ArticleRow = { id: number; slug: string; kind: ArticleKind; title_tr: string; status: ArticleStatus; origin: ArticleOrigin;
  city: string | null; byline: string; featured: boolean; has_english: boolean; words: number; cover: ArticleCover;
  updated_at: string; published_at: string | null; created_at: string; monuments_count: number };
export type ArticleMonument = { slug: string; name_tr: string; city: string; review_status: string; pilot: boolean };
export type Article = { id: number; slug: string; kind: ArticleKind; title_tr: string; title_en: string | null; summary_tr: string | null;
  summary_en: string | null; body_tr: string; body_en: string | null; city_id: number | null; city_slug: string | null; city_tr: string | null;
  cover_file: string | null; cover_alt: string | null; cover: ArticleCover; authors: string[]; source_section_id: number | null;
  source_paras: [number, number] | null; page_start: number | null; page_end: number | null; source_note: string | null;
  book_title: string | null; section_title: string | null; origin: ArticleOrigin; user_id: number | null; user_name: string | null;
  user_deleted: boolean | null; status: ArticleStatus; reject_reason: string | null; featured: boolean; created_by: string | null;
  reviewed_by: string | null; reviewed_at: string | null; published_at: string | null; created_at: string; updated_at: string;
  byline: string; reading_minutes: number; words: number; monuments: ArticleMonument[] };
export type ArticleFields = Partial<{ kind: ArticleKind; title_tr: string; title_en: string | null; summary_tr: string | null;
  summary_en: string | null; body_tr: string; body_en: string | null; city: string | null; authors: string[]; source_note: string | null;
  page_start: number | null; page_end: number | null; monuments: string[]; featured: boolean; cover_alt: string | null; slug: string;
  status: ArticleStatus; reject_reason: string | null }>;
export type ArticleSource = { id: number; kind: string; kind_label: string; title_tr: string; page_start: number | null; page_end: number | null;
  book: string; book_title: string; city: string | null; paragraphs: number; used_paragraphs: number; articles: number };
export type SourceRange = { id: number; title: string; status: ArticleStatus; from_para: number; to_para: number };
export type ArticleSourceDetail = { id: number; kind: string; title_tr: string; book: string; book_title: string; city: string | null;
  authors: string[]; paragraphs: { n: number; text: string; pages: number[] }[]; used: SourceRange[] };
export type TermCategory = 'architecture' | 'decoration' | 'waqf' | 'title' | 'daily_life' | 'other';
export type Term = { id: number; slug: string; term_tr: string; term_en: string; definition_tr: string; definition_child_tr: string | null;
  definition_en: string | null; category: TermCategory | null; origin: ArticleOrigin; status: ArticleStatus; reject_reason: string | null;
  created_by: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string; updated_at: string;
  user_id: number | null; user_name: string | null; author?: string | null };
export type TermFields = Partial<Pick<Term, 'term_tr' | 'term_en' | 'definition_tr' | 'definition_child_tr' | 'definition_en' | 'category' |
  'status' | 'reject_reason'>>;
