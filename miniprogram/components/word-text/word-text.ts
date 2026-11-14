import { tokenize, type TextToken } from '../../services/word-lookup';

/**
 * 把中英混排文本切成 token 渲染：只有命中词库的英文词带 catchtap 与可点样式，
 * 中文、标点、词性缩写和未收录词输出为普通文本，不响应点击。
 * 字号/颜色/行高全部继承宿主节点，便于复用在例句、搭配、词族、义项等不同位置。
 */
Component({
  properties: {
    text: { type: String, value: '' },
    /** 当前弹卡对应的词条 id，用于给被点词加选中底色。 */
    activeId: { type: String, value: '' }
  },
  data: {
    tokens: [] as TextToken[]
  },
  lifetimes: {
    attached() {
      this.setData({ tokens: tokenize(this.data.text) });
    }
  },
  observers: {
    text(value: string) {
      this.setData({ tokens: tokenize(value) });
    }
  },
  methods: {
    onTokenTap(event: WechatMiniprogram.TouchEvent) {
      const id = event.currentTarget.dataset.id as string;
      const raw = event.currentTarget.dataset.raw as string;
      if (!id) return;
      this.triggerEvent('wordtap', { id, raw });
    }
  }
});
