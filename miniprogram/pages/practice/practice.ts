import type { QuizQuestion } from '../../types/index';
import { getAppData } from '../../store/app-store';
import { getTodayNewWordIds, recordPractice } from '../../services/learning';
import { loadWordsByIds } from '../../services/word-repo';
import { buildQuestions, normalizeAnswer } from '../../services/quiz';

Page({
  data: {
    queue: [] as QuizQuestion[],
    current: null as QuizQuestion | null,
    total: 0,
    answered: 0,
    correct: 0,
    firstResults: {} as Record<string, boolean>,
    selected: '',
    inputValue: '',
    feedback: '' as '' | 'correct' | 'wrong',
    finished: false,
    durationText: '',
    accuracy: 0,
    empty: false,
    loading: true,
    startedAt: 0,
    /** 由生词本学习页透传，结果页「返回」指向生词本。 */
    wordbookId: ''
  },

  onShareAppMessage() {
    return { title: '四种题型练单词 · 拾词Wordiary', path: '/pages/home/home' };
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ wordbookId: options.wordbook ?? '' });
    const rawIds = options.ids ? decodeURIComponent(options.ids) : '';
    const ids = rawIds.split(',').filter(Boolean);
    const settings = getAppData().settings;
    const requestIds = ids.length ? ids : getTodayNewWordIds(settings.dailyNewWords);
    if (!requestIds.length) {
      this.setData({ empty: true, loading: false });
      return;
    }
    loadWordsByIds(requestIds)
      .then((words) => {
        if (!words.length) {
          this.setData({ empty: true, loading: false });
          return;
        }
        const questions = buildQuestions(words, settings.accent);
        this.setData({
          queue: questions,
          current: questions[0],
          total: questions.length,
          startedAt: Date.now(),
          loading: false
        });
      })
      .catch(() => this.setData({ empty: true, loading: false }));
  },

  onSelect(event: WechatMiniprogram.CustomEvent<{ label: string }>) {
    this.submitAnswer(event.detail.label);
  },

  onInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ inputValue: event.detail.value });
  },

  onSubmit() {
    this.submitAnswer(this.data.inputValue);
  },

  submitAnswer(value: string) {
    const current = this.data.current;
    if (!current || this.data.feedback) return;
    if (!value.trim()) {
      wx.showToast({ title: '先作答再提交', icon: 'none' });
      return;
    }

    const correct =
      normalizeAnswer(value, current.quizType) === normalizeAnswer(current.answer, current.quizType);
    const isFirst = !(current.wordId in this.data.firstResults);
    const firstResults = { ...this.data.firstResults };
    if (isFirst) firstResults[current.wordId] = correct;

    const queue = [...this.data.queue];
    queue.shift();
    if (!correct) queue.push(current);

    this.setData({
      queue,
      feedback: correct ? 'correct' : 'wrong',
      selected: value,
      firstResults,
      answered: isFirst ? this.data.answered + 1 : this.data.answered,
      correct: isFirst && correct ? this.data.correct + 1 : this.data.correct
    });
  },

  continueNext() {
    if (!this.data.feedback) return;
    if (!this.data.queue.length) {
      this.finishRound();
      return;
    }
    this.setData({
      current: this.data.queue[0],
      feedback: '',
      selected: '',
      inputValue: ''
    });
  },

  finishRound() {
    const results = this.data.firstResults;
    Object.keys(results).forEach((wordId) => {
      recordPractice(wordId, results[wordId]);
    });

    const total = this.data.total;
    const accuracy = total > 0 ? Math.round((this.data.correct / total) * 100) : 0;
    const seconds = Math.max(1, Math.round((Date.now() - this.data.startedAt) / 1000));
    const durationText = `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
    this.setData({ finished: true, accuracy, durationText, queue: [], current: null });
  },

  backHome() {
    // 与学习页一致：生词本来源回到该本的词表页（生词列表）
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
  },

  goReview() {
    wx.redirectTo({ url: '/pages/review/review' });
  }
});
