const rootRoutes = new Set([
  'pages/start/index',
  'pages/home/index',
  'pages/task/index',
  'pages/community/index',
  'pages/profile/index',
])

Component({
  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    interceptBack: { type: Boolean, value: false },
  },
  data: { showBack: false },
  lifetimes: {
    attached() {
      const pages = getCurrentPages()
      const route = pages[pages.length - 1]?.route || ''
      this.setData({ showBack: Boolean(route && !rootRoutes.has(route)) })
    },
  },
  methods: {
    goBack() {
      if (this.properties.interceptBack) { this.triggerEvent('back'); return }
      if (getCurrentPages().length > 1) {
        wx.navigateBack()
        return
      }
      wx.reLaunch({ url: '/pages/start/index' })
    },
  },
})
