import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { PointsType, Reward, TaskItem, TaskPlanType } from '../../types/index'
import { setActiveTab, showError, showSuccess } from '../../utils/ui'

type DisplayTask = TaskItem & { statusLabel: string; statusClass: string; typeLabel: string; actionLabel: string; planLabel: string }
type DisplayReward = Reward & { enough: boolean; redeemed: boolean; pointsLabel: string; statusLabel: string; statusClass: string }

const TASK_VIEW_STORAGE_KEY = 'love-points-task-view'

const statusMeta: Record<TaskItem['status'], { label: string; className: string }> = {
  todo: { label: '待完成', className: 'status-todo' },
  pending: { label: '待审批', className: 'status-pending' },
  done: { label: '已完成', className: 'status-done' },
  rejected: { label: '已驳回', className: 'status-warning' },
  missed: { label: '未完成', className: 'status-warning' },
}

Page({
  data: {
    state: createInitialState(),
    viewMode: 'tasks' as 'tasks' | 'shop',
    tasks: [] as DisplayTask[],
    taskFilter: 'daily' as 'daily' | 'weekly' | 'long_term' | 'pending',
    rewards: [] as DisplayReward[],
    activeCount: 0,
    pendingCount: 0,
    loading: true,
    loadError: false,
    busy: false,
    createOpen: false,
    title: '',
    description: '',
    points: '80',
    taskType: 'shared' as 'personal' | 'shared',
    assignee: 'self' as 'self' | 'partner',
    planType: 'long_term' as TaskPlanType,
    rewardName: '一起看日落',
    rewardDescription: '找一个天气好的傍晚散步',
    rewardCost: '150',
    rewardPointsType: 'shared' as PointsType,
    rewardExpiry: '创建后 365 天内',
    rewardCondition: '由双方共同商量使用时间',
    rewardApprovalRequired: false,
  },
  async onShow() {
    setActiveTab(this, 1)
    const requestedView = wx.getStorageSync<'tasks' | 'shop'>(TASK_VIEW_STORAGE_KEY)
    if (requestedView === 'tasks' || requestedView === 'shop') this.setData({ viewMode: requestedView })
    await this.refresh()
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const allTasks = state.tasks.map((task) => ({
        ...task,
        statusLabel: statusMeta[task.status].label,
        statusClass: statusMeta[task.status].className,
        typeLabel: task.taskType === 'shared' ? '共同任务' : '个人任务',
        actionLabel: task.assigneeIsSelf ? '由我完成' : '由对方完成',
        planLabel: task.planType === 'daily'
          ? `每日 · ${task.isCurrentCycle ? '今天' : task.cycleLabel}`
          : task.planType === 'weekly'
            ? `每周 · ${task.isCurrentCycle ? '本周' : task.cycleLabel}`
            : '长期',
      }))
      const tasks = allTasks.filter((task) => this.data.taskFilter === 'pending'
        ? task.status === 'pending' && task.reviewerIsSelf
        : task.planType === this.data.taskFilter && (task.isCurrentCycle || task.planType === 'long_term'))
      const rewards = state.rewards.map((reward) => {
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
      this.setData({
        state,
        tasks,
        rewards,
        activeCount: tasks.filter((task) => task.status !== 'done').length,
        pendingCount: tasks.filter((task) => task.status === 'pending').length,
        loading: false,
      })
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  switchView(event: WechatMiniprogram.TouchEvent) {
    const viewMode = event.currentTarget.dataset.view as 'tasks' | 'shop'
    if (!['tasks', 'shop'].includes(viewMode)) return
    wx.setStorageSync(TASK_VIEW_STORAGE_KEY, viewMode)
    this.setData({ viewMode, createOpen: false })
  },
  selectTaskFilter(event: WechatMiniprogram.TouchEvent) {
    const taskFilter = event.currentTarget.dataset.filter as 'daily' | 'weekly' | 'long_term' | 'pending'
    if (!['daily', 'weekly', 'long_term', 'pending'].includes(taskFilter)) return
    this.setData({ taskFilter })
    this.refresh()
  },
  toggleCreate() { this.setData({ createOpen: !this.data.createOpen }) },
  handleTitle(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ title: event.detail.value }) },
  handleDescription(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ description: event.detail.value }) },
  handlePoints(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ points: event.detail.value.replace(/\D/g, '') }) },
  selectTaskType(event: WechatMiniprogram.TouchEvent) { this.setData({ taskType: event.currentTarget.dataset.type as 'personal' | 'shared' }) },
  selectAssignee(event: WechatMiniprogram.TouchEvent) { this.setData({ assignee: event.currentTarget.dataset.assignee as 'self' | 'partner' }) },
  selectPlanType(event: WechatMiniprogram.TouchEvent) { this.setData({ planType: event.currentTarget.dataset.plan as TaskPlanType }) },
  handleRewardName(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ rewardName: event.detail.value }) },
  handleRewardDescription(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ rewardDescription: event.detail.value }) },
  handleRewardCost(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ rewardCost: event.detail.value.replace(/\D/g, '') }) },
  handleRewardExpiry(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ rewardExpiry: event.detail.value }) },
  handleRewardCondition(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ rewardCondition: event.detail.value }) },
  handleRewardApproval(event: WechatMiniprogram.CustomEvent<{ value: boolean }>) { this.setData({ rewardApprovalRequired: event.detail.value }) },
  selectRewardPointsType(event: WechatMiniprogram.TouchEvent) { this.setData({ rewardPointsType: event.currentTarget.dataset.type as PointsType }) },
  async createTask() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await lovePointsService.createTask({
        title: this.data.title,
        description: this.data.description,
        points: Number(this.data.points),
        taskType: this.data.taskType,
        assignee: this.data.assignee,
        planType: this.data.planType,
      })
      this.setData({ createOpen: false, title: '', description: '', points: '80', taskFilter: this.data.planType })
      showSuccess('任务已创建')
      await this.refresh()
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async createReward() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await lovePointsService.createReward({
        name: this.data.rewardName,
        description: this.data.rewardDescription,
        cost: Number(this.data.rewardCost),
        pointsType: this.data.rewardPointsType,
        expiry: this.data.rewardExpiry,
        condition: this.data.rewardCondition,
        approvalRequired: this.data.rewardApprovalRequired,
      })
      this.setData({ createOpen: false })
      showSuccess('奖励已创建')
      await this.refresh()
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  openTask(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id)
    const task = this.data.state.tasks.find((item) => item.id === id)
    if (!task) return
    lovePointsService.selectTask(id)
    if (task.status === 'pending' || task.status === 'done') {
      wx.navigateTo({ url: `/pages/task/review?id=${encodeURIComponent(id)}` })
      return
    }
    if (!task.assigneeIsSelf) {
      wx.showToast({ title: '等待对方完成这个任务', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/task/submit?id=${encodeURIComponent(id)}` })
  },
  openReward(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id)
    const reward = this.data.rewards.find((item) => item.id === id)
    lovePointsService.selectReward(id)
    wx.navigateTo({ url: `${reward?.redeemed ? '/pages/reward/redemption' : '/pages/reward/detail'}?id=${encodeURIComponent(id)}` })
  },
})
