import { CEFR_LEVELS } from '../../data/topics';
import { playAudio, subscribeAudio } from '../../services/audio';
import { getAppData } from '../../store/app-store';
import { WORDBOOK_GOAL_OPTIONS } from '../../services/storage';
import {
  addWords,
  classifyWordbook,
  clearWords,
  exportWordbookText,
  getWordbook,
  removeWords,
  rowsFor,
  searchIndex,
  setDailyGoal,
  setMaskMode,
  type WordbookIndexItem,
  type WordbookRow,
  type WordbookTab
} from '../../services/wordbook';
import type { Accent, CEFR, WordbookMaskMode } from '../../types/index';

type DialogKind = '' | 'goal' | 'cefr' | 'add';

interface TabItem {
  key: WordbookTab;
  label: string;
}

interface MaskOption {
  value: WordbookMaskMode;
  label: string;
}

const TABS: TabItem[] = [
  { key: 'today', label: '今日任务' },
  { key: 'learning', label: '在学单词' },
  { key: 'unlearned', label: '未学单词' },
  { key: 'easy', label: '简单词' }
];

const MASK_OPTIONS: MaskOption[] = [
  { value: 'none', label: '不遮挡' },
  { value: 'meaning', label: '遮挡释义' },
  { value: 'word', label: '遮挡单词' }
];

