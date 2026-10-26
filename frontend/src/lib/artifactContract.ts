import type { Artifact } from '../data/artifacts';

export type SourceReference = { title: string; url: string };
export type ArtifactChapter = { title: string; short: string; story?: string; child?: string };

export type ArtifactRecord = {
  id: string;
  slug: string;
  name: string;
  city: string;
  period: string;
  category: string;
  description: string;
  sourceReferences: SourceReference[];
  year?: string | null;
  architect?: string | null;
  coordinates?: [number, number] | null;
  image?: string | null;
  imageAlt?: string | null;
  chapters?: ArtifactChapter[] | null;
  detail?: Artifact['detail'] | null;
};

export type ArtifactFeed = { schemaVersion: 1; items: ArtifactRecord[] };

export type DiscoveryArtifact = Omit<Artifact, 'coordinates' | 'chapters' | 'detail'> & {
  coordinates: [number, number] | null;
  chapters: ArtifactChapter[];
  detail: Artifact['detail'] | null;
};

export type ArtifactFeedIssue = { path: string; message: string };
export type ArtifactFeedResult =
  | { ok: true; artifacts: DiscoveryArtifact[] }
  | { ok: false; issues: ArtifactFeedIssue[] };
