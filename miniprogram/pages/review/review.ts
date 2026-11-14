import type { Word } from '../../types/index';
import { getAppData } from '../../store/app-store';
import { getDueRecords, recordReview } from '../../services/learning';
import { loadWordsByIds } from '../../services/word-repo';
import { Rating, type Grade } from '../../services/fsrs';
import { playAudio } from '../../services/audio';
import { hasSeenTapZoneHint, markTapZoneHintSeen } from '../../services/storage';

Page({
  data: {
    words: [] as Word[],
    index: 0,
    current: null as Word | null,
    total: 0,
    showAnswer: false,
    finished: false,
    empty: false,
    loading: true,
    correct: 0,
    reviewed: 0,
    showTapHint: false
  },

  onShareAppMessage() {
    return { title: 'FSRS 智能复习 · 拾词Wordiary', path: '/pages/home/home' };
  },

  onLoad() {
    // 与学习页共用同一个一次性引导标记：谁先进入词卡页谁提示
    this.setData({ showTapHint: !hasSeenTapZoneHint() });
    const records = getDueRecords();
    if (!records.length) {
      this.setData({ empty: true, loading: false });
      return;
    }
    loadWordsByIds(records.map((record) => record.wordId))
      .then((words) => {
        if (!words.length) {
          this.setData({ empty: true, loading: false });
          return;
        }
        this.setData({ words, total: words.length, current: words[0], loading: false });
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

  toggleAnswer() {
    this.setData({ showAnswer: !this.data.showAnswer });
  },

  /** 看答案前的快捷自评：认识直接以「良好」过卡进入下一个词；模糊/不认识翻开答案进入四档评分。 */
  onQuickRate(event: WechatMiniprogram.TouchEvent) {
    this.quickRate(event.currentTarget.dataset.rating as 'known' | 'unsure' | 'unknown');
  },

  /** 词卡左右隐形热区：等价于点击「不认识 / 认识」快捷按钮；答案翻开后按钮隐藏，不再响应。 */
  onZoneRate(event: WechatMiniprogram.TouchEvent) {
    this.quickRate(event.currentTarget.dataset.rating as 'known' | 'unknown');
  },

  /** 快捷自评与左右隐形热区共用的评分逻辑（仅在快捷按钮可见时生效）。 */
  quickRate(raw: 'known' | 'unsure' | 'unknown') {
    const current = this.data.current;
    if (!current || this.data.finished || this.data.showAnswer) return;
    if (raw === 'known') {
      recordReview(current.id, Rating.Good);
      this.advance(1);
      return;
    }
    this.setData({ showAnswer: true });
  },

  /** 关闭首次使用引导并写入一次性标记。 */
  dismissTapHint() {
    if (!this.data.showTapHint) return;
    markTapZoneHintSeen();
    this.setData({ showTapHint: false });
  },

  /** 引导层左右指示与隐形热区等价：左侧=不认识、右侧=认识，评分同时关闭引导。 */
  onGuideRate(event: WechatMiniprogram.TouchEvent) {
    this.dismissTapHint();
    this.quickRate(event.currentTarget.dataset.rating as 'known' | 'unknown');
  },

  onRate(event: WechatMiniprogram.TouchEvent) {
    const current = this.data.current;
    if (!current) return;
    const raw = event.currentTarget.dataset.rating as 'again' | 'hard' | 'good' | 'easy';
    const grade: Grade =
      raw === 'again' ? Rating.Again : raw === 'hard' ? Rating.Hard : raw === 'good' ? Rating.Good : Rating.Easy;

    recordReview(current.id, grade);
    this.advance(raw === 'again' ? 0 : 1);
  },

  /** 记分并推进到下一个词（结束则展示统计）。 */
  advance(correctDelta: 0 | 1) {
    const correct = this.data.correct + correctDelta;
    const nextIndex = this.data.index + 1;
    if (nextIndex >= this.data.words.length) {
      this.setData({ finished: true, correct, reviewed: this.data.total });
      return;
    }
    const next = this.data.words[nextIndex];
    this.setData({
      index: nextIndex,
      current: next,
      showAnswer: false,
      correct,
      reviewed: nextIndex
    });
    this.playAccentAudio(next);
  },

  backHome() {
    wx.navigateBack();
  }
});
