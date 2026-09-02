const crypto = require('node:crypto')
const { db, collections, now, hashCode, requireCouple, getDoc } = require('../lib/shared')
const { assert } = require('../lib/errors')

const create = async ({ openid, payload }) => {
  const allowed = new Set(['heat_task', 'community_post', 'couple_bind'])
  const type = String(payload.type || '')
  assert(allowed.has(type), 'SHARE_TYPE_INVALID', '当前内容不支持微信分享')
  const relation = type === 'couple_bind' ? { coupleId: null } : await requireCouple(openid)
  const coupleId = relation.coupleId
  if (type === 'community_post') {
    const post = await getDoc(collections.communityPosts, String(payload.resourceId || ''))
    assert(post && post.status === 'published' && !post.deleted, 'POST_NOT_PUBLIC', '帖子尚未公开，不能分享到微信')
  }
  const token = crypto.randomBytes(18).toString('base64url')
  const id = `share_${hashCode(token).slice(0, 40)}`
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  await db.collection(collections.shareIntents).doc(id).set({ data: { tokenHash: hashCode(token), coupleId, senderOpenId: openid, type, resourceId: String(payload.resourceId || '').slice(0, 100), targetPath: String(payload.targetPath || '').slice(0, 200), expiresAt, createdAt: now() } })
  return { token, path: `/pages/share-entry/index?t=${encodeURIComponent(token)}` }
}

const resolve = async ({ openid, payload }) => {
  const tokenHash = hashCode(String(payload.token || ''))
  const result = await db.collection(collections.shareIntents).where({ tokenHash }).limit(1).get()
  const intent = result.data[0]
  assert(intent && new Date(intent.expiresAt).getTime() > Date.now(), 'SHARE_EXPIRED', '分享已失效')
  if (intent.type === 'community_post') {
    const post = await getDoc(collections.communityPosts, intent.resourceId)
    assert(post && post.status === 'published' && !post.deleted, 'POST_NOT_PUBLIC', '帖子已撤回或删除')
  }
  if (intent.type !== 'community_post' && intent.type !== 'couple_bind') {
    const user = await getDoc(collections.users, openid)
    assert(user && user.coupleId === intent.coupleId, 'SHARE_FORBIDDEN', '这个内容只对情侣双方开放')
  }
  return { type: intent.type, resourceId: intent.resourceId, targetPath: intent.targetPath }
}

module.exports = { create, resolve }
