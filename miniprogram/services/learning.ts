import { TOTAL_VOCAB_SIZE } from '../data/topics';
import { WORD_INDEX } from './word-repo';
import { getAppData, updateAppData } from '../store/app-store';
import type { LearningRecord, WordStatus } from '../types/index';
import { dateKey, daysBetween } from '../utils/date';
import { isMastered, reviewCard, Rating, type Grade } from './fsrs';
import { collectIntoDraft } from './wordbook';

export type StudyRating = 'known' | 'unsure' | 'unknown';

/** 取今日新词 id：优先加入今日学习的词，其次从未学过的词里按学习路径顺序补足。词条详情经 word-repo 的 loadWordsByIds 异步加载。 */
export function getTodayNewWordIds(limit: number): string[] {
  const data = getAppData();
  const seen = new Set<string>();
  const pool: string[] = [];
  Object.values(data.records).forEach((record) => {
    if (record.status === 'new' && !seen.has(record.wordId)) {
      seen.add(record.wordId);
      pool.push(record.wordId);
    }
  });
  WORD_INDEX.forEach((item) => {
    if (!data.records[item.id] && !seen.has(item.id)) {
      seen.add(item.id);
      pool.push(item.id);
    }
  });
  return pool.slice(0, Math.max(1, limit));
}

/**
 * 今日小测取词：今天首次接触，或今天学习 / 复习 / 标记过的词。
 * 与 getTodayNewWordIds（今日待学池）不同，学完的词会离开待学池，所以这里从
 * LearningRecord 反查；按词库学习路径顺序返回，保证每轮出题顺序稳定可复现。
 * limit > 0 时截取前 N 个，0 表示全部。
 */
export function getTodayStudiedWordIds(limit: number = 0): string[] {
  const today = dateKey();
  const ids = Object.values(getAppData().records)
    .filter((record) => dateKey(new Date(record.lastReviewedAt ?? record.firstSeenAt)) === today)
    .map((record) => record.wordId);
  const order = new Map(WORD_INDEX.map((item, index) => [item.id, index]));
  ids.sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER));
  return limit > 0 ? ids.slice(0, limit) : ids;
}

export function getDueRecords(now: number = Date.now()): LearningRecord[] {
  return Object.values(getAppData().records)
    .filter((record) => record.fsrsCard && record.fsrsCard.due <= now && record.status !== 'new')
    .sort((a, b) => (a.fsrsCard?.due ?? 0) - (b.fsrsCard?.due ?? 0));
}

export function getDueCount(now: number = Date.now()): number {
  return getDueRecords(now).length;
}

function ensureRecord(data: ReturnType<typeof getAppData>, wordId: string, now: number): LearningRecord {
  const existing = data.records[wordId];
  if (existing) return existing;
  data.stats.totalStudied += 1;
  const created: LearningRecord = {
    wordId,
    status: 'learning',
    firstSeenAt: now,
    correctCount: 0,
    wrongCount: 0
  };
  data.records[wordId] = created;
  return created;
}

function touchStreak(data: ReturnType<typeof getAppData>): void {
  const today = dateKey();
  if (data.stats.lastStudyDate === today) return;
  const previous = data.stats.lastStudyDate;
  if (!previous) {
    data.stats.streakDays = 1;
  } else {
    data.stats.streakDays = daysBetween(previous, today) === 1 ? data.stats.streakDays + 1 : 1;
  }
  data.stats.lastStudyDate = today;
}

/** 学习页的「认识 / 模糊 / 不认识」，首次评分同时创建 FSRS 卡；「不认识」自动进默认生词本。 */
export function recordStudy(wordId: string, rating: StudyRating): void {
  const now = Date.now();
  updateAppData((data) => {
    const record = ensureRecord(data, wordId, now);
    const grade = rating === 'known' ? Rating.Good : rating === 'unsure' ? Rating.Hard : Rating.Again;
    const card = reviewCard(record.fsrsCard, grade, now, data.settings.desiredRetention);
    record.fsrsCard = card;
    record.lastReviewedAt = now;
    record.status = isMastered(card) ? 'mastered' : card.state === 2 ? 'review' : 'learning';
    if (rating === 'known') record.correctCount += 1;
    if (rating === 'unknown') record.wrongCount += 1;
    if (rating === 'unknown') collectIntoDraft(data, wordId);
    touchStreak(data);
  });
}

/** 复习页的四档评分：忘记 / 困难 / 良好 / 容易；「忘记」自动进默认生词本。 */
export function recordReview(wordId: string, grade: Grade): void {
  const now = Date.now();
  updateAppData((data) => {
    const record = ensureRecord(data, wordId, now);
    const card = reviewCard(record.fsrsCard, grade, now, data.settings.desiredRetention);
    record.fsrsCard = card;
    record.lastReviewedAt = now;
    record.status = isMastered(card) ? 'mastered' : card.state === 2 ? 'review' : 'learning';
    if (grade === Rating.Again) record.wrongCount += 1;
    else record.correctCount += 1;
    if (grade === Rating.Again) collectIntoDraft(data, wordId);
    touchStreak(data);
  });
}

/** 练习结果只更新正确率统计，不推进 FSRS 调度；同一词累计答错 ≥2 次视为「反复记不住」，自动进默认生词本。 */
export function recordPractice(wordId: string, correct: boolean): void {
  const now = Date.now();
  updateAppData((data) => {
    const record = ensureRecord(data, wordId, now);
    if (correct) record.correctCount += 1;
    else record.wrongCount += 1;
    if (!correct && record.wrongCount >= 2) collectIntoDraft(data, wordId);
    if (record.status === 'new') record.status = 'learning';
  });
}

export function setRecordStatus(wordId: string, status: WordStatus): void {
  const now = Date.now();
  updateAppData((data) => {
    const record = ensureRecord(data, wordId, now);
    record.status = status;
    if (status !== 'new') record.lastReviewedAt = now;
  });
}

export interface Summary {
  totalWords: number;
  learned: number;
  learning: number;
  todayNew: number;
  due: number;
  accuracy: number;
  percent: number;
}

export function getSummary(): Summary {
  const data = getAppData();
  const records = Object.values(data.records);
  const learned = records.filter((record) => record.status === 'review' || record.status === 'mastered').length;
  const learning = records.filter((record) => record.status === 'new' || record.status === 'learning').length;
  const todayNew = records.filter((record) => dateKey(new Date(record.firstSeenAt)) === dateKey()).length;
  const correct = records.reduce((sum, record) => sum + record.correctCount, 0);
  const wrong = records.reduce((sum, record) => sum + record.wrongCount, 0);
  const totalWords = TOTAL_VOCAB_SIZE;
  return {
    totalWords,
    learned,
    learning,
    todayNew,
    due: getDueCount(),
    accuracy: correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0,
    percent: totalWords > 0 ? Math.round((learned / totalWords) * 100) : 0
  };
}
