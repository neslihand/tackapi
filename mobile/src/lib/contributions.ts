// Ziyaretçi katkıları (backend/pipeline/visitors.py), the same as the site's: photos and texts that appear only after an
// administrator approves them, kept apart from the book and from the phone's own Hatıra Defteri.
import type { ImagePickerAsset } from 'expo-image-picker';
import { Platform } from 'react-native';
import { request } from './api';
import { canSend, type ContributionKind, type TextKind } from './contributionRules';

export type Contribution = { id: number; kind: ContributionKind; text_kind: TextKind | null; text_kind_label: string | null; body: string | null; author: string; created_at: string;
  image: { src: string; thumb: string; width: number | null; height: number | null } | null };
export type MyContribution = Contribution & { status: 'pending' | 'approved' | 'rejected'; reject_reason: string | null; monument: string; monument_name: string };

const path = (slug: string) => `/api/monuments/${encodeURIComponent(slug)}/contributions`;

export const contributionsApi = {
  approved: (slug: string) => request<Contribution[]>(path(slug)),
  mine: () => request<MyContribution[]>('/api/me/contributions'),
  send: (slug: string, d: { kind: ContributionKind; textKind: TextKind; body: string; photo: ImagePickerAsset | null }) => {
    if (!canSend(d.kind, d.body, Boolean(d.photo))) return Promise.reject(new Error('invalid'));
    const form = new FormData();
    form.append('kind', d.kind);
    if (d.body.trim()) form.append('body', d.body.trim());
    if (d.kind === 'text') form.append('text_kind', d.textKind);
    if (d.kind === 'photo' && d.photo) {
      // the browser's picker gives a File; React Native's FormData takes {uri, name, type}
      form.append('file', Platform.OS === 'web' && d.photo.file ? d.photo.file
        : { uri: d.photo.uri, name: d.photo.fileName ?? 'katki.jpg', type: d.photo.mimeType ?? 'image/jpeg' } as unknown as Blob);
    }
    return request<MyContribution>(path(slug), { method: 'POST', body: form });
  },
};
