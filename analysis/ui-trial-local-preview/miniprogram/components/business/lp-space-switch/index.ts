import type { SpaceType } from '../../../types/index'

Component({
  properties: {
    active: { type: String, value: 'personal' },
    bound: { type: Boolean, value: false },
  },
  methods: {
    choose(event: WechatMiniprogram.TouchEvent) {
      const spaceType = event.currentTarget.dataset.space as SpaceType
      if (spaceType === 'couple' && !this.data.bound) {
        wx.showToast({ title: '绑定 TA 后会创建情侣空间', icon: 'none' })
        return
      }
      if (spaceType === this.data.active) return
      this.triggerEvent('change', { spaceType })
    },
  },
})
