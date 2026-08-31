import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { CompletionRequirement, PointsType, Reward, TaskItem, TaskKind, TaskPlanType } from '../../types/index'
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
    taskFilter: 'active' as 'active' | 'recurring' | 'project' | 'done' | 'pending',
    rewardFilter: 'all' as 'all' | 'available' | 'purchased' | 'pending' | 'refund',
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
    planType: 'daily' as TaskPlanType,
    taskKind: 'one_time' as TaskKind,
    completionRequirement: 'note' as CompletionRequirement,
    projectSteps: [
      { title: '准备第一个环节', assignee: 'self', completionRequirement: 'direct' },
      { title: '准备第二个环节', assignee: 'partner', completionRequirement: 'direct' },
    ] as Array<{ title: string; assignee: 'self' | 'partner'; completionRequirement: CompletionRequirement }>,
    rewardName: '一起看日落',
    rewardDescription: '找一个天气好的傍晚散步',
    rewardCost: '150',
    rewardPointsType: 'shared' as PointsType,
    rewardExpiry: '创建后 365 天内',
    rewardCondition: '由双方共同商量使用时间',
    rewardApprovalRequired: false,
    rewardBeneficiaryType: 'couple' as Reward['beneficiaryType'],
  },
  async onShow() {
    setActiveTab(this, 1)
    const requestedView = wx.getStorageSync<'tasks' | 'shop'>(TASK_VIEW_STORAGE_KEY)
    if (requestedView === 'tasks' || requestedView === 'shop') this.setData({ viewMode: requestedView })
    await this.refresh()
    const state = this.data.state
    if (!state.preferences.taskGuideSeen) {
      await wx.showModal({ title: '个人与情侣积分不互通', content: '个人空间和情侣空间各自拥有任务、积分与奖励。顶部可以随时切换，内容不会在两个空间之间迁移。', showCancel: false, confirmText: '我知道了', confirmColor: '#f65f6b' })
      await lovePointsService.markGuideSeen('task')
    }
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const allTasks = state.tasks.map((task) => ({
        ...task,
        statusLabel: statusMeta[task.status].label,
        statusClass: statusMeta[task.status].className,
        typeLabel: task.kind === 'project' ? '大任务' : task.taskType === 'shared' ? '共同任务' : '个人任务',
        actionLabel: task.assigneeIsSelf ? '由我完成' : '由对方完成',
        planLabel: task.planType === 'daily'
          ? `每日 · ${task.isCurrentCycle ? '今天' : task.cycleLabel}`
          : task.planType === 'weekly'
            ? `每周 · ${task.isCurrentCycle ? '本周' : task.cycleLabel}`
            : task.kind === 'project' ? `${task.projectSteps.filter((step) => step.status === 'done').length}/${task.projectSteps.length} 个环节` : '单次',
      }))
      const tasks = allTasks.filter((task) => {
        if (this.data.taskFilter === 'pending') return task.status === 'pending'
        if (this.data.taskFilter === 'done') return task.status === 'done' || task.status === 'missed'
        if (this.data.taskFilter === 'project') return task.kind === 'project' && task.status !== 'done'
        if (this.data.taskFilter === 'recurring') return task.kind === 'recurring' && task.status !== 'done'
        return !['done', 'missed'].includes(task.status)
      })
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
        taskType: state.bound ? this.data.taskType : 'personal',
        assignee: state.bound ? this.data.assignee : 'self',
        rewardPointsType: state.bound ? this.data.rewardPointsType : 'personal',
        rewardApprovalRequired: state.bound ? this.data.rewardApprovalRequired : false,
        taskKind: state.activeSpaceType === 'personal' && this.data.taskKind === 'project' ? 'one_time' : this.data.taskKind,
        rewardBeneficiaryType: state.activeSpaceType === 'personal' ? 'self' : this.data.rewardBeneficiaryType,
        tasks,
        rewards,
        activeCount: allTasks.filter((task) => !['done', 'missed'].includes(task.status)).length,
        pendingCount: allTasks.filter((task) => task.status === 'pending').length,
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
    const taskFilter = event.currentTarget.dataset.filter as 'active' | 'recurring' | 'project' | 'done' | 'pending'
    if (!['active', 'recurring', 'project', 'done', 'pending'].includes(taskFilter)) return
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
  selectTaskKind(event: WechatMiniprogram.TouchEvent) {
    const taskKind = event.currentTarget.dataset.kind as TaskKind
    if (taskKind === 'project' && this.data.state.activeSpaceType !== 'couple') {
      wx.showToast({ title: '大任务只能创建在情侣空间', icon: 'none' })
      return
    }
    this.setData({ taskKind, planType: taskKind === 'recurring' ? (this.data.planType === 'weekly' ? 'weekly' : 'daily') : 'long_term' })
  },
  selectCompletionRequirement(event: WechatMiniprogram.TouchEvent) { this.setData({ completionRequirement: event.currentTarget.dataset.requirement as CompletionRequirement }) },
  handleProjectStepTitle(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const projectSteps = [...this.data.projectSteps]
    projectSteps[Number(event.currentTarget.dataset.index)].title = event.detail.value
    this.setData({ projectSteps })
  },
  selectProjectStepAssignee(event: WechatMiniprogram.TouchEvent) {
    const projectSteps = [...this.data.projectSteps]
    projectSteps[Number(event.currentTarget.dataset.index)].assignee = event.currentTarget.dataset.assignee as 'self' | 'partner'
    this.setData({ projectSteps })
  },
  selectProjectStepRequirement(event: WechatMiniprogram.TouchEvent) {
    const projectSteps = [...this.data.projectSteps]
    projectSteps[Number(event.currentTarget.dataset.index)].completionRequirement = event.currentTarget.dataset.requirement as CompletionRequirement
    this.setData({ projectSteps })
  },
  addProjectStep() {
    if (this.data.projectSteps.length >= 8) return wx.showToast({ title: '最多设置 8 个环节', icon: 'none' })
    this.setData({ projectSteps: [...this.data.projectSteps, { title: '', assignee: 'self', completionRequirement: 'direct' as CompletionRequirement }] })
  },
  removeProjectStep(event: WechatMiniprogram.TouchEvent) {
    if (this.data.projectSteps.length <= 2) return wx.showToast({ title: '至少保留 2 个环节', icon: 'none' })
    this.setData({ projectSteps: this.data.projectSteps.filter((_, index) => index !== Number(event.currentTarget.dataset.index)) })
  },
  selectRewardFilter(event: WechatMiniprogram.TouchEvent) { this.setData({ rewardFilter: event.currentTarget.dataset.filter }); this.refresh() },
  selectRewardBeneficiary(event: WechatMiniprogram.TouchEvent) { this.setData({ rewardBeneficiaryType: event.currentTarget.dataset.beneficiary as Reward['beneficiaryType'] }) },
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
        kind: this.data.taskKind,
        completionRequirement: this.data.completionRequirement,
        projectSteps: this.data.taskKind === 'project' ? this.data.projectSteps : [],
      })
      this.setData({ createOpen: false, title: '', description: '', points: '80', taskFilter: this.data.taskKind === 'project' ? 'project' : 'active' })
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
        beneficiaryType: this.data.rewardBeneficiaryType,
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
    wx.navigateTo({ url: `/pages/task/detail?id=${encodeURIComponent(id)}` })
  },
  openReward(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id)
    const reward = this.data.rewards.find((item) => item.id === id)
    lovePointsService.selectReward(id)
    wx.navigateTo({ url: `${reward?.redeemed ? '/pages/reward/redemption' : '/pages/reward/detail'}?id=${encodeURIComponent(id)}` })
  },
})
