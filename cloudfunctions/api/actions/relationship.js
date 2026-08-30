const { db, collections, now, makeId, getDoc, requireCouple, createNotification, writeOperationLog } = require('../lib/shared')
const { assert } = require('../lib/errors')

const list = async ({ openid }) => {
  const { coupleId, couple } = await requireCouple(openid)
  const pending = await db.collection(collections.relationshipRequests).where({ coupleId, status: 'pending' }).orderBy('createdAt', 'desc').limit(20).get()
  return { relationshipStartedAt: new Date(couple.relationshipStartedAt || couple.createdAt).toISOString(), publicApproved: Boolean(couple.publicApproved), requests: pending.data.map((item) => ({ id: item._id, type: item.type, value: item.value || '', canReview: item.reviewerOpenId === openid })) }
}
const request = async ({ openid, payload }) => {
  const { coupleId, partnerId } = await requireCouple(openid)
  const type = payload.type === 'public' ? 'public' : 'date'
  const value = type === 'date' ? String(payload.value || '') : 'approve'
  if (type === 'date') {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(value), 'RELATIONSHIP_DATE_INVALID', '请选择有效的恋爱开始日期')
    const timestamp = new Date(`${value}T00:00:00+08:00`).getTime()
    assert(timestamp <= Date.now(), 'RELATIONSHIP_DATE_FUTURE', '恋爱开始日期不能晚于今天')
  }
  const id = makeId('relationship_request')
  await db.collection(collections.relationshipRequests).doc(id).set({ data: { coupleId, requesterOpenId: openid, reviewerOpenId: partnerId, type, value, status: 'pending', createdAt: now(), updatedAt: now() } })
  await createNotification({ recipientOpenId: partnerId, coupleId, type: 'relationship', title: type === 'date' ? '恋爱日期待确认' : '关系公开待确认', body: type === 'date' ? `对方申请将恋爱开始日设为 ${value}` : '对方希望允许公开情侣关系', actionPath: '/pages/settings/relationship', sourceId: id })
  await writeOperationLog({ coupleId, openid, action: `relationship.${type}.request`, targetId: id })
  return list({ openid })
}
const review = async ({ openid, payload }) => {
  const { coupleId } = await requireCouple(openid)
  const id = String(payload.id || '').slice(0, 120)
  const item = await getDoc(collections.relationshipRequests, id)
  assert(item && item.coupleId === coupleId && item.reviewerOpenId === openid && item.status === 'pending', 'RELATIONSHIP_REQUEST_NOT_FOUND', '申请不存在或已经处理')
  const approved = Boolean(payload.approved)
  await db.collection(collections.relationshipRequests).doc(id).update({ data: { status: approved ? 'approved' : 'rejected', updatedAt: db.serverDate() } })
  if (approved) {
    const data = item.type === 'date' ? { relationshipStartedAt: new Date(`${item.value}T00:00:00+08:00`), updatedAt: db.serverDate() } : { publicApproved: true, updatedAt: db.serverDate() }
    await db.collection(collections.couples).doc(coupleId).update({ data })
  }
  await createNotification({ recipientOpenId: item.requesterOpenId, coupleId, type: 'relationship', title: approved ? '情侣设置已同意' : '情侣设置未通过', body: item.type === 'date' ? '恋爱开始日期申请已处理' : '关系公开申请已处理', actionPath: '/pages/settings/relationship', sourceId: id })
  return list({ openid })
}
const revokePublic = async ({ openid }) => {
  const { coupleId } = await requireCouple(openid)
  await db.collection(collections.couples).doc(coupleId).update({ data: { publicApproved: false, updatedAt: db.serverDate() } })
  return list({ openid })
}
module.exports = { list, request, review, revokePublic }
