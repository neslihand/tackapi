import { useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Compass, RotateCcw, Sparkles, X } from 'lucide-react';
import { type QuizQuestion } from '../data/artifacts';
import { useContent } from '../lib/contentStore';
import { pickRound, roundScore } from '../lib/content';
import { PageHeading } from '../components/UI';
import { Link } from '../lib/navigation';
import { useProgress } from '../lib/store';

export function Quiz() {
  const [stage, setStage] = useState<'intro' | 'playing' | 'result'>('intro');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const locked = useRef(false);
  const { finishQuiz, progress } = useProgress();
  const { quizQuestions, artifacts } = useContent();
  const [round, setRound] = useState<QuizQuestion[]>(() => pickRound(quizQuestions));
  const question = round[index];
  const answered = answers.length > index;
  const correct = answers.filter((answer, i) => answer === round[i].answer).length;
  const score = roundScore(correct, round.length);
  const total = String(round.length).padStart(2, '0');
  function choose(answer: number) { if (locked.current || answered) return; locked.current = true; setAnswers(a => [...a, answer]); }
  function next() {
    if (!answered) return;
    if (index === round.length - 1) { setStage('result'); finishQuiz(score); }
    else { setIndex(i => i + 1); locked.current = false; }
  }
  function restart() { locked.current = false; setRound(pickRound(quizQuestions)); setAnswers([]); setIndex(0); setStage('playing'); }
  return <div className="page-shell quiz-page"><PageHeading kicker="KEŞFEDEREK ÖĞREN" title={<>Tarihin <em>İzinde.</em></>}>Her soru, geçmişe açılan küçük bir pencere.</PageHeading><div className="quiz-paper">{stage === 'intro' ? <div className="quiz-intro"><span className="quiz-seal"><Compass size={64} strokeWidth={1} /></span><p className="eyebrow">BİR MERAK TURU</p><h2>İzleri birleştirmeye<br /><em>hazır mısın?</em></h2><p>{round.length} soruyla Anadolu’nun mirasına yaklaş.<br />Her cevaptan sonra yeni bir ayrıntı öğren.</p><div className="quiz-rules"><span>{round.length} soru</span><i>✧</i><span>100 puan üzerinden</span><i>✧</i><span>Süre sınırı yok</span></div><button className="button dark" onClick={restart}>Yolculuğa başla <ArrowRight size={18} /></button>{progress.quiz.completed > 0 && <small>Şimdiye kadarki en iyi puanın: {progress.quiz.best} / 100</small>}</div> : stage === 'playing' ? <div className="quiz-playing" key={index}><div className="quiz-top"><span>SORU {String(index + 1).padStart(2, '0')} / {total}</span><span>{score} PUAN</span></div><div className="quiz-progress">{round.map((_, i) => <span className={i <= index ? 'filled' : ''} key={i} />)}</div><h2>{question.question}</h2><div className="quiz-options">{question.options.map((option, i) => <button className={`${answered && i === question.answer ? 'correct' : ''} ${answered && answers[index] === i && i !== question.answer ? 'incorrect' : ''}`} key={option} onClick={() => choose(i)} disabled={answered}><span>{String.fromCharCode(65 + i)}</span>{option}{answered && i === question.answer && <Check size={20} />}{answered && answers[index] === i && i !== question.answer && <X size={20} />}</button>)}</div>{answered && <div className="quiz-feedback" role="status"><strong>{answers[index] === question.answer ? 'İzi doğru sürdün!' : 'Yeni bir bilgi keşfettin.'}</strong><p>{question.explanation}</p><button className="button dark" onClick={next}>{index === round.length - 1 ? 'Sonucumu gör' : 'Sonraki soru'} <ArrowRight size={17} /></button></div>}</div> : <div className="quiz-result"><Sparkles size={34} /><p className="eyebrow">YOLCULUK TAMAMLANDI</p><div className="quiz-score">{score}<span>/ 100</span></div><h2>{score >= 80 ? 'Geçmişin izini buldun.' : 'Merakın seni ileri taşıyor.'}</h2><p>{correct} / {round.length} doğru cevap, keşfedilecek daha nice hikâye.<br />Bilgi Avcısı madalyonun koleksiyonunda seni bekliyor.</p><div className="quiz-result-actions"><Link className="button dark" to="/basarimlar">Madalyonumu gör <ArrowUpRight size={18} /></Link><button className="text-link" onClick={restart}><RotateCcw size={16} /> Yeniden oyna</button></div><details className="quiz-review"><summary>Cevapları ve açıklamaları incele</summary>{round.map((q, i) => <div key={q.id}><strong>{i + 1}. {q.question}</strong><p>{q.options[q.answer]} — {q.explanation}</p><Link to={`/eser/${artifacts.find(a => a.id === q.artifactId)?.slug ?? q.artifactId}`}>Eserin hikâyesi <ArrowUpRight size={13} /></Link></div>)}</details></div>}</div></div>;
}
