import type { ChatMessage, CommunityPost, DailyRecord, DocumentGroup, HeatTask, LovePointsState, Reward, RewardRedemption, SharedDocument, TaskItem, TaskPlanType } from '../types/index'

const STORAGE_KEY = 'love-points-miniprogram-v1'

const initialRewards: Reward[] = [
  {
    id: 'movie-night',
    name: '双人电影之夜',
    description: '选一部期待很久的电影',
    cost: 200,
    pointsType: 'shared',
    expiry: '2026 年 12 月 31 日',
    condition: '周末或节假日',
    approvalRequired: false,
    beneficiaryType: 'couple',
    spaceType: 'couple',
  },
  {
    id: 'weekend-trip',
    name: '周末短途旅行',
    description: '周末一起出发',
    cost: 800,
    pointsType: 'shared',
    expiry: '2027 年 06 月 30 日',
    condition: '提前一周商量目的地',
    approvalRequired: true,
    beneficiaryType: 'couple',
    spaceType: 'couple',
  },
]

const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000
const pad = (value: number) => String(value).padStart(2, '0')
const localDateParts = (date: Date) => {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET)
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), weekday: shifted.getUTCDay() }
}
const utcFromShanghai = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day) - SHANGHAI_OFFSET)
const formatDayKey = (date: Date) => {
  const { year, month, day } = localDateParts(date)
  return `${year}-${pad(month + 1)}-${pad(day)}`
}
const formatShortDate = (date: Date) => {
  const { month, day } = localDateParts(date)
  return `${month + 1} 月 ${day} 日`
}

export const getTaskCycleMeta = (planType: TaskPlanType, at = new Date()) => {
  if (planType === 'long_term') return { cycleKey: 'lifetime', cycleLabel: '长期', periodStart: '', periodEnd: '' }
  const parts = localDateParts(at)
  if (planType === 'daily') {
    const start = utcFromShanghai(parts.year, parts.month, parts.day)
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
    return { cycleKey: formatDayKey(start), cycleLabel: formatShortDate(start), periodStart: start.toISOString(), periodEnd: end.toISOString() }
  }
  const daysSinceMonday = (parts.weekday + 6) % 7
  const start = utcFromShanghai(parts.year, parts.month, parts.day - daysSinceMonday)
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
  const lastDay = new Date(end.getTime() - 24 * 60 * 60 * 1000)
  return { cycleKey: formatDayKey(start), cycleLabel: `${formatShortDate(start)}–${formatShortDate(lastDay)}`, periodStart: start.toISOString(), periodEnd: end.toISOString() }
}

const normalizeTask = (task: TaskItem, at: Date): TaskItem => {
  const planType: TaskPlanType = ['daily', 'weekly', 'long_term'].includes(task.planType) ? task.planType : 'long_term'
  const templateId = task.templateId || task.id
  const meta = task.cycleKey ? {
    cycleKey: task.cycleKey,
    cycleLabel: task.cycleLabel || (planType === 'long_term' ? '长期' : task.cycleKey),
    periodStart: task.periodStart || '',
    periodEnd: task.periodEnd || '',
  } : getTaskCycleMeta(planType, at)
  const current = getTaskCycleMeta(planType, at)
  let status = task.status
  if (planType !== 'long_term' && meta.periodEnd && new Date(meta.periodEnd).getTime() <= at.getTime() && ['todo', 'rejected'].includes(status)) status = 'missed'
  const kind = task.kind || (planType === 'long_term' ? 'one_time' : 'recurring')
  const projectSteps = Array.isArray(task.projectSteps) ? task.projectSteps : []
  const completedSteps = projectSteps.filter((step) => step.status === 'done').length
  return {
    ...task,
    templateId,
    planType,
    ...meta,
    status,
    kind,
    completionRequirement: task.completionRequirement || 'note',
    evidence: Array.isArray(task.evidence) ? task.evidence : [],
    projectSteps,
    projectFinalized: Boolean(task.projectFinalized),
    progressPercent: kind === 'project'
      ? Math.min(100, completedSteps * 10 + (task.projectFinalized ? Math.max(0, 100 - completedSteps * 10) : 0))
      : task.status === 'done' ? 100 : task.status === 'pending' ? 80 : 0,
    isCurrentCycle: planType === 'long_term' || meta.cycleKey === current.cycleKey,
    rejectionReason: task.rejectionReason || '',
  }
}

