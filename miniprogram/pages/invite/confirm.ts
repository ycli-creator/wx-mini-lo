import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import { showError, showSuccess } from '../../utils/ui'

Page({
  data: { waiting: false, hasApplication: true, state: createInitialState(), loading: true, loadError: false, busy: false },
  onLoad(query: Record<string, string | undefined>) { this.setData({ waiting: query.waiting === '1' }) },
  async onShow() { await this.refresh() },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      if (state.bound) {
        showSuccess('绑定成功')
        wx.switchTab({ url: '/pages/home/index' })
        return
      }
      if (!this.data.waiting) {
        const pending = await lovePointsService.pendingInvite()
        this.setData({ state, hasApplication: Boolean(pending.invite), loading: false })
      } else {
        const inviteStatus = await lovePointsService.inviteStatus()
        if (inviteStatus.invite?.status === 'rejected') {
          wx.showToast({ title: '邀请方暂未同意绑定', icon: 'none' })
          wx.reLaunch({ url: '/pages/start/index' })
          return
        }
        this.setData({ state, loading: false })
      }
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  async approve() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await lovePointsService.confirmBinding()
      showSuccess('绑定成功')
      wx.switchTab({ url: '/pages/home/index' })
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async reject() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await lovePointsService.rejectBinding()
      wx.showToast({ title: '已拒绝绑定申请', icon: 'none' })
      wx.reLaunch({ url: '/pages/start/index' })
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  goStart() { wx.reLaunch({ url: '/pages/start/index' }) },
})
