const { db, collections, now, hashCode, getDoc, taskCycleWindow } = require('./shared')
const { assert } = require('./errors')

const TASK_DEFINITIONS = [
  {
    taskId: 'H001', title: '记录今日心情', description: '把此刻的心情留在生活日历里', category: 'calendar',
    triggerEvent: 'calendar.mood_created', maxParticipants: 2, individualReward: 1, pairBonus: 1,
    ctaLabel: '去记录', targetPath: '/pages/records/edit?type=mood', canRemind: true,
  },
  {
    taskId: 'H002', title: '记录今天发生的一件事', description: '记下一件值得一起记住的小事', category: 'calendar',
    triggerEvent: 'calendar.event_created', maxParticipants: 2, individualReward: 1, pairBonus: 1,
    ctaLabel: '记一件事', targetPath: '/pages/records/edit?type=event', canRemind: true,
  },
  {
    taskId: 'H101', title: '完成一次定制任务', description: '完成一项你们自己约定的任务', category: 'task',
    triggerEvent: 'custom_task.completed', maxParticipants: 2, individualReward: 1, pairBonus: 1,
    ctaLabel: '去做任务', targetPath: '/pages/task/index', canRemind: true,
  },
  {
    taskId: 'H301', title: '今日发帖一次', description: '共同确认并发布一条有效社区帖子', category: 'community',
    triggerEvent: 'community.post_created', maxParticipants: 1, individualReward: 4, pairBonus: 0,
    ctaLabel: '去发布', targetPath: '/pages/community/create', canRemind: false,
  },
  {
    taskId: 'H401', title: '一起完善一个共享文档', description: '双方今天各完成一次有效编辑', category: 'document',
    triggerEvent: 'shared_doc.updated', maxParticipants: 2, individualReward: 1, pairBonus: 1,
    ctaLabel: '去写一点', targetPath: '/pages/documents/index', canRemind: true,
  },
  {
    taskId: 'H501', title: '兑换一个约定奖励', description: '完成今天第一次有效奖励兑换', category: 'reward',
    triggerEvent: 'reward.redeemed', maxParticipants: 1, individualReward: 2, pairBonus: 0,
    ctaLabel: '去看看奖励', targetPath: '/pages/task/index', canRemind: false,
  },
  {
    taskId: 'H502', title: '为 TA 新增一个奖励', description: '创建一份想和 TA 一起兑现的期待', category: 'reward',
    triggerEvent: 'reward.created', maxParticipants: 1, individualReward: 1, pairBonus: 0,
    ctaLabel: '去新增', targetPath: '/pages/task/index', canRemind: false,
  },
]

const definitionById = new Map(TASK_DEFINITIONS.map((item) => [item.taskId, item]))
const dayKey = (date = now()) => taskCycleWindow('daily', date).cycleKey
const dailyTaskId = (coupleId, date, taskId) => `heat_task_${hashCode(`${coupleId}:${date}:${taskId}`).slice(0, 40)}`
const heatAccountId = (coupleId) => coupleId

const definitionsForDay = (coupleId, date) => {
  const seed = parseInt(hashCode(`${coupleId}:${date}`).slice(0, 8), 16)
  const selected = ['H001', 'H002']
  selected.push(seed % 2 === 0 ? 'H101' : 'H401')
  const exploration = ['H301', 'H401', 'H101']
  selected.push(exploration.find((id, index) => index >= seed % exploration.length && !selected.includes(id))
    || exploration.find((id) => !selected.includes(id)))
  selected.push(seed % 2 === 0 ? 'H501' : 'H502')
  return selected.map((id) => definitionById.get(id)).filter(Boolean)
}

const ensureHeatAccount = async (coupleId, date) => {
  const existing = await getDoc(collections.coupleHeat, heatAccountId(coupleId))
  if (!existing) {
    await db.collection(collections.coupleHeat).doc(heatAccountId(coupleId)).set({ data: {
      coupleId, totalHeat: 0, todayHeat: 0, heatDate: date, status: 'active', createdAt: now(), updatedAt: now(),
    } })
    return { _id: heatAccountId(coupleId), coupleId, totalHeat: 0, todayHeat: 0, heatDate: date, status: 'active' }
  }
  if (existing.heatDate !== date) {
    await db.collection(collections.coupleHeat).doc(existing._id).update({ data: { todayHeat: 0, heatDate: date, updatedAt: now() } })
    return { ...existing, todayHeat: 0, heatDate: date }
  }
  return existing
}

const ensureDailyHeatTasks = async (coupleId, at = now()) => {
  const date = dayKey(at)
  const definitions = definitionsForDay(coupleId, date)
  const tasks = []
  for (let order = 0; order < definitions.length; order += 1) {
    const definition = definitions[order]
    const id = dailyTaskId(coupleId, date, definition.taskId)
    let task = await getDoc(collections.dailyHeatTasks, id)
    if (!task) {
      await db.collection(collections.dailyHeatTasks).doc(id).set({ data: {
        coupleId,
        taskId: definition.taskId,
        date,
        order,
        participantIds: [],
        pairBonusGranted: false,
        earnedHeat: 0,
        status: 'active',
        createdAt: now(),
        updatedAt: now(),
      } })
      task = { _id: id, coupleId, taskId: definition.taskId, date, order, participantIds: [], pairBonusGranted: false, earnedHeat: 0, status: 'active' }
    }
    tasks.push(task)
  }
  await ensureHeatAccount(coupleId, date)
  return { date, tasks }
}