export const rollTaskCycles = (tasks: TaskItem[], at = new Date()): TaskItem[] => {
  const normalized = tasks.map((task) => normalizeTask(task, at))
  const templateIds = [...new Set(normalized.map((task) => task.templateId))]
  for (const templateId of templateIds) {
    const instances = normalized.filter((task) => task.templateId === templateId)
    const source = instances.find((task) => task.isCurrentCycle) || instances[0]
    if (!source || source.planType === 'long_term') continue
    const meta = getTaskCycleMeta(source.planType, at)
    if (instances.some((task) => task.cycleKey === meta.cycleKey)) continue
    normalized.unshift({
      ...source,
      id: `${templateId}:${meta.cycleKey}`,
      ...meta,
      status: 'todo',
      latestNote: '',
      rejectionReason: '',
      isCurrentCycle: true,
    })
  }
  return normalized
}

const makeInitialTask = (task: Omit<TaskItem, 'id' | 'templateId' | 'cycleKey' | 'cycleLabel' | 'periodStart' | 'periodEnd' | 'isCurrentCycle'> & { templateId: string }): TaskItem => {
  const meta = getTaskCycleMeta(task.planType)
  return { ...task, id: task.planType === 'long_term' ? task.templateId : `${task.templateId}:${meta.cycleKey}`, ...meta, isCurrentCycle: true }
}

const initialTasks: TaskItem[] = [
  makeInitialTask({
    templateId: 'task-dinner',
    title: '一起完成晚餐',
    description: '准备两个人都喜欢的菜，完成后一起记录。',
    taskType: 'personal',
    pointsType: 'personal',
    points: 120,
    status: 'todo',
    assigneeIsSelf: true,
    reviewerIsSelf: true,
    latestNote: '今晚一起做了番茄牛腩，还拍了照片留念。',
    rejectionReason: '',
    planType: 'daily',
    kind: 'recurring',
    completionRequirement: 'note',
    evidence: [],
    progressPercent: 0,
    projectSteps: [],
    projectFinalized: false,
    spaceType: 'personal',
  }),
  makeInitialTask({
    templateId: 'task-walk',
    title: '周末一起散步',
    description: '选一条没走过的路线，慢慢聊聊天。',
    taskType: 'shared',
    pointsType: 'shared',
    points: 80,
    status: 'todo',
    assigneeIsSelf: true,
    reviewerIsSelf: true,
    latestNote: '',
    rejectionReason: '',
    planType: 'weekly',
    kind: 'recurring',
    completionRequirement: 'direct',
    evidence: [],
    progressPercent: 0,
    projectSteps: [],
    projectFinalized: false,
    spaceType: 'couple',
  }),
  makeInitialTask({
    templateId: 'task-photos',
    title: '整理旅行照片',
    description: '从最近一次旅行中选出最喜欢的照片。',
    taskType: 'personal',
    pointsType: 'personal',
    points: 60,
    status: 'todo',
    assigneeIsSelf: true,
    reviewerIsSelf: true,
    latestNote: '',
    rejectionReason: '',
    planType: 'long_term',
    kind: 'one_time',
    completionRequirement: 'image',
    evidence: [],
    progressPercent: 0,
    projectSteps: [],
    projectFinalized: false,
    spaceType: 'personal',
  }),
]

const initialDocumentGroups: DocumentGroup[] = [
  { id: 'group-diary', name: '日记', order: 0 },
  { id: 'group-travel', name: '旅行攻略', order: 1 },
  { id: 'group-wishes', name: '愿望清单', order: 2 },
]

