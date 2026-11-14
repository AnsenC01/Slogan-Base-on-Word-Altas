import type { AppData, LearningRecord, Settings, Wordbook, WordbookMaskMode } from '../types/index';

const STORAGE_KEY = 'word-atlas:appdata:v1';

export const DEFAULT_SETTINGS: Settings = {
  dailyNewWords: 20,
  desiredRetention: 0.9,
  accent: 'uk'
};

export const DAILY_OPTIONS = [10, 20, 30, 50, 80, 100, 130, 150, 200, 300, 350, 400, 450, 500];

/** 默认生词本固定 id：不可删除，且始终是列表第一个（自动收集的目标本）。 */
export const DEFAULT_WORDBOOK_ID = 'default';
/** 「设置任务量」可选档位。 */
export const WORDBOOK_GOAL_OPTIONS = [10, 20, 30, 50, 80, 100, 150, 200];
const MASK_MODES: WordbookMaskMode[] = ['none', 'meaning', 'word'];

export function defaultWordbook(): Wordbook {
  return {
    id: DEFAULT_WORDBOOK_ID,
    name: '默认生词本',
    createdAt: Date.now(),
    wordIds: [],
    dailyGoal: 20,
    maskMode: 'meaning'
  };
}

/**
 * 归一化生词本列表：兼容 version 1 的旧备份（无 wordbooks 字段时补默认本），
 * 逐字段校验范围、去重词条、保证默认本存在且位于第一位。
 */
export function normalizeWordbooks(raw: unknown): Wordbook[] {
  const list = Array.isArray(raw) ? raw : [];
  const result: Wordbook[] = [];
  const usedIds = new Set<string>();
  list.forEach((item) => {
    if (!isObject(item)) return;
    const id = typeof item.id === 'string' && item.id ? item.id.slice(0, 64) : `wb-${result.length}`;
    if (usedIds.has(id) || result.length >= 50) return;
    usedIds.add(id);
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 40) : '生词本';
    const wordIds = Array.isArray(item.wordIds)
      ? [...new Set(item.wordIds.filter((w): w is string => typeof w === 'string' && !!w))].slice(0, 7298)
      : [];
    const goal = num(item.dailyGoal, 1, 500);
    const mask = MASK_MODES.includes(item.maskMode as WordbookMaskMode)
      ? (item.maskMode as WordbookMaskMode)
      : 'meaning';
    result.push({
      id,
      name,
      createdAt: typeof item.createdAt === 'number' && Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      wordIds,
      dailyGoal: goal !== null ? Math.round(goal) : 20,
      maskMode: mask
    });
  });
  if (!result.length) result.push(defaultWordbook());
  const defaultIndex = result.findIndex((book) => book.id === DEFAULT_WORDBOOK_ID);
  if (defaultIndex < 0) result.unshift(defaultWordbook());
  else if (defaultIndex > 0) {
    const [defaultBook] = result.splice(defaultIndex, 1);
    result.unshift(defaultBook);
  }
  return result;
}

