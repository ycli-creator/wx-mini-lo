import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { LedgerEntry, PointsType } from '../../types/index'
import { showError } from '../../utils/ui'

Page({
  data: {
    state: createInitialState(),
    tab: 'personal' as PointsType,
    entries: [] as LedgerEntry[],
    loading: true,
    loadError: false,
  },
  async onShow() { await this.refresh() },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      this.setData({ state, entries: state.ledger.filter((entry) => entry.type === this.data.tab), loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  selectTab(event: WechatMiniprogram.TouchEvent) {
    const tab = event.currentTarget.dataset.tab as PointsType
    this.setData({ tab, entries: this.data.state.ledger.filter((entry) => entry.type === tab) })
  },
  goRewards() { wx.setStorageSync('love-points-task-view', 'shop'); wx.switchTab({ url: '/pages/task/index' }) },
  goHome() { wx.switchTab({ url: '/pages/home/index' }) },
})
