import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, RotateCcw, Trophy, X } from 'lucide-react';
import { type QuizQuestion } from '../data/artifacts';
import { QuizMark } from '../components/PlayArt';
import { useContent } from '../lib/contentStore';
import { roundScore } from '../lib/content';
import { pickQuizRound, quizPool } from '../lib/quiz';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { useProgress } from '../lib/store';

// Four questions a round, so each correct answer is worth 25 points.
const ROUND = 4;
const pad = (n: number) => String(n).padStart(2, '0');

// The pool is the editors' questions plus those generated from the artifact records (src/lib/quiz.ts).
export function QuizStage({ onFinish, focus }: { onFinish: () => void; focus?: string }) {
  const { finishQuiz, answerCorrect } = useProgress();
  const { quizQuestions, artifacts } = useContent();
  const pool = useMemo(() => quizPool(quizQuestions, artifacts), [quizQuestions, artifacts]);
  const [round, setRound] = useState<QuizQuestion[]>(() => pickQuizRound(pool, ROUND, { focus }));
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const locked = useRef(false);
  const submitted = useRef(false);
  const acted = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const question = round[index];
  const answered = answers.length > index;
  const last = index === round.length - 1;
  const correct = answers.filter((answer, i) => answer === round[i].answer).length;
  const score = roundScore(correct, round.length);

  useEffect(() => {
    // The stage sits inside a longer page, so focus only moves after the visitor has acted.
    if (acted.current) stage.current?.querySelector<HTMLElement>(finished ? '#quiz-result-title' : '#quiz-question')?.focus();
  }, [finished, index, round]);

  function choose(answer: number) {
    if (locked.current || answered) return;
    locked.current = true;
    setAnswers(a => [...a, answer]);
    // A right answer counts for the artifact's quest step even if the round is left unfinished.
    if (answer === question.answer) answerCorrect(question.artifactId);
  }
  function next() {
    if (!answered || submitted.current) return;
    acted.current = true;
    if (last) { submitted.current = true; finishQuiz(score); onFinish(); setFinished(true); }
    else { setIndex(i => i + 1); locked.current = false; }
  }
  function restart() {
    acted.current = true; locked.current = false; submitted.current = false;
    setRound(pickQuizRound(pool, ROUND)); setAnswers([]); setIndex(0); setFinished(false);
  }

  if (!round.length) return <div className="qz-board qz-empty"><h3>{t('Bu koleksiyonun soruları hazırlanıyor.', 'The questions for this collection are being prepared.')}</h3><p>{t('Bu sırada bilgi kartlarını çevirerek eserleri tanıyabilirsin.', 'Meanwhile, you can get to know the works by turning the knowledge cards.')}</p><Link className="qz-next" to="/oyun/bilgi-kartlari">{t('Bilgi kartlarına geç', 'Go to the knowledge cards')} <ArrowUpRight size={17} aria-hidden="true" /></Link></div>;

  return <div className="qz-stage" ref={stage}>
    <div className="qz-strip"><p>{t('MİRAS KEŞFİ', 'HERITAGE DISCOVERY')} <span>/ {t('KISA SINAV', 'SHORT QUIZ')}</span></p><ol id="quiz-pips" className="qz-pips" aria-hidden="true">{round.map((q, i) => <li key={q.id} className={finished || i < index ? 'done' : i === index ? 'current' : ''} />)}</ol></div>
    <div className="qz-status"><p id="quiz-question-count" aria-hidden="true">{finished ? 'TUR TAMAMLANDI' : `SORU ${pad(index + 1)} / ${pad(round.length)}`}</p><p id="quiz-points"><Trophy size={18} aria-hidden="true" />{score} PUAN</p></div>
    {finished ? <section id="quiz-complete" className="qz-board qz-result" aria-labelledby="quiz-result-title">
      <p className="qz-kicker">YOLCULUK TAMAMLANDI</p>
      <h3 id="quiz-result-title" tabIndex={-1}>{score >= 75 ? t('Geçmişin izini buldun.', 'You found the trail of the past.') : t('Merakın seni ileri taşıyor.', 'Your curiosity carries you forward.')}</h3>
      <p className="qz-score"><span className="sr-only">{t(`Puanın: 100 üzerinden ${score}`, `Your score: ${score} out of 100`)}</span><span aria-hidden="true">{score}<small>/ 100</small></span></p>
      <p>{t(`${correct} / ${round.length} doğru cevap. Bilgi Avcısı madalyonun koleksiyonunda seni bekliyor.`, `${correct} / ${round.length} right answers. Your Knowledge Hunter medallion is waiting in your collection.`)}</p>
      <div className="qz-result-actions"><Link className="qz-next" to="/basarimlar">{t('Madalyonumu gör', 'See my medallion')} <ArrowUpRight size={17} aria-hidden="true" /></Link><button type="button" className="qz-ghost" onClick={restart}><RotateCcw size={16} aria-hidden="true" /> {t('Yeniden oyna', 'Play again')}</button></div>
      <details className="qz-review"><summary>{t('Cevapları ve açıklamaları incele', 'Review the answers and explanations')}</summary>{round.map((q, i) => {
        const artifact = artifacts.find(a => a.id === q.artifactId);
        return <div key={q.id}><h4>{i + 1}. {q.question}</h4><p>{t('Senin cevabın', 'Your answer')}: {q.options[answers[i]]} ({answers[i] === q.answer ? t('doğru', 'right') : t('yanlış', 'wrong')}).</p><p>{t('Doğru cevap', 'Right answer')}: {q.options[q.answer]}. {q.explanation}</p>{artifact && <Link to={`/eser/${artifact.slug}`}>{artifact.name}: {t('hikâyeyi oku', 'read the story')} <ArrowUpRight size={13} aria-hidden="true" /></Link>}</div>;
      })}</details>
    </section> : <div id="quiz-play" className="qz-board">
      <div className="qz-question-row"><h3 id="quiz-question" tabIndex={-1}><span className="sr-only">Soru {index + 1} / {round.length}: </span>{question.question}</h3><QuizMark n={index + 1} total={round.length} /></div>
      <div className="qz-divider" aria-hidden="true">✦</div>
      <div id="quiz-options" className="qz-options" role="group" aria-labelledby="quiz-question">{question.options.map((option, i) => {
        const isCorrect = answered && i === question.answer;
        const isIncorrect = answered && answers[index] === i && !isCorrect;
        return <button key={`${question.id}-${i}`} type="button" className={`qz-option ${isCorrect ? 'correct' : ''} ${isIncorrect ? 'incorrect' : ''}`} onClick={() => choose(i)} aria-disabled={answered}>
          <span className="qz-letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
          <span className="qz-option-text">{option}{isCorrect && <small>{t('Doğru cevap', 'Right answer')}{answers[index] === i ? t(' · Senin seçimin', ' · Your choice') : ''}</small>}{isIncorrect && <small>{t('Senin seçimin · Yanlış cevap', 'Your choice · Wrong answer')}</small>}</span>
          {isCorrect && <Check size={20} aria-hidden="true" />}{isIncorrect && <X size={20} aria-hidden="true" />}
        </button>;
      })}</div>
      <div id="quiz-feedback" className="qz-feedback" role="status" aria-atomic="true">{answered && <><span className={`qz-feedback-icon ${answers[index] === question.answer ? '' : 'wrong'}`} aria-hidden="true">{answers[index] === question.answer ? <Check size={18} /> : <X size={18} />}</span><div><strong>{answers[index] === question.answer ? t('Doğru cevap!', 'Right answer!') : t('Bu cevap doğru değil.', 'That answer is not right.')}</strong><p>{t('Doğru cevap', 'Right answer')}: {question.options[question.answer]}. {question.explanation}</p></div></>}</div>
      <div className="qz-foot"><p id="quiz-help">{!answered ? t('Bir yanıt seçerek başlayabilirsin.', 'Start by choosing an answer.') : last ? t('Tur bitti; puanını görebilirsin.', 'The round is over; you can see your score.') : t('Hazır olduğunda sonraki soruya geç.', 'Move to the next question when you are ready.')}</p><button id="quiz-next" type="button" className="qz-next" onClick={next} disabled={!answered}>{last ? t('Sonucumu gör', 'See my result') : t('Sonraki soru', 'Next question')} <ArrowUpRight size={17} aria-hidden="true" /></button></div>
    </div>}
  </div>;
}
