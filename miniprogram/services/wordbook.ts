import { mediaUrls } from '../data/media';
import { getAppData, updateAppData } from '../store/app-store';
import { DEFAULT_WORDBOOK_ID, defaultWordbook, normalizeWordbooks } from './storage';
import { WORD_INDEX } from './word-repo';
import type { AppData, CEFR, Wordbook, WordbookMaskMode } from '../types/index';

/** 词表页四个分类 tab。 */
export type WordbookTab = 'today' | 'learning' | 'unlearned' | 'easy';

export interface WordbookRow {
  id: string;
  word: string;
  phoneticUK: string;
  pos: string;
  meaningCN: string;
  cefr: CEFR;
  /** 跟随发音偏好的单词发音 URL（词表刷新时派生）。 */
  audioUrl: string;
  /** 英音 / 美音原始 URL，点击时按当前设置实时取用，保证与「我的」偏好联动。 */
  audioUK: string;
  audioUS: string;
  /** FSRS 已到期，用于「复习词」标签与筛选。 */
  isReview: boolean;
  statusLabel: string;
}

export interface WordbookIndexItem {
  id: string;
  word: string;
  meaningCN: string;
  pos: string;
  cefr: CEFR;
}

const indexById = new Map(WORD_INDEX.map((item) => [item.id, item]));

/** mutator 内使用：保证 draft 上一定有生词本列表（正常已由 storage 归一化）。 */
function ensureBooks(draft: AppData): Wordbook[] {
  if (!Array.isArray(draft.wordbooks) || !draft.wordbooks.length) {
    draft.wordbooks = [defaultWordbook()];
  }
  return draft.wordbooks as Wordbook[];
}

export function getWordbooks(): Wordbook[] {
  return normalizeWordbooks(getAppData().wordbooks);
}

export function getWordbook(id: string): Wordbook | undefined {
  return getWordbooks().find((book) => book.id === id);
}

/** 当前「默认生词本」id：用户可指定，缺失或指向不存在的本时回退到第一个本。 */
export function defaultBookIdOf(data: AppData): string {
  const books: Wordbook[] =
    Array.isArray(data.wordbooks) && data.wordbooks.length
      ? (data.wordbooks as Wordbook[])
      : [defaultWordbook()];
  const id = data.defaultWordbookId;
  return typeof id === 'string' && books.some((book) => book.id === id) ? id : books[0].id;
}

export function getDefaultWordbookId(): string {
  return defaultBookIdOf(getAppData());
}

/** 用户自主设置哪一个生词本作为默认（自动收集 / 词库加星的目标）。 */
export function setDefaultWordbook(id: string): void {
  updateAppData((draft) => {
    const books = ensureBooks(draft);
    if (books.some((book) => book.id === id)) draft.defaultWordbookId = id;
  });
}

