import type { Artifact } from '../data/artifacts';

// url is optional for book citations (an inventory book has no web address); when given it is https.
export type SourceReference = { title: string; url?: string };
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
  // true: found automatically and not yet verified; the map shows it as an approximate area, not an exact pin.
  coordinatesApproximate?: boolean;
  image?: string | null;
  imageAlt?: string | null;
  chapters?: ArtifactChapter[] | null;
  detail?: Artifact['detail'] | null;
};

export type ArtifactFeed = { schemaVersion: 1; items: ArtifactRecord[] };

export type DiscoveryArtifact = Omit<Artifact, 'coordinates' | 'chapters' | 'detail' | 'sourceReferences'> & {
  coordinates: [number, number] | null;
  coordinatesApproximate?: boolean;
  sourceReferences: SourceReference[];
  chapters: ArtifactChapter[];
  detail: Artifact['detail'] | null;
};

export type ArtifactFeedIssue = { path: string; message: string };
export type ArtifactFeedResult =
  | { ok: true; artifacts: DiscoveryArtifact[] }
  | { ok: false; issues: ArtifactFeedIssue[] };