export function defaultAppData(): AppData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    records: {},
    stats: { streakDays: 0, lastStudyDate: '', totalStudied: 0 },
    wordbooks: [defaultWordbook()],
    defaultWordbookId: DEFAULT_WORDBOOK_ID
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function num(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function normalizeSettings(raw: unknown): Settings {
  if (!isObject(raw)) return { ...DEFAULT_SETTINGS };
  const daily = num(raw.dailyNewWords, 1, 500);
  const retention = num(raw.desiredRetention, 0.5, 1);
  const accent = raw.accent === 'us' ? 'us' : 'uk';
  return {
    dailyNewWords: daily !== null ? (DAILY_OPTIONS.indexOf(daily) >= 0 ? daily : DEFAULT_SETTINGS.dailyNewWords) : DEFAULT_SETTINGS.dailyNewWords,
    desiredRetention: retention !== null ? retention : DEFAULT_SETTINGS.desiredRetention,
    accent
  };
}

function normalizeCard(raw: unknown): LearningRecord['fsrsCard'] {
  if (!isObject(raw)) return undefined;
  const due = num(raw.due, 0, 1e15);
  const stability = num(raw.stability, 0, 1e6);
  const difficulty = num(raw.difficulty, 0, 10);
  const elapsedDays = num(raw.elapsedDays, 0, 1e6);
  const scheduledDays = num(raw.scheduledDays, 0, 1e6);
  const learningSteps = num(raw.learningSteps, 0, 1e6);
  const reps = num(raw.reps, 0, 1e6);
  const lapses = num(raw.lapses, 0, 1e6);
  const state = raw.state;
  if (
    due === null ||
    stability === null ||
    difficulty === null ||
    elapsedDays === null ||
    scheduledDays === null ||
    learningSteps === null ||
    reps === null ||
    lapses === null ||
    (state !== 0 && state !== 1 && state !== 2 && state !== 3)
  ) {
    return undefined;
  }
  return {
    due,
    stability,
    difficulty,
    elapsedDays,
    scheduledDays,
    learningSteps,
    reps,
    lapses,
    state,
    lastReview: num(raw.lastReview, 0, 1e15) ?? undefined,
    seen: num(raw.seen, 0, 1e15) ?? undefined
  };
}

function normalizeRecord(raw: unknown, wordId: string): LearningRecord | null {
  if (!isObject(raw)) return null;
  const status = raw.status;
  if (status !== 'new' && status !== 'learning' && status !== 'review' && status !== 'mastered') {
    return null;
  }
  return {
    wordId: typeof raw.wordId === 'string' ? raw.wordId : wordId,
    status,
    firstSeenAt: typeof raw.firstSeenAt === 'number' ? raw.firstSeenAt : Date.now(),
    lastReviewedAt: typeof raw.lastReviewedAt === 'number' ? raw.lastReviewedAt : undefined,
    correctCount: typeof raw.correctCount === 'number' ? raw.correctCount : 0,
    wrongCount: typeof raw.wrongCount === 'number' ? raw.wrongCount : 0,
    fsrsCard: normalizeCard(raw.fsrsCard)
  };
}

/** 校验外部数据（导入/读取本地存储）并返回可用结构；不合法返回 null。 */
export function validateAppData(raw: unknown): AppData | null {
  if (!isObject(raw) || raw.version !== 1) return null;
  const rawRecords = raw.records;
  const rawStats = raw.stats;
  if (!isObject(rawRecords) || !isObject(rawStats)) return null;

  const records: Record<string, LearningRecord> = {};
  Object.keys(rawRecords).forEach((key) => {
    const record = normalizeRecord(rawRecords[key], key);
    if (record) records[key] = record;
  });

  const settings = normalizeSettings(raw.settings);
  const streakDays = num(rawStats.streakDays, 0, 100000);
  const totalStudied = num(rawStats.totalStudied, 0, 10000000);
  const lastStudyDate = typeof rawStats.lastStudyDate === 'string' ? rawStats.lastStudyDate : '';

  if (streakDays === null || totalStudied === null) return null;

  // 旧备份没有 wordbooks / defaultWordbookId 时自动补齐，version 仍保持 1
  const wordbooks = normalizeWordbooks(raw.wordbooks);
  const requestedDefault = raw.defaultWordbookId;
  const defaultWordbookId =
    typeof requestedDefault === 'string' && wordbooks.some((book) => book.id === requestedDefault)
      ? requestedDefault
      : wordbooks[0].id;

  return {
    version: 1,
    settings,
    records,
    stats: { streakDays, totalStudied, lastStudyDate },
    wordbooks,
    defaultWordbookId
  };
}

/** 读取本地数据；读取或校验失败时返回默认数据，不抛错。 */
export function readAppData(): AppData {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY);
    if (!raw) return defaultAppData();
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return validateAppData(parsed) ?? defaultAppData();
  } catch (error) {
    return defaultAppData();
  }
}

/** 写入本地数据，失败返回 false。 */
export function writeAppData(data: AppData): boolean {
  try {
    wx.setStorageSync(STORAGE_KEY, data);
    return true;
  } catch (error) {
    return false;
  }
}

/** 清除本地数据。 */
export function clearAppData(): boolean {
  try {
    wx.removeStorageSync(STORAGE_KEY);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * 左右热区「首次使用引导」标记。
 * 独立于 AppData：不改 PRD 定义的数据结构，也不进入导入 / 导出内容；
 * 「清除本地数据」不重置它——引导针对的是第一次使用小程序，而非清除数据后的第一次。
 * 学习 / 复习页与词条详情页左右区域含义不同，因此使用两个独立 key，各自提示一次。
 */
const TAP_ZONE_HINT_KEY = 'word-atlas:tap-zone-hint:v1';
const DETAIL_ZONE_HINT_KEY = 'word-atlas:detail-zone-hint:v1';

function hasSeenHint(key: string): boolean {
  try {
    return wx.getStorageSync(key) === true;
  } catch (error) {
    return false;
  }
}

function markHintSeen(key: string): void {
  try {
    wx.setStorageSync(key, true);
  } catch (error) {
    // 引导只是 UI 状态，写失败时静默忽略
  }
}

/** 学习 / 复习词卡：是否已看过「认识 / 不认识」引导。 */
export function hasSeenTapZoneHint(): boolean {
  return hasSeenHint(TAP_ZONE_HINT_KEY);
}

export function markTapZoneHintSeen(): void {
  markHintSeen(TAP_ZONE_HINT_KEY);
}

/** 词条详情页：是否已看过「标记已学 / 下一个单词」引导。 */
export function hasSeenDetailZoneHint(): boolean {
  return hasSeenHint(DETAIL_ZONE_HINT_KEY);
}

export function markDetailZoneHintSeen(): void {
  markHintSeen(DETAIL_ZONE_HINT_KEY);
}
