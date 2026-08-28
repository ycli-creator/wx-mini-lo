const tabs = [
  { pagePath: '/pages/home/index', text: '首页', icon: 'heart', activeIcon: 'heart-filled' },
  { pagePath: '/pages/task/index', text: '任务', icon: 'task', activeIcon: 'task-filled' },
  { pagePath: '/pages/community/index', text: '社区', icon: 'image', activeIcon: 'image-filled' },
  { pagePath: '/pages/documents/index', text: '文档', icon: 'book-open', activeIcon: 'book-open-filled' },
  { pagePath: '/pages/profile/index', text: '我的', icon: 'user-circle', activeIcon: 'user-circle-filled' },
]

Component({
  data: { selected: 0, tabs },
  methods: {
    switchTab(event: WechatMiniprogram.TouchEvent) {
      const index = Number(event.currentTarget.dataset.index)
      const tab = this.data.tabs[index]
      if (!tab) return
      wx.switchTab({ url: tab.pagePath })
      this.setData({ selected: index })
    },
  },
})
