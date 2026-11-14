import { PASSAGE_GROUPS, getPassageList } from '../../services/passage-repo';
import type { PassageCategory, PassageIndexItem } from '../../types/passage';
import { syncTabBar } from '../../utils/tabbar';

Page({
  data: {
    groups: PASSAGE_GROUPS,
    group: 'ielts-passage' as PassageCategory,
    list: [] as PassageIndexItem[],
    total: 0
  },

  onShareAppMessage() {
    return { title: '拾词Wordiary · 短文记词', path: '/pages/passage-list/passage-list' };
  },

  onShareTimeline() {
    return { title: '拾词Wordiary · 短文记词', query: '' };
  },

  onShow() {
    syncTabBar(this, 1);
    this.refresh();
  },

  refresh() {
    const list = getPassageList(this.data.group);
    this.setData({ list, total: list.length });
  },

  onGroupTap(event: WechatMiniprogram.TouchEvent) {
    const group = event.currentTarget.dataset.key as PassageCategory;
    if (group === this.data.group) return;
    this.setData({ group });
    this.refresh();
  },

  openPassage(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    // from=list：从目录进入时重置三个开关为默认；组内翻页（redirectTo）不带此参数，保持状态
    wx.navigateTo({ url: `/pages/passage-detail/passage-detail?id=${id}&from=list` });
  }
});