Page({
  data: {
    bookId: '',
    bookName: '',
    notFound: false,
    tabs: TABS,
    activeTab: 'today' as WordbookTab,
    rows: [] as WordbookRow[],
    count: 0,
    listCount: 0,
    reviewCount: 0,
    reviewOnly: false,
    cefrLevels: ['ALL', ...CEFR_LEVELS] as Array<CEFR | 'ALL'>,
    selectedCefr: 'ALL' as CEFR | 'ALL',
    maskOptions: MASK_OPTIONS,
    maskMode: 'meaning' as WordbookMaskMode,
    revealed: {} as Record<string, boolean>,
    removeMode: false,
    menuOpen: false,
    dialog: '' as DialogKind,
    goalOptions: WORDBOOK_GOAL_OPTIONS,
    dailyGoal: 20,
    searchKeyword: '',
    searchResults: [] as WordbookIndexItem[],
    accent: 'uk' as Accent,
    audioStatus: 'idle' as 'idle' | 'playing',
    lastPlayUrl: ''
  },

  onShareAppMessage() {
    return { title: '生词本词表 · 拾词Wordiary', path: '/pages/wordbook/wordbook' };
  },

  onLoad(options: Record<string, string | undefined>) {
    const instance = this as unknown as { _unsubAudio?: () => void };
    instance._unsubAudio = subscribeAudio((state) => {
      this.setData({
        audioStatus: state.status === 'playing' || state.status === 'loading' ? 'playing' : 'idle'
      });
    });
    this.setData({ bookId: options.id ?? '' });
    this.refresh();
  },

  onUnload() {
    const instance = this as unknown as { _unsubAudio?: () => void };
    instance._unsubAudio?.();
  },

  onShow() {
    // 从「我的」改过发音偏好、或从学习页返回后状态变化，都重新计算
    if (this.data.bookId) this.refresh();
  },

  refresh() {
    const book = getWordbook(this.data.bookId);
    if (!book) {
      this.setData({ notFound: true, rows: [] });
      return;
    }
    const ids = classifyWordbook(book)[this.data.activeTab];
    const allRows = rowsFor(ids);
    const rows = rowsFor(ids, {
      cefr: this.data.selectedCefr,
      reviewOnly: this.data.reviewOnly
    });
    this.setData({
      notFound: false,
      bookName: book.name,
      maskMode: book.maskMode,
      dailyGoal: book.dailyGoal,
      accent: getAppData().settings.accent,
      count: ids.length,
      listCount: rows.length,
      reviewCount: allRows.filter((row) => row.isReview).length,
      rows
    });
  },

  switchTab(event: WechatMiniprogram.TouchEvent) {
    this.setData({ activeTab: event.currentTarget.dataset.key as WordbookTab });
    this.refresh();
  },

  toggleReviewOnly() {
    this.setData({ reviewOnly: !this.data.reviewOnly });
    this.refresh();
  },

  openCefr() {
    this.setData({ dialog: 'cefr' });
  },

  chooseCefr(event: WechatMiniprogram.TouchEvent) {
    this.setData({ selectedCefr: event.currentTarget.dataset.value as CEFR | 'ALL', dialog: '' });
    this.refresh();
  },

  toggleMenu() {
    this.setData({ menuOpen: !this.data.menuOpen });
  },

  closeMenu() {
    this.setData({ menuOpen: false });
  },

  openGoal() {
    this.setData({ menuOpen: false, dialog: 'goal' });
  },

  chooseGoal(event: WechatMiniprogram.TouchEvent) {
    const goal = Number(event.currentTarget.dataset.value);
    setDailyGoal(this.data.bookId, goal);
    this.setData({ dialog: '', dailyGoal: goal });
    this.refresh();
  },

  toggleRemoveMode() {
    const removeMode = !this.data.removeMode;
    this.setData({ removeMode, menuOpen: false });
    wx.showToast({
      title: removeMode ? '点词条右侧「移除」' : '已退出移除',
      icon: 'none'
    });
  },

  removeOne(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    removeWords(this.data.bookId, [id]);
    this.refresh();
  },

  openAdd() {
    this.setData({ menuOpen: false, dialog: 'add', searchKeyword: '', searchResults: [] });
  },

  onSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const keyword = event.detail.value;
    this.setData({ searchKeyword: keyword, searchResults: searchIndex(keyword) });
  },

  addOne(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    addWords(this.data.bookId, [id]);
    this.refresh();
    wx.showToast({ title: '已加入本生词本', icon: 'none' });
  },

  clearAll() {
    this.setData({ menuOpen: false });
    wx.showModal({
      title: '一键清空？',
      content: '会清空该生词本内的全部词条，学习记录不受影响，且不可恢复。',
      confirmText: '清空',
      confirmColor: '#AD5038',
      success: (res) => {
        if (!res.confirm) return;
        clearWords(this.data.bookId);
        this.refresh();
      }
    });
  },

  chooseMask(event: WechatMiniprogram.TouchEvent) {
    const mode = event.currentTarget.dataset.value as WordbookMaskMode;
    setMaskMode(this.data.bookId, mode);
    this.setData({ maskMode: mode, menuOpen: false });
    this.refresh();
  },

  closeDialog() {
    this.setData({ dialog: '' });
  },

  noop() {},

  /** 点词条行临时揭示被遮挡的内容，再点收回。 */
  toggleReveal(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    this.setData({ [`revealed.${id}`]: !this.data.revealed[id] });
  },

  playRowAudio(event: WechatMiniprogram.TouchEvent) {
    const dataset = event.currentTarget.dataset;
    // 实时读取「我的」中的发音偏好，切换英音/美音后无需重建词表也能生效
    const accent = getAppData().settings.accent;
    const url = (accent === 'us' ? dataset.us : dataset.uk) as string;
    if (!url) return;
    playAudio(url);
    this.setData({ lastPlayUrl: url, audioStatus: 'playing' });
  },

  startStudy() {
    const book = getWordbook(this.data.bookId);
    if (!book || !book.wordIds.length) {
      wx.showToast({ title: '这个生词本还没有词', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/study/study?wordbook=${this.data.bookId}` });
  },

  startRush() {
    const book = getWordbook(this.data.bookId);
    if (!book || !book.wordIds.length) {
      wx.showToast({ title: '这个生词本还没有词', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/wordbook-rush/wordbook-rush?id=${this.data.bookId}` });
  },

  exportList() {
    const book = getWordbook(this.data.bookId);
    if (!book) return;
    wx.setClipboardData({
      data: exportWordbookText(book),
      success: () => wx.showToast({ title: '词表已复制到剪贴板', icon: 'none' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' })
    });
  },

  back() {
    wx.navigateBack();
  }
});
