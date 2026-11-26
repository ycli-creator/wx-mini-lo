import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { Reward, RewardRedemption } from '../../types/index'
import { showError, showSuccess } from '../../utils/ui'

const fallback = createInitialState().rewards[0]
const fallbackRedemption: RewardRedemption = {
  rewardId: fallback.id,
  status: 'active',
  canReview: false,
  refundStatus: 'none',
  refundCanReview: false,
  requesterIsSelf: true,
}

Page({
  data: { state: createInitialState(), reward: fallback as Reward, rewardId: fallback.id, redemption: fallbackRedemption, loading: true, loadError: false, busy: false },
  onLoad(query: Record<string, string | undefined>) { if (query.id) this.setData({ rewardId: query.id }) },
  async onShow() { await this.refresh() },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const reward = state.rewards.find((item) => item.id === this.data.rewardId) || state.rewards.find((item) => item.id === state.selectedRewardId)
      if (!reward) throw new Error('心愿不存在或已经下架')
      const redemption = state.redemptions.find((item) => item.rewardId === reward.id)
      if (!redemption) throw new Error('没有找到这条兑换记录')
      this.setData({ state, reward, redemption, loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  async requestRefund() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { await lovePointsService.requestRefund(this.data.reward.id); showSuccess('退款申请已发送'); await this.refresh() } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async approveRefund() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { await lovePointsService.reviewRefund(true, this.data.reward.id); showSuccess('积分已返还'); await this.refresh() } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async rejectRefund() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { await lovePointsService.reviewRefund(false, this.data.reward.id); wx.showToast({ title: '已拒绝退款', icon: 'none' }); await this.refresh() } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async approveRedemption() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { await lovePointsService.reviewRedemption(true, this.data.reward.id); showSuccess('已同意兑换'); await this.refresh() } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async rejectRedemption() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { await lovePointsService.reviewRedemption(false, this.data.reward.id); wx.showToast({ title: '已拒绝兑换', icon: 'none' }); wx.navigateBack() } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  goRewards() { wx.setStorageSync('love-points-task-view', 'shop'); wx.switchTab({ url: '/pages/task/index' }) },
})
