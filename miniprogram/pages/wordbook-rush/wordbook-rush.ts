import { playAudio, subscribeAudio } from '../../services/audio';
import { getAppData } from '../../store/app-store';
import { getStudyIds, getWordbook } from '../../services/wordbook';
import { getTodayStudiedWordIds } from '../../services/learning';
import { loadWordsByIds } from '../../services/word-repo';
import type { Word } from '../../types/index';

/**
 * 极速刷词：对当前生词本的今日任务词快速过一遍，只做「认识 / 不认识」判断。
 * 不写入 AppData / FSRS，避免快速浏览污染正式学习调度；不认识的词本来就在本内。
 */
Page({
  data: {
    bookId: '',
    bookName: '',
    words: [] as Word[],
    /** 首次加载的完整词表；「再刷一轮」始终回到它。 */
    originalWords: [] as Word[],
    /** 当前这一轮里被判为「不认识」的词，完成后可汇聚成新的一轮。 */
    unknownWords: [] as Word[],
    /** 当前是否处于「只刷不认识的词」的收敛轮。 */
    isUnknownRound: false,
    index: 0,
    current: null as Word | null,
    total: 0,
    showMeaning: false,
    known: 0,
    unknown: 0,
    finished: false,
    empty: false,
    loading: true,
    audioStatus: 'idle' as 'idle' | 'playing',
    lastPlayUrl: '',
    /** 当前点词弹卡对应的词条 id，空串表示关闭。 */
    popupId: '',
    /** 被点击时的原文词形。 */
    popupRaw: '',
    /** 'today'＝首页「今日单词小测」；空串＝生词本极速刷词。两种来源共用全部交互。 */
    source: '',
    /** 完成页返回按钮文案（小测回首页、极速刷词回词表）。 */
    backLabel: '返回词表'
  },

  onShareAppMessage() {
    return this.data.source === 'today'
      ? { title: '今日单词小测 · 拾词Wordiary', path: '/pages/home/home' }
      : { title: '极速刷词 · 拾词Wordiary', path: '/pages/wordbook/wordbook' };
  },

  onLoad(options: Record<string, string | undefined>) {
    const instance = this as unknown as { _unsubAudio?: () => void };
    instance._unsubAudio = subscribeAudio((state) => {
      this.setData({
        audioStatus: state.status === 'playing' || state.status === 'loading' ? 'playing' : 'idle'
      });
    });
    const source = options.source === 'today' ? 'today' : '';
    // 页面 json 的标题是静态的，小测来源要显示自己的名称
    wx.setNavigationBarTitle({ title: source === 'today' ? '今日单词小测' : '极速刷词' });
    if (source === 'today') {
      // 今日单词小测：考今天学过的词，不写 AppData / FSRS，交互与极速刷词完全一致
      this.setData({ source, bookName: '今日单词', backLabel: '返回首页' });
      loadWordsByIds(getTodayStudiedWordIds())
        .then((words) => this.initWords(words))
        .catch(() => this.setData({ empty: true, loading: false }));
      return;
    }
    const bookId = options.id ?? '';
    const book = getWordbook(bookId);
    if (!book || !book.wordIds.length) {
      this.setData({ empty: true, loading: false });
      return;
    }
    this.setData({ bookId, bookName: book.name });
    loadWordsByIds(getStudyIds(bookId))
      .then((words) => this.initWords(words))
      .catch(() => this.setData({ empty: true, loading: false }));
  },

  /** 两种来源共用的词表初始化：保存完整词表供「再刷一轮」恢复。 */
  initWords(words: Word[]) {
    if (!words.length) {
      this.setData({ empty: true, loading: false });
      return;
    }
    this.setData({
      words,
      originalWords: words,
      unknownWords: [],
      isUnknownRound: false,
      total: words.length,
      current: words[0],
      index: 0,
      loading: false
    });
  },

  onUnload() {
    const instance = this as unknown as { _unsubAudio?: () => void };
    instance._unsubAudio?.();
  },

  toggleMeaning() {
    this.setData({ showMeaning: !this.data.showMeaning });
  },

  onWordTap(event: { detail: { id: string; raw: string } }) {
    const { id, raw } = event.detail;
    if (!id) return;
    this.setData({ popupId: id, popupRaw: raw });
  },

  onPopupClose() {
    this.setData({ popupId: '', popupRaw: '' });
  },

  playWordAudio() {
    const word = this.data.current;
    if (!word) return;
    // 实时跟随「我的」发音偏好：英音用 audioUK，美音用 audioUS
    const accent = getAppData().settings.accent;
    const url = accent === 'us' ? word.audioUS : word.audioUK;
    playAudio(url);
    this.setData({ lastPlayUrl: url, audioStatus: 'playing' });
  },

  rate(event: WechatMiniprogram.TouchEvent) {
    const isKnown = event.currentTarget.dataset.known === '1';
    const current = this.data.current;
    const known = this.data.known + (isKnown ? 1 : 0);
    const unknown = this.data.unknown + (isKnown ? 0 : 1);
    // 本轮判为「不认识」的词按出现顺序收集，完成后可单独成轮
    const unknownWords =
      isKnown || !current ? this.data.unknownWords : [...this.data.unknownWords, current];
    const nextIndex = this.data.index + 1;
    if (nextIndex >= this.data.words.length) {
      this.setData({ known, unknown, unknownWords, finished: true, popupId: '', popupRaw: '' });
      return;
    }
    this.setData({
      index: nextIndex,
      current: this.data.words[nextIndex],
      showMeaning: false,
      popupId: '',
      popupRaw: '',
      known,
      unknown,
      unknownWords
    });
  },

  /** 再刷一轮：回到首次加载的完整词表。 */
  restart() {
    const words = this.data.originalWords;
    if (!words.length) {
      wx.showToast({ title: '没有可刷的词', icon: 'none' });
      return;
    }
    this.setData({
      words,
      total: words.length,
      index: 0,
      current: words[0],
      showMeaning: false,
      popupId: '',
      popupRaw: '',
      known: 0,
      unknown: 0,
      unknownWords: [],
      isUnknownRound: false,
      finished: false
    });
  },

  /**
   * 把本轮仍不认识的词单独汇聚成新的一轮再学一次。
   * 新的一轮会重新收集它自己的「不认识」词，因此可以反复收敛直到全部认识；
   * 与极速刷词整体一致，不写入 AppData / FSRS。
   */
  restartUnknown() {
    const words = this.data.unknownWords;
    if (!words.length) {
      wx.showToast({ title: '本轮没有不认识的词', icon: 'none' });
      return;
    }
    this.setData({
      words,
      total: words.length,
      index: 0,
      current: words[0],
      showMeaning: false,
      popupId: '',
      popupRaw: '',
      known: 0,
      unknown: 0,
      unknownWords: [],
      isUnknownRound: true,
      finished: false
    });
  },

  back() {
    // 小测从首页 tab 进入，用 switchTab 清掉页面栈回到首页；极速刷词仍退回词表页
    if (this.data.source === 'today') {
      wx.switchTab({ url: '/pages/home/home' });
      return;
    }
    wx.navigateBack();
  }
});