const initialDocuments: SharedDocument[] = [
  {
    id: 'document-diary',
    groupId: 'group-diary',
    title: '我们的第一篇共同日记',
    body: '今天一起完成了晚餐任务，番茄牛腩比想象中更成功。下次想试试做甜点。',
    lockedByOther: false,
  },
  {
    id: 'document-travel',
    groupId: 'group-travel',
    title: '下一次周末旅行',
    body: '想找一座可以慢慢散步的小城，提前一起选路线和餐厅。',
    lockedByOther: false,
  },
  {
    id: 'document-wishes',
    groupId: 'group-wishes',
    title: '今年想一起完成的事',
    body: '看一次日出，学会一道新菜，拍一组双人照片。',
    lockedByOther: false,
  },
]

const initialHeatTasks: HeatTask[] = [
  { id: 'HF01', code: 'HF01', title: '每日打卡', description: '今天也来一起留个脚印。', rewardText: '+1/人 · 双方额外 +1', progress: 0, maxParticipants: 2, selfCompleted: false, partnerCompleted: false, status: 'todo', actionPath: '/pages/heat/index', actionText: '立即打卡', canCue: false, random: false },
  { id: 'HF02', code: 'HF02', title: '记录今日情绪', description: '各自记录一次今天的心情。', rewardText: '+1/人 · 双方额外 +1', progress: 0, maxParticipants: 2, selfCompleted: false, partnerCompleted: false, status: 'todo', actionPath: '/pages/records/edit?date=today&type=mood', actionText: '去记录', canCue: true, random: false },
  { id: 'HF03', code: 'HF03', title: '完成积分任务', description: '完成一项真实任务并通过确认。', rewardText: '+1/人 · 双方额外 +1', progress: 0, maxParticipants: 2, selfCompleted: false, partnerCompleted: false, status: 'todo', actionPath: '/pages/task/index', actionText: '去做任务', canCue: true, random: false },
  { id: 'HF04', code: 'HF04', title: '和 TA 互动一次', description: '从情侣聊天打开对方发来的卡片。', rewardText: '共同 +2', progress: 0, maxParticipants: 1, selfCompleted: false, partnerCompleted: false, status: 'todo', actionPath: '/pages/chat/index', actionText: '去聊天', canCue: true, random: false },
  { id: 'HR01', code: 'HR01', title: '完成一个共同任务', description: '今天一起完成一项共同积分任务。', rewardText: '共同 +4', progress: 0, maxParticipants: 1, selfCompleted: false, partnerCompleted: false, status: 'todo', actionPath: '/pages/task/index', actionText: '查看任务', canCue: true, random: true },
]

const initialMessages: ChatMessage[] = []

