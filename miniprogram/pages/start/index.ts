import { lovePointsService } from '../../services/love-points'
import { isCloudEnabled } from '../../config/env'
import { showError } from '../../utils/ui'

Page({
  data: { loading: true, loadError: false, cloudEnabled: isCloudEnabled() },
  async onShow() { await this.refresh() },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      if (!state.profileComplete) {
        wx.navigateTo({ url: '/pages/profile/edit?onboarding=1' })
        return
      }
      if (state.bound) {
        wx.switchTab({ url: '/pages/home/index' })
        return
      }
    } catch (error) { this.setData({ loadError: true }); showError(error) }
    finally { this.setData({ loading: false }) }
  },
  goInvite() { wx.navigateTo({ url: '/pages/invite/create' }) },
  goJoin() { wx.navigateTo({ url: '/pages/invite/join' }) },
  goSolo() { wx.switchTab({ url: '/pages/home/index' }) },
})
