// The limits the server applies to a visitor's contribution (visitors.py), checked here too so the send button can say so.
export type ContributionKind = 'photo' | 'text';
export type TextKind = 'memory' | 'info' | 'correction';
export const TEXT_MIN = 20;
export const TEXT_MAX = 2000;
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function canSend(kind: ContributionKind, body: string, hasPhoto: boolean) {
  const n = body.trim().length;
  return kind === 'photo' ? hasPhoto && n <= TEXT_MAX : n >= TEXT_MIN && n <= TEXT_MAX;
}

/** Why a chosen photo cannot go; an unknown type or size is left for the server to judge. */
export function photoProblem(asset: { fileSize?: number | null; mimeType?: string | null }): 'too_big' | 'wrong_type' | null {
  if (asset.fileSize && asset.fileSize > PHOTO_MAX_BYTES) return 'too_big';
  if (asset.mimeType && !PHOTO_TYPES.includes(asset.mimeType)) return 'wrong_type';
  return null;
}

/** Where to go after signing in; only a screen of this app, never an outside address. */
export const afterSignIn = (next: string | null | undefined) => next && next.startsWith('/') && !next.startsWith('//') ? next : '/hesap';
