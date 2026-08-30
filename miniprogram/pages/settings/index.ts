import { APP_VERSION, isCloudEnabled } from '../../config/env'
import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import { setActiveTab, showError } from '../../utils/ui'

Page({
  data: { state: createInitialState(), appVersion: APP_VERSION, modeLabel: isCloudEnabled() ? 'CloudBase 双人同步' : '本机体验数据', loading: true, loadError: false },
  async onShow() {
    setActiveTab(this, 4)
    await this.refresh()
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try { this.setData({ state: await lovePointsService.getState(), loading: false }) }
    catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  openUnbind() {
    if (this.data.loading || this.data.loadError) return
    wx.navigateTo({ url: this.data.state.unbindRequested ? '/pages/unbind/pending' : '/pages/unbind/pending?create=1' })
  },
  openRelationship() { wx.navigateTo({ url: '/pages/settings/relationship' }) },
  openFriends() { wx.navigateTo({ url: '/pages/friends/index' }) },
  async changePrivacy(event: WechatMiniprogram.SwitchChange) {
    const key = String(event.currentTarget.dataset.key || '') as keyof typeof this.data.state.profile.privacy
    if (!key) return
    const privacy = { ...this.data.state.profile.privacy, [key]: event.detail.value }
    try { this.setData({ 'state.profile.privacy': privacy }); this.setData({ state: await lovePointsService.updateProfilePrivacy(privacy) }) }
    catch (error) { await this.refresh(); showError(error) }
  },
})
