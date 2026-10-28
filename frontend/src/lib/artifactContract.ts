<<<<<<< HEAD
import type { Artifact, QuizQuestion } from '../data/artifacts';
import type { Season } from '../data/collections';

// url is optional for book citations (an inventory book has no web address); when given it is https.
export type SourceReference = { title: string; url?: string };
=======
import type { Artifact } from '../data/artifacts';

export type SourceReference = { title: string; url: string };
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
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
<<<<<<< HEAD
  // true: found automatically and not yet verified; the map shows it as an approximate area, not an exact pin.
  coordinatesApproximate?: boolean;
=======
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
  image?: string | null;
  imageAlt?: string | null;
  chapters?: ArtifactChapter[] | null;
  detail?: Artifact['detail'] | null;
};

<<<<<<< HEAD
// seasons: optional discovery routes over the feed's items (artifactIds are item ids); quizQuestions: written quiz
// questions about the items.
export type ArtifactFeed = { schemaVersion: 1; items: ArtifactRecord[]; seasons?: Season[]; quizQuestions?: QuizQuestion[] };

export type DiscoveryArtifact = Omit<Artifact, 'coordinates' | 'chapters' | 'detail' | 'sourceReferences'> & {
  coordinates: [number, number] | null;
  coordinatesApproximate?: boolean;
  sourceReferences: SourceReference[];
=======
export type ArtifactFeed = { schemaVersion: 1; items: ArtifactRecord[] };

export type DiscoveryArtifact = Omit<Artifact, 'coordinates' | 'chapters' | 'detail'> & {
  coordinates: [number, number] | null;
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
  chapters: ArtifactChapter[];
  detail: Artifact['detail'] | null;
};

export type ArtifactFeedIssue = { path: string; message: string };
export type ArtifactFeedResult =
<<<<<<< HEAD
  | { ok: true; artifacts: DiscoveryArtifact[]; seasons: Season[]; quizQuestions: QuizQuestion[] }
=======
  | { ok: true; artifacts: DiscoveryArtifact[] }
>>>>>>> a7c8a0fe3a38724fb9ab1d30e17f1da754fde53d
  | { ok: false; issues: ArtifactFeedIssue[] };
