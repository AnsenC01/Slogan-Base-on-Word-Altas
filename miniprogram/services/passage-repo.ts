import { PASSAGE_CONTENT, PASSAGE_INDEX } from '../data/passages';
import type { PassageCategory, PassageContent, PassageIndexItem } from '../types/passage';

export interface PassageGroup {
  key: PassageCategory;
  label: string;
  count: number;
}

/** 两个分组：40 篇雅思短文 / 27 篇双语小故事，互不串篇。 */
export const PASSAGE_GROUPS: PassageGroup[] = [
  { key: 'ielts-passage', label: '雅思短文', count: PASSAGE_INDEX.filter((p) => p.category === 'ielts-passage').length },
  { key: 'bilingual-story', label: '双语小故事', count: PASSAGE_INDEX.filter((p) => p.category === 'bilingual-story').length }
];

/** 按分组取目录（已按 id 升序，index 为组内序号）。 */
export function getPassageList(category: PassageCategory): PassageIndexItem[] {
  return PASSAGE_INDEX.filter((item) => item.category === category);
}

export function findPassage(id: string): PassageIndexItem | undefined {
  return PASSAGE_INDEX.find((item) => item.id === id);
}

export function getPassageContent(id: string): PassageContent | undefined {
  return PASSAGE_CONTENT[id];
}

/** 组内上一篇 / 下一篇；翻页不跨分组。 */
export function getNeighborIds(id: string): { prevId: string | null; nextId: string | null } {
  const meta = findPassage(id);
  if (!meta) return { prevId: null, nextId: null };
  const list = getPassageList(meta.category);
  return {
    prevId: meta.index > 0 ? list[meta.index - 1].id : null,
    nextId: meta.index < list.length - 1 ? list[meta.index + 1].id : null
  };
}

export function passageGroupLabel(category: PassageCategory): string {
  return PASSAGE_GROUPS.find((group) => group.key === category)?.label ?? '';
}
