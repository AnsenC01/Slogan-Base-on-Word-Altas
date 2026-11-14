import { WORD_INDEX } from './word-repo';
import type { Accent, QuizQuestion, QuizType, Word } from '../types/index';

const TYPE_LABELS: Record<QuizType, string> = {
  'meaning-choice': '看义选词',
  'image-fill': '看图补句',
  'audio-choice': '听音辨词',
  spelling: '拼写'
};

const TYPE_ORDER: QuizType[] = ['meaning-choice', 'image-fill', 'audio-choice', 'spelling'];

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 把例句中的目标词替换为下划线；若未命中则追加提示，保证题目可做。 */
function blankExample(word: Word): string {
  const pattern = new RegExp(`\\b${escapeRegExp(word.word)}\\b`, 'gi');
  const blanked = word.example.replace(pattern, '____');
  if (blanked !== word.example) return blanked;
  return `${word.example}（____）`;
}

/** 干扰项优先同话题，其次同 CEFR，最后从全词库补足。 */
function buildOptions(word: Word): string[] {
  const sameTopic = WORD_INDEX.filter((item) => item.id !== word.id && item.topicId === word.topicId);
  const sameLevel = WORD_INDEX.filter(
    (item) => item.id !== word.id && item.cefr === word.cefr && item.topicId !== word.topicId
  );
  const rest = WORD_INDEX.filter((item) => item.id !== word.id);

  const picked: string[] = [];
  [...sameTopic, ...sameLevel, ...rest].forEach((item) => {
    if (picked.length < 3 && !picked.includes(item.word)) picked.push(item.word);
  });
  return shuffle([word.word, ...picked]);
}

export function normalizeAnswer(value: string, quizType: QuizType): string {
  const trimmed = value.trim();
  return quizType === 'spelling' ? trimmed.toLowerCase() : trimmed;
}

/** 题干统一带词性前缀（如 "n. 图书馆；藏书室"），无词性时原样返回。 */
function promptOf(word: Word): string {
  return word.pos ? `${word.pos} ${word.meaningCN}` : word.meaningCN;
}

/**
 * 每个词分配一种题型；一轮题量 ≥ 4 时保证四种题型都出现。
 */
export function buildQuestions(words: Word[], accent: Accent): QuizQuestion[] {
  const offset = Math.floor(Math.random() * TYPE_ORDER.length);
  return words.map((word, index) => {
    const quizType = TYPE_ORDER[(index + offset) % TYPE_ORDER.length];
    const base: QuizQuestion = {
      id: `${word.id}:${quizType}`,
      wordId: word.id,
      quizType,
      quizLabel: TYPE_LABELS[quizType],
      prompt: promptOf(word),
      options: [],
      answer: word.word
    };

    if (quizType === 'meaning-choice') {
      base.options = buildOptions(word);
    } else if (quizType === 'image-fill') {
      base.prompt = '看图补全句子';
      base.hint = blankExample(word);
      base.imageUrl = word.imageUrl;
      base.options = buildOptions(word);
    } else if (quizType === 'audio-choice') {
      base.prompt = '听发音，选出你听到的单词';
      base.audioUrl = accent === 'us' ? word.audioUS : word.audioUK;
      base.options = buildOptions(word);
    } else {
      base.prompt = promptOf(word);
      base.hint = blankExample(word);
    }
    return base;
  });
}
