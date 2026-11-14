import { playAudio, stopAudio, subscribeAudio } from '../../services/audio';

Component({
  properties: {
    label: { type: String, value: '' },
    url: { type: String, value: '' },
    tone: { type: String, value: 'light' },
    /** 是否作为大腰形音频组内的分段按钮（去掉独立胶囊边框）。 */
    grouped: { type: Boolean, value: false }
  },
  data: {
    status: 'idle'
  },
  lifetimes: {
    attached() {
      const instance = this as unknown as { _unsubscribe?: () => void };
      instance._unsubscribe = subscribeAudio((state) => {
        this.setData({ status: state.url === this.data.url ? state.status : 'idle' });
      });
    },
    detached() {
      const instance = this as unknown as { _unsubscribe?: () => void };
      instance._unsubscribe?.();
    }
  },
  methods: {
    onTap() {
      if (!this.data.url) return;
      if (this.data.status === 'playing' || this.data.status === 'loading') {
        stopAudio();
      } else {
        playAudio(this.data.url);
      }
    }
  }
});
