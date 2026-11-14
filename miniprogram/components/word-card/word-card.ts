Component({
  properties: {
    word: { type: Object, value: null },
    showMeaning: { type: Boolean, value: false }
  },
  data: {
    imageError: false,
    retry: 0,
    /** 当前点词弹卡对应的词条 id，空串表示关闭。 */
    popupId: '',
    /** 被点击时的原文词形，词形还原命中时用于提示。 */
    popupRaw: ''
  },
  observers: {
    word() {
      // 切换词条时关闭可能残留的弹卡
      this.setData({ imageError: false, retry: 0, popupId: '', popupRaw: '' });
    }
  },
  methods: {
    onImageError() {
      this.setData({ imageError: true });
    },
    retryImage() {
      this.setData({ imageError: false, retry: this.data.retry + 1 });
    },
    onWordTap(event: { detail: { id: string; raw: string } }) {
      const { id, raw } = event.detail;
      if (!id) return;
      this.setData({ popupId: id, popupRaw: raw });
    },
    onPopupClose() {
      this.setData({ popupId: '', popupRaw: '' });
    },
    /** 弹卡加入/移出生词本后向页面冒泡，供词条详情页同步五角星状态。 */
    onWordbookChange(event: { detail: { id: string; starred: boolean } }) {
      this.triggerEvent('wordbookchange', event.detail);
    }
  }
});
