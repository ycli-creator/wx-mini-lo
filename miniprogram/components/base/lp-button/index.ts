Component({
  properties: {
    label: { type: String, value: '' },
    variant: { type: String, value: 'primary' },
    disabled: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    openType: { type: String, value: '' },
  },
  methods: {
    handleTap() { if (!this.data.disabled && !this.data.loading) this.triggerEvent('tap') },
  },
})
