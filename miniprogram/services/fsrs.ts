import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs';
import type { FSRSCard } from '../types/index';

const schedulers = new Map<number, ReturnType<typeof fsrs>>();

function scheduler(retention: number): ReturnType<typeof fsrs> {
  let instance = schedulers.get(retention);
  if (!instance) {
    instance = fsrs({
      request_retention: retention,
      enable_fuzz: true,
      enable_short_term: true,
      learning_steps: ['1m', '10m'],
      relearning_steps: ['10m']
    });
    schedulers.set(retention, instance);
  }
  return instance;
}

function toCard(card: FSRSCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as State,
    last_review: card.lastReview ? new Date(card.lastReview) : undefined
  };
}

function fromCard(card: Card, seen: number): FSRSCard {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as FSRSCard['state'],
    lastReview: card.last_review ? card.last_review.getTime() : undefined,
    seen
  };
}

/** 按目标记忆率计算下一次复习时间；日期以 epoch 毫秒存储。 */
export function reviewCard(
  previous: FSRSCard | undefined,
  grade: Grade,
  now: number = Date.now(),
  retention: number = 0.9
): FSRSCard {
  const card = previous ? toCard(previous) : createEmptyCard(new Date(now));
  const next = scheduler(retention).next(card, new Date(now), grade).card;
  return fromCard(next, previous?.seen ?? now);
}

/** 长期记忆：Review 状态且稳定度 ≥ 21 天视为已掌握。 */
export const MASTERED_STABILITY = 21;

export function isMastered(card?: FSRSCard): boolean {
  return !!card && card.state === 2 && card.stability >= MASTERED_STABILITY;
}

export function formatInterval(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return '<1分';
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}小时`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}天`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}个月`;
  return `${(days / 365).toFixed(1)}年`;
}

export { Rating };
export type { Grade };
