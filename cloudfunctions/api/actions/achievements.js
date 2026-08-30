const { db, collections, getDoc, requireCouple, createNotification, now } = require('../lib/shared')

const definitions = [
  ...[1, 7, 30, 100, 365, 520, 999].map((target, index) => ({ id: `relationship-${target}`, title: `相伴 ${target}`, description: `相伴满 ${target} 天`, category: 'relationship', target, badge: `R${String(index + 1).padStart(2, '0')}` })),
  ...[10, 30, 100, 999].map((target, index) => ({ id: `task-${target}`, title: `并肩 ${target}`, description: `共同完成 ${target} 个任务`, category: 'task', target, badge: `T${String(index + 1).padStart(2, '0')}` })),
  ...[10, 30, 100, 999].map((target, index) => ({ id: `heat-${target}`, title: `升温 ${target}`, description: `情侣热力达到 ${target}`, category: 'heat', target, badge: `H${String(index + 1).padStart(2, '0')}` })),
]

const list = async ({ openid }) => {
  const { coupleId, couple } = await requireCouple(openid)
  const [cycles, heatAccount, unlocked] = await Promise.all([
    db.collection(collections.taskCycles).where({ coupleId, status: 'approved' }).limit(1000).get(),
    getDoc(collections.heatAccounts, coupleId),
    db.collection(collections.achievements).where({ ownerId: coupleId }).limit(100).get(),
  ])
  const days = Math.max(1, Math.floor((Date.now() - new Date(couple.relationshipStartedAt || couple.createdAt).getTime()) / 86400000) + 1)
  const values = { relationship: days, task: cycles.data.length, heat: Number(heatAccount?.totalHeat || 0) }
  const unlockedIds = new Set(unlocked.data.map((item) => item.achievementId))
  for (const item of definitions) {
    if (values[item.category] < item.target || unlockedIds.has(item.id)) continue
    await db.collection(collections.achievements).doc(`achievement_${coupleId}_${item.id}`).set({ data: { ownerId: coupleId, coupleId, achievementId: item.id, unlockedAt: now(), createdAt: now() } })
    for (const member of couple.members) await createNotification({ recipientOpenId: member, coupleId, type: 'achievement', title: `解锁成就：${item.title}`, body: item.description, actionPath: '/pages/profile/index', sourceId: item.id })
    unlockedIds.add(item.id)
  }
  return definitions.map((item) => ({ ...item, progress: Math.min(values[item.category], item.target), unlocked: unlockedIds.has(item.id) }))
}
module.exports = { list }
