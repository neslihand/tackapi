// The quiz round as on the site (frontend/src/lib/quiz.ts): four questions, 25 points each. With fewer questions the
// round is as long as they are and the score still runs to 100.
export const ROUND_SIZE = 4;
export const roundScore = (right: number, total: number) => total ? Math.round(right / total * 100) : 0;
