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
} from '../types/index'
import { getTaskCycleMeta, rollTaskCycles } from '../store/state'
import { runAction } from './client'
import { isCloudEnabled } from '../config/env'

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
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
  state.partnerProfile = { ...initial.partnerProfile, ...(value?.partnerProfile || {}) }
  state.profileComplete = Boolean(value?.profileComplete || state.profile.completed || state.profile.nickname.trim())
  state.profile.completed = state.profileComplete
  state.communityPosts = Array.isArray(value?.communityPosts) ? value.communityPosts : []
  state.dailyRecords = Array.isArray(value?.dailyRecords) ? value.dailyRecords : []
  const receivedTasks = Array.isArray(value?.tasks) ? value.tasks : initial.tasks
  state.tasks = isCloudEnabled() ? receivedTasks : rollTaskCycles(receivedTasks)
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

const currentTask = (state: LovePointsState, taskId?: string) =>
  state.tasks.find((task) => task.id === (taskId || state.selectedTaskId)) || state.tasks[0]

const upsertRedemption = (draft: LovePointsState, rewardId: string, values: Omit<RewardRedemption, 'rewardId'>) => {
  const existing = draft.redemptions.find((item) => item.rewardId === rewardId)
  if (existing) Object.assign(existing, values)
  else draft.redemptions.unshift({ rewardId, ...values })
}

const syncSelectedTask = (draft: LovePointsState, task: TaskItem) => {
  draft.selectedTaskId = task.id
  draft.taskStatus = task.status
  draft.taskCanReview = task.reviewerIsSelf
  draft.taskNote = task.latestNote
}

