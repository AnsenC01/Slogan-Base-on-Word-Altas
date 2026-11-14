/**
 * 同步自定义 tabBar 的选中态。
 * getTabBar() 由小程序框架在 tab 页注入；非 tab 页或组件尚未就绪时静默跳过。
 */
export function syncTabBar(page: any, selected: number): void {
  const tabBar = typeof page?.getTabBar === 'function' ? page.getTabBar() : null;
  if (tabBar) tabBar.setData({ selected });
}
