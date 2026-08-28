import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { Reward } from '../../types/index'
import { showError, showSuccess } from '../../utils/ui'

const fallback = createInitialState().rewards[0]

Page({
  data: { state: createInitialState(), reward: fallback as Reward, rewardId: fallback.id, enough: false, redeemed: false, pointsLabel: '共同', loading: true, loadError: false, busy: false },
  onLoad(query: Record<string, string | undefined>) { if (query.id) this.setData({ rewardId: query.id }) },
  async onShow() { await this.refresh() },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const reward = state.rewards.find((item) => item.id === this.data.rewardId) || state.rewards.find((item) => item.id === state.selectedRewardId)
      if (!reward) throw new Error('奖励不存在或已经下架')
      const balance = reward.pointsType === 'shared' ? state.sharedPoints : state.personalPoints
      const redeemed = state.redemptions.some((item) => item.rewardId === reward.id && item.status !== 'refunded')
      this.setData({ state, reward, enough: balance >= reward.cost, redeemed, pointsLabel: reward.pointsType === 'shared' ? '共同' : '个人', loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  async redeem() {
    if (this.data.redeemed) {
      wx.redirectTo({ url: `/pages/reward/redemption?id=${encodeURIComponent(this.data.reward.id)}` })
      return
    }
    if (this.data.busy || !this.data.enough) return
    this.setData({ busy: true })
    try {
      const state = await lovePointsService.redeemReward(this.data.reward.id)
      showSuccess(state.redemptionStatus === 'pending' ? '兑换申请已发送' : '兑换成功')
      wx.redirectTo({ url: `/pages/reward/redemption?id=${encodeURIComponent(this.data.reward.id)}` })
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  goBack() { wx.navigateBack() },
})
