Component({
  properties: {
    label: { type: String, value: '' },
    state: { type: String, value: 'idle' },
    disabled: { type: Boolean, value: false }
  },
  methods: {
    onTap() {
      if (this.data.disabled) return;
      this.triggerEvent('select', { label: this.data.label });
    }
  }
});
