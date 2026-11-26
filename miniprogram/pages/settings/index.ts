import { APP_VERSION } from '../../config/env'
import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import { showError } from '../../utils/ui'

Page({
  data: {
    state: createInitialState(), appVersion: APP_VERSION, loading: true, loadError: false, busy: false,
    privacyOptions: [
      { key: 'searchableByCode', label: '允许通过身份码找到我', couple: false },
      { key: 'showPartner', label: '展示伴侣身份', couple: true },
      { key: 'showRelationshipDays', label: '展示相伴天数', couple: true },
      { key: 'showHeat', label: '展示情侣热力', couple: true },
    ],
  },
  async onShow() {
    await this.refresh()
  },
  async refresh() {
    if (this.data.busy) return
    this.setData({ loading: true, loadError: false })
    try { this.setData({ state: await lovePointsService.getState(), loading: false }) }
    catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  async openUnbind() {
    if (this.data.loading || this.data.loadError) return
    if (!this.data.state.bound) return
    if (!this.data.state.unbindRequested) {
      const result = await wx.showModal({ title: '申请解除绑定？', content: '对方同意后，情侣空间会被冻结归档，记录不会带入下一段关系。', confirmText: '发起申请', cancelText: '取消', confirmColor: '#b72f46' })
      if (!result.confirm) return
    }
    wx.navigateTo({ url: this.data.state.unbindRequested ? '/pages/unbind/pending' : '/pages/unbind/pending?create=1' })
  },
  openRelationship() { wx.navigateTo({ url: '/pages/settings/relationship' }) },
  openFriends() { wx.navigateTo({ url: '/pages/friends/index' }) },
  openPolicies() { wx.navigateTo({ url: '/pages/legal/index' }) },
  async changePrivacy(event: WechatMiniprogram.SwitchChange) {
    const key = String(event.currentTarget.dataset.key || '') as keyof typeof this.data.state.profile.privacy
    const previous = this.data.state.profile.privacy
    if (this.data.busy || this.data.loading || this.data.loadError || !(key in previous)) return
    if (key !== 'privateMode' && previous.privateMode) return
    const privacy = key === 'privateMode'
      ? { privateMode: event.detail.value, searchableByCode: false, showPartner: false, showRelationshipDays: false, showHeat: false, showDocumentCount: false }
      : { ...previous, [key]: event.detail.value }
    this.setData({ busy: true, 'state.profile.privacy': privacy })
    try { this.setData({ state: await lovePointsService.updateProfilePrivacy(privacy) }) }
    catch (error) { this.setData({ 'state.profile.privacy': previous }); showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async changeUsageMode(event: WechatMiniprogram.TouchEvent) {
    const usageMode = String(event.currentTarget.dataset.mode || 'record') as 'record' | 'social'
    if (this.data.busy || usageMode === this.data.state.preferences.usageMode) return
    this.setData({ busy: true })
    try {
      const result = await wx.showModal({ title: usageMode === 'record' ? '切换到专注记录？' : '切换到分享生活？', content: usageMode === 'record' ? '将关闭身份码搜索及伴侣、相伴天数等主页信息展示。' : '将允许他人通过身份码找到你，并关闭“一键不展示”。', confirmText: '切换', cancelText: '取消' })
      if (result.confirm) this.setData({ state: await lovePointsService.updateUsageMode(usageMode) })
    }
    catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
})
