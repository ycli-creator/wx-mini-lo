import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import { showError, showSuccess } from '../../utils/ui'

Page({
  data: { state: createInitialState(), loading: true, loadError: false, busy: false },
  async onShow() { await this.refresh() },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      if (!state.unbindRequested || !state.unbindCanReview) throw new Error('当前没有需要你处理的解绑申请')
      this.setData({ state, loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  async approve() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { await lovePointsService.approveUnbind(); showSuccess('已解除绑定'); wx.reLaunch({ url: '/pages/start/index' }) } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async reject() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { await lovePointsService.rejectUnbind(); wx.showToast({ title: '已拒绝，数据保持不变', icon: 'none' }); wx.switchTab({ url: '/pages/profile/index' }) } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
})
