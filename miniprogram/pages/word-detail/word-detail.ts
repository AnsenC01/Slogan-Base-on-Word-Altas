import type { Word } from '../../types/index';
import { loadWordDetail, WORD_INDEX } from '../../services/word-repo';
import { setRecordStatus } from '../../services/learning';
import { getAppData } from '../../store/app-store';
import { topicName } from '../../data/topics';
import { playAudio } from '../../services/audio';
import { hasSeenDetailZoneHint, markDetailZoneHintSeen } from '../../services/storage';
import { isInDefaultWordbook, toggleDefaultWord } from '../../services/wordbook';

function statusLabelOf(status?: string): string {
  if (!status) return '未学';
  if (status === 'new') return '今日待学';
  if (status === 'learning') return '学习中';
  if (status === 'review') return '已学';
  return '已掌握';
}

Page({
  data: {
    word: null as Word | null,
    topicName: '',
    statusLabel: '未学',
    notFound: false,
    showDetailHint: false,
    /** 是否已加入默认生词本（右上角五角星）。 */
    starred: false
  },

  onShareAppMessage() {
    const word = this.data.word;
    if (!word) {
      return { title: '拾词Wordiary · 看图背单词', path: '/pages/home/home' };
    }
    return {
      title: `${word.word} · ${word.meaningCN}｜拾词Wordiary`,
      path: `/pages/word-detail/word-detail?id=${word.id}`
    };
  },

  onLoad(options: Record<string, string | undefined>) {
    // 详情页左右热区含义（标记已学 / 下一个单词）与学习页不同，独立提示一次
    this.setData({ showDetailHint: !hasSeenDetailZoneHint() });
    const id = options.id ?? '';
    loadWordDetail(id)
      .then((word) => {
        if (!word) {
          this.setData({ notFound: true });
          return;
        }
        this.setData({ word, topicName: topicName(word.topicId) });
        this.refreshStatus(word.id);
        // 进入详情自动播放口音对应的发音
        const accent = getAppData().settings.accent;
        playAudio(accent === 'us' ? word.audioUS : word.audioUK);
      })
      .catch(() => this.setData({ notFound: true }));
  },

  onShow() {
    if (this.data.word) this.refreshStatus(this.data.word.id);
  },

  refreshStatus(wordId: string) {
    const record = getAppData().records[wordId];
    this.setData({
      statusLabel: statusLabelOf(record?.status),
      starred: isInDefaultWordbook(wordId)
    });
  },

  /** 五角星：加入 / 移出用户设置的默认生词本。 */
  onStarTap() {
    const word = this.data.word;
    if (!word) return;
    const starred = toggleDefaultWord(word.id);
    this.setData({ starred });
    wx.showToast({
      title: starred ? '已加入默认生词本' : '已移出生词本',
      icon: 'none'
    });
  },

  /** 点词弹卡加入 / 移出生词本后，同步右上角五角星状态。 */
  onWordbookChange() {
    const word = this.data.word;
    if (!word) return;
    this.setData({ starred: isInDefaultWordbook(word.id) });
  },

  addToStudy() {
    // 用户已从底部按钮操作过，视为看过引导，避免跳词后每个详情页都重复提示
    this.dismissDetailHint();
    const word = this.data.word;
    if (!word) return;
    const record = getAppData().records[word.id];
    if (record && record.status !== 'mastered') {
      wx.showToast({ title: '已在学习计划中', icon: 'none' });
      return;
    }
    setRecordStatus(word.id, 'new');
    this.refreshStatus(word.id);
    wx.showToast({ title: '已加入今日学习', icon: 'none' });
  },

  markLearned() {
    this.dismissDetailHint();
    const word = this.data.word;
    if (!word) return;
    setRecordStatus(word.id, 'mastered');
    this.refreshStatus(word.id);
    wx.showToast({ title: '已标记为已学', icon: 'none' });
  },

  /** 词卡左右隐形热区：右侧＝下一个单词、左侧＝标记已学，与页面底部按钮等价。 */
  onZoneRate(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.word) return;
    const side = event.currentTarget.dataset.side as 'left' | 'right';
    if (side === 'right') this.nextWord();
    else this.markLearned();
  },

  /** 关闭详情页首次引导并写入独立的一次性标记。 */
  dismissDetailHint() {
    if (!this.data.showDetailHint) return;
    markDetailZoneHintSeen();
    this.setData({ showDetailHint: false });
  },

  /** 引导层左右框与隐形热区完全等价：先关闭引导，再执行对应动作。 */
  onGuideRate(event: WechatMiniprogram.TouchEvent) {
    this.dismissDetailHint();
    this.onZoneRate(event);
  },

  /** 按词库顺序进入下一个单词的详情页（redirectTo 替换当前页，避免页面栈堆积）。 */
  nextWord() {
    this.dismissDetailHint();
    const word = this.data.word;
    if (!word) return;
    const idx = WORD_INDEX.findIndex((item) => item.id === word.id);
    if (idx < 0 || idx + 1 >= WORD_INDEX.length) {
      wx.showToast({ title: '已经是最后一个单词', icon: 'none' });
      return;
    }
    wx.redirectTo({ url: `/pages/word-detail/word-detail?id=${WORD_INDEX[idx + 1].id}` });
  },

  back() {
    wx.navigateBack();
  }
});
