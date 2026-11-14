import type { CEFR, LibraryFilter, WordStatus } from '../../types/index';
import { CEFR_LEVELS, TOPICS, topicName } from '../../data/topics';
import { filterWords, paginate } from '../../services/word-repo';
import { isInDefaultWordbook, toggleDefaultWord } from '../../services/wordbook';
import { consumePendingLibraryFilter, getAppData } from '../../store/app-store';
import { syncTabBar } from '../../utils/tabbar';

const PAGE_SIZE = 20;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

interface LibraryItem {
  id: string;
  word: string;
  phoneticUK: string;
  meaningCN: string;
  pos: string;
  cefr: CEFR;
  topicId: string;
  topicName: string;
  thumbUrl: string;
  status: WordStatus | 'unseen';
  statusLabel: string;
  /** 是否已在默认生词本中（五角星实心状态）。 */
  starred: boolean;
}

Page({
  data: {
    cefrLevels: ['ALL', ...CEFR_LEVELS] as Array<CEFR | 'ALL'>,
    topics: TOPICS,
    selectedCefr: 'ALL' as CEFR | 'ALL',
    selectedTopic: '',
    keyword: '',
    list: [] as LibraryItem[],
    total: 0,
    page: 1,
    hasMore: false
  },

  onShareAppMessage() {
    return { title: '词库 · 拾词Wordiary', path: '/pages/library/library' };
  },

  onShareTimeline() {
    return { title: '词库 · 拾词Wordiary', query: '' };
  },

  onShow() {
    syncTabBar(this, 3);
    const pending = consumePendingLibraryFilter();
    if (pending) {
      this.setData({
        selectedCefr: pending.cefr ?? 'ALL',
        selectedTopic: pending.topicId ?? '',
        keyword: pending.keyword ?? ''
      });
    }
    this.applyFilter();
  },

  onUnload() {
    if (searchTimer) clearTimeout(searchTimer);
  },

  decorate(items: ReturnType<typeof filterWords>): LibraryItem[] {
    const records = getAppData().records;
    return items.map((item) => {
      const record = records[item.id];
      const status: WordStatus | 'unseen' = record ? record.status : 'unseen';
      const statusLabel = !record
        ? '未学'
        : record.status === 'review' || record.status === 'mastered'
          ? '已学'
          : '学习中';
      return {
        id: item.id,
        word: item.word,
        phoneticUK: item.phoneticUK,
        meaningCN: item.meaningCN,
        pos: item.pos,
        cefr: item.cefr,
        topicId: item.topicId,
        topicName: topicName(item.topicId),
        thumbUrl: item.thumbUrl,
        status,
        statusLabel,
        starred: isInDefaultWordbook(item.id)
      };
    });
  },

  currentFilter(): LibraryFilter {
    return {
      cefr: this.data.selectedCefr,
      topicId: this.data.selectedTopic,
      keyword: this.data.keyword
    };
  },

  applyFilter() {
    const all = this.decorate(filterWords(this.currentFilter()));
    this.setData({
      list: paginate(all, 1, PAGE_SIZE),
      total: all.length,
      page: 1,
      hasMore: all.length > PAGE_SIZE
    });
  },

  onCefrTap(event: WechatMiniprogram.TouchEvent) {
    const cefr = event.currentTarget.dataset.cefr as CEFR | 'ALL';
    if (cefr === this.data.selectedCefr) return;
    this.setData({ selectedCefr: cefr });
    this.applyFilter();
  },

  onTopicTap(event: WechatMiniprogram.TouchEvent) {
    const topicId = event.currentTarget.dataset.id as string;
    this.setData({ selectedTopic: this.data.selectedTopic === topicId ? '' : topicId });
    this.applyFilter();
  },

  onSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ keyword: event.detail.value });
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      this.applyFilter();
    }, 300);
  },

  clearSearch() {
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  onReachBottom() {
    if (!this.data.hasMore) return;
    const page = this.data.page + 1;
    const all = this.decorate(filterWords(this.currentFilter()));
    this.setData({
      page,
      list: paginate(all, page, PAGE_SIZE),
      hasMore: all.length > page * PAGE_SIZE
    });
  },

  onWordTap(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/word-detail/word-detail?id=${id}` });
  },

  /** 五角星：加入 / 移出用户设置的默认生词本，只局部更新该行，不重置分页。 */
  onStarTap(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    const starred = toggleDefaultWord(id);
    const list = this.data.list.map((item) => (item.id === id ? { ...item, starred } : item));
    this.setData({ list });
    wx.showToast({
      title: starred ? '已加入默认生词本' : '已移出生词本',
      icon: 'none'
    });
  }
});
