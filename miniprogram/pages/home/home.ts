import { getAppData } from '../../store/app-store';
import { getSummary, getTodayNewWordIds, getTodayStudiedWordIds } from '../../services/learning';
import { todayLabel } from '../../utils/date';
import { syncTabBar } from '../../utils/tabbar';

Page({
  data: {
    today: '',
    streakDays: 0,
    newGoal: 20,
    todayNew: 0,
    newRemaining: 0,
    due: 0,
    learned: 0,
    totalWords: 0,
    percent: 0,
    accuracy: 0,
    /** 今天学过的词数，用于「今日单词小测」按钮。 */
    quizCount: 0
  },

  onShareAppMessage() {
    return { title: '拾词Wordiary · 看图背单词', path: '/pages/home/home' };
  },

  onShareTimeline() {
    return { title: '拾词Wordiary · 看图背单词', query: '' };
  },

  onShow() {
    syncTabBar(this, 0);
    this.refresh();
  },

  refresh() {
    const data = getAppData();
    const summary = getSummary();
    const available = getTodayNewWordIds(data.settings.dailyNewWords).length;
    const remaining = Math.max(0, data.settings.dailyNewWords - summary.todayNew);
    this.setData({
      today: todayLabel(),
      streakDays: data.stats.streakDays,
      newGoal: data.settings.dailyNewWords,
      todayNew: summary.todayNew,
      newRemaining: Math.min(remaining, available),
      due: summary.due,
      learned: summary.learned,
      totalWords: summary.totalWords,
      percent: summary.percent,
      accuracy: summary.accuracy,
      quizCount: getTodayStudiedWordIds().length
    });
  },

  startStudy() {
    if (this.data.newRemaining <= 0) {
      wx.showToast({ title: '今日新词已完成', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/study/study' });
  },

  startReview() {
    if (this.data.due <= 0) {
      wx.showToast({ title: '暂无到期复习', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/review/review' });
  },

  /** 今日单词小测：复用极速刷词的交互，数据源换成今天学过的词。 */
  startDailyQuiz() {
    if (this.data.quizCount <= 0) {
      wx.showToast({ title: '今天还没有学过单词', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/wordbook-rush/wordbook-rush?source=today' });
  }
});
