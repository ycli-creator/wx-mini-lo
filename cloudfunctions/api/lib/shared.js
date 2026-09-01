const crypto = require('node:crypto')
const cloud = require('wx-server-sdk')
const { assert } = require('./errors')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database({ env: cloud.DYNAMIC_CURRENT_ENV })
const command = db.command

const collections = {
  users: 'users',
  couples: 'couples',
  invites: 'invites',
  tasks: 'tasks',
  taskCycles: 'task_cycles',
  submissions: 'task_submissions',
  accounts: 'point_accounts',
  ledgers: 'point_ledgers',
  rewards: 'rewards',
  redemptions: 'redemptions',
  documentGroups: 'document_groups',
  documents: 'documents',
  notifications: 'notifications',
  unbindRequests: 'unbind_requests',
  operationLogs: 'operation_logs',
  communityPosts: 'community_posts',
  dailyRecords: 'daily_records',
  heatAccounts: 'heat_accounts',
  dailyHeatTasks: 'daily_heat_tasks',
  heatLedgers: 'heat_ledgers',
  conversations: 'conversations',
  messages: 'messages',
  shareIntents: 'share_intents',
  friendRequests: 'friend_requests',
  friendships: 'friendships',
  relationshipRequests: 'relationship_requests',
  achievements: 'achievements',
}

