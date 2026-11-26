import { lovePointsService } from '../../services/love-points'
import { canCompleteTask, chooseTaskImages, uploadTaskEvidence, type DraftImage } from '../../services/task-completion'
import { createInitialState } from '../../store/state'
import { rewardsForFilter, type DisplayReward, type RewardFilter } from '../../utils/reward-views'
import type { CompletionRequirement, LovePointsState, PointsType, Reward, TaskAssigneeMode, TaskItem, TaskKind, TaskPlanType } from '../../types/index'
import { setActiveTab, showError, showSuccess } from '../../utils/ui'

type DisplayTask = TaskItem & { statusLabel: string; canComplete: boolean; requirementLabel: string }
type InlineDraft = { note: string; images: DraftImage[] }
const emptyDraft = (): InlineDraft => ({ note: '', images: [] })
const requirementLabels = { direct: '直接完成', note: '填写说明', image: '上传照片' }
type TaskSectionId = 'today' | 'pending' | 'later' | 'recurring' | 'project' | 'done'
type TaskSection = { id: TaskSectionId; title: string; expanded: boolean; tasks: DisplayTask[] }
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
  { id: 'water', icon: 'line-water', title: '今天喝够水', description: '完成今天的喝水目标', points: 10, kind: 'recurring', planType: 'daily', completionRequirement: 'direct' },
  { id: 'walk', icon: 'line-walk', title: '晚饭后散步', description: '一起散步 20 分钟，聊聊今天', points: 20, kind: 'recurring', planType: 'daily', completionRequirement: 'note' },
  { id: 'date', icon: 'line-calendar', title: '安排本周约会', description: '选一个两个人都期待的活动', points: 40, kind: 'recurring', planType: 'weekly', completionRequirement: 'note' },
  { id: 'room', icon: 'line-room', title: '整理房间', description: '完成一次舒服的小整理', points: 30, kind: 'one_time', planType: 'long_term', completionRequirement: 'image' },
  { id: 'trip', icon: 'line-trip', title: '计划一次旅行', description: '把目的地、交通和行程一起确定下来', points: 200, kind: 'project', planType: 'long_term', completionRequirement: 'direct', coupleOnly: true, projectSteps: [
    { title: '确定目的地', assignee: 'self', completionRequirement: 'note' },
    { title: '确认交通与住宿', assignee: 'partner', completionRequirement: 'note' },
    { title: '整理共同清单', assignee: 'self', completionRequirement: 'direct' },
  ] },
]

const rewardPresets: RewardPreset[] = [
  { id: 'hug', icon: 'line-heart', name: '一个认真拥抱', description: '放下手机，好好抱一会儿', cost: 50, beneficiaryType: 'self', condition: '兑换后 7 天内使用' },
  { id: 'movie', icon: 'line-film', name: '一起看场电影', description: '由兑换的人挑选想看的电影', cost: 200, beneficiaryType: 'couple', condition: '找一个双方都有空的晚上' },
  { id: 'breakfast', icon: 'line-breakfast', name: '一顿周末早餐', description: 'TA 准备或带你去吃喜欢的早餐', cost: 120, beneficiaryType: 'self', condition: '周末使用' },
  { id: 'choice', icon: 'line-star', name: '今天听我的', description: '今天的一项共同安排由我决定', cost: 300, beneficiaryType: 'self', condition: '不影响彼此的重要安排' },
]

const statusLabels: Record<TaskItem['status'], string> = {
  todo: '待完成', partial: '已完成 1/2', pending: '待确认', done: '已完成', rejected: '已驳回', missed: '未完成',
}

