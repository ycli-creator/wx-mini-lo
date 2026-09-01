import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { TaskItem } from '../../types/index'
import { setActiveTab, setTabUnread, showError } from '../../utils/ui'
import { relationshipDays } from '../../utils/achievements'

const initialState = createInitialState()

Page({
  data: {
    state: initialState,
    task: initialState.tasks[0] as TaskItem,
    hasTask: true,
    rewardHint: '',
    rewardNeedsAction: false,
    loading: true,
    loadError: false,
    homeTab: 'today' as 'today' | 'tools',
    relationshipDays: 0,
  },
  async onShow() {
    setActiveTab(this, 0)
    await this.refresh()
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const task = state.tasks.find((item) => item.planType === 'daily' && item.isCurrentCycle && ['todo', 'partial', 'rejected', 'pending', 'done'].includes(item.status) && (item.assigneeIsSelf || item.reviewerIsSelf))
        || state.tasks.find((item) => item.status === 'pending' && item.reviewerIsSelf)
        || state.tasks.find((item) => item.planType === 'weekly' && item.isCurrentCycle && ['todo', 'rejected'].includes(item.status) && item.assigneeIsSelf)
        || state.tasks.find((item) => item.planType === 'long_term' && ['todo', 'rejected'].includes(item.status) && item.assigneeIsSelf)
        || state.tasks.find((item) => item.id === state.selectedTaskId)
        || state.tasks[0]
      const incomingRedemption = state.redemptions.find((item) => item.canReview || item.refundCanReview)
      const ownPendingRedemption = state.redemptions.find((item) => item.requesterIsSelf && (item.status === 'pending' || item.refundStatus === 'requested'))
      const rewardHint = incomingRedemption?.refundCanReview
        ? '退款待处理'
        : incomingRedemption?.canReview
          ? '兑换待处理'
          : ownPendingRedemption?.refundStatus === 'requested'
            ? '退款处理中'
            : ownPendingRedemption?.status === 'pending'
              ? '心愿兑换处理中'
              : ''
      this.setData({
        state,
        task: task || initialState.tasks[0],
        hasTask: Boolean(task),
        rewardHint,
        rewardNeedsAction: Boolean(incomingRedemption),
        relationshipDays: relationshipDays(state.relationshipStartedAt),
        loading: false,
      })
      if (state.bound) setTabUnread(this, await lovePointsService.getUnreadMessages())
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  switchHomeTab(event: WechatMiniprogram.TouchEvent) { this.setData({ homeTab: event.currentTarget.dataset.tab as 'today' | 'tools' }) },
  openTask() {
    if (!this.data.hasTask) {
      wx.setStorageSync('love-points-task-view', 'tasks')
      wx.switchTab({ url: '/pages/task/index' })
      return
    }
    const task = this.data.task
    wx.navigateTo({ url: `/pages/task/detail?id=${encodeURIComponent(task.id)}` })
  },
  openPoints() { wx.navigateTo({ url: '/pages/points/index' }) },
  openRewards() { wx.setStorageSync('love-points-task-view', 'shop'); wx.switchTab({ url: '/pages/task/index' }) },
  openCalendar() { wx.navigateTo({ url: '/pages/records/index' }) },
  openHeat() { wx.navigateTo({ url: '/pages/heat/index' }) },
  openDocuments() { wx.navigateTo({ url: '/pages/documents/index' }) },
  openSettings() { wx.switchTab({ url: '/pages/profile/index' }) },
})
