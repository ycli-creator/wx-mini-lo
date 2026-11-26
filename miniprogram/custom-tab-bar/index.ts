import { MAIN_TABS as tabs } from '../utils/navigation'

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
