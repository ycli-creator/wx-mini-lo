const { db, collections, now, hashCode, requireCouple, getDoc } = require('../lib/shared')

const OFFSET = 8 * 60 * 60 * 1000
const dayKey = (date = now()) => {
  const local = new Date(date.getTime() + OFFSET)
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`
}

const fixed = [
  { code: 'HF01', title: '每日打卡', description: '今天也来一起留个脚印。', rewardText: '+1/人 · 双方额外 +1', maxParticipants: 2, individualReward: 1, pairBonus: 1, actionPath: '/pages/heat/index', actionText: '立即打卡' },
  { code: 'HF02', title: '记录今日情绪', description: '各自记录一次今天的心情。', rewardText: '+1/人 · 双方额外 +1', maxParticipants: 2, individualReward: 1, pairBonus: 1, actionPath: '/pages/records/edit?type=mood', actionText: '去记录' },
  { code: 'HF03', title: '完成积分任务', description: '完成一项真实任务并通过确认。', rewardText: '+1/人 · 双方额外 +1', maxParticipants: 2, individualReward: 1, pairBonus: 1, actionPath: '/pages/task/index', actionText: '去做任务' },
  { code: 'HF04', title: '和 TA 互动一次', description: '从情侣聊天打开对方发来的卡片。', rewardText: '共同 +2', maxParticipants: 1, individualReward: 2, pairBonus: 0, actionPath: '/pages/chat/index', actionText: '去聊天' },
]
const randomPool = [
  { code: 'HR01', title: '完成一个共同任务', description: '今天一起完成一项共同积分任务。', rewardText: '共同 +4', maxParticipants: 1, individualReward: 4, pairBonus: 0, actionPath: '/pages/task/index', actionText: '查看任务' },
  { code: 'HR02', title: '一起完善共享文档', description: '双方今天分别完善一次共同文档。', rewardText: '+2/人 · 双方额外 +1', maxParticipants: 2, individualReward: 2, pairBonus: 1, actionPath: '/pages/documents/index', actionText: '去写一点' },
  { code: 'HR03', title: '记录今天的一件事', description: '双方分别记下一件今天发生的事。', rewardText: '+2/人 · 双方额外 +1', maxParticipants: 2, individualReward: 2, pairBonus: 1, actionPath: '/pages/records/edit?type=event', actionText: '记一件事' },
  { code: 'HR04', title: '兑换一个共同奖励', description: '使用共同积分兑换一项约定奖励。', rewardText: '共同 +4', maxParticipants: 1, individualReward: 4, pairBonus: 0, actionPath: '/pages/reward/list', actionText: '看奖励' },
  { code: 'HR05', title: '发布一条共同帖子', description: '共同确认并公开一条社区帖子。', rewardText: '共同 +5', maxParticipants: 1, individualReward: 5, pairBonus: 0, actionPath: '/pages/community/create', actionText: '去发布' },
]
const definitionByCode = (code) => [...fixed, ...randomPool].find((item) => item.code === code)
const dailyId = (coupleId, date) => `heat_day_${hashCode(`${coupleId}:${date}`).slice(0, 40)}`
const accountId = (coupleId) => `heat_${hashCode(coupleId).slice(0, 40)}`

const ensureAccount = async (coupleId, date = dayKey()) => {
  const id = accountId(coupleId)
  const existing = await getDoc(collections.heatAccounts, id)
  if (existing) return existing
  const data = { coupleId, totalHeat: 0, todayHeat: 0, heatDate: date, createdAt: now(), updatedAt: now() }
  await db.collection(collections.heatAccounts).doc(id).set({ data })
  return { _id: id, ...data }
}

const ensureDaily = async (coupleId, members, date = dayKey()) => {
  const id = dailyId(coupleId, date)
  const existing = await getDoc(collections.dailyHeatTasks, id)
  if (existing) return existing
  const random = randomPool[parseInt(hashCode(`${coupleId}:${date}`).slice(0, 8), 16) % randomPool.length]
  const tasks = [...fixed, random].map((item) => ({ code: item.code, participants: [], pairBonusGranted: false, status: 'todo' }))
  const data = { coupleId, date, members, randomCode: random.code, tasks, createdAt: now(), updatedAt: now() }
  await db.collection(collections.dailyHeatTasks).doc(id).set({ data })
  return { _id: id, ...data }
}

const grant = async ({ openid, code, businessResourceId, participantOpenId }) => {
  const user = await getDoc(collections.users, openid)
  if (!user || !user.coupleId) return
  const { coupleId, couple } = await requireCouple(openid)
  const date = dayKey()
  const definition = definitionByCode(code)
  if (!definition) return
  const daily = await ensureDaily(coupleId, couple.members, date)
  await ensureAccount(coupleId, date)
  if (!daily.tasks.some((item) => item.code === code)) return
  const participant = definition.maxParticipants === 1 ? 'couple' : (participantOpenId || openid)
  const ledgerId = `heat_ledger_${hashCode(`${coupleId}:${date}:${code}:${participant}:individual`).slice(0, 40)}`
  await db.runTransaction(async (transaction) => {
    const latestDaily = (await transaction.collection(collections.dailyHeatTasks).doc(daily._id).get()).data
    const task = latestDaily.tasks.find((item) => item.code === code)
    if (!task || task.participants.includes(participant)) return
    const accountDoc = (await transaction.collection(collections.heatAccounts).doc(accountId(coupleId)).get()).data
    const account = accountDoc || { coupleId, totalHeat: 0, todayHeat: 0, heatDate: date }
    const todayHeat = account.heatDate === date ? Number(account.todayHeat || 0) : 0
    task.participants.push(participant)
    task.status = task.participants.length >= definition.maxParticipants ? 'done' : 'partial'
    let delta = definition.individualReward
    let pairGranted = false
    if (task.status === 'done' && definition.pairBonus && !task.pairBonusGranted) { task.pairBonusGranted = true; pairGranted = true; delta += definition.pairBonus }
    await transaction.collection(collections.dailyHeatTasks).doc(daily._id).update({ data: { tasks: latestDaily.tasks, updatedAt: now() } })
    await transaction.collection(collections.heatAccounts).doc(accountId(coupleId)).set({ data: { coupleId, totalHeat: Number(account.totalHeat || 0) + delta, todayHeat: todayHeat + delta, heatDate: date, updatedAt: now() } })
    await transaction.collection(collections.heatLedgers).doc(ledgerId).set({ data: { coupleId, date, taskCode: code, participant, delta: definition.individualReward, reason: definition.title, businessResourceId: String(businessResourceId || ''), createdAt: now() } })
    if (pairGranted) await transaction.collection(collections.heatLedgers).doc(`${ledgerId}_pair`).set({ data: { coupleId, date, taskCode: code, participant: 'pair_bonus', delta: definition.pairBonus, reason: `${definition.title}双人奖励`, businessResourceId: String(businessResourceId || ''), createdAt: now() } })
  })
}

const summary = async ({ openid }) => {
  const { coupleId, couple } = await requireCouple(openid)
  const date = dayKey()
  const daily = await ensureDaily(coupleId, couple.members, date)
  const [account, ledgerResult] = await Promise.all([
    ensureAccount(coupleId, date),
    db.collection(collections.heatLedgers).where({ coupleId }).orderBy('createdAt', 'desc').limit(30).get(),
  ])
  const tasks = daily.tasks.map((task) => {
    const definition = definitionByCode(task.code)
    const progress = task.participants.length
    return { id: task.code, code: task.code, title: definition.title, description: definition.description, rewardText: definition.rewardText, progress, maxParticipants: definition.maxParticipants, selfCompleted: task.participants.includes(openid) || task.participants.includes('couple'), partnerCompleted: task.participants.some((id) => id !== openid), status: task.status, actionPath: definition.actionPath, actionText: definition.actionText, canCue: task.code !== 'HF01', random: task.code.startsWith('HR') }
  })
  return { totalHeat: Number(account.totalHeat || 0), todayHeat: account.heatDate === date ? Number(account.todayHeat || 0) : 0, completedCount: tasks.filter((item) => item.status === 'done').length, tasks, ledger: ledgerResult.data.map((item) => ({ id: item._id, title: item.reason, delta: item.delta, createdAt: new Date(item.createdAt).toISOString() })) }
}

const checkin = async ({ openid }) => { await grant({ openid, code: 'HF01', businessResourceId: dayKey() }); return summary({ openid }) }

module.exports = { summary, checkin, grant }
