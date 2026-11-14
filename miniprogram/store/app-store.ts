import { readAppData, writeAppData } from '../services/storage';
import type { AppData, LibraryFilter } from '../types/index';

type Listener = (data: AppData) => void;

let state: AppData = readAppData();
const listeners = new Set<Listener>();

/** tabBar 页面之间无法带 query，用这一项传递词库筛选条件。 */
let pendingLibraryFilter: LibraryFilter | null = null;

function notify(): void {
  listeners.forEach((listener) => listener(state));
}

export function getAppData(): AppData {
  return state;
}

/** 更新内存与本地存储，并通知订阅者。 */
export function updateAppData(mutator: (draft: AppData) => void): AppData {
  const draft: AppData = JSON.parse(JSON.stringify(state));
  mutator(draft);
  state = draft;
  writeAppData(state);
  notify();
  return state;
}

/** 用外部数据整体替换（导入恢复）。 */
export function replaceAppData(data: AppData): AppData {
  state = data;
  writeAppData(state);
  notify();
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setPendingLibraryFilter(filter: LibraryFilter | null): void {
  pendingLibraryFilter = filter;
}

/** 词库页读取后立即清空，避免下次进入时误用。 */
export function consumePendingLibraryFilter(): LibraryFilter | null {
  const filter = pendingLibraryFilter;
  pendingLibraryFilter = null;
  return filter;
}
