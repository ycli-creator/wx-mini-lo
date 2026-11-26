import { lovePointsService } from '../../services/love-points'
import { showError } from '../../utils/ui'

Page({
  data: { code: '', codeDisplay: '—— ——', loading: true, loadError: false },
  async onLoad() { await this.refresh() },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.createInvite()
      this.setData({ code: state.inviteCode, codeDisplay: `${state.inviteCode.slice(0, 3)} ${state.inviteCode.slice(3)}`, loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  onShareAppMessage() {
    return {
      title: '和我一起建立 Love Points 情侣空间',
      path: this.data.code ? `/pages/invite/join?code=${this.data.code}` : '/pages/start/index',
    }
  },
  checkApplication() { wx.navigateTo({ url: '/pages/invite/confirm' }) },
  goBack() { wx.navigateBack() },
})
