import { createInitialState, resetState, updateState, readState } from '../store/state'
import type {
  CommunityMedia,
  CommunityPost,
  DailyRecord,
  DailyRecordType,
  ChatMessage,
  ChatMessageType,
  HeatSummary,
  LovePointsState,
  PointsType,
  ProfileGender,
  Reward,
  RewardRedemption,
  TaskItem,
  TaskPlanType,
  AppNotification,
  FriendProfile,
  AchievementItem,
  CompletionRequirement,
  ProjectStep,
  SpaceType,
  TaskKind,
  TaskAssigneeMode,
  UsageMode,
} from '../types/index'
import { getTaskCycleMeta, rollTaskCycles } from '../store/state'
import { runAction } from './client'
import { isCloudEnabled } from '../config/env'

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
const addLocalTaskLog = (task: TaskItem, type: TaskItem['activityLogs'][number]['type'], summary: string, actorIsSelf = true) => {
  task.activityLogs.unshift({ id: uid('task-log'), type, actorIsSelf, actorName: actorIsSelf ? '我' : 'TA', summary, createdAt: new Date().toISOString() })
  task.activityLogs = task.activityLogs.slice(0, 50)
}
const normalizeClientTask = (task: TaskItem): TaskItem => {
  const bothRequired = Boolean(task.bothRequired || task.assigneeMode === 'both')
  const emptyCompletion = { completed: false, completedAt: '', note: '', evidence: [] as CommunityMedia[] }
  const selfCompletion = { ...emptyCompletion, ...(task.selfCompletion || {}) }
  const partnerCompletion = { ...emptyCompletion, ...(task.partnerCompletion || {}) }
  return {
    ...task,
    assigneeMode: bothRequired ? 'both' : task.assigneeMode || (task.assigneeIsSelf ? 'self' : 'partner'),
    bothRequired,
    selfCompletion,
    partnerCompletion,
    media: Array.isArray(task.media) ? task.media : [],
    dailyHistory: Array.isArray(task.dailyHistory) ? task.dailyHistory : [],
    activityLogs: Array.isArray(task.activityLogs) ? task.activityLogs : [],
    projectSteps: (Array.isArray(task.projectSteps) ? task.projectSteps : []).map((step) => ({ ...step, media: Array.isArray(step.media) ? step.media : [] })),
    progressPercent: bothRequired ? (selfCompletion.completed ? 50 : 0) + (partnerCompletion.completed ? 50 : 0) : task.progressPercent,
  }
}
const grantLocalHeat = (draft: LovePointsState, code: string, delta: number, title: string) => {
  const task = draft.heat.tasks.find((item) => item.code === code)
  if (!task || task.selfCompleted) return
  task.selfCompleted = true
  task.progress = Math.min(task.maxParticipants, task.progress + 1)
  task.status = task.progress >= task.maxParticipants ? 'done' : 'partial'
  draft.heat.totalHeat += delta
  draft.heat.todayHeat += delta
  draft.heat.completedCount = draft.heat.tasks.filter((item) => item.status === 'done').length
  draft.heat.ledger.unshift({ id: uid('heat'), title, delta, createdAt: new Date().toISOString() })
}
const normalizeState = (value: LovePointsState): LovePointsState => {
  const initial = createInitialState()
  const state = { ...initial, ...value }
  state.profile = { ...initial.profile, ...(value?.profile || {}) }
  state.profile.privacy = { ...initial.profile.privacy, ...((value?.profile && value.profile.privacy) || {}) }
  state.preferences = { ...initial.preferences, ...(value?.preferences || {}) }
  state.activeSpaceType = value?.activeSpaceType === 'couple' && state.bound ? 'couple' : 'personal'
  state.availableSpaces = state.bound ? ['personal', 'couple'] : ['personal']
  state.partnerProfile = { ...initial.partnerProfile, ...(value?.partnerProfile || {}) }
  state.profileComplete = Boolean(value?.profileComplete || state.profile.completed || state.profile.nickname.trim())
  state.profile.completed = state.profileComplete
  state.communityPosts = Array.isArray(value?.communityPosts) ? value.communityPosts : []
  state.dailyRecords = Array.isArray(value?.dailyRecords) ? value.dailyRecords : []
  const receivedTasks = Array.isArray(value?.tasks) ? value.tasks : initial.tasks
  state.tasks = isCloudEnabled()
    ? receivedTasks.map(normalizeClientTask)
    : rollTaskCycles(receivedTasks).filter((item) => !item.spaceType || item.spaceType === state.activeSpaceType)
  if (!isCloudEnabled()) {
    state.rewards = state.rewards.filter((item) => !item.spaceType || item.spaceType === state.activeSpaceType)
    state.dailyRecords = state.dailyRecords.filter((item) => !item.spaceType || item.spaceType === state.activeSpaceType)
  }
  return state
}
const operationKey = (scope: string) => {
  const storageKey = `love-points-operation-${scope}`
  const existing = wx.getStorageSync<string>(storageKey)
  if (existing) return { key: existing, storageKey }
  const key = `${scope}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  wx.setStorageSync(storageKey, key)
  return { key, storageKey }
}

const currentTask = (state: LovePointsState, taskId?: string) => {
  const tasks = state.tasks.filter((task) => !task.spaceType || task.spaceType === state.activeSpaceType)
  return tasks.find((task) => task.id === (taskId || state.selectedTaskId)) || tasks[0]
}

const upsertRedemption = (draft: LovePointsState, rewardId: string, values: Omit<RewardRedemption, 'rewardId'>) => {
  const existing = draft.redemptions.find((item) => item.rewardId === rewardId)
  if (existing) Object.assign(existing, values)
  else draft.redemptions.unshift({ rewardId, ...values })
}

const syncSelectedTask = (draft: LovePointsState, task: TaskItem) => {
  draft.selectedTaskId = task.id
  draft.taskStatus = task.status
  draft.taskCanReview = task.reviewerIsSelf && task.status === 'pending'
  draft.taskNote = task.latestNote
}

const applyLocalRedemption = (draft: LovePointsState, reward: Reward) => {
  const balance = reward.pointsType === 'shared' ? draft.sharedPoints : draft.personalPoints
  if (balance < reward.cost) throw new Error('当前积分不足，先一起完成待办吧')
  const nextBalance = balance - reward.cost
  if (reward.pointsType === 'shared') draft.sharedPoints = nextBalance
  else draft.personalPoints = nextBalance
  draft.selectedRewardId = reward.id
  draft.redeemedRewardId = reward.id
  draft.redemptionStatus = 'active'
  draft.redemptionCanReview = false
  draft.refundStatus = 'none'
  draft.refundCanReview = true
  upsertRedemption(draft, reward.id, {
    status: 'active',
    canReview: false,
    refundStatus: 'none',
    refundCanReview: true,
    requesterIsSelf: true,
  })
  draft.ledger.unshift({
    id: uid('redeem'),
    title: `兑换「${reward.name}」`,
    detail: '刚刚兑换成功',
    amount: -reward.cost,
    balance: nextBalance,
    type: reward.pointsType,
  })
}

export const lovePointsService = {
  getState: async (): Promise<LovePointsState> => {
    const state = normalizeState(await runAction('home.summary', {}, readState))
    if (state.bound && isCloudEnabled()) state.heat = await runAction('heat.summary', {}, () => state.heat)
    return state
  },

  updateProfile: async (input: {
    nickname: string
    avatarUrl: string
    gender: ProfileGender
    region: string
    hobbies: string[]
    backgroundUrl?: string
  }): Promise<LovePointsState> => runAction('profile.update', input, () => updateState((draft) => {
    const nickname = input.nickname.trim()
    if (!nickname) throw new Error('请填写你的用户名')
    if (nickname.length > 24) throw new Error('用户名最多 24 个字')
    draft.profile = {
      ...draft.profile,
      nickname,
      avatarUrl: input.avatarUrl.trim(),
      backgroundUrl: (input.backgroundUrl || draft.profile.backgroundUrl).trim(),
      gender: input.gender,
      region: input.region.trim().slice(0, 60),
      hobbies: input.hobbies.map((item) => item.trim()).filter(Boolean).slice(0, 12),
      completed: true,
    }
    draft.profileComplete = true
  })),

  updateProfilePrivacy: async (privacy: LovePointsState['profile']['privacy']): Promise<LovePointsState> =>
    runAction('profile.privacy.update', { ...privacy }, () => updateState((draft) => {
      draft.profile.privacy = privacy.privateMode
        ? { ...privacy, searchableByCode: false, showPartner: false, showRelationshipDays: false, showHeat: false, showDocumentCount: false }
        : { ...privacy }
      if (privacy.privateMode) {
        draft.communityPosts.forEach((post) => {
          if (post.status === 'published' || post.status === 'pending') {
            post.status = 'couple_only'
            post.visibility = 'couple'
            post.syncToCommunity = false
            post.canReview = false
          }
        })
      }
    })),

  updateUsageMode: async (usageMode: UsageMode, hideExistingPublic = false): Promise<LovePointsState> =>
    runAction('profile.preferences.update', { usageMode, hideExistingPublic }, () => updateState((draft) => {
      draft.preferences = { ...draft.preferences, onboardingCompleted: true, usageMode }
      if (usageMode === 'record') {
        draft.profile.privacy = {
          ...draft.profile.privacy,
          searchableByCode: false,
          showPartner: false,
          showRelationshipDays: false,
          showHeat: false,
          showDocumentCount: false,
        }
        if (hideExistingPublic) {
          draft.communityPosts.forEach((post) => {
            if (post.status === 'published') {
              post.status = 'couple_only'
              post.visibility = 'couple'
              post.syncToCommunity = false
            }
          })
        }
      } else {
        draft.profile.privacy.searchableByCode = true
        draft.profile.privacy.privateMode = false
      }
    })),

  markGuideSeen: async (guide: 'community' | 'task'): Promise<LovePointsState> => {
    const current = readState()
    const preferences = { ...current.preferences, [guide === 'community' ? 'communityGuideSeen' : 'taskGuideSeen']: true }
    return runAction('profile.preferences.update', { ...preferences, usageMode: current.preferences.usageMode }, () => updateState((draft) => { draft.preferences = preferences }))
  },

  switchSpace: async (spaceType: SpaceType): Promise<LovePointsState> =>
    runAction('space.switch', { spaceType }, () => updateState((draft) => {
      if (spaceType === 'couple' && !draft.bound) throw new Error('请先绑定 TA，再进入情侣空间')
      draft.activeSpaceType = spaceType
    })),

  listCommunityPosts: async (): Promise<CommunityPost[]> => runAction('community.list', {}, () => readState().communityPosts),

  createCommunityPost: async (input: { title?: string; content: string; media: CommunityMedia[]; syncToCommunity?: boolean }): Promise<CommunityPost[]> =>
    runAction('community.create', input, () => updateState((draft) => {
      const title = String(input.title || '').trim()
      const content = input.content.trim()
      if (!title) throw new Error('请填写帖子标题')
      if (!content && !input.media.length) throw new Error('写点正文，或选择照片和视频')
      const syncToCommunity = Boolean(input.syncToCommunity) && !draft.profile.privacy.privateMode
      const post: CommunityPost = {
        id: uid('post'),
        title: title.slice(0, 60),
        content: content.slice(0, 1000),
        media: input.media.slice(0, 9),
        visibility: syncToCommunity ? 'community' : 'couple',
        syncToCommunity,
        status: syncToCommunity ? 'pending' : 'couple_only',
        authorName: draft.profile.nickname || '我',
        authorAvatarUrl: draft.profile.avatarUrl,
        pairLabel: `${draft.profile.nickname || '我'} × ${draft.partnerProfile.nickname || 'TA'}`,
        authorIsSelf: true,
        canReview: syncToCommunity,
        createdAt: new Date().toISOString(),
        publishedAt: '',
        rejectionReason: '',
        spaceType: draft.activeSpaceType,
      }
      draft.communityPosts.unshift(post)
    }).communityPosts),

  updateCommunityPost: async (postId: string, input: { title: string; content: string; media: CommunityMedia[]; syncToCommunity?: boolean }): Promise<CommunityPost[]> =>
    runAction('community.update', { postId, ...input }, () => updateState((draft) => {
      const post = draft.communityPosts.find((item) => item.id === postId && item.authorIsSelf)
      if (!post) throw new Error('只能编辑自己发布的帖子')
      const title = input.title.trim()
      const content = input.content.trim()
      if (!title) throw new Error('请填写帖子标题')
      if (!content && !input.media.length) throw new Error('写点正文，或选择照片和视频')
      const syncToCommunity = Boolean(input.syncToCommunity) && !draft.profile.privacy.privateMode
      post.title = title.slice(0, 60)
      post.content = content.slice(0, 1000)
      post.media = input.media.slice(0, 9)
      post.visibility = syncToCommunity ? 'community' : 'couple'
      post.syncToCommunity = syncToCommunity
      post.status = syncToCommunity ? 'pending' : 'couple_only'
      post.canReview = false
      post.publishedAt = ''
      post.rejectionReason = ''
    }).communityPosts),

  reviewCommunityPost: async (postId: string, approved: boolean, reason = ''): Promise<CommunityPost[]> =>
    runAction('community.review', { postId, approved, reason }, () => updateState((draft) => {
      const post = draft.communityPosts.find((item) => item.id === postId)
      if (!post || post.status !== 'pending') throw new Error('这条发布申请已经处理')
      post.status = approved ? 'published' : 'rejected'
      post.canReview = false
      post.publishedAt = approved ? new Date().toISOString() : ''
      post.rejectionReason = approved ? '' : reason.trim()
    }).communityPosts),

  listDailyRecords: async (month: string): Promise<DailyRecord[]> => runAction('records.list', { month }, () => {
    return readState().dailyRecords.filter((item) => item.date.startsWith(month))
  }),

  saveDailyRecord: async (input: {
    id?: string
    date: string
    type: DailyRecordType
    title: string
    note: string
    mood: string
    periodFlow: DailyRecord['periodFlow']
    visibility: DailyRecord['visibility']
    media?: CommunityMedia[]
  }): Promise<DailyRecord[]> => runAction('records.save', input, () => updateState((draft) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('记录日期不正确')
    const title = input.title.trim()
    if (input.type === 'event' && !title) throw new Error('请填写事件名称')
    let record = input.id ? draft.dailyRecords.find((item) => item.id === input.id && item.ownerIsSelf) : undefined
    if (!record) {
      record = {
        id: uid('record'),
        date: input.date,
        type: input.type,
        title,
        note: input.note.trim(),
        mood: input.mood,
        periodFlow: input.periodFlow,
        visibility: draft.bound ? input.visibility : 'self',
        media: (input.media || []).slice(0, 9),
        ownerIsSelf: true,
        ownerName: draft.profile.nickname || '我',
        createdAt: new Date().toISOString(),
        spaceType: draft.activeSpaceType,
      }
      draft.dailyRecords.unshift(record)
    } else {
      Object.assign(record, {
        date: input.date,
        type: input.type,
        title,
        note: input.note.trim(),
        mood: input.mood,
        periodFlow: input.periodFlow,
        visibility: draft.bound ? input.visibility : 'self',
        media: (input.media || []).slice(0, 9),
      })
    }
    if (input.type === 'mood') grantLocalHeat(draft, 'HF02', 1, '记录今日情绪')
  }).dailyRecords),

  deleteDailyRecord: async (recordId: string): Promise<DailyRecord[]> =>
    runAction('records.delete', { recordId }, () => updateState((draft) => {
      draft.dailyRecords = draft.dailyRecords.filter((item) => item.id !== recordId || !item.ownerIsSelf)
    }).dailyRecords),

  createInvite: async (): Promise<LovePointsState> => runAction('invite.create', {}, () => {
    return updateState((draft) => {
      draft.inviteCode = String(Math.floor(100000 + Math.random() * 900000))
    })
  }),

  applyInvite: async (code: string): Promise<LovePointsState> => runAction('invite.apply', { code }, () => {
    if (!/^\d{6}$/.test(code)) throw new Error('请输入完整的 6 位数字短码')
    return updateState((draft) => { draft.joinCode = code })
  }),

  pendingInvite: async (): Promise<{ invite: { id: string; status: string; hasApplicant: boolean } | null }> =>
    runAction('invite.pending', {}, () => ({ invite: { id: 'local-pending', status: 'applied', hasApplicant: true } })),

  inviteStatus: async (): Promise<{ invite: { id: string; status: string; expiresAt?: string } | null }> =>
    runAction('invite.status', {}, () => ({ invite: { id: 'local-pending', status: 'applied' } })),

  confirmBinding: async (): Promise<LovePointsState> => runAction('invite.review', { approved: true }, () => {
    return updateState((draft) => {
      draft.bound = true
      draft.activeSpaceType = 'couple'
      draft.availableSpaces = ['personal', 'couple']
      draft.relationshipStartedAt = new Date().toISOString()
      draft.sharedPoints = 580
      draft.ledger = []
      draft.heat = createInitialState().heat
      draft.messages = []
      draft.unreadMessages = 0
    })
  }),

  rejectBinding: async (): Promise<LovePointsState> => runAction('invite.review', { approved: false }, () => {
    return updateState((draft) => {
      draft.joinCode = ''
      draft.bound = false
    })
  }),

  selectTask: (taskId: string): LovePointsState => updateState((draft) => {
    const task = currentTask(draft, taskId)
    if (!task) return
    syncSelectedTask(draft, task)
  }),

  createTask: async (input: {
    title: string
    description: string
    points: number
    taskType: 'personal' | 'shared'
    assignee: TaskAssigneeMode
    planType: TaskPlanType
    kind?: TaskKind
    completionRequirement?: CompletionRequirement
    projectSteps?: Array<{ title: string; description?: string; assignee: 'self' | 'partner'; completionRequirement: CompletionRequirement }>
  }): Promise<LovePointsState> => runAction('task.create', input, () => updateState((draft) => {
    if (!input.title.trim()) throw new Error('请填写待办名称')
    if (!Number.isInteger(input.points) || input.points <= 0 || input.points > 10000) {
      throw new Error('待办积分必须是 1–10000 的整数')
    }
    const kind: TaskKind = input.kind || (input.planType === 'long_term' ? 'one_time' : 'recurring')
    if (kind === 'project' && (!draft.bound || draft.activeSpaceType !== 'couple')) throw new Error('大计划只能创建在情侣空间')
    const planType = kind === 'project' || kind === 'one_time' ? 'long_term' : input.planType === 'weekly' ? 'weekly' : 'daily'
    const bothRequired = input.assignee === 'both'
    if (bothRequired && (draft.activeSpaceType !== 'couple' || kind !== 'recurring' || planType !== 'daily')) throw new Error('双方完成模式仅用于情侣空间的每日待办')
    const rawSteps = input.projectSteps || []
    if (kind === 'project' && (rawSteps.length < 2 || rawSteps.length > 8)) throw new Error('大计划需要设置 2–8 个环节')
    const templateId = uid('task-template')
    const meta = getTaskCycleMeta(planType)
    const projectSteps: ProjectStep[] = rawSteps.map((step, index) => ({
      id: `${templateId}-step-${index + 1}`,
      title: step.title.trim(),
      description: String(step.description || '').trim(),
      assignee: step.assignee,
      assigneeIsSelf: step.assignee === 'self',
      completionRequirement: step.completionRequirement,
      status: 'todo',
      completedBySelf: false,
      completedAt: '',
      note: '',
      evidence: [],
      media: [],
      rewardPoints: Math.floor(input.points * 0.1),
    }))
    const task: TaskItem = {
      id: planType === 'long_term' ? templateId : `${templateId}:${meta.cycleKey}`,
      templateId,
      title: input.title.trim(),
      description: input.description.trim() || '你们共同创建的新待办',
      taskType: draft.activeSpaceType === 'couple' ? 'shared' : 'personal',
      pointsType: draft.activeSpaceType === 'couple' ? 'shared' : 'personal',
      points: input.points,
      status: 'todo',
      assigneeMode: bothRequired ? 'both' : input.assignee,
      bothRequired,
      assigneeIsSelf: input.assignee !== 'partner',
      reviewerIsSelf: !bothRequired && input.assignee === 'partner',
      selfCompletion: { completed: false, completedAt: '', note: '', evidence: [] },
      partnerCompletion: { completed: false, completedAt: '', note: '', evidence: [] },
      latestNote: '',
      rejectionReason: '',
      planType,
      kind,
      completionRequirement: input.completionRequirement || 'note',
      evidence: [],
      media: [],
      dailyHistory: [],
      activityLogs: [],
      progressPercent: 0,
      projectSteps,
      projectFinalized: false,
      spaceType: draft.activeSpaceType,
      ...meta,
      isCurrentCycle: true,
    }
    addLocalTaskLog(task, 'created', bothRequired ? '创建了双方每日都要完成的待办' : '创建了待办')
    draft.tasks.unshift(task)
    syncSelectedTask(draft, task)
  })),

  submitTask: async (note: string, taskId?: string, evidence: CommunityMedia[] = []): Promise<LovePointsState> => runAction('task.submit', { note, taskId, evidence }, () => {
    return updateState((draft) => {
      const task = currentTask(draft, taskId)
      if (!task) throw new Error('待办不存在')
      if (task.kind === 'project') throw new Error('请在大计划详情中完成具体环节')
      if (task.completionRequirement === 'note' && !note.trim()) throw new Error('请填写完成说明')
      if (task.completionRequirement === 'image' && !evidence.length) throw new Error('请至少上传一张完成图片')
      if (task.bothRequired) {
        if (!task.isCurrentCycle) throw new Error('这个周期已经结束，不能补交')
        if (task.selfCompletion.completed) return
        const completedAt = new Date().toISOString()
        task.selfCompletion = { completed: true, completedAt, note: note.trim(), evidence: evidence.slice(0, 9) }
        task.latestNote = note.trim()
        task.evidence = evidence.slice(0, 9)
        task.status = task.partnerCompletion.completed ? 'done' : 'partial'
        task.progressPercent = task.partnerCompletion.completed ? 100 : 50
        const ledgerId = `${task.id}-participant-self-completed`
        if (!draft.ledger.some((entry) => entry.id === ledgerId)) {
          draft.sharedPoints += task.points
          draft.ledger.unshift({ id: ledgerId, title: task.title, detail: '我完成了双方每日待办', amount: task.points, balance: draft.sharedPoints, type: 'shared' })
        }
        const historyEntry = task.dailyHistory.find((item) => item.date === task.cycleKey)
        if (historyEntry) historyEntry.selfCompleted = true
        else task.dailyHistory.unshift({ date: task.cycleKey, selfCompleted: true, partnerCompleted: task.partnerCompletion.completed })
        addLocalTaskLog(task, 'completed', `完成了今日待办，情侣积分 +${task.points}`)
        syncSelectedTask(draft, task)
        return
      }
      if (!task.assigneeIsSelf) throw new Error('只有待办执行人可以提交')
      if (!['todo', 'rejected'].includes(task.status)) throw new Error('待办当前状态不可提交')
      if (!task.isCurrentCycle && task.planType !== 'long_term') throw new Error('这个周期已经结束，不能补交')
      task.latestNote = note.trim()
      task.evidence = evidence.slice(0, 9)
      task.status = draft.activeSpaceType === 'personal' ? 'done' : 'pending'
      task.rejectionReason = ''
      if (draft.activeSpaceType === 'personal') {
        const ledgerId = `${task.id}-self-completed`
        if (!draft.ledger.some((entry) => entry.id === ledgerId)) {
          draft.personalPoints += task.points
          draft.ledger.unshift({ id: ledgerId, title: task.title, detail: '个人待办完成', amount: task.points, balance: draft.personalPoints, type: 'personal' })
        }
        task.progressPercent = 100
      }
      // 本机体验模式用同一台设备模拟双方，提交后切换为审批视角；云端模式由 OpenID 权限决定。
      task.reviewerIsSelf = true
      addLocalTaskLog(task, 'completed', draft.activeSpaceType === 'personal' ? `完成待办，个人积分 +${task.points}` : '提交了完成记录，等待对方确认')
      syncSelectedTask(draft, task)
    })
  }),

  completeProjectStep: async (taskId: string, stepId: string, note = '', evidence: CommunityMedia[] = []): Promise<LovePointsState> =>
    runAction('task.project.step.complete', { taskId, stepId, note, evidence }, () => updateState((draft) => {
      const task = currentTask(draft, taskId)
      if (!task || task.kind !== 'project') throw new Error('大计划不存在')
      const step = task.projectSteps.find((item) => item.id === stepId)
      if (!step) throw new Error('计划环节不存在')
      if (!step.assigneeIsSelf) throw new Error('这个环节由 TA 完成')
      if (step.status === 'done') return
      if (step.completionRequirement === 'note' && !note.trim()) throw new Error('请填写完成说明')
      if (step.completionRequirement === 'image' && !evidence.length) throw new Error('请至少上传一张完成图片')
      step.status = 'done'
      step.completedBySelf = true
      step.completedAt = new Date().toISOString()
      step.note = note.trim()
      step.evidence = evidence.slice(0, 9)
      const ledgerId = `${task.templateId}-${step.id}-completed`
      if (!draft.ledger.some((entry) => entry.id === ledgerId)) {
        draft.sharedPoints += step.rewardPoints
        draft.ledger.unshift({ id: ledgerId, title: `${task.title} · ${step.title}`, detail: '完成大计划环节', amount: step.rewardPoints, balance: draft.sharedPoints, type: 'shared' })
      }
      task.progressPercent = task.projectSteps.filter((item) => item.status === 'done').length * 10
      addLocalTaskLog(task, 'step_completed', `完成环节“${step.title}”，情侣积分 +${step.rewardPoints}`)
    })),

  completeProject: async (taskId: string): Promise<LovePointsState> =>
    runAction('task.project.complete', { taskId }, () => updateState((draft) => {
      const task = currentTask(draft, taskId)
      if (!task || task.kind !== 'project') throw new Error('大计划不存在')
      if (task.projectSteps.some((step) => step.status !== 'done')) throw new Error('完成所有环节后才能结束大计划')
      if (task.projectFinalized) return
      const stepPoints = task.projectSteps.reduce((sum, step) => sum + step.rewardPoints, 0)
      const remaining = Math.max(0, task.points - stepPoints)
      task.projectFinalized = true
      task.status = 'done'
      task.progressPercent = 100
      const ledgerId = `${task.templateId}-project-completed`
      if (!draft.ledger.some((entry) => entry.id === ledgerId)) {
        draft.sharedPoints += remaining
        draft.ledger.unshift({ id: ledgerId, title: task.title, detail: '共同计划全部完成', amount: remaining, balance: draft.sharedPoints, type: 'shared' })
      }
      syncSelectedTask(draft, task)
    })),

  reviewTask: async (approved: boolean, taskId?: string, reason = ''): Promise<LovePointsState> => runAction('task.review', { approved, taskId, reason }, () => {
    return updateState((draft) => {
      const task = currentTask(draft, taskId)
      if (!task) throw new Error('待办不存在')
      if (!task.reviewerIsSelf) throw new Error('只有指定确认人可以处理待办')
      if (!approved) {
        task.status = 'rejected'
        task.rejectionReason = reason.trim()
        addLocalTaskLog(task, 'reviewed', `要求补充完成记录${reason.trim() ? `：${reason.trim()}` : ''}`)
        syncSelectedTask(draft, task)
        return
      }
      if (task.status === 'done') return
      if (task.status !== 'pending') throw new Error('待办当前不在待确认状态')
      task.status = 'done'
      const nextBalance = (task.pointsType === 'shared' ? draft.sharedPoints : draft.personalPoints) + task.points
      if (task.pointsType === 'shared') draft.sharedPoints = nextBalance
      else draft.personalPoints = nextBalance
      const ledgerId = `${task.id}-approved`
      if (!draft.ledger.some((entry) => entry.id === ledgerId)) {
        draft.ledger.unshift({
          id: ledgerId,
          title: task.title,
          detail: '刚刚由对方确认完成',
          amount: task.points,
          balance: nextBalance,
          type: task.pointsType,
        })
      }
      addLocalTaskLog(task, 'reviewed', `确认完成，${task.pointsType === 'shared' ? '情侣' : '个人'}积分 +${task.points}`)
      grantLocalHeat(draft, 'HF03', 1, '完成积分任务')
      if (task.taskType === 'shared') grantLocalHeat(draft, 'HR01', 4, '完成共同待办')
      syncSelectedTask(draft, task)
    })
  }),

  updateTask: async (taskId: string, input: { title: string; description: string; points: number; completionRequirement: CompletionRequirement }): Promise<LovePointsState> =>
    runAction('task.update', { taskId, ...input }, () => updateState((draft) => {
      const task = currentTask(draft, taskId)
      if (!task) throw new Error('待办不存在')
      const title = input.title.trim()
      const description = input.description.trim()
      if (!title) throw new Error('请填写待办名称')
      if (!Number.isInteger(input.points) || input.points <= 0 || input.points > 10000) throw new Error('待办积分必须是 1–10000 的整数')
      const changed: string[] = []
      if (task.title !== title) changed.push('名称')
      if (task.description !== description) changed.push('说明')
      if (task.points !== input.points) changed.push('积分')
      if (task.completionRequirement !== input.completionRequirement) changed.push('完成方式')
      draft.tasks.filter((item) => item.templateId === task.templateId).forEach((item) => {
        item.title = title
        item.description = description
        item.points = input.points
        if (item.kind !== 'project') item.completionRequirement = input.completionRequirement
      })
      addLocalTaskLog(task, 'updated', changed.length ? `修改了${changed.join('、')}` : '保存了待办信息')
      syncSelectedTask(draft, task)
    })),

  addTaskPhotos: async (taskId: string, media: CommunityMedia[], stepId = ''): Promise<LovePointsState> =>
    runAction('task.media.add', { taskId, media, stepId }, () => updateState((draft) => {
      const task = currentTask(draft, taskId)
      if (!task) throw new Error('待办不存在')
      const images = media.filter((item) => item.type === 'image').slice(0, 9)
      if (!images.length) throw new Error('请选择照片')
      if (stepId) {
        const step = task.projectSteps.find((item) => item.id === stepId)
        if (!step) throw new Error('计划环节不存在')
        step.media = [...step.media, ...images].slice(0, 9)
        addLocalTaskLog(task, 'photo_added', `为环节“${step.title}”添加了 ${images.length} 张照片`)
      } else {
        task.media = [...task.media, ...images].slice(0, 9)
        addLocalTaskLog(task, 'photo_added', `为待办添加了 ${images.length} 张照片`)
      }
      syncSelectedTask(draft, task)
    })),

  selectReward: (id: string): LovePointsState => updateState((draft) => { draft.selectedRewardId = id }),

  createReward: async (input: {
    name: string
    description: string
    cost: number
    pointsType: PointsType
    expiry?: string
    condition?: string
    approvalRequired?: boolean
    beneficiaryType?: Reward['beneficiaryType']
  }): Promise<LovePointsState> =>
    runAction('reward.create', input, () => updateState((draft) => {
      if (!input.name.trim() || !Number.isFinite(input.cost) || input.cost <= 0) {
        throw new Error('请填写有效的心愿名称和积分')
      }
      const reward: Reward = {
        id: uid('custom'),
        name: input.name.trim(),
        description: input.description.trim() || '你们共同创建的心愿',
        cost: input.cost,
        pointsType: draft.activeSpaceType === 'couple' ? 'shared' : 'personal',
        expiry: input.expiry?.trim() || '创建后 365 天内',
        condition: input.condition?.trim() || '由双方共同商量使用时间',
        approvalRequired: draft.activeSpaceType === 'couple' && Boolean(input.approvalRequired),
        beneficiaryType: draft.activeSpaceType === 'couple' ? (input.beneficiaryType || 'couple') : 'self',
        spaceType: draft.activeSpaceType,
      }
      draft.rewards.push(reward)
      draft.selectedRewardId = reward.id
    })),

  redeemReward: async (rewardId: string): Promise<LovePointsState> => {
    const operation = operationKey(`redeem-${rewardId}`)
    const result = await runAction('reward.redeem', { rewardId, idempotencyKey: operation.key }, () => {
      return updateState((draft) => {
      const reward = draft.rewards.find((item) => item.id === rewardId && (!item.spaceType || item.spaceType === draft.activeSpaceType))
      if (!reward) throw new Error('心愿不存在或已下架')
      if (draft.redeemedRewardId === reward.id && ['pending', 'active'].includes(draft.redemptionStatus)) return
      const balance = reward.pointsType === 'shared' ? draft.sharedPoints : draft.personalPoints
      if (balance < reward.cost) throw new Error('当前积分不足，先一起完成待办吧')
      if (reward.approvalRequired) {
        draft.selectedRewardId = reward.id
        draft.redeemedRewardId = reward.id
        draft.redemptionStatus = 'pending'
        draft.redemptionCanReview = true
        draft.refundStatus = 'none'
        draft.refundCanReview = false
        upsertRedemption(draft, reward.id, {
          status: 'pending',
          canReview: true,
          refundStatus: 'none',
          refundCanReview: false,
          requesterIsSelf: true,
        })
        return
      }
      applyLocalRedemption(draft, reward)
      })
    })
    wx.removeStorageSync(operation.storageKey)
    return result
  },

  reviewRedemption: async (approved: boolean, rewardId?: string): Promise<LovePointsState> =>
    runAction('reward.redeem.review', { approved, rewardId }, () => {
      if (!approved) return updateState((draft) => {
        const targetRewardId = rewardId || draft.selectedRewardId
        draft.redemptions = draft.redemptions.filter((item) => item.rewardId !== targetRewardId)
        draft.redeemedRewardId = null
        draft.redemptionStatus = 'none'
        draft.redemptionCanReview = false
      })
      return updateState((draft) => {
        const targetRewardId = rewardId || draft.selectedRewardId
        const redemption = draft.redemptions.find((item) => item.rewardId === targetRewardId)
        if (redemption && redemption.status !== 'pending') return
        const reward = draft.rewards.find((item) => item.id === targetRewardId)
        if (!reward) throw new Error('心愿不存在或已下架')
        applyLocalRedemption(draft, reward)
      })
    }),

  requestRefund: async (rewardId?: string): Promise<LovePointsState> => runAction('reward.refund.request', { rewardId }, () => {
    return updateState((draft) => {
      const targetRewardId = rewardId || draft.redeemedRewardId || ''
      const redemption = draft.redemptions.find((item) => item.rewardId === targetRewardId && item.status === 'active')
      if (!redemption) throw new Error('当前奖励没有可退款的兑换记录')
      redemption.refundStatus = 'requested'
      redemption.refundCanReview = true
      draft.refundStatus = 'requested'
      draft.refundCanReview = true
    })
  }),

  approveRefund: async (rewardId?: string): Promise<LovePointsState> => runAction('reward.refund.review', { approved: true, rewardId }, () => {
    return updateState((draft) => {
      const targetRewardId = rewardId
        || draft.redemptions.find((item) => item.refundStatus === 'requested')?.rewardId
        || draft.redemptions.find((item) => item.refundStatus === 'approved')?.rewardId
        || draft.redeemedRewardId
        || ''
      const redemption = draft.redemptions.find((item) => item.rewardId === targetRewardId)
      if (redemption?.refundStatus === 'approved') return
      const reward = draft.rewards.find((item) => item.id === targetRewardId)
      if (!reward || redemption?.refundStatus !== 'requested') throw new Error('没有待处理的退款申请')
      const nextBalance = (reward.pointsType === 'shared' ? draft.sharedPoints : draft.personalPoints) + reward.cost
      if (reward.pointsType === 'shared') draft.sharedPoints = nextBalance
      else draft.personalPoints = nextBalance
      draft.refundStatus = 'approved'
      draft.refundCanReview = false
      draft.redeemedRewardId = null
      draft.redemptionStatus = 'refunded'
      redemption.status = 'refunded'
      redemption.refundStatus = 'approved'
      redemption.refundCanReview = false
      draft.ledger.unshift({
        id: uid('refund'),
        title: `心愿退款「${reward.name}」`,
        detail: '刚刚由对方确认通过',
        amount: reward.cost,
        balance: nextBalance,
        type: reward.pointsType,
      })
    })
  }),

  reviewRefund: async (approved: boolean, rewardId?: string): Promise<LovePointsState> => {
    if (approved) return lovePointsService.approveRefund(rewardId)
    return runAction('reward.refund.review', { approved: false, rewardId }, () => updateState((draft) => {
      const targetRewardId = rewardId || draft.redeemedRewardId || ''
      const redemption = draft.redemptions.find((item) => item.rewardId === targetRewardId)
      if (redemption) {
        redemption.status = 'active'
        redemption.refundStatus = 'none'
        redemption.refundCanReview = false
      }
      draft.refundStatus = 'none'
      draft.refundCanReview = false
      draft.redemptionStatus = 'active'
    }))
  },

  selectDocument: (documentId: string): LovePointsState => updateState((draft) => {
    const document = draft.documents.find((item) => item.id === documentId)
    if (!document) return
    draft.selectedDocumentId = document.id
    draft.documentTitle = document.title
    draft.documentBody = document.body
  }),

  getDocument: async (documentId: string): Promise<{ document: { id: string; groupId: string; title: string; body: string; lockedByOther: boolean } }> =>
    runAction('documents.detail', { documentId }, () => {
      const document = readState().documents.find((item) => item.id === documentId)
      if (!document) throw new Error('文档不存在')
      return { document }
    }),

  createDocumentGroup: async (name: string): Promise<LovePointsState> =>
    runAction('documents.groups.create', { name }, () => updateState((draft) => {
      if (!name.trim()) throw new Error('请填写文档组名称')
      draft.documentGroups.push({ id: uid('group'), name: name.trim(), order: draft.documentGroups.length })
    })),

  saveDocument: async (title: string, body: string, documentId?: string, groupId?: string): Promise<LovePointsState> => runAction('documents.save', { title, body, documentId, groupId }, () => {
    if (!title.trim()) throw new Error('文档标题不能为空')
    return updateState((draft) => {
      let document = documentId ? draft.documents.find((item) => item.id === documentId) : undefined
      if (!document) {
        document = {
          id: uid('document'),
          groupId: groupId || draft.documentGroups[0]?.id || '',
          title: title.trim(),
          body: body.trim(),
          lockedByOther: false,
        }
        draft.documents.unshift(document)
      } else {
        document.title = title.trim()
        document.body = body.trim()
      }
      draft.selectedDocumentId = document.id
      draft.documentTitle = document.title
      draft.documentBody = document.body
    })
  }),

  lockDocument: async (documentId?: string): Promise<{ documentId: string; lockExpiresAt: string }> =>
    runAction('documents.lock', { documentId }, () => ({ documentId: documentId || 'local-document', lockExpiresAt: new Date(Date.now() + 300000).toISOString() })),

  unlockDocument: async (documentId?: string): Promise<{ ok: boolean }> =>
    runAction('documents.unlock', { documentId }, () => ({ ok: true })),

  requestUnbind: async (): Promise<LovePointsState> => runAction('unbind.request', {}, () => {
    return updateState((draft) => { draft.unbindRequested = true })
  }),

  cancelUnbind: async (): Promise<LovePointsState> => runAction('unbind.cancel', {}, () => {
    return updateState((draft) => { draft.unbindRequested = false })
  }),

  rejectUnbind: async (): Promise<LovePointsState> => runAction('unbind.review', { approved: false }, () => {
    return updateState((draft) => { draft.unbindRequested = false })
  }),

  approveUnbind: async (): Promise<LovePointsState> => runAction('unbind.review', { approved: true }, () => {
    const current = readState()
    resetState()
    return updateState((draft) => {
      draft.profile = current.profile
      draft.profileComplete = current.profileComplete
      draft.preferences = current.preferences
      draft.activeSpaceType = 'personal'
      draft.availableSpaces = ['personal']
      draft.personalPoints = current.personalPoints
    })
  }),

  getHeat: async (): Promise<HeatSummary> => runAction('heat.summary', {}, () => readState().heat),

  checkInHeat: async (): Promise<HeatSummary> => runAction('heat.checkin', {}, () => updateState((draft) => {
    if (!draft.bound) throw new Error('绑定 TA 后才能一起积累热力')
    grantLocalHeat(draft, 'HF01', 1, '完成每日打卡')
  }).heat),

  listMessages: async (): Promise<{ messages: ChatMessage[]; unread: number }> => runAction('chat.list', {}, () => {
    const state = updateState((draft) => { draft.unreadMessages = 0 })
    return { messages: state.messages, unread: 0 }
  }),
  getUnreadMessages: async (): Promise<number> => (await runAction('chat.unread', {}, () => ({ unread: readState().unreadMessages }))).unread,

  listNotifications: async (): Promise<{ items: AppNotification[]; unread: number }> => runAction('notifications.list', {}, () => ({ items: [], unread: 0 })),
  listAchievements: async (state: LovePointsState): Promise<AchievementItem[]> => runAction('achievements.list', {}, async () => (await import('../utils/achievements')).buildAchievements(state)),
  readNotification: async (id: string): Promise<{ items: AppNotification[]; unread: number }> => runAction('notifications.read', { id }, () => ({ items: [], unread: 0 })),
  searchFriend: async (code: string): Promise<{ user: FriendProfile }> => runAction('friends.search', { code }, () => { throw new Error('本机体验模式无法搜索真实身份码') }),
  requestFriend: async (code: string): Promise<{ friends: FriendProfile[]; requests: Array<{ id: string; user: FriendProfile }> }> => runAction('friends.request', { code }, () => ({ friends: [], requests: [] })),
  listFriends: async (): Promise<{ friends: FriendProfile[]; requests: Array<{ id: string; user: FriendProfile }> }> => runAction('friends.list', {}, () => ({ friends: [], requests: [] })),
  reviewFriend: async (id: string, approved: boolean): Promise<{ friends: FriendProfile[]; requests: Array<{ id: string; user: FriendProfile }> }> => runAction('friends.review', { id, approved }, () => ({ friends: [], requests: [] })),
  getRelationshipSettings: async (): Promise<{ relationshipStartedAt: string; publicApproved: boolean; requests: Array<{ id: string; type: string; value: string; canReview: boolean }> }> => runAction('relationship.list', {}, () => ({ relationshipStartedAt: readState().relationshipStartedAt, publicApproved: readState().relationshipPublicApproved, requests: [] })),
  requestRelationshipChange: async (type: 'date' | 'public', value = '') => runAction('relationship.request', { type, value }, () => ({ relationshipStartedAt: readState().relationshipStartedAt, publicApproved: readState().relationshipPublicApproved, requests: [] })),
  reviewRelationshipChange: async (id: string, approved: boolean) => runAction('relationship.review', { id, approved }, () => ({ relationshipStartedAt: readState().relationshipStartedAt, publicApproved: readState().relationshipPublicApproved, requests: [] })),
  revokeRelationshipPublic: async (): Promise<{ relationshipStartedAt: string; publicApproved: boolean; requests: Array<{ id: string; type: string; value: string; canReview: boolean }> }> => runAction('relationship.public.revoke', {}, () => {
    const state = updateState((draft) => { draft.relationshipPublicApproved = false })
    return { relationshipStartedAt: state.relationshipStartedAt, publicApproved: false, requests: [] }
  }),

  sendMessage: async (text: string): Promise<{ messages: ChatMessage[]; unread: number }> => runAction('chat.send', { text }, () => {
    const clean = text.trim().slice(0, 500)
    if (!clean) throw new Error('请输入消息内容')
    const state = updateState((draft) => {
      if (!draft.bound) throw new Error('绑定 TA 后才能聊天')
      draft.messages.push({ id: uid('message'), type: 'text', text: clean, title: '', description: '', resourceType: '', resourceId: '', actionPath: '', actionText: '', senderIsSelf: true, createdAt: new Date().toISOString(), status: 'sent' })
    })
    return { messages: state.messages, unread: state.unreadMessages }
  }),

  cuePartner: async (input: { type: ChatMessageType; title: string; description: string; resourceType: string; resourceId: string; actionPath: string; actionText: string }): Promise<void> => {
    await runAction('chat.cue', input, () => updateState((draft) => {
      if (!draft.bound) throw new Error('绑定 TA 后才能使用 @TA')
      draft.messages.push({ id: uid('cue'), ...input, text: '', senderIsSelf: true, createdAt: new Date().toISOString(), status: 'sent' })
    }))
  },

  openChatCard: async (messageId: string): Promise<{ actionPath: string }> => runAction('chat.open', { messageId }, () => {
    const state = updateState((draft) => { grantLocalHeat(draft, 'HF04', 2, '和 TA 完成一次互动') })
    const message = state.messages.find((item) => item.id === messageId)
    return { actionPath: message?.actionPath || '' }
  }),

  createShareIntent: async (input: { type: 'heat_task' | 'community_post' | 'couple_bind'; resourceId: string; targetPath: string }): Promise<{ token: string; path: string }> =>
    runAction('share.create', input, () => ({ token: uid('share'), path: input.targetPath })),

  resolveShareIntent: async (token: string): Promise<{ type: string; resourceId: string; targetPath: string }> =>
    runAction('share.resolve', { token }, () => ({ type: 'local', resourceId: '', targetPath: '/pages/home/index' })),
}
