import {
  createWordbook,
  deleteWordbook,
  getDefaultWordbookId,
  getWordbooks,
  renameWordbook,
  setDefaultWordbook
} from '../../services/wordbook';
import { DEFAULT_WORDBOOK_ID } from '../../services/storage';
import type { Wordbook } from '../../types/index';
import { syncTabBar } from '../../utils/tabbar';

type DialogMode = 'create' | 'edit';

/** 左滑手势起点与最近一次滑动时间（不进 setData，避免频繁渲染）。 */
let touchStartX = 0;
let touchStartY = 0;
let lastSwipeAt = 0;

Page({
  data: {
    books: [] as Wordbook[],
    totalWords: 0,
    defaultWordbookId: '',
    dialog: false,
    dialogMode: 'create' as DialogMode,
    draftName: '',
    editId: '',
    /** 当前编辑的本是否为用户设置的默认本（决定是否显示「设为默认」）。 */
    isDefaultBook: false,
    /** 当前编辑的本是否为固定本 id='default'（固定本不可删除）。 */
    isFixedBook: false,
    fixedBookId: DEFAULT_WORDBOOK_ID,
    /** 当前左滑展开删除按钮的本 id，同时只展开一个。 */
    swipedId: ''
  },

  onShareAppMessage() {
    return { title: '生词本 · 拾词Wordiary', path: '/pages/wordbook/wordbook' };
  },

  onShareTimeline() {
    return { title: '生词本 · 拾词Wordiary', query: '' };
  },

  onShow() {
    syncTabBar(this, 2);
    this.refresh();
  },

  refresh() {
    const books = getWordbooks();
    this.setData({
      books,
      totalWords: books.reduce((sum, book) => sum + book.wordIds.length, 0),
      defaultWordbookId: getDefaultWordbookId(),
      swipedId: ''
    });
  },

  /** 点击页面其它区域收起左滑；滑动刚结束时不处理，避免手势被当成点击。 */
  onPageTap() {
    if (Date.now() - lastSwipeAt < 350) return;
    if (this.data.swipedId) this.setData({ swipedId: '' });
  },

  onSwipeStart(event: WechatMiniprogram.TouchEvent) {
    const touch = event.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
  },

  onSwipeEnd(event: WechatMiniprogram.TouchEvent) {
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    // 位移太小或纵向为主时视为滚动/点击，不触发展开
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    lastSwipeAt = Date.now();
    const id = event.currentTarget.dataset.id as string;
    if (dx < 0) {
      if (id === DEFAULT_WORDBOOK_ID) {
        wx.showToast({ title: '固定生词本不可删除', icon: 'none' });
        return;
      }
      this.setData({ swipedId: id });
    } else if (this.data.swipedId === id) {
      this.setData({ swipedId: '' });
    }
  },

  /** 左滑露出的删除按钮：二次确认后删除整本，复用编辑弹层的警告文案。 */
  onSwipeDelete(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    if (!id || id === DEFAULT_WORDBOOK_ID) return;
    wx.showModal({
      title: '删除生词本？',
      content: '该生词本内的词条会一并移除，不可恢复。学习记录不受影响。',
      confirmText: '删除',
      confirmColor: '#AD5038',
      success: (res) => {
        if (!res.confirm) {
          this.setData({ swipedId: '' });
          return;
        }
        deleteWordbook(id);
        this.setData({ swipedId: '' });
        this.refresh();
        wx.showToast({ title: '已删除', icon: 'none' });
      }
    });
  },

  openList(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    wx.navigateTo({ url: `/pages/wordbook-list/wordbook-list?id=${id}` });
  },

  startStudy(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    const book = getWordbooks().find((item) => item.id === id);
    if (!book || !book.wordIds.length) {
      wx.showToast({ title: '这个生词本还没有词', icon: 'none' });
      return;
    }
    // 复用学习页：study.ts 通过 wordbook 参数取本内今日任务词
    wx.navigateTo({ url: `/pages/study/study?wordbook=${id}` });
  },

  openCreate() {
    this.setData({
      dialog: true,
      dialogMode: 'create',
      draftName: '',
      editId: '',
      isDefaultBook: false,
      isFixedBook: false
    });
  },

  onEdit(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as string;
    const book = getWordbooks().find((item) => item.id === id);
    if (!book) return;
    this.setData({
      dialog: true,
      dialogMode: 'edit',
      draftName: book.name,
      editId: id,
      isDefaultBook: id === this.data.defaultWordbookId,
      isFixedBook: id === DEFAULT_WORDBOOK_ID
    });
  },

  closeDialog() {
    this.setData({ dialog: false });
  },

  noop() {},

  onNameInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ draftName: event.detail.value });
  },

  confirmDialog() {
    const name = this.data.draftName.trim();
    if (!name) {
      wx.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }
    if (this.data.dialogMode === 'create') createWordbook(name);
    else renameWordbook(this.data.editId, name);
    this.setData({ dialog: false });
    this.refresh();
    wx.showToast({ title: this.data.dialogMode === 'create' ? '已新建' : '已保存', icon: 'none' });
  },

  /** 把当前编辑的本设为默认：之后自动收集与词库加星都写入它。 */
  confirmSetDefault() {
    const id = this.data.editId;
    if (!id || id === this.data.defaultWordbookId) return;
    setDefaultWordbook(id);
    this.setData({ dialog: false });
    this.refresh();
    wx.showToast({ title: '已设为默认生词本', icon: 'none' });
  },

  confirmDelete() {
    const id = this.data.editId;
    if (id === DEFAULT_WORDBOOK_ID) return;
    wx.showModal({
      title: '删除生词本？',
      content: '该生词本内的词条会一并移除，不可恢复。学习记录不受影响。',
      confirmText: '删除',
      confirmColor: '#AD5038',
      success: (res) => {
        if (!res.confirm) return;
        deleteWordbook(id);
        this.setData({ dialog: false });
        this.refresh();
      }
    });
  }
});
