/** 返回本地日期字符串，格式 YYYY-MM-DD。 */
export function dateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 返回距离今天的天数差（正数表示过去）。 */
export function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00`);
  const to = new Date(`${toKey}T00:00:00`);
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

/** 人性化展示今日日期，例如 11月6日 星期四。 */
export function todayLabel(date: Date = new Date()): string {
  const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${week[date.getDay()]}`;
}
