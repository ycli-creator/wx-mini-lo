import { lovePointsService } from '../../services/love-points'
import type { UsageMode } from '../../types/index'
import { showError } from '../../utils/ui'

Page({
  data: { selected: 'record' as UsageMode, busy: false },
  selectMode(event: WechatMiniprogram.TouchEvent) {
    this.setData({ selected: event.currentTarget.dataset.mode as UsageMode })
  },
  async continue() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await lovePointsService.updateUsageMode(this.data.selected)
      wx.reLaunch({ url: '/pages/start/index' })
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
})