const recordHeatEvent = async ({ coupleId, userId, eventName, businessResourceId }) => {
  assert(coupleId && userId && eventName && businessResourceId, 'HEAT_EVENT_INVALID', '热力事件信息不完整')
  const couple = await getDoc(collections.couples, coupleId)
  assert(couple?.status === 'active' && Array.isArray(couple.members) && couple.members.includes(userId), 'HEAT_COUPLE_INACTIVE', '情侣关系已失效')
  const { date, tasks } = await ensureDailyHeatTasks(coupleId)
  const task = tasks.find((item) => definitionById.get(item.taskId)?.triggerEvent === eventName)
  if (!task) return { awarded: 0 }
  const definition = definitionById.get(task.taskId)
  const contributionLedgerId = `heat_ledger_${hashCode(`${coupleId}:${date}:${task.taskId}:${userId}`).slice(0, 40)}`
  const pairLedgerId = `heat_pair_${hashCode(`${coupleId}:${date}:${task.taskId}`).slice(0, 40)}`
  let awarded = 0

  await db.runTransaction(async (transaction) => {
    const existingLedger = (await transaction.collection(collections.heatLedgers).doc(contributionLedgerId).get()).data
    if (existingLedger) return
    const latestTask = (await transaction.collection(collections.dailyHeatTasks).doc(task._id).get()).data
    const account = (await transaction.collection(collections.coupleHeat).doc(heatAccountId(coupleId)).get()).data
    assert(latestTask && account && account.status !== 'frozen', 'HEAT_ACCOUNT_MISSING', '热力账户暂不可用')
    const participantIds = Array.isArray(latestTask.participantIds) ? [...latestTask.participantIds] : []
    if (participantIds.includes(userId) || participantIds.length >= definition.maxParticipants) return
    participantIds.push(userId)
    let delta = definition.individualReward
    let pairGranted = Boolean(latestTask.pairBonusGranted)
    const pairCompleted = definition.maxParticipants === 2 && participantIds.length === 2 && !pairGranted
    if (pairCompleted) {
      delta += definition.pairBonus
      pairGranted = true
    }
    const currentToday = account.heatDate === date ? Number(account.todayHeat || 0) : 0
    const totalHeat = Number(account.totalHeat || 0) + delta
    const todayHeat = currentToday + delta
    await transaction.collection(collections.coupleHeat).doc(heatAccountId(coupleId)).update({ data: {
      totalHeat, todayHeat, heatDate: date, updatedAt: now(),
    } })
    await transaction.collection(collections.dailyHeatTasks).doc(task._id).update({ data: {
      participantIds,
      pairBonusGranted: pairGranted,
      earnedHeat: Number(latestTask.earnedHeat || 0) + delta,
      status: participantIds.length >= definition.maxParticipants ? 'completed' : 'active',
      updatedAt: now(),
    } })
    await transaction.collection(collections.heatLedgers).doc(contributionLedgerId).set({ data: {
      coupleId,
      taskId: task.taskId,
      userId,
      delta: definition.individualReward,
      reason: `${definition.title} · 个人完成`,
      businessResourceId: String(businessResourceId),
      date,
      balanceAfter: totalHeat - (pairCompleted ? definition.pairBonus : 0),
      idempotencyKey: contributionLedgerId,
      createdAt: now(),
    } })
    if (pairCompleted && definition.pairBonus > 0) {
      await transaction.collection(collections.heatLedgers).doc(pairLedgerId).set({ data: {
        coupleId,
        taskId: task.taskId,
        userId: null,
        delta: definition.pairBonus,
        reason: `${definition.title} · 双人协作奖励`,
        businessResourceId: String(businessResourceId),
        date,
        balanceAfter: totalHeat,
        idempotencyKey: pairLedgerId,
        createdAt: now(),
      } })
    }
    awarded = delta
  })
  return { awarded }
}

const getHeatSummary = async ({ coupleId, openid }) => {
  const { date, tasks } = await ensureDailyHeatTasks(coupleId)
  const [account, ledgerResult] = await Promise.all([
    getDoc(collections.coupleHeat, heatAccountId(coupleId)),
    db.collection(collections.heatLedgers).where({ coupleId }).orderBy('createdAt', 'desc').limit(30).get(),
  ])
  const mappedTasks = tasks
    .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
    .map((task) => {
      const definition = definitionById.get(task.taskId)
      const participantIds = Array.isArray(task.participantIds) ? task.participantIds : []
      return {
        id: task._id,
        taskId: task.taskId,
        title: definition.title,
        description: definition.description,
        category: definition.category,
        maxParticipants: definition.maxParticipants,
        individualReward: definition.individualReward,
        pairBonus: definition.pairBonus,
        progress: Math.min(participantIds.length, definition.maxParticipants),
        selfCompleted: participantIds.includes(openid),
        partnerCompleted: participantIds.some((id) => id !== openid),
        pairBonusGranted: Boolean(task.pairBonusGranted),
        earnedHeat: Number(task.earnedHeat || 0),
        completed: participantIds.length >= definition.maxParticipants,
        ctaLabel: definition.ctaLabel,
        targetPath: definition.targetPath,
        canRemind: definition.canRemind,
      }
    })
  return {
    totalHeat: Number(account?.totalHeat || 0),
    todayHeat: account?.heatDate === date ? Number(account.todayHeat || 0) : 0,
    heatDate: date,
    completedTasks: mappedTasks.filter((task) => task.completed).length,
    totalTasks: mappedTasks.length,
    tasks: mappedTasks,
    ledger: ledgerResult.data.map((entry) => ({
      id: entry._id,
      taskId: entry.taskId,
      delta: Number(entry.delta || 0),
      reason: entry.reason || '',
      date: entry.date || '',
    })),
  }
}

const targetForHeatTask = (taskId) => definitionById.get(taskId)?.targetPath || '/pages/heat/index'

module.exports = {
  TASK_DEFINITIONS,
  ensureDailyHeatTasks,
  getHeatSummary,
  recordHeatEvent,
  targetForHeatTask,
}
