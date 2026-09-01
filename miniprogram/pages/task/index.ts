import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { CompletionRequirement, PointsType, Reward, TaskAssigneeMode, TaskItem, TaskKind, TaskPlanType } from '../../types/index'
import { setActiveTab, showError, showSuccess } from '../../utils/ui'

type DisplayTask = TaskItem & { statusLabel: string; statusClass: string; typeLabel: string; actionLabel: string; planLabel: string }
type DisplayReward = Reward & { enough: boolean; redeemed: boolean; pointsLabel: string; statusLabel: string; statusClass: string }
type TaskSectionId = 'today' | 'pending' | 'later' | 'recurring' | 'project' | 'done'
type TaskSection = { id: TaskSectionId; title: string; hint: string; expanded: boolean; tasks: DisplayTask[] }
type TaskPreset = {
  id: string
  icon: string
  title: string
  description: string
  points: number
  kind: TaskKind
  planType: TaskPlanType
  completionRequirement: CompletionRequirement
  coupleOnly?: boolean
  projectSteps?: Array<{ title: string; assignee: 'self' | 'partner'; completionRequirement: CompletionRequirement }>
}
type RewardPreset = { id: string; icon: string; name: string; description: string; cost: number; beneficiaryType: Reward['beneficiaryType']; condition: string }

const TASK_VIEW_STORAGE_KEY = 'love-points-task-view'

const taskPresets: TaskPreset[] = [
  { id: 'water', icon: '💧', title: '今天喝够水', description: '完成今天的喝水目标', points: 10, kind: 'recurring', planType: 'daily', completionRequirement: 'direct' },
  { id: 'walk', icon: '🌙', title: '晚饭后散步', description: '一起散步 20 分钟，聊聊今天', points: 20, kind: 'recurring', planType: 'daily', completionRequirement: 'note' },
  { id: 'date', icon: '🍿', title: '安排本周约会', description: '选一个两个人都期待的活动', points: 40, kind: 'recurring', planType: 'weekly', completionRequirement: 'note' },
  { id: 'room', icon: '🧺', title: '整理房间', description: '完成一次舒服的小整理', points: 30, kind: 'one_time', planType: 'long_term', completionRequirement: 'image' },
  { id: 'trip', icon: '🗺️', title: '计划一次旅行', description: '把目的地、交通和行程一起确定下来', points: 200, kind: 'project', planType: 'long_term', completionRequirement: 'direct', coupleOnly: true, projectSteps: [
    { title: '确定目的地', assignee: 'self', completionRequirement: 'note' },
    { title: '确认交通与住宿', assignee: 'partner', completionRequirement: 'note' },
    { title: '整理共同清单', assignee: 'self', completionRequirement: 'direct' },
  ] },
]

const rewardPresets: RewardPreset[] = [
  { id: 'hug', icon: '🫂', name: '一个认真拥抱', description: '放下手机，好好抱一会儿', cost: 50, beneficiaryType: 'self', condition: '兑换后 7 天内使用' },
  { id: 'movie', icon: '🎬', name: '一起看场电影', description: '由兑换的人挑选想看的电影', cost: 200, beneficiaryType: 'couple', condition: '找一个双方都有空的晚上' },
  { id: 'breakfast', icon: '🥐', name: '一顿周末早餐', description: 'TA 准备或带你去吃喜欢的早餐', cost: 120, beneficiaryType: 'self', condition: '周末使用' },
  { id: 'choice', icon: '✨', name: '今天听我的', description: '今天的一项共同安排由我决定', cost: 300, beneficiaryType: 'self', condition: '不影响彼此的重要安排' },
]

const statusMeta: Record<TaskItem['status'], { label: string; className: string }> = {
  todo: { label: '待完成', className: 'status-todo' },
  partial: { label: '已完成 1/2', className: 'status-partial' },
  pending: { label: '待确认', className: 'status-pending' },
  done: { label: '已完成', className: 'status-done' },
  rejected: { label: '已驳回', className: 'status-warning' },
  missed: { label: '未完成', className: 'status-warning' },
}

