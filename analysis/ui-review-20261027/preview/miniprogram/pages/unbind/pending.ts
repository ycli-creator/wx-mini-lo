import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import { showError, showSuccess } from '../../utils/ui'

Page({
  data: { state: createInitialState(), createRequest: false, loading: true, loadError: false, busy: false },
  async onLoad(query: Record<string, string | undefined>) {
    this.setData({ createRequest: query.create === '1' })
    await this.refresh()
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = this.data.createRequest ? await lovePointsService.requestUnbind() : await lovePointsService.getState()
      if (!state.unbindRequested) throw new Error('当前没有等待处理的解绑申请')
      this.setData({ state, loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  openConfirm() { wx.navigateTo({ url: '/pages/unbind/confirm' }) },
  async cancel() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { await lovePointsService.cancelUnbind(); showSuccess('已取消申请'); wx.switchTab({ url: '/pages/profile/index' }) } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
})
