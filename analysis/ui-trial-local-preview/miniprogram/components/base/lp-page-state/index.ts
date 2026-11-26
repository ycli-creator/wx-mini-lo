Component({
  properties: {
    loading: { type: Boolean, value: false },
    loadingText: { type: String, value: '正在同步数据' },
    errorText: { type: String, value: '暂时无法加载，请稍后重试。' },
  },
  methods: {
    retry() {
      if (!this.data.loading) this.triggerEvent('retry')
    },
  },
})
