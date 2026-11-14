import {
  findPassage,
  getNeighborIds,
  getPassageContent,
  getPassageList,
  passageGroupLabel
} from '../../services/passage-repo';
import type { PassageKeyword, PassageSegment } from '../../types/passage';

interface RenderSegment extends PassageSegment {
  k: number;
}
interface RenderSense {
  k: number;
  pos: string;
  zh: string;
}
interface RenderZhLine {
  k: number;
  x: string;
}
interface ActiveKeyword {
  w: string;
  cefr: string;
  ipa: string;
  senses: RenderSense[];
}

/**
 * 翻页用 redirectTo 重建页面，开关状态存在模块作用域里，
 * 保证「显示中文 / 显示词注 / 重点词」在组内连续翻页时保持。
 */
let savedShowZh = false;
let savedShowGloss = false;
let savedShowKw = true;

Page({
  data: {
    id: '',
    titleEn: '',
    titleZh: '',
    groupLabel: '',
    seqText: '',
    kwText: '',
    segments: [] as RenderSegment[],
    zhLines: [] as RenderZhLine[],
    keywords: [] as PassageKeyword[],
    showZh: savedShowZh,
    showGloss: savedShowGloss,
    showKw: savedShowKw,
    activeKw: null as ActiveKeyword | null,
    prevId: null as string | null,
    nextId: null as string | null,
    pagerText: ''
  },

  onLoad(options) {
    const id = String(options.id ?? '');
    // 从目录进入回到默认口径；组内翻页不带 from，保持连续阅读时的开关状态
    if (String(options.from ?? '') === 'list') {
      savedShowZh = false;
      savedShowGloss = false;
      savedShowKw = true;
    }
    const meta = findPassage(id);
    const content = getPassageContent(id);
    if (!meta || !content) {
      wx.showToast({ title: '短文不存在', icon: 'none' });
      return;
    }
    const { prevId, nextId } = getNeighborIds(id);
    const total = getPassageList(meta.category).length;
    this.setData({
      id,
      titleEn: meta.en,
      titleZh: meta.zh ?? '',
      groupLabel: passageGroupLabel(meta.category),
      seqText: `${meta.index + 1} / ${total}`,
      kwText: `本篇重点词 ${meta.kwCount} 个 · ${meta.level} 起 · 点击可查词典义项`,
      segments: content.segments.map((seg, k) => ({ ...seg, k })),
      zhLines: content.zhLines.map((x, k) => ({ x, k })),
      keywords: content.keywords,
      showZh: savedShowZh,
      showGloss: savedShowGloss,
      showKw: savedShowKw,
      activeKw: null,
      prevId,
      nextId,
      pagerText: `${meta.index + 1} / ${total}`
    });
  },

  onShareAppMessage() {
    return { title: '拾词Wordiary · 短文记词', path: `/pages/passage-detail/passage-detail?id=${this.data.id}` };
  },

  onShareTimeline() {
    return { title: '拾词Wordiary · 短文记词', query: `id=${this.data.id}` };
  },

  toggleZh() {
    savedShowZh = !this.data.showZh;
    this.setData({ showZh: savedShowZh });
  },

  toggleGloss() {
    savedShowGloss = !this.data.showGloss;
    this.setData({ showGloss: savedShowGloss });
  },

  toggleKw() {
    savedShowKw = !this.data.showKw;
    this.setData({ showKw: savedShowKw, activeKw: null });
  },

  onKeywordTap(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.showKw) return;
    const ki = Number(event.currentTarget.dataset.ki);
    const kw = this.data.keywords[ki];
    if (!kw) return;
    const ipa = [kw.uk ? `英 ${kw.uk}` : '', kw.us ? `美 ${kw.us}` : ''].filter(Boolean).join('　');
    this.setData({
      activeKw: {
        w: kw.w,
        cefr: kw.cefr,
        ipa,
        senses: kw.ss.map((s, k) => ({ k, pos: s[0], zh: s[1] }))
      }
    });
  },

  closeKw() {
    this.setData({ activeKw: null });
  },

  noop() {},

  goPrev() {
    if (!this.data.prevId) return;
    wx.redirectTo({ url: `/pages/passage-detail/passage-detail?id=${this.data.prevId}` });
  },

  goNext() {
    if (!this.data.nextId) return;
    wx.redirectTo({ url: `/pages/passage-detail/passage-detail?id=${this.data.nextId}` });
  }
});