export const createInitialState = (): LovePointsState => ({
  profile: {
    nickname: '',
    avatarUrl: '',
    gender: 'private',
    region: '',
    hobbies: [],
    completed: false,
    identityCode: 'LP-LOCAL-01',
    backgroundUrl: '',
    privacy: {
      searchableByCode: true,
      showPartner: false,
      showRelationshipDays: false,
      showHeat: false,
      showDocumentCount: false,
      privateMode: false,
    },
  },
  partnerProfile: { nickname: '你的另一半', avatarUrl: '' },
  profileComplete: false,
  bound: false,
  activeSpaceType: 'personal',
  availableSpaces: ['personal'],
  preferences: {
    onboardingCompleted: false,
    usageMode: 'record',
    communityGuideSeen: false,
    taskGuideSeen: false,
  },
  inviteCode: '528913',
  joinCode: '',
  taskStatus: 'todo',
  taskCanReview: true,
  taskNote: '今晚一起做了番茄牛腩，还拍了照片留念。',
  selectedTaskId: initialTasks[0].id,
  tasks: initialTasks,
  personalPoints: 0,
  sharedPoints: 0,
  selectedRewardId: 'movie-night',
  redeemedRewardId: null,
  redemptionStatus: 'none',
  redemptionCanReview: false,
  refundStatus: 'none',
  refundCanReview: true,
  documentTitle: '我们的第一篇共同日记',
  documentBody: '今天一起完成了晚餐任务，番茄牛腩比想象中更成功。下次想试试做甜点。',
  selectedDocumentId: 'document-diary',
  documentGroups: initialDocumentGroups,
  documents: initialDocuments,
  unbindRequested: false,
  unbindCanReview: true,
  rewards: initialRewards,
  redemptions: [] as RewardRedemption[],
  communityPosts: [] as CommunityPost[],
  dailyRecords: [] as DailyRecord[],
  ledger: [],
  heat: { totalHeat: 0, todayHeat: 0, completedCount: 0, tasks: initialHeatTasks, ledger: [] },
  messages: initialMessages,
  unreadMessages: 0,
  relationshipStartedAt: '',
  relationshipPublicApproved: false,
})

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const readState = (): LovePointsState => {
  const saved = wx.getStorageSync<LovePointsState>(STORAGE_KEY)
  if (!saved) return createInitialState()
  const migrated = { ...createInitialState(), ...saved }
  migrated.profile = { ...createInitialState().profile, ...(saved.profile || {}) }
  migrated.profile.hobbies = Array.isArray(migrated.profile.hobbies) ? migrated.profile.hobbies : []
  migrated.profile.privacy = { ...createInitialState().profile.privacy, ...((saved.profile && saved.profile.privacy) || {}) }
  migrated.preferences = { ...createInitialState().preferences, ...(saved.preferences || {}) }
  migrated.activeSpaceType = saved.activeSpaceType === 'couple' && saved.bound ? 'couple' : 'personal'
  migrated.availableSpaces = saved.bound ? ['personal', 'couple'] : ['personal']
  migrated.profileComplete = Boolean(migrated.profile.completed || migrated.profile.nickname.trim())
  migrated.profile.completed = migrated.profileComplete
  migrated.partnerProfile = { ...createInitialState().partnerProfile, ...(saved.partnerProfile || {}) }
  migrated.communityPosts = Array.isArray(saved.communityPosts) ? saved.communityPosts : []
  migrated.dailyRecords = Array.isArray(saved.dailyRecords) ? saved.dailyRecords : []
  migrated.heat = saved.heat && Array.isArray(saved.heat.tasks) ? saved.heat : createInitialState().heat
  migrated.messages = Array.isArray(saved.messages) ? saved.messages : []
  migrated.unreadMessages = Number(saved.unreadMessages || 0)
  migrated.tasks = rollTaskCycles(migrated.tasks, new Date())
  migrated.rewards = (Array.isArray(saved.rewards) ? saved.rewards : createInitialState().rewards).map((reward) => ({
    ...reward,
    beneficiaryType: reward.beneficiaryType || (reward.pointsType === 'shared' ? 'couple' : 'self'),
  }))
  if (!Array.isArray(saved.tasks)) {
    migrated.tasks[0] = {
      ...migrated.tasks[0],
      status: saved.taskStatus,
      latestNote: saved.taskNote,
      reviewerIsSelf: saved.taskCanReview,
    }
  }
  if (!Array.isArray(saved.documents)) {
    migrated.documents[0] = {
      ...migrated.documents[0],
      title: saved.documentTitle,
      body: saved.documentBody,
    }
  }
  if (!Array.isArray(saved.redemptions)) {
    migrated.redemptions = saved.redeemedRewardId ? [{
      rewardId: saved.redeemedRewardId,
      status: saved.redemptionStatus === 'pending' ? 'pending' : saved.redemptionStatus === 'refunded' ? 'refunded' : 'active',
      canReview: saved.redemptionCanReview,
      refundStatus: saved.refundStatus,
      refundCanReview: saved.refundCanReview,
      requesterIsSelf: true,
    }] : []
  }
  return migrated
}

export const writeState = (state: LovePointsState): LovePointsState => {
  wx.setStorageSync(STORAGE_KEY, state)
  return clone(state)
}

export const updateState = (updater: (draft: LovePointsState) => void): LovePointsState => {
  const draft = clone(readState())
  updater(draft)
  return writeState(draft)
}

export const resetState = (): LovePointsState => {
  const next = createInitialState()
  wx.setStorageSync(STORAGE_KEY, next)
  return clone(next)
}
