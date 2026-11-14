/** 词汇等级（CEFR）。 */
export type CEFR = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

/** 发音偏好。 */
export type Accent = 'uk' | 'us';

/** 学习状态。 */
export type WordStatus = 'new' | 'learning' | 'review' | 'mastered';

/** 完整释义中的单个义项（上游 senses[]，含词性、中文与英文释义）。 */
export interface WordSense {
  pos: string;
  zh: string;
  en: string;
}

/** 完整释义中的单条例句（上游 ex[]，仅文本，不含音频）。 */
export interface WordExample {
  en: string;
  zh: string;
}

/**
 * PRD 定义的词条结构。字段名不可修改。
 * meaningEN/example/exampleCN 仍取首义项、首例句，保证 quiz 与列表行为不变；
 * 以下新增字段承载完整释义，供词卡/详情页展开。
 */
export interface Word {
  id: string;
  word: string;
  phoneticUK: string;
  phoneticUS: string;
  /** 词性（合并去重，如 "n." 或 "n./v."）。 */
  pos: string;
  meaningCN: string;
  meaningEN: string;
  example: string;
  exampleCN: string;
  collocations?: string[];
  wordFamily?: string[];
  usageTip?: string;
  topicId: string;
  cefr: CEFR;
  imageUrl: string;
  thumbUrl: string;
  audioUK: string;
  audioUS: string;
  audioExample: string;
  /** 全部义项（1–3 条），按上游顺序。 */
  senses?: WordSense[];
  /** 全部例句文本（当前上游固定 2 条）。 */
  examples?: WordExample[];
  /** 同义词。 */
  synonyms?: string[];
  /** 反义词。 */
  antonyms?: string[];
  /** 用法注意/辨析（上游 note，仅少量词条有）。 */
  note?: string;
}

/**
 * 序列化后的 FSRS 卡。日期使用 epoch 毫秒，便于本地存储与导入导出。
 * state：0 New / 1 Learning / 2 Review / 3 Relearning。
 */
export interface FSRSCard {
  due: number;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  lastReview?: number;
  /** 首次接触该词的时间。 */
  seen?: number;
}

/** PRD 定义的学习记录。字段名不可修改。 */
export interface LearningRecord {
  wordId: string;
  status: WordStatus;
  firstSeenAt: number;
  lastReviewedAt?: number;
  correctCount: number;
  wrongCount: number;
  fsrsCard?: FSRSCard;
}

/** PRD 定义的设置。字段名不可修改。 */
export interface Settings {
  dailyNewWords: number;
  desiredRetention: number;
  accent: Accent;
}

/** 生词本词表的遮挡模式。 */
export type WordbookMaskMode = 'none' | 'meaning' | 'word';

/**
 * 生词本（用户明确要求的新功能，不属于 PRD 原有数据模型）。
 * 作为 AppData 的**可选**字段加入：旧备份（version 仍为 1）导入时由
 * services/storage.ts 的 normalizeWordbooks 补出默认生词本，字段名与已有字段互不冲突。
 */
export interface Wordbook {
  id: string;
  name: string;
  createdAt: number;
  /** 本内词条 id，按加入顺序保存、去重。 */
  wordIds: string[];
  /** 每日任务词数（词表页「设置任务量」）。 */
  dailyGoal: number;
  /** 词表遮挡模式。 */
  maskMode: WordbookMaskMode;
}

/** PRD 定义的应用数据。新增的生词本字段为可选，保证 version 1 旧数据可平滑导入。 */
export interface AppData {
  version: 1;
  settings: Settings;
  records: Record<string, LearningRecord>;
  stats: {
    streakDays: number;
    lastStudyDate: string;
    totalStudied: number;
  };
  /** 所有生词本；id 为 'default' 的本固定存在且不可删除，恒为列表第一个。 */
  wordbooks?: Wordbook[];
  /** 用户指定的「默认生词本」：自动收集与词库加星都写入该本；缺省时回退到第一个本。 */
  defaultWordbookId?: string;
}

/** 四种主动回忆题型。 */
export type QuizType = 'meaning-choice' | 'image-fill' | 'audio-choice' | 'spelling';

export interface QuizQuestion {
  /** 单题唯一标识，形如 `${wordId}:${quizType}`。 */
  id: string;
  wordId: string;
  quizType: QuizType;
  /** 题型展示名。 */
  quizLabel: string;
  /** 题干：中文释义、挖空例句、听音提示或拼写提示。 */
  prompt: string;
  /** 补充提示（挖空例句等）。 */
  hint?: string;
  /** 选择题选项；拼写题为空数组。 */
  options: string[];
  answer: string;
  imageUrl?: string;
  audioUrl?: string;
}

/** 词库筛选条件。 */
export interface LibraryFilter {
  cefr?: CEFR | 'ALL';
  topicId?: string;
  keyword?: string;
}