export function createWordbook(name: string): Wordbook {
  const book: Wordbook = {
    id: `wb-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: name.trim().slice(0, 40) || '新生成词本',
    createdAt: Date.now(),
    wordIds: [],
    dailyGoal: 20,
    maskMode: 'meaning'
  };
  updateAppData((draft) => {
    ensureBooks(draft).push(book);
  });
  return book;
}

export function renameWordbook(id: string, name: string): void {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return;
  updateAppData((draft) => {
    const book = ensureBooks(draft).find((item) => item.id === id);
    if (book) book.name = trimmed;
  });
}

/** 固定本（id='default'）不可删除；删除当前默认本时自动回退到第一个本。 */
export function deleteWordbook(id: string): void {
  if (id === DEFAULT_WORDBOOK_ID) return;
  updateAppData((draft) => {
    const books = ensureBooks(draft);
    draft.wordbooks = books.filter((book) => book.id !== id);
    if (!draft.wordbooks.length) draft.wordbooks = [defaultWordbook()];
    if (
      draft.defaultWordbookId === id ||
      !draft.wordbooks.some((book) => book.id === draft.defaultWordbookId)
    ) {
      draft.defaultWordbookId = draft.wordbooks[0].id;
    }
  });
}

/** 批量加词：只接受词库中存在的 id，按加入顺序去重。 */
export function addWords(id: string, wordIds: string[]): void {
  updateAppData((draft) => {
    const book = ensureBooks(draft).find((item) => item.id === id);
    if (!book) return;
    const set = new Set(book.wordIds);
    wordIds.forEach((wordId) => {
      if (indexById.has(wordId)) set.add(wordId);
    });
    book.wordIds = [...set];
  });
}

export function removeWords(id: string, wordIds: string[]): void {
  const removing = new Set(wordIds);
  updateAppData((draft) => {
    const book = ensureBooks(draft).find((item) => item.id === id);
    if (book) book.wordIds = book.wordIds.filter((wordId) => !removing.has(wordId));
  });
}

export function clearWords(id: string): void {
  updateAppData((draft) => {
    const book = ensureBooks(draft).find((item) => item.id === id);
    if (book) book.wordIds = [];
  });
}

export function setDailyGoal(id: string, goal: number): void {
  updateAppData((draft) => {
    const book = ensureBooks(draft).find((item) => item.id === id);
    if (book) book.dailyGoal = Math.min(500, Math.max(1, Math.round(goal)));
  });
}

export function setMaskMode(id: string, mode: WordbookMaskMode): void {
  updateAppData((draft) => {
    const book = ensureBooks(draft).find((item) => item.id === id);
    if (book) book.maskMode = mode;
  });
}

/**
 * 自动收集的 mutator 版本：写进用户设置的「默认生词本」（缺省为第一个本）。
 * 由 learning.ts 在 updateAppData 的回调内调用，避免嵌套写入覆盖状态。
 */
export function collectIntoDraft(draft: AppData, wordId: string): void {
  if (!indexById.has(wordId)) return;
  const books = ensureBooks(draft);
  const targetId = defaultBookIdOf(draft);
  const book = books.find((item) => item.id === targetId) ?? books[0];
  if (!book.wordIds.includes(wordId)) book.wordIds.push(wordId);
}

/** 供页面层直接调用（当前仅保留接口，主要入口是 collectIntoDraft）。 */
export function collectWord(wordId: string): void {
  updateAppData((draft) => collectIntoDraft(draft, wordId));
}

/** 词库列表 / 词条详情的五角星：该词是否已在默认生词本中。 */
export function isInDefaultWordbook(wordId: string): boolean {
  const data = getAppData();
  const id = defaultBookIdOf(data);
  return !!normalizeWordbooks(data.wordbooks)
    .find((book) => book.id === id)
    ?.wordIds.includes(wordId);
}

/** 点击五角星：加入或移出默认生词本，返回操作后的收藏状态。 */
export function toggleDefaultWord(wordId: string): boolean {
  if (!indexById.has(wordId)) return false;
  const wasStarred = isInDefaultWordbook(wordId);
  const bookId = getDefaultWordbookId();
  if (wasStarred) removeWords(bookId, [wordId]);
  else addWords(bookId, [wordId]);
  return !wasStarred;
}

/**
 * 四分类映射现有 LearningRecord.status 与 fsrsCard.due：
 * 今日任务＝到期或待学（按任务量取前 N）、在学单词＝learning/review、
 * 未学单词＝无记录/new、简单词＝mastered。
 */
export function classifyWordbook(book: Wordbook, now: number = Date.now()): Record<WordbookTab, string[]> {
  const data = getAppData();
  const ids = book.wordIds.filter((id) => indexById.has(id));
  const result: Record<WordbookTab, string[]> = {
    today: [],
    learning: [],
    unlearned: [],
    easy: []
  };
  ids.forEach((id) => {
    const status = data.records[id]?.status;
    if (status === 'mastered') result.easy.push(id);
    else if (status === 'learning' || status === 'review') result.learning.push(id);
    else result.unlearned.push(id);
  });
  const dueOrNew = ids.filter((id) => {
    const record = data.records[id];
    if (record?.status === 'mastered') return false;
    if (!record) return true;
    return record.status === 'new' || (record.fsrsCard?.due ?? Infinity) <= now;
  });
  result.today = dueOrNew.slice(0, Math.max(1, book.dailyGoal));
  return result;
}

/** 「开始学习」取词：生词本今日任务；为空时回退到本内全部词，保证按钮可用。 */
export function getStudyIds(bookId: string): string[] {
  const book = getWordbook(bookId);
  if (!book) return [];
  const today = classifyWordbook(book).today;
  return today.length ? today : book.wordIds.filter((id) => indexById.has(id));
}

/** 组装词表行（可按 CEFR 与「复习词」筛选）。 */
export function rowsFor(
  ids: string[],
  options: { cefr?: CEFR | 'ALL'; reviewOnly?: boolean } = {}
): WordbookRow[] {
  const data = getAppData();
  const accent = data.settings.accent;
  const now = Date.now();
  const cefr = options.cefr ?? 'ALL';
  const rows: WordbookRow[] = [];
  ids.forEach((id) => {
    const item = indexById.get(id);
    if (!item || (cefr !== 'ALL' && item.cefr !== cefr)) return;
    const record = data.records[id];
    const isReview =
      !!record?.fsrsCard && record.fsrsCard.due <= now && record.status !== 'mastered';
    if (options.reviewOnly && !isReview) return;
    const urls = mediaUrls(id);
    rows.push({
      id,
      word: item.word,
      phoneticUK: item.phoneticUK,
      pos: item.pos,
      meaningCN: item.meaningCN,
      cefr: item.cefr,
      audioUrl: accent === 'us' ? urls.us : urls.uk,
      audioUK: urls.uk,
      audioUS: urls.us,
      isReview,
      statusLabel: !record
        ? '未学'
        : record.status === 'mastered'
          ? '已掌握'
          : record.status === 'review'
            ? '已学'
            : '学习中'
    });
  });
  return rows;
}

/** 「添加生词」弹层的全库搜索。 */
export function searchIndex(keyword: string, limit: number = 20): WordbookIndexItem[] {
  const key = keyword.trim().toLowerCase();
  if (!key) return [];
  const result: WordbookIndexItem[] = [];
  for (const item of WORD_INDEX) {
    if (`${item.word} ${item.meaningCN}`.toLowerCase().includes(key)) {
      result.push({
        id: item.id,
        word: item.word,
        meaningCN: item.meaningCN,
        pos: item.pos,
        cefr: item.cefr
      });
      if (result.length >= limit) break;
    }
  }
  return result;
}

/** 「导出词表」：可读文本词表，复制到剪贴板，不写入任何文件/云端。 */
export function exportWordbookText(book: Wordbook): string {
  const rows = rowsFor(book.wordIds);
  const lines = [`${book.name} · 共 ${rows.length} 词`, ''];
  rows.forEach((row, index) => {
    lines.push(`${index + 1}. ${row.word} ${row.phoneticUK} ${row.pos} ${row.meaningCN}`);
  });
  return lines.join('\n');
}
