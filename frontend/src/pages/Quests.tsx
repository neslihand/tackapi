import { useMemo } from 'react';
import { ArrowUpRight, BookOpen, Check, CircleHelp, Puzzle, Stamp } from 'lucide-react';
import { useContent } from '../lib/contentStore';
import { PLACEHOLDER_IMAGE } from '../lib/content';
import { Link } from '../lib/navigation';
import { t } from '../lib/i18n';
import { buildQuests, questRoutes, type Quest, type QuestStepKind } from '../lib/quests';
import { answerableArtifacts } from '../lib/quiz';
import { useProgress } from '../lib/store';

const stepIcon: Record<QuestStepKind, typeof BookOpen> = { read: BookOpen, puzzle: Puzzle, quiz: CircleHelp };

export function useQuests() {
  const { artifacts, seasons, quizQuestions } = useContent();
  const { progress } = useProgress();
  const answerable = useMemo(() => answerableArtifacts(quizQuestions, artifacts), [quizQuestions, artifacts]);
  return useMemo(() => buildQuests(questRoutes(seasons, artifacts), artifacts, progress, answerable), [seasons, artifacts, progress, answerable]);
}

function QuestCard({ quest }: { quest: Quest }) {
  const next = quest.steps.find(step => !step.done);
  const { artifacts } = useContent();
  // The route's stops, in order, as a strip of pictures across the top of the ticket.
  const stops = [...new Set(quest.steps.map(step => step.artifactId))].map(id => artifacts.find(a => a.id === id)).filter(a => a && a.image !== PLACEHOLDER_IMAGE);
  return <article className={`quest-card ${quest.complete ? 'complete' : ''}`} aria-labelledby={`quest-${quest.id}`}>
    <div className="quest-stops" aria-hidden="true">{stops.map((a, i) => <span key={a!.id} style={{ zIndex: stops.length - i }}><img src={a!.image} alt="" loading="lazy" /></span>)}<b>{stops.length} {t('DURAK', 'STOPS')}</b></div>
    <p className="quest-kicker">{quest.kicker}</p>
    <h3 id={`quest-${quest.id}`}>{quest.title}</h3>
    <p className="quest-text">{quest.description}</p>
    <div className="quest-progress"><span className="quest-bar" aria-hidden="true"><i style={{ width: `${quest.done / quest.steps.length * 100}%` }} /></span><span>{quest.done} / {quest.steps.length} {t('adım', 'steps')}</span></div>
    <ol className="quest-steps">{quest.steps.map((step, i) => {
      const Icon = step.done ? Check : stepIcon[step.kind];
      return <li key={i} className={step.done ? 'done' : ''}>
        <span className="quest-step-icon" aria-hidden="true"><Icon size={15} strokeWidth={step.done ? 3 : 1.8} /></span>
        {step.done ? <span>{step.label}<span className="sr-only">: {t('tamamlandı', 'done')}</span></span> : <Link to={step.to}>{step.label}</Link>}
      </li>;
    })}</ol>
    {quest.complete ? <p className="quest-done"><Stamp size={17} aria-hidden="true" />{t('GÖREV TAMAMLANDI', 'QUEST COMPLETE')}</p>
      : next && <Link className="quest-next" to={next.to}>{t('Sıradaki adım', 'Next step')}<span className="sr-only">: {next.label}</span> <ArrowUpRight size={17} aria-hidden="true" /></Link>}
  </article>;
}

export function QuestBoard() {
  const quests = useQuests();
  if (!quests.length) return <p role="status">{t('Bu koleksiyonda henüz görev yok. Keşif rotaları eklendiğinde burada görünecek.', 'There are no quests in this collection yet. They will appear here once discovery routes are added.')}</p>;
  return <ul className="quest-grid">{quests.map(quest => <li key={quest.id}><QuestCard quest={quest} /></li>)}</ul>;
}