Page({
  data: {
    state: createInitialState(),
    viewMode: 'tasks' as 'tasks' | 'shop',
    tasks: [] as DisplayTask[],
    taskSections: [] as TaskSection[],
    sectionExpanded: { today: true, pending: true, later: true, recurring: true, project: true, done: false } as Record<TaskSectionId, boolean>,
    taskPresets,
    rewardPresets,
    selectedTaskPreset: '',
    selectedRewardPreset: '',
    rewardFilter: 'all' as RewardFilter,
    rewards: [] as DisplayReward[],
    todayCompleted: 0,
    todayTotal: 0,
    todayPercent: 0,
    loading: true,
    loadError: false,
    busy: false,
    expandedTaskId: '',
    submittingId: '',
    completedId: '',
    pickingImage: false,
    drafts: {} as Record<string, InlineDraft>,
    createOpen: false,
    moreOptionsOpen: false,
    templatesOpen: false,
    title: '',
    description: '',
    points: '80',
    taskType: 'shared' as 'personal' | 'shared',
    assignee: 'self' as TaskAssigneeMode,
    approvalRequired: false,
    planType: 'long_term' as TaskPlanType,
    taskKind: 'one_time' as TaskKind,
    completionRequirement: 'direct' as CompletionRequirement,
    projectSteps: [
      { title: '准备第一个环节', assignee: 'self', completionRequirement: 'direct' },
      { title: '准备第二个环节', assignee: 'partner', completionRequirement: 'direct' },
    ] as Array<{ title: string; assignee: 'self' | 'partner'; completionRequirement: CompletionRequirement }>,
    rewardName: '',
    rewardDescription: '',
    rewardCost: '150',
    rewardPointsType: 'personal' as PointsType,
    rewardExpiry: '创建后 365 天内',
    rewardCondition: '',
    rewardApprovalRequired: false,
    rewardBeneficiaryType: 'couple' as Reward['beneficiaryType'],
  },
  async onShow() {
    setActiveTab(this, 1)
    if (this.data.submittingId || this.data.pickingImage) return
    const requestedView = wx.getStorageSync<'tasks' | 'shop'>(TASK_VIEW_STORAGE_KEY)
    if (requestedView === 'tasks' || requestedView === 'shop') this.setData({ viewMode: requestedView })
    await this.refresh()
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      this.displayState(await lovePointsService.getState())
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  displayState(state: LovePointsState) {
    const allTasks = state.tasks.map((task) => ({
      ...task,
      canComplete: canCompleteTask(task),
      requirementLabel: requirementLabels[task.completionRequirement],
      statusLabel: statusLabels[task.status],
    }))
    const grouped: Record<TaskSectionId, DisplayTask[]> = { today: [], pending: [], later: [], recurring: [], project: [], done: [] }
    allTasks.forEach((task) => {
      if (task.status === 'pending') grouped.pending.push(task)
      else if (['done', 'missed'].includes(task.status) || (!task.isCurrentCycle && task.planType !== 'long_term')) grouped.done.push(task)
      else if (task.kind === 'project') grouped.project.push(task)
      else if (task.planType === 'daily' && task.isCurrentCycle) grouped.today.push(task)
      else if (task.planType === 'weekly' && task.isCurrentCycle) grouped.recurring.push(task)
      else grouped.later.push(task)
    })
    const sectionMeta: Array<{ id: TaskSectionId; title: string }> = [
      { id: 'today', title: '今天' },
      { id: 'pending', title: '待确认' },
      { id: 'later', title: '单次待办' },
      { id: 'recurring', title: '本周' },
      { id: 'project', title: '大计划' },
      { id: 'done', title: '历史记录' },
    ]
    const taskSections = sectionMeta
      .filter((section) => section.id === 'today' || grouped[section.id].length > 0)
      .map((section) => ({ ...section, expanded: this.data.sectionExpanded[section.id], tasks: grouped[section.id] }))
    const todayTasks = allTasks.filter((task) => task.planType === 'daily' && task.isCurrentCycle && task.status !== 'missed')
    const todayCompleted = todayTasks.filter((task) => task.status === 'done').length
    const rewards = rewardsForFilter(state, this.data.rewardFilter)
    this.setData({
      state,
      taskType: state.bound ? this.data.taskType : 'personal',
      assignee: state.bound ? this.data.assignee : 'self',
      rewardPointsType: 'personal',
      rewardApprovalRequired: state.bound ? this.data.rewardApprovalRequired : false,
      taskKind: state.activeSpaceType === 'personal' && this.data.taskKind === 'project' ? 'one_time' : this.data.taskKind,
      rewardBeneficiaryType: state.activeSpaceType === 'personal' ? 'self' : this.data.rewardBeneficiaryType,
      tasks: allTasks,
      taskSections,
      rewards,
      todayCompleted,
      todayTotal: todayTasks.length,
      todayPercent: todayTasks.length ? Math.round(todayCompleted / todayTasks.length * 100) : 0,
      loading: false,
    })
  },
  toggleTask(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return
    const id = String(event.currentTarget.dataset.id)
    this.setData({ expandedTaskId: this.data.expandedTaskId === id ? '' : id })
  },
  checkTask(event: WechatMiniprogram.TouchEvent) {
    const task = this.data.tasks.find(row => row.id === event.currentTarget.dataset.id)
    if (!task?.canComplete || this.data.busy) return
    if (task.completionRequirement !== 'direct') {
      this.setData({ expandedTaskId: task.id })
      return
    }
    return this.submitInline(event)
  },
  updateDraft(id: string, changes: Partial<InlineDraft>) {
    this.setData({ drafts: { ...this.data.drafts, [id]: { ...emptyDraft(), ...this.data.drafts[id], ...changes } } })
  },
  inlineNote(event: WechatMiniprogram.Input) {
    this.updateDraft(String(event.currentTarget.dataset.id), { note: event.detail.value })
  },
  async inlinePhoto(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return
    const id = String(event.currentTarget.dataset.id)
    this.setData({ busy: true, pickingImage: true })
    try { this.updateDraft(id, { images: await chooseTaskImages(this.data.drafts[id]?.images || []) }) }
    catch (error) { if (!/cancel/i.test(String((error as { errMsg?: string }).errMsg || error))) showError(error) }
    finally { this.setData({ busy: false, pickingImage: false }) }
  },
  removeInlinePhoto(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return
    const { id, index } = event.currentTarget.dataset
    this.updateDraft(id, { images: this.data.drafts[id].images.filter((_, i) => i !== Number(index)) })
  },
  async submitInline(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id)
    const task = this.data.tasks.find(row => row.id === id)
    if (this.data.busy || !task?.canComplete) return
    const draft = this.data.drafts[id] || emptyDraft()
    if (task.completionRequirement === 'note' && !draft.note.trim()) return showError(new Error('请填写完成说明'))
    if (task.completionRequirement === 'image' && !draft.images.length) return showError(new Error('请添加完成照片'))
    this.setData({ busy: true, submittingId: id })
    try {
      const evidence = await uploadTaskEvidence(draft.images)
      const result = await lovePointsService.submitTask(draft.note.trim(), id, evidence)
      const updated = result.tasks.find(row => row.id === id)
      if (!updated) { await this.refresh(); return }
      if (updated.status === 'done') {
        this.setData({ completedId: id, expandedTaskId: '' })
        await new Promise(resolve => setTimeout(resolve, 620))
      } else {
        showSuccess(updated.status === 'pending' ? '已提交，待确认' : '我的部分已完成')
      }
      const drafts = { ...this.data.drafts }
      delete drafts[id]
      this.setData({ drafts, expandedTaskId: '' })
      this.displayState({
        ...this.data.state, personalPoints: result.personalPoints, sharedPoints: result.sharedPoints,
        tasks: this.data.state.tasks.map(row => row.id === id ? updated : row),
      })
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false, submittingId: '', completedId: '' }) }
  },
  switchView(event: WechatMiniprogram.TouchEvent) {
    const viewMode = event.currentTarget.dataset.view as 'tasks' | 'shop'
    if (this.data.busy || viewMode === this.data.viewMode || !['tasks', 'shop'].includes(viewMode)) return
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
  toggleCreate() {
    if (this.data.busy) return
    const createOpen = !this.data.createOpen
    this.setData({ createOpen, selectedTaskPreset: '', selectedRewardPreset: '' })
    if (createOpen) wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },
  toggleMoreOptions() { this.setData({ moreOptionsOpen: !this.data.moreOptionsOpen }) },
  toggleTemplates() { this.setData({ templatesOpen: !this.data.templatesOpen }) },
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
  selectAssignee(event: WechatMiniprogram.TouchEvent) { this.setData({ assignee: event.currentTarget.dataset.assignee as TaskAssigneeMode, approvalRequired: false }) },
  toggleApproval(event: WechatMiniprogram.TouchEvent) { this.setData({ approvalRequired: event.currentTarget.dataset.approval === 'true' }) },
  selectPlanType(event: WechatMiniprogram.TouchEvent) {
    const planType = event.currentTarget.dataset.plan as TaskPlanType
    this.setData({ planType })
  },
  selectTaskKind(event: WechatMiniprogram.TouchEvent) {
    const taskKind = event.currentTarget.dataset.kind as TaskKind
    if (taskKind === 'project' && this.data.state.activeSpaceType !== 'couple') {
      wx.showToast({ title: '大计划只能创建在情侣空间', icon: 'none' })
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
        approvalRequired: this.data.approvalRequired,
        planType: this.data.planType,
        kind: this.data.taskKind,
        completionRequirement: this.data.completionRequirement,
        projectSteps: this.data.taskKind === 'project' ? this.data.projectSteps : [],
      })
      this.setData({ createOpen: false, title: '', description: '', points: '80', selectedTaskPreset: '', taskKind: 'one_time', planType: 'long_term', completionRequirement: 'direct', assignee: 'self', approvalRequired: false, moreOptionsOpen: false, templatesOpen: false })
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
    if (this.data.busy) return
    const id = String(event.currentTarget.dataset.id)
    const task = this.data.state.tasks.find((item) => item.id === id)
    if (!task) return
    lovePointsService.selectTask(id)
    const route = task.status === 'pending' && task.reviewerIsSelf ? 'review' : 'detail'
    wx.navigateTo({ url: `/pages/task/${route}?id=${encodeURIComponent(id)}` })
  },
  openReward(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id)
    const reward = this.data.rewards.find((item) => item.id === id)
    lovePointsService.selectReward(id)
    wx.navigateTo({ url: `${reward?.redeemed ? '/pages/reward/redemption' : '/pages/reward/detail'}?id=${encodeURIComponent(id)}` })
  },
})
