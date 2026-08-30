const { db, collections } = require('../lib/shared')

const mapItem = (item) => ({ id: item._id, type: item.type || 'system', title: item.title || '通知', body: item.body || '', actionPath: item.actionPath || '', read: Boolean(item.readAt), createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '' })
const list = async ({ openid }) => {
  const result = await db.collection(collections.notifications).where({ recipientOpenId: openid }).orderBy('createdAt', 'desc').limit(100).get()
  return { items: result.data.map(mapItem), unread: result.data.filter((item) => !item.readAt).length }
}
const read = async ({ openid, payload }) => {
  const id = String(payload.id || '').slice(0, 120)
  const result = await db.collection(collections.notifications).where({ _id: id, recipientOpenId: openid }).limit(1).get()
  if (result.data[0] && !result.data[0].readAt) await db.collection(collections.notifications).doc(id).update({ data: { readAt: db.serverDate() } })
  return list({ openid })
}
module.exports = { list, read }