Page({
  data: {
    state: createInitialState(),
    viewMode: 'tasks' as 'tasks' | 'shop',
    tasks: [] as DisplayTask[],
    taskSections: [] as TaskSection[],
    sectionExpanded: { today: true, pending: false, later: false, recurring: false, project: false, done: false } as Record<TaskSectionId, boolean>,
    taskPresets,
    rewardPresets,
    selectedTaskPreset: '',
    selectedRewardPreset: '',
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
    assignee: 'self' as TaskAssigneeMode,
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
      await wx.showModal({ title: '待办与热力任务互相独立', content: '这里记录你们自己创建的待办，并通过完成待办获得积分。平台每日热力任务仍在热力中心；工作空间可在“我的主页”切换。', showCancel: false, confirmText: '我知道了', confirmColor: '#f65f6b' })
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
        typeLabel: task.kind === 'project' ? '大计划' : task.taskType === 'shared' ? '共同待办' : '个人待办',
        actionLabel: task.bothRequired ? '双方每日完成' : task.assigneeIsSelf ? '由我完成' : '由对方完成',
        planLabel: task.planType === 'daily'
          ? `每日 · ${task.isCurrentCycle ? '今天' : task.cycleLabel}`
          : task.planType === 'weekly'
            ? `每周 · ${task.isCurrentCycle ? '本周' : task.cycleLabel}`
            : task.kind === 'project' ? `${task.projectSteps.filter((step) => step.status === 'done').length}/${task.projectSteps.length} 个环节` : '单次',
      }))
      const grouped: Record<TaskSectionId, DisplayTask[]> = { today: [], pending: [], later: [], recurring: [], project: [], done: [] }
      allTasks.forEach((task) => {
        if (task.planType === 'daily' && task.isCurrentCycle) grouped.today.push(task)
        else if (task.status === 'pending') grouped.pending.push(task)
        else if (['done', 'missed'].includes(task.status)) grouped.done.push(task)
        else if (task.kind === 'project') grouped.project.push(task)
        else if (task.kind === 'recurring') grouped.recurring.push(task)
        else grouped.later.push(task)
      })
      const sectionMeta: Array<{ id: TaskSectionId; title: string; hint: string }> = [
        { id: 'today', title: '今日待办', hint: '每天优先从这里开始' },
        { id: 'pending', title: '待确认', hint: '等待一方审批或补充' },
        { id: 'later', title: '以后要做', hint: '没有固定日期的单次待办' },
        { id: 'recurring', title: '重复待办', hint: '每周或其他固定节奏' },
        { id: 'project', title: '大计划', hint: '由多个环节组成' },
        { id: 'done', title: '已完成', hint: '完成和错过的历史记录' },
      ]
      const taskSections = sectionMeta
        .filter((section) => section.id === 'today' || grouped[section.id].length > 0)
        .map((section) => ({ ...section, expanded: this.data.sectionExpanded[section.id], tasks: grouped[section.id] }))
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
          statusLabel: redemption?.status === 'pending' ? '待确认' : redemption?.refundStatus === 'requested' ? '退款中' : redeemed ? '已兑换' : enough ? '可兑换' : '积分不足',
          statusClass: redemption?.status === 'pending' || redemption?.refundStatus === 'requested' ? 'status-pending' : redeemed ? 'status-done' : enough ? 'status-todo' : 'status-warning',
        }
      })
      const rewards = allRewards.filter((reward) => {
        if (this.data.rewardFilter === 'available') return reward.enough && !reward.redeemed
        if (this.data.rewardFilter === 'purchased') return reward.redeemed
        if (this.data.rewardFilter === 'pending') return reward.statusLabel === '待确认'
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
        tasks: allTasks,
        taskSections,
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
  toggleTaskSection(event: WechatMiniprogram.TouchEvent) {
    const id = event.currentTarget.dataset.id as TaskSectionId
    if (!['today', 'pending', 'later', 'recurring', 'project', 'done'].includes(id)) return
    const sectionExpanded = { ...this.data.sectionExpanded, [id]: !this.data.sectionExpanded[id] }
    this.setData({
      sectionExpanded,
      taskSections: this.data.taskSections.map((section) => section.id === id ? { ...section, expanded: sectionExpanded[id] } : section),
    })
  },
  toggleCreate() { this.setData({ createOpen: !this.data.createOpen, selectedTaskPreset: '', selectedRewardPreset: '' }) },
  useTaskPreset(event: WechatMiniprogram.TouchEvent) {
    const preset = taskPresets.find((item) => item.id === String(event.currentTarget.dataset.id))
    if (!preset) return
    if (preset.coupleOnly && this.data.state.activeSpaceType !== 'couple') {
      wx.showToast({ title: '大计划只能创建在情侣空间', icon: 'none' })
      return
    }
    this.setData({
      selectedTaskPreset: preset.id,
      title: preset.title,
      description: preset.description,
      points: String(preset.points),
      taskKind: preset.kind,
      planType: preset.planType,
      completionRequirement: preset.completionRequirement,
      projectSteps: preset.projectSteps ? preset.projectSteps.map((step) => ({ ...step })) : this.data.projectSteps,
    })
  },
  useRewardPreset(event: WechatMiniprogram.TouchEvent) {
    const preset = rewardPresets.find((item) => item.id === String(event.currentTarget.dataset.id))
    if (!preset) return
    this.setData({
      selectedRewardPreset: preset.id,
      rewardName: preset.name,
      rewardDescription: preset.description,
      rewardCost: String(preset.cost),
      rewardCondition: preset.condition,
      rewardBeneficiaryType: this.data.state.activeSpaceType === 'personal' ? 'self' : preset.beneficiaryType,
    })
  },
  handleTitle(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ title: event.detail.value }) },
  handleDescription(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ description: event.detail.value }) },
  handlePoints(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ points: event.detail.value.replace(/\D/g, '') }) },
  selectTaskType(event: WechatMiniprogram.TouchEvent) { this.setData({ taskType: event.currentTarget.dataset.type as 'personal' | 'shared' }) },
  selectAssignee(event: WechatMiniprogram.TouchEvent) { this.setData({ assignee: event.currentTarget.dataset.assignee as TaskAssigneeMode }) },
  selectPlanType(event: WechatMiniprogram.TouchEvent) {
    const planType = event.currentTarget.dataset.plan as TaskPlanType
    this.setData({ planType, assignee: planType === 'daily' ? this.data.assignee : this.data.assignee === 'both' ? 'self' : this.data.assignee })
  },
  selectTaskKind(event: WechatMiniprogram.TouchEvent) {
    const taskKind = event.currentTarget.dataset.kind as TaskKind
    if (taskKind === 'project' && this.data.state.activeSpaceType !== 'couple') {
      wx.showToast({ title: '大计划只能创建在情侣空间', icon: 'none' })
      return
    }
    this.setData({ taskKind, planType: taskKind === 'recurring' ? (this.data.planType === 'weekly' ? 'weekly' : 'daily') : 'long_term', assignee: taskKind === 'recurring' ? this.data.assignee : this.data.assignee === 'both' ? 'self' : this.data.assignee })
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
      this.setData({ createOpen: false, title: '', description: '', points: '80', selectedTaskPreset: '' })
      showSuccess('待办已创建')
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
      this.setData({ createOpen: false, selectedRewardPreset: '' })
      showSuccess('心愿已创建')
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
