import type { CEFR } from '../types/index';

export interface Topic {
  id: string;
  name: string;
  /** 该话题在全量词库中的词数（生产环境词库口径）。 */
  wordCount: number;
}

/** 全量词库总词数（生产环境词库口径，与 vocab-index 一致，由 scripts/build-vocab.mjs 校验）。 */
export const TOTAL_VOCAB_SIZE = 7298;

/** 与上游词库一致的 19 个话题，wordCount 为全量词库中该话题的词数。 */
export const TOPICS: Topic[] = [
  { id: 'education', name: '教育', wordCount: 378 },
  { id: 'work', name: '职场', wordCount: 414 },
  { id: 'technology', name: '科技', wordCount: 206 },
  { id: 'science', name: '科学', wordCount: 325 },
  { id: 'environment', name: '环境', wordCount: 145 },
  { id: 'health', name: '健康', wordCount: 381 },
  { id: 'society', name: '社会', wordCount: 824 },
  { id: 'government', name: '政法', wordCount: 205 },
  { id: 'economy', name: '经济', wordCount: 266 },
  { id: 'media', name: '媒体', wordCount: 100 },
  { id: 'arts', name: '艺术', wordCount: 228 },
  { id: 'travel', name: '旅行', wordCount: 300 },
  { id: 'city', name: '城市', wordCount: 149 },
  { id: 'nature', name: '自然', wordCount: 443 },
  { id: 'daily', name: '生活', wordCount: 1828 },
  { id: 'emotion', name: '情感', wordCount: 364 },
  { id: 'thinking', name: '思维', wordCount: 516 },
  { id: 'sport', name: '运动', wordCount: 103 },
  { id: 'history', name: '历史', wordCount: 123 }
];

export const CEFR_LEVELS: CEFR[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function topicName(id: string): string {
  return TOPICS.find((t) => t.id === id)?.name ?? id;
}
