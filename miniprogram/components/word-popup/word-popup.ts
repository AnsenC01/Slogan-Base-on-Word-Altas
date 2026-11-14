import { mediaUrls } from '../../data/media';
import { playAudio } from '../../services/audio';
import { loadWordDetail } from '../../services/word-repo';
import {
  getWordById,
  type LookupWord
} from '../../services/word-lookup';
import { isInDefaultWordbook, toggleDefaultWord } from '../../services/wordbook';
import type { WordExample, WordSense } from '../../types/index';

/**
 * 点词弹卡：暖米浅色卡片，展示词、星标、英美音标与发音、简单释义，
 * 「详细释义」在卡内原地展开全部义项 + 一条例句，可加入/移出默认生词本。
 * 明确不做「问 AI」搜索框。简单释义全部来自主包索引（零延迟），
 * 只有展开详情时才按需 loadWordDetail 加载分包。
 * 弹层用 root-portal 渲染到页面根，避开词卡左右隐形热区与首次引导层的层级。
 */
Component({
  properties: {
    /** 空串表示关闭；值为词库词条 id。 */
    wordId: { type: String, value: '' },
    /** 被点击时的原文词形，词形还原命中时提示「例句中为 ...」。 */
    activeRaw: { type: String, value: '' }
  },
  data: {
    entry: null as LookupWord | null,
    fromRaw: '',
    starred: false,
    expanded: false,
    loadingDetail: false,
    senses: [] as WordSense[],
    example: null as WordExample | null,
    audioUK: '',
    audioUS: ''
  },
  observers: {
    'wordId, activeRaw'(id: string, raw: string) {
      if (!id) {
        this.setData({ entry: null, fromRaw: '', expanded: false, senses: [], example: null });
        return;
      }
      const entry = getWordById(id) ?? null;
      if (!entry) {
        this.setData({ entry: null, fromRaw: '' });
        return;
      }
      const urls = mediaUrls(id);
      this.setData({
        entry,
        fromRaw: raw && raw.toLowerCase() !== entry.word.toLowerCase() ? raw : '',
        starred: isInDefaultWordbook(id),
        expanded: false,
        loadingDetail: false,
        senses: [],
        example: null,
        audioUK: urls.uk,
        audioUS: urls.us
      });
    }
  },
  methods: {
    onClose() {
      this.triggerEvent('close');
    },
    /** 弹卡内部点击不冒泡到遮罩；catchtouchmove 阻止滚动穿透。 */
    onNoop() {},
    onPlayUK() {
      playAudio(this.data.audioUK);
    },
    onPlayUS() {
      playAudio(this.data.audioUS);
    },
    onToggleWordbook() {
      const id = this.data.wordId;
      if (!id) return;
      const starred = toggleDefaultWord(id);
      this.setData({ starred });
      wx.showToast({
        title: starred ? '已加入生词本' : '已移出生词本',
        icon: 'none',
        duration: 1200
      });
      this.triggerEvent('wordbookchange', { id, starred });
    },
    onToggleDetail() {
      if (this.data.expanded) {
        this.setData({ expanded: false });
        return;
      }
      if (this.data.senses.length) {
        this.setData({ expanded: true });
        return;
      }
      const id = this.data.wordId;
      if (!id || this.data.loadingDetail) return;
      this.setData({ loadingDetail: true });
      loadWordDetail(id)
        .then((word) => {
          if (this.data.wordId !== id) return;
          this.setData({
            loadingDetail: false,
            senses: word?.senses ?? [],
            example: word?.examples?.[0] ?? null,
            expanded: true
          });
        })
        .catch(() => {
          if (this.data.wordId !== id) return;
          this.setData({ loadingDetail: false });
        });
    }
  }
});
