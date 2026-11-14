import { TOPICS } from '../../data/topics';
import { WORD_INDEX } from '../../services/word-repo';
import { getSummary } from '../../services/learning';
import { getAppData, setPendingLibraryFilter } from '../../store/app-store';

interface TopicStat {
  id: string;
  name: string;
  total: number;
  learned: number;
  learning: number;
  unlearned: number;
  percent: number;
  countsText: string;
}

Page({
  data: {
    totalWords: 0,
    learned: 0,
    percent: 0,
    todayNew: 0,
    due: 0,
    accuracy: 0,
    streakDays: 0,
    topics: [] as TopicStat[]
  },

  onShareAppMessage() {
    return { title: '词汇进度 · 拾词Wordiary', path: '/pages/progress/progress' };
  },

  onShareTimeline() {
    return { title: '词汇进度 · 拾词Wordiary', query: '' };
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const summary = getSummary();
    const data = getAppData();
    const topics: TopicStat[] = TOPICS.map((topic) => {
      const items = WORD_INDEX.filter((item) => item.topicId === topic.id);
      let learned = 0;
      let learning = 0;
      items.forEach((item) => {
        const record = data.records[item.id];
        if (!record) return;
        if (record.status === 'review' || record.status === 'mastered') learned += 1;
        else learning += 1;
      });
      const total = topic.wordCount;
      return {
        id: topic.id,
        name: topic.name,
        total,
        learned,
        learning,
        unlearned: total - learned - learning,
        percent: total > 0 ? Math.round((learned / total) * 100) : 0,
        countsText: `已学 ${learned} · 学习中 ${learning} · 未学 ${total - learned - learning}`
      };
    });

    this.setData({
      totalWords: summary.totalWords,
      learned: summary.learned,
      percent: summary.percent,
      todayNew: summary.todayNew,
      due: summary.due,
      accuracy: summary.accuracy,
      streakDays: data.stats.streakDays,
      topics
    });
  },

  onTopicTap(event: WechatMiniprogram.TouchEvent) {
    const topicId = event.currentTarget.dataset.id as string;
    setPendingLibraryFilter({ cefr: 'ALL', topicId, keyword: '' });
    wx.switchTab({ url: '/pages/library/library' });
  }
});
