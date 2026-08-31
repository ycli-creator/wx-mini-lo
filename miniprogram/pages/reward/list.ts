import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { Reward } from '../../types/index'
import { setActiveTab, showError, showSuccess } from '../../utils/ui'

type DisplayReward = Reward & { enough: boolean; redeemed: boolean; pointsLabel: string; statusLabel: string; statusClass: string }

Page({
  data: {
    state: createInitialState(),
    rewards: [] as DisplayReward[],
    loading: true,
    loadError: false,
    busy: false,
    createOpen: false,
    rewardFilter: 'all' as 'all' | 'available' | 'purchased' | 'pending' | 'refund',
    name: '一起看日落',
    description: '找一个天气好的傍晚散步',
    cost: '150',
    expiry: '创建后 365 天内',
    condition: '由双方共同商量使用时间',
    approvalRequired: false,
    beneficiaryType: 'couple' as Reward['beneficiaryType'],
  },
  async onShow() {
    setActiveTab(this, 2)
    await this.refresh()
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const allRewards = state.rewards.map((reward) => {
        const balance = reward.pointsType === 'shared' ? state.sharedPoints : state.personalPoints
        const enough = balance >= reward.cost
        const redemption = state.redemptions.find((item) => item.rewardId === reward.id && item.status !== 'refunded')
        const redeemed = Boolean(redemption)
        return {
          ...reward,
          enough,
          redeemed,
          pointsLabel: reward.pointsType === 'shared' ? '共同' : '个人',
          statusLabel: redemption?.status === 'pending' ? '待审批' : redemption?.refundStatus === 'requested' ? '退款中' : redeemed ? '已兑换' : enough ? '可兑换' : '积分不足',
          statusClass: redemption?.status === 'pending' || redemption?.refundStatus === 'requested' ? 'status-pending' : redeemed ? 'status-done' : enough ? 'status-todo' : 'status-warning',
        }
      })
      const rewards = allRewards.filter((reward) => {
        if (this.data.rewardFilter === 'available') return reward.enough && !reward.redeemed
        if (this.data.rewardFilter === 'purchased') return reward.redeemed
        if (this.data.rewardFilter === 'pending') return reward.statusLabel === '待审批'
        if (this.data.rewardFilter === 'refund') return reward.statusLabel === '退款中'
        return true
      })
      this.setData({
        state,
        rewards,
        approvalRequired: state.activeSpaceType === 'couple' ? this.data.approvalRequired : false,
        beneficiaryType: state.activeSpaceType === 'couple' ? this.data.beneficiaryType : 'self',
        loading: false,
      })
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  toggleCreate() { this.setData({ createOpen: !this.data.createOpen }) },
  handleName(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ name: event.detail.value }) },
  handleDescription(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ description: event.detail.value }) },
  handleCost(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ cost: event.detail.value.replace(/\D/g, '') }) },
  handleExpiry(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ expiry: event.detail.value }) },
  handleCondition(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ condition: event.detail.value }) },
  handleApproval(event: WechatMiniprogram.CustomEvent<{ value: boolean }>) { this.setData({ approvalRequired: event.detail.value }) },
  selectRewardFilter(event: WechatMiniprogram.TouchEvent) {
    this.setData({ rewardFilter: event.currentTarget.dataset.filter })
    this.refresh()
  },
  selectBeneficiary(event: WechatMiniprogram.TouchEvent) { this.setData({ beneficiaryType: event.currentTarget.dataset.beneficiary as Reward['beneficiaryType'] }) },
  async createReward() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await lovePointsService.createReward({
        name: this.data.name,
        description: this.data.description,
        cost: Number(this.data.cost),
        pointsType: this.data.state.activeSpaceType === 'couple' ? 'shared' : 'personal',
        expiry: this.data.expiry,
        condition: this.data.condition,
        approvalRequired: this.data.approvalRequired,
        beneficiaryType: this.data.beneficiaryType,
      })
      this.setData({ createOpen: false })
      showSuccess('奖励已创建')
      await this.refresh()
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  openReward(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id)
    const reward = this.data.rewards.find((item) => item.id === id)
    lovePointsService.selectReward(id)
    wx.navigateTo({ url: `${reward?.redeemed ? '/pages/reward/redemption' : '/pages/reward/detail'}?id=${encodeURIComponent(id)}` })
  },
})
