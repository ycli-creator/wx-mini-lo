import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import { rewardsForFilter, type DisplayReward, type RewardFilter } from '../../utils/reward-views'
import type { Reward } from '../../types/index'
import { showError, showSuccess } from '../../utils/ui'


Page({
  data: {
    state: createInitialState(),
    rewards: [] as DisplayReward[],
    loading: true,
    loadError: false,
    busy: false,
    createOpen: false,
    rewardFilter: 'all' as RewardFilter,
    name: '',
    description: '',
    cost: '150',
    expiry: '创建后 365 天内',
    condition: '',
    approvalRequired: false,
    beneficiaryType: 'couple' as Reward['beneficiaryType'],
  },
  async onShow() {
    await this.refresh()
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const rewards = rewardsForFilter(state, this.data.rewardFilter)
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
      showSuccess('心愿已创建')
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
