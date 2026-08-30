const { db, collections, now, makeId, requireCouple, getDoc } = require('../lib/shared')
const { assert } = require('../lib/errors')
const heat = require('./heat')

const clean = (value, length) => String(value || '').trim().slice(0, length)
const allowedTypes = new Set(['text', 'heat_task', 'custom_task', 'calendar', 'community_post', 'shared_doc', 'reward', 'system'])

const list = async ({ openid }) => {
  const { coupleId } = await requireCouple(openid)
  const result = await db.collection(collections.messages).where({ coupleId }).orderBy('createdAt', 'asc').limit(200).get()
  const unread = result.data.filter((item) => item.senderOpenId !== openid && !item.readAt).length
  const unreadIds = result.data.filter((item) => item.senderOpenId !== openid && !item.readAt).map((item) => item._id)
  await Promise.all(unreadIds.map((id) => db.collection(collections.messages).doc(id).update({ data: { readAt: db.serverDate() } })))
  return { messages: result.data.map((item) => ({ id: item._id, type: item.type, text: item.text || '', title: item.title || '', description: item.description || '', resourceType: item.resourceType || '', resourceId: item.resourceId || '', actionPath: item.actionPath || '', actionText: item.actionText || '', senderIsSelf: item.senderOpenId === openid, createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '', status: 'sent' })), unread }
}

const unread = async ({ openid }) => {
  const { coupleId } = await requireCouple(openid)
  const result = await db.collection(collections.messages).where({ coupleId, readAt: null }).limit(100).get()
  return { unread: result.data.filter((item) => item.senderOpenId !== openid).length }
}

const createMessage = async ({ openid, payload, cue }) => {
  const { coupleId } = await requireCouple(openid)
  const type = cue ? clean(payload.type, 30) : 'text'
  assert(allowedTypes.has(type), 'MESSAGE_TYPE_INVALID', '消息类型不正确')
  const text = clean(payload.text, 500)
  assert(cue || text, 'MESSAGE_EMPTY', '请输入消息内容')
  if (cue) {
    const recent = await db.collection(collections.messages).where({ coupleId, senderOpenId: openid, resourceType: clean(payload.resourceType, 40), resourceId: clean(payload.resourceId, 100) }).orderBy('createdAt', 'desc').limit(1).get()
    const latest = recent.data[0]
    assert(!latest || Date.now() - new Date(latest.createdAt).getTime() >= 5 * 60 * 1000, 'CUE_TOO_FREQUENT', '刚刚已经提醒过 TA 啦')
  }
  const id = makeId('message')
  await db.collection(collections.messages).doc(id).set({ data: { coupleId, senderOpenId: openid, type, text, title: clean(payload.title, 60), description: clean(payload.description, 160), resourceType: clean(payload.resourceType, 40), resourceId: clean(payload.resourceId, 100), actionPath: clean(payload.actionPath, 200), actionText: clean(payload.actionText, 20), readAt: null, createdAt: now() } })
  return list({ openid })
}

const send = (context) => createMessage({ ...context, cue: false })
const cue = (context) => createMessage({ ...context, cue: true })
const open = async ({ openid, payload }) => {
  const { coupleId } = await requireCouple(openid)
  const message = await getDoc(collections.messages, clean(payload.messageId, 100))
  assert(message && message.coupleId === coupleId, 'MESSAGE_NOT_FOUND', '消息不存在或不可访问')
  if (message.senderOpenId !== openid) await heat.grant({ openid, code: 'HF04', businessResourceId: message._id })
  return { actionPath: message.actionPath || '' }
}

module.exports = { list, unread, send, cue, open }
