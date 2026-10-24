// Arka uç yönetim API'sinin (backend/pipeline/admin.py) yanıt ve gövde tipleri. Sözleşme: backend/README.md §9.

export type ReviewStatus = 'draft' | 'reviewed' | 'published';
export type ImageStatus = ReviewStatus | 'rejected';
export type Kind = 'complex' | 'mosque' | 'masjid' | 'madrasa' | 'tomb' | 'imaret' | 'bath' | 'fountain' | 'han' | 'bedesten'
  | 'zawiya' | 'tekke' | 'graveyard' | 'bridge' | 'library' | 'church' | 'house' | 'other';
export type DateBasis = 'inscription' | 'waqfiyya' | 'archive' | 'literature' | 'style' | 'tradition' | 'parent' | 'unknown';
export type MonumentState = 'standing' | 'ruined' | 'lost' | 'rebuilt';

export type Page<T> = { total: number; page: number; page_size: number; items: T[] };
export type Count = { review_status: string; n: number };
export type Stats = { monuments: Count[]; images: Count[]; images_unassigned: number; monuments_without_image: number;
  segmentation_pending: number };

export type MonumentRow = {
  slug: string; name_tr: string; kind: Kind; city: string; district: string | null; review_status: ReviewStatus;
  is_synthetic: boolean; qa_flags: string[]; updated_at: string | null; created_by: string | null; from_panel: boolean;
  images: number; images_pending: number;
};

export type AdminImage = {
  id: number; file: string; source: 'book' | 'upload'; review_status: ImageStatus; is_cover: boolean; sort: number;
  alt_tr: string | null; alt_en?: string | null; caption_tr: string | null; printed_page: number | null; pdf_page: number | null;
  match_method: string | null; edited: boolean; width: number | null; height: number | null;
  // yalnızca kuyrukta (/images) gelenler
  src?: string; thumb?: string; section_title?: string | null; monument?: string | null; monument_name?: string | null;
  book?: string | null; book_title?: string | null;
};

// Düzenlenebilir alanlar (PATCH /monuments/{slug} gövdesi; hepsi isteğe bağlı)
export type MonumentFields = {
  name_tr?: string; name_en?: string | null; alt_names?: string[]; kind?: Kind; district?: string | null;
  neighborhood?: string | null; address?: string | null; lat?: number | null; lon?: number | null; period?: string | null;
  parent?: string | null; built_from?: number | null; built_to?: number | null; date_basis?: DateBasis | null;
  status?: MonumentState | null; summary_tr?: string | null; summary_en?: string | null; current_state?: string | null;
  source_note?: string | null; review_status?: ReviewStatus;
};

export type MonumentDetail = Required<Omit<MonumentFields, 'review_status'>> & {
  slug: string; city: string; review_status: ReviewStatus; qa_flags: string[]; is_synthetic: boolean;
  created_by: string | null; updated_at: string | null; book: string | null; from_panel: boolean; text_editable: boolean;
  text_tr: string | null; text_en: string | null; images: AdminImage[]; notes: QualityNote[];
  paragraphs: { own: Paragraph[]; incoming: { para_no: number; from_slug: string; from_name: string }[] };
};

// Bölümleme düzeltmeleri: kitap metni değişmez, paragrafın hangi esere ait olduğu kararı tutulur
export type ParaDecision = 'pending' | 'keep' | 'hide' | 'merge_prev' | 'move';
export type Paragraph = { no: number; text: string; pages: number[]; id: number | null; decision: ParaDecision | null;
  source: 'auto' | 'model' | 'admin' | null; rule: string | null; reason: string | null; target_slug: string | null; decided_by: string | null };
export type SegItem = { id: number; para_no: number; count: number; decision: ParaDecision; source: 'auto' | 'model' | 'admin';
  rule: string | null; reason: string | null; decided_by: string | null; decided_at: string | null; monument_id: number; slug: string;
  name_tr: string; review_status: ReviewStatus; book: string | null; target_slug: string | null; target_name: string | null;
  suggested_slug: string | null; suggested_name: string | null; text: string; pages: number[]; prev: string | null; next: string | null };
export type DecisionResult = { slug: string; para_no: number; before: ParaDecision | null; after: ParaDecision; added: number; kept: number; embedded: number };

// Çıkarım sırasında üretilen iç kalite notları (bölümleme, çelişki, OCR); ziyaretçi görmez
export type NoteStatus = 'open' | 'confirmed' | 'resolved' | 'wontfix';
export type QualityNote = { id: number; kind: string; note_tr: string; status: NoteStatus };

export type City = { slug: string; name_tr: string; name_en: string; lat: number | null; lon: number | null; monuments: number };
export type Book = { slug: string; title: string; city: string | null; images_draft: number; images: number };
export type Period = { slug: string; name_tr: string; parent: string | null; city: string | null; start: number; end: number };
export type LogRow = { at: string; actor: string; action: string; target: string; detail: Record<string, unknown> };
