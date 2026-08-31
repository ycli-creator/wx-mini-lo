const { db, command, collections, now, makeId, getDoc, createNotification, writeOperationLog } = require('../lib/shared')
const { assert } = require('../lib/errors')

const cleanCode = (value) => String(value || '').trim().toUpperCase().slice(0, 20)
const profile = (user) => {
  const privateMode = Boolean(user.privacy?.privateMode)
  return {
    identityCode: user.identityCode || '',
    nickname: privateMode ? '一位 Love Points 用户' : user.nickname || 'Love Points 用户',
    avatarUrl: privateMode ? '' : user.avatarUrl || '',
    region: privateMode ? '' : user.region || '',
    bound: Boolean(user.coupleId),
    privateMode,
  }
}
const search = async ({ openid, payload }) => {
  const code = cleanCode(payload.code)
  assert(/^LP-[0-9A-F]{4}-[0-9A-F]{4}$/.test(code), 'IDENTITY_CODE_INVALID', '请输入完整身份码')
  const result = await db.collection(collections.users).where({ identityCode: code }).limit(1).get()
  const user = result.data[0]
  assert(user && user._id !== openid && user.privacy?.searchableByCode !== false, 'USER_NOT_FOUND', '没有找到允许通过身份码添加的用户')
  return { user: profile(user) }
}
const request = async ({ openid, payload }) => {
  const found = await search({ openid, payload })
  const targetResult = await db.collection(collections.users).where({ identityCode: found.user.identityCode }).limit(1).get()
  const target = targetResult.data[0]
  const existing = await db.collection(collections.friendRequests).where({ requesterOpenId: openid, recipientOpenId: target._id, status: 'pending' }).limit(1).get()
  assert(!existing.data[0], 'FRIEND_REQUEST_EXISTS', '好友申请已经发送')
  const id = makeId('friend_request')
  await db.collection(collections.friendRequests).doc(id).set({ data: { requesterOpenId: openid, recipientOpenId: target._id, status: 'pending', createdAt: now(), updatedAt: now() } })
  const sender = await getDoc(collections.users, openid)
  await createNotification({ recipientOpenId: target._id, type: 'friend', title: '新的好友申请', body: `${sender.nickname || '一位用户'}想添加你为好友`, actionPath: '/pages/friends/index', sourceId: id })
  await writeOperationLog({ openid, action: 'friend.request', targetId: id })
  return list({ openid })
}
const list = async ({ openid }) => {
  const [relations, incoming] = await Promise.all([
    db.collection(collections.friendships).where({ members: command.all([openid]), status: 'active' }).orderBy('createdAt', 'desc').limit(100).get(),
    db.collection(collections.friendRequests).where({ recipientOpenId: openid, status: 'pending' }).orderBy('createdAt', 'desc').limit(50).get(),
  ])
  const friendIds = relations.data.map((item) => item.members.find((id) => id !== openid)).filter(Boolean)
  const requesterIds = incoming.data.map((item) => item.requesterOpenId)
  const users = await Promise.all([...new Set([...friendIds, ...requesterIds])].map((id) => getDoc(collections.users, id)))
  const byId = new Map(users.filter(Boolean).map((item) => [item._id, item]))
  return { friends: friendIds.map((id) => profile(byId.get(id) || {})), requests: incoming.data.map((item) => ({ id: item._id, user: profile(byId.get(item.requesterOpenId) || {}) })) }
}
const review = async ({ openid, payload }) => {
  const id = String(payload.id || '').slice(0, 120)
  const item = await getDoc(collections.friendRequests, id)
  assert(item && item.recipientOpenId === openid && item.status === 'pending', 'FRIEND_REQUEST_NOT_FOUND', '好友申请不存在或已经处理')
  const approved = Boolean(payload.approved)
  await db.collection(collections.friendRequests).doc(id).update({ data: { status: approved ? 'accepted' : 'rejected', updatedAt: db.serverDate() } })
  if (approved) {
    const members = [item.requesterOpenId, openid].sort()
    await db.collection(collections.friendships).doc(`friend_${members.join('_')}`).set({ data: { members, status: 'active', createdAt: now(), updatedAt: now() } })
    const reviewer = await getDoc(collections.users, openid)
    await createNotification({ recipientOpenId: item.requesterOpenId, type: 'friend', title: '好友申请已通过', body: `你和${reviewer.nickname || '对方'}已经成为好友`, actionPath: '/pages/friends/index', sourceId: id })
  }
  return list({ openid })
}
module.exports = { search, request, list, review }