const now = () => new Date()
const makeId = (prefix) => `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex')
const randomCode = () => String(crypto.randomInt(100000, 1000000))
const randomIdentityCode = () => `LP-${crypto.randomBytes(4).toString('hex').toUpperCase().match(/.{1,4}/g).join('-')}`
const defaultPrivacy = () => ({ searchableByCode: false, showPartner: false, showRelationshipDays: false, showHeat: false, showDocumentCount: false, privateMode: false })
const defaultPreferences = () => ({ onboardingCompleted: false, usageMode: 'record', communityGuideSeen: false, taskGuideSeen: false })

const createNotification = async ({ recipientOpenId, coupleId = null, type, title, body, actionPath = '', sourceId = '' }) => {
  const id = makeId('notification')
  await db.collection(collections.notifications).doc(id).set({ data: { recipientOpenId, coupleId, type, title, body, actionPath, sourceId, readAt: null, createdAt: now() } })
  return id
}

const queryOne = async (collection, where, orderBy = null) => {
  let query = db.collection(collection).where(where)
  if (orderBy) query = query.orderBy(orderBy.field, orderBy.direction)
  const result = await query.limit(1).get()
  return result.data[0] || null
}

const getDoc = async (collection, id) => {
  const result = await db.collection(collection).where({ _id: id }).limit(1).get()
  return result.data[0] || null
}

const ensureUser = async (openid) => {
  assert(openid, 'UNAUTHENTICATED', '无法获取微信用户身份')
  const existing = await getDoc(collections.users, openid)
  if (existing) {
    const patch = { lastSeenAt: db.serverDate(), updatedAt: db.serverDate() }
    if (!existing.identityCode) patch.identityCode = randomIdentityCode()
    if (!existing.privacy) patch.privacy = defaultPrivacy()
    if (!existing.preferences) patch.preferences = defaultPreferences()
    if (!existing.activeSpaceType) patch.activeSpaceType = existing.coupleId ? 'couple' : 'personal'
    await db.collection(collections.users).doc(openid).update({ data: patch })
    Object.assign(existing, patch)
    return existing
  }
  const user = {
    coupleId: null,
    nickname: '',
    avatarUrl: '',
    gender: 'private',
    region: '',
    hobbies: [],
    profileCompleted: false,
    identityCode: randomIdentityCode(),
    backgroundUrl: '',
    privacy: defaultPrivacy(),
    preferences: defaultPreferences(),
    activeSpaceType: 'personal',
    personalSpaceVersion: 0,
    createdAt: now(),
    updatedAt: now(),
    lastSeenAt: now(),
  }
  await db.collection(collections.users).doc(openid).set({ data: user })
  return user
}

const requireCouple = async (openid) => {
  const user = await getDoc(collections.users, openid)
  assert(user?.coupleId, 'NOT_BOUND', '请先完成情侣绑定')
  const couple = await getDoc(collections.couples, user.coupleId)
  assert(couple && couple.status === 'active', 'COUPLE_INACTIVE', '情侣空间不存在或已解绑')
  assert(Array.isArray(couple.members) && couple.members.includes(openid), 'FORBIDDEN', '你无权访问该情侣空间')
  return { user, couple, coupleId: couple._id, partnerId: couple.members.find((id) => id !== openid) || '' }
}

const personalSpaceId = (openid, version = 0) => `personal_${hashCode(`${openid}:${version}`).slice(0, 40)}`
const requireSpace = async (openid, requestedSpaceType = '') => {
  const user = await getDoc(collections.users, openid)
  assert(user, 'UNAUTHENTICATED', '无法获取用户空间')
  const activeSpaceType = requestedSpaceType === 'couple' || requestedSpaceType === 'personal'
    ? requestedSpaceType
    : user.activeSpaceType || (user.coupleId ? 'couple' : 'personal')
  if (activeSpaceType === 'couple') {
    assert(user.coupleId, 'COUPLE_REQUIRED', '请先绑定 TA，再进入情侣空间')
    const coupleSpace = await requireCouple(openid)
    return { ...coupleSpace, spaceType: 'couple' }
  }
  const coupleId = personalSpaceId(openid, Number(user.personalSpaceVersion || 0))
  const account = await getDoc(collections.accounts, coupleId)
  if (!account) await db.collection(collections.accounts).doc(coupleId).set({ data: { coupleId, personalBalances: { [openid]: 0 }, sharedBalance: 0, spaceType: 'personal', createdAt: now(), updatedAt: now() } })
  return { user, couple: { _id: coupleId, members: [openid], status: 'active', spaceType: 'personal' }, coupleId, partnerId: '', spaceType: 'personal' }
}

const publicProfile = (user = {}) => ({
  nickname: String(user.nickname || ''),
  avatarUrl: String(user.avatarUrl || ''),
  gender: ['female', 'male', 'other', 'private'].includes(user.gender) ? user.gender : 'private',
  region: String(user.region || ''),
  hobbies: Array.isArray(user.hobbies) ? user.hobbies.map(String).slice(0, 12) : [],
  completed: Boolean(user.profileCompleted || String(user.nickname || '').trim()),
  identityCode: String(user.identityCode || ''),
  backgroundUrl: String(user.backgroundUrl || ''),
  privacy: {
    searchableByCode: user.privacy?.searchableByCode === true,
    showPartner: Boolean(user.privacy?.showPartner),
    showRelationshipDays: Boolean(user.privacy?.showRelationshipDays),
    showHeat: Boolean(user.privacy?.showHeat),
    showDocumentCount: Boolean(user.privacy?.showDocumentCount),
    privateMode: Boolean(user.privacy?.privateMode),
  },
})

const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000
const pad = (value) => String(value).padStart(2, '0')
const localDateParts = (date) => {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET)
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), weekday: shifted.getUTCDay() }
}
const utcFromShanghai = (year, month, day) => new Date(Date.UTC(year, month, day) - SHANGHAI_OFFSET)
const formatDayKey = (date) => {
  const { year, month, day } = localDateParts(date)
  return `${year}-${pad(month + 1)}-${pad(day)}`
}
const formatShortDate = (date) => {
  const { month, day } = localDateParts(date)
  return `${month + 1} 月 ${day} 日`
}
const normalizePlanType = (value) => ['daily', 'weekly', 'long_term'].includes(value) ? value : 'long_term'
const taskCycleWindow = (planTypeValue, at = now()) => {
  const planType = normalizePlanType(planTypeValue)
  if (planType === 'long_term') return { cycleKey: 'lifetime', cycleLabel: '长期', periodStart: null, periodEnd: null }
  const parts = localDateParts(at)
  if (planType === 'daily') {
    const periodStart = utcFromShanghai(parts.year, parts.month, parts.day)
    const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000)
    return { cycleKey: formatDayKey(periodStart), cycleLabel: formatShortDate(periodStart), periodStart, periodEnd }
  }
  const daysSinceMonday = (parts.weekday + 6) % 7
  const periodStart = utcFromShanghai(parts.year, parts.month, parts.day - daysSinceMonday)
  const periodEnd = new Date(periodStart.getTime() + 7 * 24 * 60 * 60 * 1000)
  const lastDay = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000)
  return { cycleKey: formatDayKey(periodStart), cycleLabel: `${formatShortDate(periodStart)}–${formatShortDate(lastDay)}`, periodStart, periodEnd }
}
const taskCycleId = (taskId, cycleKey) => `cycle_${hashCode(`${taskId}:${cycleKey}`).slice(0, 40)}`

const ensureTaskCycles = async (taskDocuments, coupleId, at = now()) => {
  const existingResult = await db.collection(collections.taskCycles).where({ coupleId }).limit(500).get()
  const cycles = [...existingResult.data]
  const cycleById = new Map(cycles.map((cycle) => [cycle._id, cycle]))
  for (const cycle of cycles) {
    if (!cycle.periodEnd || new Date(cycle.periodEnd).getTime() > at.getTime() || !['todo', 'partial', 'rejected'].includes(cycle.status)) continue
    await db.collection(collections.taskCycles).doc(cycle._id).update({ data: { status: 'missed', settledAt: at, updatedAt: at } })
    cycle.status = 'missed'
    cycle.settledAt = at
    cycle.updatedAt = at
  }
  for (const task of taskDocuments) {
    if (task.enabled === false || task.deleted === true) continue
    const planType = normalizePlanType(task.planType)
    const window = taskCycleWindow(planType, at)
    const cycleId = taskCycleId(task._id, window.cycleKey)
    if (!cycleById.has(cycleId)) {
      const cycle = {
        _id: cycleId,
        coupleId,
        taskId: task._id,
        cycleKey: window.cycleKey,
        cycleLabel: window.cycleLabel,
        periodStart: window.periodStart,
        periodEnd: window.periodEnd,
        status: planType === 'long_term' && ['todo', 'pending', 'approved', 'rejected'].includes(task.status) ? task.status : 'todo',
        latestSubmissionId: planType === 'long_term' ? task.latestSubmissionId || null : null,
        latestNote: planType === 'long_term' ? task.latestNote || '' : '',
        rejectionReason: planType === 'long_term' ? task.rejectionReason || '' : '',
        participantCompletions: planType === 'long_term' && task.participantCompletions && typeof task.participantCompletions === 'object' ? task.participantCompletions : {},
        evidence: [],
        settledAt: planType === 'long_term' && task.status === 'approved' ? task.updatedAt || at : null,
        createdAt: at,
        updatedAt: at,
      }
      const { _id, ...data } = cycle
      await db.collection(collections.taskCycles).doc(cycleId).set({ data })
      cycles.push(cycle)
      cycleById.set(cycleId, cycle)
    }
    if (!task.planType) {
      await db.collection(collections.tasks).doc(task._id).update({ data: { planType: 'long_term', timezone: 'Asia/Shanghai', enabled: true, updatedAt: at } })
      task.planType = 'long_term'
    }
  }
  return cycles
}

const defaultState = (user = {}) => ({
  profile: publicProfile(user),
  partnerProfile: { nickname: '', avatarUrl: '' },
  profileComplete: publicProfile(user).completed,
  bound: false,
  activeSpaceType: 'personal',
  availableSpaces: ['personal'],
  preferences: { ...defaultPreferences(), ...(user.preferences || {}) },
  inviteCode: '',
  joinCode: '',
  taskStatus: 'todo',
  taskCanReview: false,
  taskNote: '',
  selectedTaskId: '',
  tasks: [],
  personalPoints: 0,
  sharedPoints: 0,
  selectedRewardId: '',
  redeemedRewardId: null,
  redemptionStatus: 'none',
  redemptionCanReview: false,
  refundStatus: 'none',
  refundCanReview: false,
  documentTitle: '',
  documentBody: '',
  selectedDocumentId: '',
  documentGroups: [],
  documents: [],
  unbindRequested: false,
  unbindCanReview: false,
  rewards: [],
  redemptions: [],
  ledger: [],
  communityPosts: [],
  dailyRecords: [],
  relationshipStartedAt: '',
  relationshipPublicApproved: false,
})

const projectState = async (openid) => {
  const user = await getDoc(collections.users, openid)
  if (!user) return defaultState(user)
  const space = await requireSpace(openid)
  const couple = space.couple
  if (!couple || couple.status !== 'active' || !couple.members.includes(openid)) return defaultState(user)

  const coupleId = space.coupleId
  const partnerId = space.spaceType === 'couple' ? couple.members.find((id) => id !== openid) || '' : ''
  const [partner, account, taskResult, rewardResult, personalLedgerResult, sharedLedgerResult, groupResult, documentResult, latestDocument, redemptionResult, unbindResult, operationLogResult] = await Promise.all([
    partnerId ? getDoc(collections.users, partnerId) : null,
    getDoc(collections.accounts, coupleId),
    db.collection(collections.tasks).where({ coupleId, deleted: command.neq(true) }).orderBy('createdAt', 'asc').limit(100).get(),
    db.collection(collections.rewards).where({ coupleId, status: 'active' }).orderBy('createdAt', 'asc').limit(100).get(),
    db.collection(collections.ledgers).where({ coupleId, pointsType: 'personal', accountOwnerOpenId: openid }).orderBy('createdAt', 'desc').limit(30).get(),
    db.collection(collections.ledgers).where({ coupleId, pointsType: 'shared' }).orderBy('createdAt', 'desc').limit(30).get(),
    db.collection(collections.documentGroups).where({ coupleId }).orderBy('order', 'asc').limit(50).get(),
    db.collection(collections.documents)
      .where({ coupleId, deleted: command.neq(true) })
      .field({ _id: true, groupId: true, title: true, lockOwnerOpenId: true, lockExpiresAt: true, updatedAt: true })
      .orderBy('updatedAt', 'desc').limit(100).get(),
    queryOne(collections.documents, { coupleId, deleted: command.neq(true) }, { field: 'updatedAt', direction: 'desc' }),
    db.collection(collections.redemptions).where({ coupleId, status: command.in(['pending_approval', 'active', 'refund_requested', 'refunded']) }).orderBy('updatedAt', 'desc').limit(50).get(),
    db.collection(collections.unbindRequests).where({ coupleId, status: 'pending' }).orderBy('createdAt', 'desc').limit(1).get(),
    db.collection(collections.operationLogs).where({ coupleId }).orderBy('createdAt', 'desc').limit(200).get(),
  ])

  const taskDocuments = taskResult.data
  const taskDocumentById = new Map(taskDocuments.map((item) => [item._id, item]))
  const taskCycles = await ensureTaskCycles(taskDocuments, coupleId)
  const document = latestDocument || null
  const incomingRedemption = redemptionResult.data.find((item) =>
    (item.status === 'pending_approval' && item.reviewerOpenId === openid)
    || (item.status === 'refund_requested' && item.refundReviewerOpenId === openid)) || null
  const ownRedemption = redemptionResult.data.find((item) => item.requesterOpenId === openid && ['pending_approval', 'refund_requested', 'active'].includes(item.status))
    || redemptionResult.data.find((item) => item.requesterOpenId === openid)
    || null
  const redemption = incomingRedemption || ownRedemption
  const visibleLedgers = [...personalLedgerResult.data, ...sharedLedgerResult.data]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 30)
  const visibleRedemptions = redemptionResult.data
  let unbindRequest = unbindResult.data[0] || null
  if (unbindRequest?.expiresAt && new Date(unbindRequest.expiresAt).getTime() <= Date.now()) {
    await db.collection(collections.unbindRequests).doc(unbindRequest._id).update({ data: { status: 'expired', updatedAt: db.serverDate() } })
    unbindRequest = null
  }
  const personalBalances = account?.personalBalances || {}
  const rewards = rewardResult.data.map((reward) => ({
    id: reward._id,
    name: reward.name,
    description: reward.description,
    cost: reward.cost,
    pointsType: reward.pointsType,
    expiry: reward.expiry,
    condition: reward.condition,
    approvalRequired: Boolean(reward.approvalRequired),
    beneficiaryType: ['self', 'partner', 'couple'].includes(reward.beneficiaryType) ? reward.beneficiaryType : reward.pointsType === 'shared' ? 'couple' : 'self',
  }))
  const taskCyclesByTaskId = new Map()
  taskCycles.forEach((cycle) => {
    const values = taskCyclesByTaskId.get(cycle.taskId) || []
    values.push(cycle)
    taskCyclesByTaskId.set(cycle.taskId, values)
  })
  const activityType = (action) => action === 'task.create' ? 'created'
    : action === 'task.update' ? 'updated'
      : action === 'task.project.step.complete' ? 'step_completed'
        : action === 'task.media.add' ? 'photo_added'
          : action.startsWith('task.review') ? 'reviewed' : 'completed'
  const activitySummary = (log) => log.detail || ({
    'task.create': '创建了待办',
    'task.submit': '提交了完成记录',
    'task.review.approve': '确认待办完成并发放积分',
    'task.review.reject': '要求补充完成记录',
    'task.project.step.complete': '完成了大计划环节',
    'task.project.complete': '完成了整个大计划',
    'task.participant.complete': '完成了双方每日待办',
    'task.update': '修改了待办',
    'task.media.add': '添加了照片',
  }[log.action] || '更新了待办')
  const activityLogsForTask = (item) => {
    const relatedCycles = taskCyclesByTaskId.get(item._id) || []
    const targetIds = new Set([item._id, ...relatedCycles.map((cycle) => cycle._id), ...(Array.isArray(item.projectSteps) ? item.projectSteps.map((step) => step.id) : [])])
    return operationLogResult.data.filter((log) => targetIds.has(log.targetId)).map((log) => ({
      id: log._id,
      type: activityType(String(log.action || '')),
      actorIsSelf: log.actorOpenId === openid,
      actorName: log.actorOpenId === openid ? '我' : String(partner?.nickname || 'TA'),
      summary: activitySummary(log),
      createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : '',
    }))
  }
  const tasks = taskCycles
    .map((cycle) => ({ cycle, item: taskDocumentById.get(cycle.taskId) }))
    .filter(({ item, cycle }) => item && (
      cycle.cycleKey === taskCycleWindow(item.planType).cycleKey
      || cycle.status === 'pending'
      || normalizePlanType(item.planType) === 'long_term'
    ))
    .map(({ cycle, item }) => ({
      id: cycle._id,
      templateId: item._id,
      title: item.title,
      description: item.description || '',
      taskType: item.taskType === 'shared' ? 'shared' : 'personal',
      pointsType: item.pointsType === 'shared' ? 'shared' : 'personal',
      points: Number(item.points || 0),
      status: cycle.status === 'approved' ? 'done' : cycle.status === 'partial' ? 'partial' : cycle.status === 'pending' ? 'pending' : cycle.status === 'rejected' ? 'rejected' : cycle.status === 'missed' ? 'missed' : 'todo',
      assigneeMode: item.bothRequired || item.assigneeMode === 'both' ? 'both' : item.assigneeOpenId === openid ? 'self' : 'partner',
      bothRequired: Boolean(item.bothRequired || item.assigneeMode === 'both'),
      assigneeIsSelf: item.bothRequired || item.assigneeMode === 'both' || item.assigneeOpenId === openid,
      reviewerIsSelf: !(item.bothRequired || item.assigneeMode === 'both') && item.reviewerOpenId === openid,
      selfCompletion: cycle.participantCompletions?.[openid] ? { completed: true, completedAt: new Date(cycle.participantCompletions[openid].completedAt).toISOString(), note: cycle.participantCompletions[openid].note || '', evidence: Array.isArray(cycle.participantCompletions[openid].evidence) ? cycle.participantCompletions[openid].evidence : [] } : { completed: false, completedAt: '', note: '', evidence: [] },
      partnerCompletion: partnerId && cycle.participantCompletions?.[partnerId] ? { completed: true, completedAt: new Date(cycle.participantCompletions[partnerId].completedAt).toISOString(), note: cycle.participantCompletions[partnerId].note || '', evidence: Array.isArray(cycle.participantCompletions[partnerId].evidence) ? cycle.participantCompletions[partnerId].evidence : [] } : { completed: false, completedAt: '', note: '', evidence: [] },
      latestNote: cycle.latestNote || '',
      rejectionReason: cycle.rejectionReason || '',
      planType: normalizePlanType(item.planType),
      cycleKey: cycle.cycleKey,
      cycleLabel: cycle.cycleLabel || cycle.cycleKey,
      periodStart: cycle.periodStart ? new Date(cycle.periodStart).toISOString() : '',
      periodEnd: cycle.periodEnd ? new Date(cycle.periodEnd).toISOString() : '',
      isCurrentCycle: cycle.cycleKey === taskCycleWindow(item.planType).cycleKey,
      kind: item.kind === 'project' ? 'project' : item.kind === 'recurring' || normalizePlanType(item.planType) !== 'long_term' ? 'recurring' : 'one_time',
      completionRequirement: ['direct', 'note', 'image'].includes(item.completionRequirement) ? item.completionRequirement : 'note',
      evidence: Array.isArray(cycle.evidence) ? cycle.evidence : [],
      media: Array.isArray(item.media) ? item.media : [],
      dailyHistory: (taskCyclesByTaskId.get(item._id) || []).filter((historyCycle) => normalizePlanType(item.planType) === 'daily').map((historyCycle) => ({ date: historyCycle.cycleKey, selfCompleted: Boolean(historyCycle.participantCompletions?.[openid]), partnerCompleted: Boolean(partnerId && historyCycle.participantCompletions?.[partnerId]) })).sort((left, right) => left.date.localeCompare(right.date)).slice(-62),
      activityLogs: activityLogsForTask(item),
      projectSteps: (Array.isArray(item.projectSteps) ? item.projectSteps : []).map((step) => ({
        id: step.id,
        title: step.title,
        description: step.description || '',
        assignee: step.assigneeOpenId === openid ? 'self' : 'partner',
        assigneeIsSelf: step.assigneeOpenId === openid,
        completionRequirement: ['direct', 'note', 'image'].includes(step.completionRequirement) ? step.completionRequirement : 'direct',
        status: step.status === 'done' ? 'done' : 'todo',
        completedBySelf: step.completedBy === openid,
        completedAt: step.completedAt ? new Date(step.completedAt).toISOString() : '',
        note: step.note || '',
        evidence: Array.isArray(step.evidence) ? step.evidence : [],
        media: Array.isArray(step.media) ? step.media : [],
        rewardPoints: Number(step.rewardPoints || Math.floor(Number(item.points || 0) * 0.1)),
      })),
      projectFinalized: Boolean(item.projectFinalized),
      progressPercent: item.kind === 'project'
        ? Math.min(100, (Array.isArray(item.projectSteps) ? item.projectSteps.filter((step) => step.status === 'done').length : 0) * 10 + (item.projectFinalized ? Math.max(0, 100 - (Array.isArray(item.projectSteps) ? item.projectSteps.filter((step) => step.status === 'done').length : 0) * 10) : 0))
        : item.bothRequired || item.assigneeMode === 'both' ? Math.min(100, Object.keys(cycle.participantCompletions || {}).length * 50)
          : cycle.status === 'approved' ? 100 : cycle.status === 'pending' ? 80 : 0,
    }))
  const task = tasks.find((item) => item.status === 'pending' && item.reviewerIsSelf)
    || tasks.find((item) => item.planType === 'daily' && item.isCurrentCycle && ['todo', 'rejected', 'done'].includes(item.status) && item.assigneeIsSelf)
    || tasks.find((item) => item.isCurrentCycle && ['todo', 'rejected'].includes(item.status) && item.assigneeIsSelf)
    || tasks[0]
    || null
  const documentGroups = groupResult.data.map((group) => ({ id: group._id, name: group.name, order: Number(group.order || 0) }))
  const documents = documentResult.data.map((item) => ({
    id: item._id,
    groupId: item.groupId || '',
    title: item.title,
    body: item._id === document?._id ? document.body || '' : '',
    lockedByOther: Boolean(
      item.lockOwnerOpenId
      && item.lockOwnerOpenId !== openid
      && item.lockExpiresAt
      && new Date(item.lockExpiresAt).getTime() > Date.now()
    ),
  }))

  return {
    profile: publicProfile(user),
    partnerProfile: { nickname: String(partner?.nickname || '你的另一半'), avatarUrl: String(partner?.avatarUrl || '') },
    profileComplete: publicProfile(user).completed,
    bound: Boolean(user.coupleId),
    activeSpaceType: space.spaceType,
    availableSpaces: user.coupleId ? ['personal', 'couple'] : ['personal'],
    preferences: { ...defaultPreferences(), ...(user.preferences || {}) },
    inviteCode: '',
    joinCode: '',
    taskStatus: task?.status || 'todo',
    taskCanReview: Boolean(task?.reviewerIsSelf && task?.status === 'pending'),
    taskNote: task?.latestNote || '',
    selectedTaskId: task?.id || '',
    tasks,
    personalPoints: space.spaceType === 'personal' ? Number(personalBalances[openid] || 0) : 0,
    sharedPoints: Number(account?.sharedBalance || 0),
    selectedRewardId: redemption?.rewardId || rewards[0]?.id || '',
    redeemedRewardId: redemption && redemption.status !== 'refunded' ? redemption.rewardId : null,
    redemptionStatus: redemption?.status === 'pending_approval' ? 'pending' : redemption?.status === 'active' || redemption?.status === 'refund_requested' ? 'active' : redemption?.status === 'refunded' ? 'refunded' : 'none',
    redemptionCanReview: Boolean(redemption && redemption.status === 'pending_approval' && redemption.reviewerOpenId === openid),
    refundStatus: redemption?.status === 'refund_requested' ? 'requested' : redemption?.status === 'refunded' ? 'approved' : 'none',
    refundCanReview: Boolean(redemption && redemption.status === 'refund_requested' && redemption.refundReviewerOpenId === openid),
    documentTitle: document?.title || '',
    documentBody: document?.body || '',
    selectedDocumentId: document?._id || '',
    documentGroups,
    documents,
    unbindRequested: Boolean(unbindRequest),
    unbindCanReview: Boolean(unbindRequest && unbindRequest.reviewerOpenId === openid),
    rewards,
    redemptions: visibleRedemptions.map((item) => ({
      rewardId: item.rewardId,
      status: item.status === 'pending_approval' ? 'pending' : item.status === 'refunded' ? 'refunded' : 'active',
      canReview: Boolean(item.status === 'pending_approval' && item.reviewerOpenId === openid),
      refundStatus: item.status === 'refund_requested' ? 'requested' : item.status === 'refunded' ? 'approved' : 'none',
      refundCanReview: Boolean(item.status === 'refund_requested' && item.refundReviewerOpenId === openid),
      requesterIsSelf: item.requesterOpenId === openid,
    })),
    ledger: visibleLedgers.map((entry) => ({
      id: entry._id,
      title: entry.title,
      detail: entry.detail,
      amount: entry.amount,
      balance: entry.balanceAfter,
      type: entry.pointsType,
    })),
    communityPosts: [],
    dailyRecords: [],
    relationshipStartedAt: space.spaceType === 'couple' && (couple.relationshipStartedAt || couple.createdAt) ? new Date(couple.relationshipStartedAt || couple.createdAt).toISOString() : '',
    relationshipPublicApproved: space.spaceType === 'couple' && Boolean(couple.publicApproved),
  }
}

const writeOperationLog = async ({ coupleId = null, openid, action, targetId = null, result = 'success', detail = '' }) => {
  try {
    await db.collection(collections.operationLogs).add({
      data: { coupleId, actorOpenId: openid, action, targetId, result, detail, createdAt: db.serverDate() },
    })
  } catch (error) {
    // The business transaction is authoritative. A secondary audit write must
    // never turn an already-committed bind, approval, redemption or refund into
    // a client-visible failure that invites a misleading retry.
    console.error('Love Points operation log write failed', {
      coupleId,
      openid,
      action,
      targetId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

const seedCouple = async (transaction, { coupleId, creatorId, applicantId, inviteId }) => {
  const createdAt = now()
  const members = [creatorId, applicantId]
  const personalBalances = { [creatorId]: 320, [applicantId]: 320 }
  const taskId = `task_seed_${coupleId}`
  const groupId = `group_diary_${coupleId}`
  const documentId = `document_seed_${coupleId}`

  await transaction.collection(collections.couples).doc(coupleId).set({
    data: { members, status: 'active', inviteId, relationshipStartedAt: createdAt, createdAt, updatedAt: createdAt },
  })
  await transaction.collection(collections.accounts).doc(coupleId).set({
    data: { coupleId, personalBalances, sharedBalance: 580, spaceType: 'couple', createdAt, updatedAt: createdAt },
  })
  await transaction.collection(collections.tasks).doc(taskId).set({
    data: {
      coupleId,
      title: '一起完成晚餐',
      description: '准备两个人都喜欢的菜，完成后一起记录。',
      taskType: 'shared',
      pointsType: 'shared',
      points: 120,
      planType: 'long_term',
      timezone: 'Asia/Shanghai',
      enabled: true,
      startDate: formatDayKey(createdAt),
      assigneeOpenId: applicantId,
      reviewerOpenId: creatorId,
      status: 'todo',
      latestSubmissionId: null,
      latestNote: '',
      rejectionReason: '',
      deleted: false,
      createdAt,
      updatedAt: createdAt,
    },
  })
  await transaction.collection(collections.rewards).doc(`reward_movie_${coupleId}`).set({
    data: {
      coupleId,
      name: '双人电影之夜',
      description: '选一部期待很久的电影',
      cost: 200,
      pointsType: 'shared',
      expiry: '2026 年 12 月 31 日',
      condition: '周末或节假日',
      approvalRequired: false,
      beneficiaryType: 'couple',
      status: 'active',
      createdBy: creatorId,
      createdAt,
      updatedAt: createdAt,
    },
  })
  await transaction.collection(collections.rewards).doc(`reward_trip_${coupleId}`).set({
    data: {
      coupleId,
      name: '周末短途旅行',
      description: '周末一起出发',
      cost: 800,
      pointsType: 'shared',
      expiry: '2027 年 06 月 30 日',
      condition: '提前一周商量目的地',
      approvalRequired: true,
      beneficiaryType: 'couple',
      status: 'active',
      createdBy: creatorId,
      createdAt,
      updatedAt: createdAt,
    },
  })
  await transaction.collection(collections.documentGroups).doc(groupId).set({
    data: { coupleId, name: '日记', order: 0, createdBy: creatorId, createdAt, updatedAt: createdAt },
  })
  await transaction.collection(collections.documents).doc(documentId).set({
    data: {
      coupleId,
      groupId,
      title: '我们的第一篇共同日记',
      body: '今天一起完成了晚餐任务，番茄牛腩比想象中更成功。下次想试试做甜点。',
      createdBy: creatorId,
      lastEditedBy: creatorId,
      lockOwnerOpenId: null,
      lockExpiresAt: null,
      deleted: false,
      createdAt,
      updatedAt: createdAt,
    },
  })
  const creator = (await transaction.collection(collections.users).doc(creatorId).get()).data
  const applicant = (await transaction.collection(collections.users).doc(applicantId).get()).data
  await transaction.collection(collections.users).doc(creatorId).update({ data: { coupleId, activeSpaceType: 'couple', updatedAt: createdAt } })
  await transaction.collection(collections.users).doc(applicantId).update({ data: { coupleId, activeSpaceType: 'couple', updatedAt: createdAt } })
}

module.exports = {
  cloud,
  db,
  command,
  collections,
  now,
  makeId,
  hashCode,
  randomCode,
  queryOne,
  getDoc,
  ensureUser,
  requireCouple,
  requireSpace,
  personalSpaceId,
  normalizePlanType,
  taskCycleWindow,
  taskCycleId,
  ensureTaskCycles,
  projectState,
  writeOperationLog,
  seedCouple,
  createNotification,
}