const applyLocalRedemption = (draft: LovePointsState, reward: Reward) => {
  const balance = reward.pointsType === 'shared' ? draft.sharedPoints : draft.personalPoints
  if (balance < reward.cost) throw new Error('当前积分不足，先一起完成任务吧')
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
    runAction('profile.privacy.update', { ...privacy }, () => updateState((draft) => { draft.profile.privacy = { ...privacy } })),

  listCommunityPosts: async (): Promise<CommunityPost[]> => runAction('community.list', {}, () => readState().communityPosts),

  createCommunityPost: async (input: { content: string; media: CommunityMedia[] }): Promise<CommunityPost[]> =>
    runAction('community.create', input, () => updateState((draft) => {
      const content = input.content.trim()
      if (!content && !input.media.length) throw new Error('写点文字，或选择照片和视频')
      const post: CommunityPost = {
        id: uid('post'),
        content: content.slice(0, 1000),
        media: input.media.slice(0, 9),
        status: 'pending',
        authorName: draft.profile.nickname || '我',
        authorAvatarUrl: draft.profile.avatarUrl,
        pairLabel: `${draft.profile.nickname || '我'} × ${draft.partnerProfile.nickname || 'TA'}`,
        authorIsSelf: true,
        canReview: true,
        createdAt: new Date().toISOString(),
        publishedAt: '',
        rejectionReason: '',
      }
      draft.communityPosts.unshift(post)
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
      draft.relationshipStartedAt = new Date().toISOString()
      draft.personalPoints = 320
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
    assignee: 'self' | 'partner'
    planType: TaskPlanType
  }): Promise<LovePointsState> => runAction('task.create', input, () => updateState((draft) => {
    if (!input.title.trim()) throw new Error('请填写任务名称')
    if (!Number.isInteger(input.points) || input.points <= 0 || input.points > 10000) {
      throw new Error('任务积分必须是 1–10000 的整数')
    }
    const templateId = uid('task-template')
    const meta = getTaskCycleMeta(input.planType)
    const task: TaskItem = {
      id: input.planType === 'long_term' ? templateId : `${templateId}:${meta.cycleKey}`,
      templateId,
      title: input.title.trim(),
      description: input.description.trim() || '你们共同创建的新任务',
      taskType: input.taskType,
      pointsType: input.taskType === 'shared' ? 'shared' : 'personal',
      points: input.points,
      status: 'todo',
      assigneeIsSelf: input.assignee === 'self',
      reviewerIsSelf: input.assignee === 'partner',
      latestNote: '',
      rejectionReason: '',
      planType: input.planType,
      ...meta,
      isCurrentCycle: true,
    }
    draft.tasks.unshift(task)
    syncSelectedTask(draft, task)
  })),

  submitTask: async (note: string, taskId?: string): Promise<LovePointsState> => runAction('task.submit', { note, taskId }, () => {
    if (!note.trim()) throw new Error('请填写完成说明')
    return updateState((draft) => {
      const task = currentTask(draft, taskId)
      if (!task) throw new Error('任务不存在')
      if (!task.assigneeIsSelf) throw new Error('只有任务执行人可以提交')
      if (!['todo', 'rejected'].includes(task.status)) throw new Error('任务当前状态不可提交')
      if (!task.isCurrentCycle && task.planType !== 'long_term') throw new Error('这个周期已经结束，不能补交')
      task.latestNote = note.trim()
      task.status = 'pending'
      task.rejectionReason = ''
      // 本机体验模式用同一台设备模拟双方，提交后切换为审批视角；云端模式由 OpenID 权限决定。
      task.reviewerIsSelf = true
      syncSelectedTask(draft, task)
    })
  }),

  reviewTask: async (approved: boolean, taskId?: string, reason = ''): Promise<LovePointsState> => runAction('task.review', { approved, taskId, reason }, () => {
    return updateState((draft) => {
      const task = currentTask(draft, taskId)
      if (!task) throw new Error('任务不存在')
      if (!task.reviewerIsSelf) throw new Error('只有指定审批人可以处理任务')
      if (!approved) {
        task.status = 'rejected'
        task.rejectionReason = reason.trim()
        syncSelectedTask(draft, task)
        return
      }
      if (task.status === 'done') return
      if (task.status !== 'pending') throw new Error('任务当前不在待审批状态')
      task.status = 'done'
      const nextBalance = (task.pointsType === 'shared' ? draft.sharedPoints : draft.personalPoints) + task.points
      if (task.pointsType === 'shared') draft.sharedPoints = nextBalance
      else draft.personalPoints = nextBalance
      const ledgerId = `${task.id}-approved`
      if (!draft.ledger.some((entry) => entry.id === ledgerId)) {
        draft.ledger.unshift({
          id: ledgerId,
          title: task.title,
          detail: '刚刚由对方审批通过',
          amount: task.points,
          balance: nextBalance,
          type: task.pointsType,
        })
      }
      grantLocalHeat(draft, 'HF03', 1, '完成积分任务')
      if (task.taskType === 'shared') grantLocalHeat(draft, 'HR01', 4, '完成共同任务')
      syncSelectedTask(draft, task)
    })
  }),

  selectReward: (id: string): LovePointsState => updateState((draft) => { draft.selectedRewardId = id }),

  createReward: async (input: {
    name: string
    description: string
    cost: number
    pointsType: PointsType
    expiry?: string
    condition?: string
    approvalRequired?: boolean
  }): Promise<LovePointsState> =>
    runAction('reward.create', input, () => updateState((draft) => {
      if (!input.name.trim() || !Number.isFinite(input.cost) || input.cost <= 0) {
        throw new Error('请填写有效的奖励名称和积分')
      }
      const reward: Reward = {
        id: uid('custom'),
        name: input.name.trim(),
        description: input.description.trim() || '你们共同创建的奖励',
        cost: input.cost,
        pointsType: input.pointsType,
        expiry: input.expiry?.trim() || '创建后 365 天内',
        condition: input.condition?.trim() || '由双方共同商量使用时间',
        approvalRequired: Boolean(input.approvalRequired),
      }
      draft.rewards.push(reward)
      draft.selectedRewardId = reward.id
    })),

  redeemReward: async (rewardId: string): Promise<LovePointsState> => {
    const operation = operationKey(`redeem-${rewardId}`)
    const result = await runAction('reward.redeem', { rewardId, idempotencyKey: operation.key }, () => {
      return updateState((draft) => {
      const reward = draft.rewards.find((item) => item.id === rewardId)
      if (!reward) throw new Error('奖励不存在或已下架')
      if (draft.redeemedRewardId === reward.id && ['pending', 'active'].includes(draft.redemptionStatus)) return
      const balance = reward.pointsType === 'shared' ? draft.sharedPoints : draft.personalPoints
      if (balance < reward.cost) throw new Error('当前积分不足，先一起完成任务吧')
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
        if (!reward) throw new Error('奖励不存在或已下架')
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
        title: `奖励退款「${reward.name}」`,
        detail: '刚刚由对方审批通过',
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
