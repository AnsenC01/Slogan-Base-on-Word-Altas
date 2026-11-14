import type { AppData } from '../types/index';
import { validateAppData } from './storage';

export interface ImportResult {
  data: AppData | null;
  error: string;
}

/** 导出完整 AppData JSON 字符串。 */
export function exportAppData(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

/** 解析并校验导入内容；失败时返回可展示的错误信息。 */
export function parseImport(text: string): ImportResult {
  const trimmed = text.trim();
  if (!trimmed) return { data: null, error: '内容为空' };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch (error) {
    return { data: null, error: 'JSON 解析失败，请检查内容' };
  }
  const data = validateAppData(raw);
  if (!data) {
    return { data: null, error: '备份格式不正确，需要 version 为 1 的数据' };
  }
  return { data, error: '' };
}
