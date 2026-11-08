// Which of the backend's sources an Esere Sor answer actually cites (same rule as the site's lib/vakifApi.ts).

/** The sources the answer cites ([S2], [S1, F0]): the backend sends every passage it gave the model, and for one work
 * those are much the same whatever the question. Sources without refs (older answers) are all kept. */
export function citedSources<T extends { ref?: string }>(answer: string, sources: T[]): T[] {
  if (!sources.some(s => typeof s.ref === 'string')) return sources;
  const cited = new Set([...answer.matchAll(/\[([SFT]\d*(?:\s*,\s*[SFT]\d*)*)\]/g)].flatMap(m => m[1].split(',').map(r => r.trim())));
  return sources.filter(s => s.ref !== undefined && cited.has(s.ref));
}
