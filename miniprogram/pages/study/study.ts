import type { Word } from '../../types/index';
import { getAppData } from '../../store/app-store';
import {
  getSummary,
  getTodayNewWordIds,
  getTodayStudiedWordIds,
  recordStudy,
  type StudyRating
} from '../../services/learning';
import { loadWordsByIds } from '../../services/word-repo';
import { playAudio } from '../../services/audio';
import { hasSeenTapZoneHint, markTapZoneHintSeen } from '../../services/storage';
import { getStudyIds } from '../../services/wordbook';

Page({
  data: {
    words: [] as Word[],
    index: 0,
    current: null as Word | null,
    total: 0,
    showMeaning: false,
    rated: false,
    finished: false,
    empty: false,
    loading: true,
    showTapHint: false,
    /** 非空表示本轮来自生词本，结果页返回文案与去向相应调整。 */
    wordbookId: ''
  },

  onShareAppMessage() {
    return { title: '边看插画边背单词 · 拾词Wordiary', path: '/pages/home/home' };
  },

  onLoad(options: Record<string, string | undefined>) {
    // 第一次使用小程序时展示一次左右热区引导；关闭后写标记，之后不再出现
    this.setData({ showTapHint: !hasSeenTapZoneHint() });

    // 生词本「开始学习」：只替换取词来源，评分 / FSRS / 热区 / 本轮小测与普通学习完全一致
    const wordbookId = options.wordbook ?? '';
    if (wordbookId) {
      this.setData({ wordbookId });
      this.loadRound(getStudyIds(wordbookId));
      return;
    }

    const settings = getAppData().settings;
    const summary = getSummary();
    const remaining = Math.max(0, settings.dailyNewWords - summary.todayNew);
    if (remaining <= 0) {
      this.setData({ empty: true, loading: false });
      return;
    }
    this.loadRound(getTodayNewWordIds(remaining));
  },

  /** 加载本轮词卡并自动发音（普通学习与生词本学习共用）。 */
  loadRound(ids: string[]) {
    if (!ids.length) {
      this.setData({ empty: true, loading: false });
      return;
    }
    loadWordsByIds(ids)
      .then((words) => {
        if (!words.length) {
          this.setData({ empty: true, loading: false });
          return;
        }
        this.setData({ words, total: words.length, current: words[0], index: 0, loading: false });
        this.playAccentAudio(words[0]);
      })
      .catch(() => this.setData({ empty: true, loading: false }));
  },

  /** 进入新单词时自动播放口音对应的发音（默认英音，跟随设置里的 accent）。 */
  playAccentAudio(word: Word) {
    if (!word) return;
    const accent = getAppData().settings.accent;
    playAudio(accent === 'us' ? word.audioUS : word.audioUK);
  },

  toggleMeaning() {
    this.setData({ showMeaning: !this.data.showMeaning });
  },

  onRate(event: WechatMiniprogram.TouchEvent) {
    this.rateCurrent(event.currentTarget.dataset.rating as StudyRating);
  },

  /**
   * 词卡左右隐形热区：始终等价于当前界面上对应的可见按钮。
   *  - 未评分（三档自评可见）：右侧＝认识、左侧＝不认识；
   *  - 已评分、展开释义（并排的「隐藏释义 / 下一个」可见）：右侧＝下一个、左侧＝显示/隐藏释义。
   * data-rating 的 known / unknown 在这里只表示「右侧 / 左侧」。
   */
  onZoneRate(event: WechatMiniprogram.TouchEvent) {
    if (this.data.finished) return;
    const side = event.currentTarget.dataset.rating as StudyRating;
    if (this.data.rated) {
      if (side === 'known') this.goNext();
      else this.toggleMeaning();
      return;
    }
    this.rateCurrent(side);
  },

  /** 三档自评与左右隐形热区共用的评分逻辑。 */
  rateCurrent(rating: StudyRating) {
    if (this.data.finished || this.data.rated) return;
    const current = this.data.current;
    if (!current) return;

    recordStudy(current.id, rating);
    // 模糊/不认识：先展开释义让用户学习，再点「下一个」继续；
    // 认识：直接进入下一词。
    if (rating !== 'known' && !this.data.showMeaning) {
      this.setData({ rated: true, showMeaning: true });
      this.playAccentAudio(current);
      return;
    }
    this.goNext();
  },

  /** 关闭首次使用引导并写入一次性标记。 */
  dismissTapHint() {
    if (!this.data.showTapHint) return;
    markTapZoneHintSeen();
    this.setData({ showTapHint: false });
  },

  /** 引导层左右指示与隐形热区完全等价：先关闭引导，再按当前状态执行对应动作。 */
  onGuideRate(event: WechatMiniprogram.TouchEvent) {
    this.dismissTapHint();
    this.onZoneRate(event);
  },

  /** 进入下一个词（或完成本轮）。 */
  goNext() {
    if (this.data.finished) return;
    const nextIndex = this.data.index + 1;
    if (nextIndex >= this.data.words.length) {
      this.setData({ finished: true });
      return;
    }
    const next = this.data.words[nextIndex];
    this.setData({
      index: nextIndex,
      current: next,
      showMeaning: false,
      rated: false
    });
    this.playAccentAudio(next);
  },

  goPractice() {
    const ids = this.data.words.map((word) => word.id).join(',');
    const suffix = this.data.wordbookId ? `&wordbook=${this.data.wordbookId}` : '';
    wx.navigateTo({ url: `/pages/practice/practice?ids=${ids}${suffix}` });
  },

  /** 学习完成页直达今日单词小测（仅普通学习来源展示）。 */
  startDailyQuiz() {
    if (!getTodayStudiedWordIds().length) {
      wx.showToast({ title: '今天还没有学过单词', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/wordbook-rush/wordbook-rush?source=today' });
  },

  backHome() {
    // 生词本来源：回到生词本 tab 后打开该本的词表页（生词列表），避免退回已完成的学习页
    if (this.data.wordbookId) {
      const wordbookId = this.data.wordbookId;
      wx.switchTab({
        url: '/pages/wordbook/wordbook',
        success: () => {
          wx.navigateTo({ url: `/pages/wordbook-list/wordbook-list?id=${wordbookId}` });
        }
      });
      return;
    }
    wx.navigateBack();
  }
});
