import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { TaskItem } from '../../types/index'
import { setActiveTab, showError } from '../../utils/ui'
import { relationshipDays } from '../../utils/achievements'

const initialState = createInitialState()
const taskStatusLabels: Record<string, string> = {
  todo: '待完成', partial: '完成 1/2', pending: '待确认', done: '已完成', rejected: '待补充', missed: '已过期',
}

Page({
  data: {
    state: initialState,
    task: initialState.tasks[0] as TaskItem,
    hasTask: true,
    taskStatusLabel: '',
    taskSectionTitle: '待办',
    rewardHint: '',
    rewardNeedsAction: false,
    loading: true,
    loadError: false,
    unread: 0,
    chatUnread: 0,
    notificationUnread: 0,
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
      const currentTasks = state.tasks.filter((item) => item.planType === 'long_term' || item.isCurrentCycle)
      const needsMyAction = (item: TaskItem) => item.kind === 'project'
        ? ['todo', 'partial', 'rejected'].includes(item.status) && (item.projectSteps.some((step) => step.assigneeIsSelf && step.status !== 'done') || item.progressPercent === 100)
        : item.assigneeIsSelf && ['todo', 'partial', 'rejected'].includes(item.status) && (!item.bothRequired || !item.selfCompletion.completed)
      const task = currentTasks.find((item) => item.status === 'pending' && item.reviewerIsSelf)
        || currentTasks.find((item) => item.planType === 'daily' && needsMyAction(item))
        || currentTasks.find(needsMyAction)
      const taskSectionTitle = !task ? '待办' : task.status === 'pending' ? '待我确认' : task.planType === 'daily' ? '今天待办' : '接下来'
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
        taskStatusLabel: task ? taskStatusLabels[task.status] || '待完成' : '',
        taskSectionTitle,
        rewardHint,
        rewardNeedsAction: Boolean(incomingRedemption),
        relationshipDays: relationshipDays(state.relationshipStartedAt),
        loading: false,
      })
      await this.refreshUnread(state.bound)
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  async refreshUnread(bound: boolean) {
    const [chat, notifications] = await Promise.allSettled([
      bound ? lovePointsService.getUnreadMessages() : Promise.resolve(0),
      lovePointsService.listNotifications(),
    ])
    const chatUnread = chat.status === 'fulfilled' ? chat.value : this.data.chatUnread
    const notificationUnread = notifications.status === 'fulfilled' ? notifications.value.unread : this.data.notificationUnread
    this.setData({ chatUnread, notificationUnread, unread: chatUnread + notificationUnread })
  },
  openMessages() { wx.navigateTo({ url: '/pages/chat/index' }) },
  openTaskList() { wx.setStorageSync('love-points-task-view', 'tasks'); wx.switchTab({ url: '/pages/task/index' }) },
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
  openDiary() { wx.navigateTo({ url: '/pages/diary/index' }) },
  openHeat() { wx.navigateTo({ url: '/pages/heat/index' }) },
  openDocuments() { wx.navigateTo({ url: '/pages/documents/index' }) },
  openSettings() { wx.switchTab({ url: '/pages/profile/index' }) },
})
