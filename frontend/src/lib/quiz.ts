import type { QuizQuestion } from '../data/artifacts';
import type { DiscoveryArtifact } from './artifactContract';
import { centuryOf, maskNames, shuffle, type Random } from './games.ts';
import { normalize } from './progress.ts';
import { centuryName, t } from './i18n.ts';

// Quiz questions built from the artifact records, so every collection (an external feed too) has a quiz.
// The right answer is the record's own value; the wrong ones are other artifacts' values for the same field, never
// made up. A question needs at least three distinct choices, otherwise it is not asked.
export type GeneratedKind = 'city' | 'architect' | 'century' | 'period' | 'detail';
const known = (value: string | null | undefined): value is string => Boolean(value && value.trim() && !/^(bilinmiyor|unknown)$/i.test(value.trim()));
const MAX_OPTIONS = 4;
const MIN_OPTIONS = 3;

// Keeps an explanation short: whole sentences up to about 280 characters.
function brief(text: string) {
  if (text.length <= 280) return text;
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  let out = '';
  for (const sentence of sentences) { if ((out + sentence).length > 280) break; out += sentence; }
  return (out || text.slice(0, 277) + '…').trim();
}

type Template = { kind: GeneratedKind; value: (a: DiscoveryArtifact) => string | null; question: (a: DiscoveryArtifact) => string; explanation: (a: DiscoveryArtifact, answer: string) => string };
const templates: Template[] = [
  { kind: 'city', value: a => known(a.city) ? a.city : null, question: a => t(`${a.name} hangi şehirde yer alır?`, `In which city is ${a.name}?`), explanation: (a, city) => t(`${a.name}, ${city} şehrindedir.`, `${a.name} is in ${city}.`) },
  { kind: 'architect', value: a => known(a.architect) ? a.architect : null, question: a => t(`${a.name} hangi mimarın ya da ustanın eseridir?`, `Which architect or master built ${a.name}?`), explanation: (a, who) => t(`Eser sayfasına göre ${a.name} eserinin mimarı ya da ustası ${who}.`, `According to its page, the architect or master of ${a.name} is ${who}.`) },
  { kind: 'century', value: a => { const c = centuryOf(a.year); return c ? centuryName(c) : null; }, question: a => t(`${a.name} hangi yüzyıla tarihlenir?`, `To which century does ${a.name} date?`), explanation: (a, century) => t(`${a.name} için verilen tarih ${a.year}; bu, ${century}a denk gelir.`, `The date given for ${a.name} is ${a.year}, which falls in the ${century}.`) },
  { kind: 'period', value: a => known(a.period) ? a.period : null, question: a => t(`${a.name} hangi döneme aittir?`, `Which era does ${a.name} belong to?`), explanation: (a, period) => t(`${a.name}, ${period} dönemine aittir.`, `${a.name} belongs to the ${period} era.`) },
];

function choices(correct: string, others: string[], random: Random) {
  const seen = new Set([normalize(correct)]);
  const wrong: string[] = [];
  for (const value of shuffle(others, random)) {
    const key = normalize(value);
    if (seen.has(key)) continue;
    seen.add(key); wrong.push(value);
    if (wrong.length === MAX_OPTIONS - 1) break;
  }
  if (wrong.length < MIN_OPTIONS - 1) return null;
  const options = shuffle([correct, ...wrong], random);
  return { options, answer: options.indexOf(correct) };
}

export function generateQuestions(artifacts: readonly DiscoveryArtifact[], random: Random = Math.random): QuizQuestion[] {
  const questions: QuizQuestion[] = [];
  for (const artifact of artifacts) {
    for (const template of templates) {
      const correct = template.value(artifact);
      if (!correct) continue;
      const others = artifacts.filter(a => a.id !== artifact.id).map(template.value).filter((v): v is string => Boolean(v));
      const picked = choices(correct, others, random);
      if (!picked) continue;
      questions.push({ id: `veri:${template.kind}:${artifact.id}`, question: template.question(artifact), ...picked, explanation: template.explanation(artifact, correct), artifactId: artifact.id });
    }
    // The detail question asks which artifact a documented detail belongs to; its text never names the artifact.
    if (artifact.detail) {
      const picked = choices(artifact.name, artifacts.filter(a => a.id !== artifact.id).map(a => a.name), random);
      if (picked) questions.push({ id: `veri:detail:${artifact.id}`, question: t(`“${maskNames(artifact.detail.title, artifact)}” hangi eserin mimari ayrıntısıdır?`, `Which work is “${maskNames(artifact.detail.title, artifact)}” an architectural detail of?`), ...picked, explanation: brief(artifact.detail.text), artifactId: artifact.id });
    }
  }
  return questions;
}

// Editor-written questions first in the pool, then generated ones; questions about artifacts no longer in the
// collection are dropped.
export function quizPool(written: readonly QuizQuestion[], artifacts: readonly DiscoveryArtifact[], random: Random = Math.random) {
  const ids = new Set(artifacts.map(a => a.id));
  return [...written.filter(q => ids.has(q.artifactId)), ...generateQuestions(artifacts, random)];
}

// A round asks about different artifacts where it can. With a focus, the round opens with a question about it
// (a quest step "answer a question about this artifact" links here).
export function pickQuizRound(pool: readonly QuizQuestion[], size: number, { focus, random = Math.random }: { focus?: string; random?: Random } = {}) {
  const shuffled = shuffle(pool, random);
  const round: QuizQuestion[] = [];
  const covered = new Set<string>();
  const first = focus ? shuffled.find(q => q.artifactId === focus) : undefined;
  if (first) { round.push(first); covered.add(first.artifactId); }
  for (const q of shuffled) if (round.length < size && !covered.has(q.artifactId)) { round.push(q); covered.add(q.artifactId); }
  for (const q of shuffled) if (round.length < size && !round.includes(q)) round.push(q);
  return round;
}

// Artifacts the quiz can ask about. Whether a generated question exists does not depend on the shuffle.
export const answerableArtifacts = (written: readonly QuizQuestion[], artifacts: readonly DiscoveryArtifact[]) => new Set(quizPool(written, artifacts).map(q => q.artifactId));
