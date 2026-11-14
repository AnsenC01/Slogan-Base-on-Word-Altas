/**
 * 短文记词（用户明确要求的新功能，不属于 PRD 原有数据模型）。
 * 短文是独立实体，不写入 AppData / FSRS，也不复用 Word.example / exampleCN。
 * 数据由 scripts/build-passages.mjs 生成，见 miniprogram/data/passages.ts。
 */

export type PassageCategory = 'ielts-passage' | 'bilingual-story';

/** 英文正文切片类型：0 普通文本 / 1 重点词 / 2 内联词注（可显隐）。 */
export type PassageSegmentType = 0 | 1 | 2;

export interface PassageSegment {
  t: PassageSegmentType;
  x: string;
  /** t=1 时指向 keywords 数组的下标。 */
  ki?: number;
}

/** 重点词弹卡所需信息，全部来自主包 7298 词索引，无需加载分包。 */
export interface PassageKeyword {
  /** 词库原形词条。 */
  w: string;
  /** 精简中文释义，用于内联词注。 */
  zh: string;
  cefr: string;
  uk: string;
  us: string;
  /** [词性, 中文义项]，最多 3 条。 */
  ss: [string, string][];
}

export interface PassageContent {
  id: string;
  /** 英文全文切片；过滤掉 t=2 后拼接即还原原文（含 \n）。 */
  segments: PassageSegment[];
  /** 中文译文按 \n 分段。 */
  zhLines: string[];
  keywords: PassageKeyword[];
  kwCount: number;
  /** 本篇重点词的 CEFR 起始等级（自适应）。 */
  level: string;
}

export interface PassageIndexItem {
  id: string;
  /** 原书编号，可能重复或跳号，仅作展示。 */
  no: string | null;
  en: string;
  zh: string | null;
  category: PassageCategory;
  kwCount: number;
  level: string;
  /** 在所属分组内的序号（0 起）。 */
  index: number;
}
