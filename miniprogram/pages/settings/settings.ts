import type { Accent } from '../../types/index';
import { defaultAppData, DAILY_OPTIONS } from '../../services/storage';
import { exportAppData, parseImport } from '../../services/import-export';
import { getAppData, replaceAppData, updateAppData } from '../../store/app-store';
import { getSummary } from '../../services/learning';
import { syncTabBar } from '../../utils/tabbar';

Page({
  data: {
    dailyOptions: DAILY_OPTIONS,
    dailyNewWords: 20,
    retentionValue: 90,
    retentionText: '90%',
    accent: 'uk' as Accent,
    importText: '',
    progressLearned: 0,
    progressTotal: 0,
    progressPercent: 0,
    progressDays: 0
  },

  onShareAppMessage() {
    return { title: '拾词Wordiary · 本地优先的词汇学习', path: '/pages/settings/settings' };
  },

  onShareTimeline() {
    return { title: '拾词Wordiary · 本地优先的词汇学习', query: '' };
  },

  onShow() {
    syncTabBar(this, 4);
    this.refresh();
  },

  refresh() {
    const settings = getAppData().settings;
    const summary = getSummary();
    const value = Math.round(settings.desiredRetention * 100);
    const remaining = Math.max(0, summary.totalWords - summary.learned);
    this.setData({
      dailyNewWords: settings.dailyNewWords,
      retentionValue: value,
      retentionText: `${value}%`,
      accent: settings.accent,
      progressLearned: summary.learned,
      progressTotal: summary.totalWords,
      progressPercent: summary.percent,
      progressDays: remaining === 0 ? 0 : Math.ceil(remaining / settings.dailyNewWords)
    });
  },

  openProgress() {
    wx.navigateTo({ url: '/pages/progress/progress' });
  },

  setDaily(event: WechatMiniprogram.TouchEvent) {
    const value = Number(event.currentTarget.dataset.value);
    updateAppData((draft) => {
      draft.settings.dailyNewWords = value;
    });
    this.refresh();
  },

  onRetentionChange(event: WechatMiniprogram.CustomEvent<{ value: number }>) {
    const value = event.detail.value;
    updateAppData((draft) => {
      draft.settings.desiredRetention = value / 100;
    });
    this.setData({ retentionValue: value, retentionText: `${value}%` });
  },

  setAccent(event: WechatMiniprogram.TouchEvent) {
    const accent = event.currentTarget.dataset.accent as Accent;
    updateAppData((draft) => {
      draft.settings.accent = accent;
    });
    this.setData({ accent });
  },

  exportData() {
    const json = exportAppData(getAppData());
    wx.setClipboardData({
      data: json,
      success: () => {
        wx.showToast({ title: '已复制到剪贴板', icon: 'none' });
      },
      fail: () => {
        wx.showToast({ title: '复制失败', icon: 'none' });
      }
    });
  },

  onImportInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ importText: event.detail.value });
  },

  importFromText() {
    this.applyImport(this.data.importText);
  },

  chooseFile() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success: (res) => {
        const file = res.tempFiles[0];
        if (!file) return;
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'utf8',
          success: (read) => {
            const content = typeof read.data === 'string' ? read.data : String(read.data);
            this.setData({ importText: content });
            this.applyImport(content);
          },
          fail: () => {
            wx.showToast({ title: '文件读取失败', icon: 'none' });
          }
        });
      }
    });
  },

  applyImport(text: string) {
    const result = parseImport(text);
    const imported = result.data;
    if (!imported) {
      wx.showToast({ title: result.error, icon: 'none' });
      return;
    }
    wx.showModal({
      title: '覆盖本地数据？',
      content: '导入会替换当前学习记录、设置与 FSRS 卡片，且不可撤销。',
      confirmText: '覆盖',
      confirmColor: '#AD5038',
      success: (res) => {
        if (!res.confirm) return;
        replaceAppData(imported);
        this.refresh();
        wx.showToast({ title: '导入成功', icon: 'success' });
      }
    });
  },

  clearAll() {
    wx.showModal({
      title: '清除本地数据？',
      content: '学习记录、设置和 FSRS 卡片都会被删除，不可恢复。',
      confirmText: '清除',
      confirmColor: '#AD5038',
      success: (res) => {
        if (!res.confirm) return;
        replaceAppData(defaultAppData());
        this.setData({ importText: '' });
        this.refresh();
        wx.showToast({ title: '已清除', icon: 'none' });
      }
    });
  }
});
