const {
  cloud, db, command, collections, now, makeId, getDoc, requireCouple, writeOperationLog, createNotification,
} = require('../lib/shared')
const { assert } = require('../lib/errors')
const heat = require('./heat')

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength)
const COMMUNITY_POLICY_VERSION = '2026-09-02'
const CREATE_WINDOW_MS = 10 * 60 * 1000
const CREATE_WINDOW_LIMIT = 5

const validateMedia = (media) => {
  assert(Array.isArray(media) && media.length <= 9, 'COMMUNITY_MEDIA_LIMIT', '一次最多发布 9 个照片或视频')
  return media.map((item) => {
    const type = item?.type === 'video' ? 'video' : 'image'
    const fileId = cleanText(item?.fileId, 500)
    assert(fileId.startsWith('cloud://'), 'COMMUNITY_MEDIA_INVALID', '照片或视频尚未上传完成')
    return {
      type,
      fileId,
      posterFileId: cleanText(item?.posterFileId, 500),
      width: Math.max(0, Number(item?.width || 0)),
      height: Math.max(0, Number(item?.height || 0)),
      duration: Math.max(0, Number(item?.duration || 0)),
    }
  })
}

const assertCommunityMediaSafe = (media) => {
  assert(media.length === 0, 'COMMUNITY_MEDIA_UNAVAILABLE', '帖子暂仅支持纯文字；图片和视频将在内容审核能力接通后开放')
}

const ensurePolicyAccepted = async (openid, user, payload) => {
  if (user?.preferences?.communityPolicyVersion === COMMUNITY_POLICY_VERSION) return
  assert(payload.policyAccepted === true && payload.policyVersion === COMMUNITY_POLICY_VERSION, 'COMMUNITY_POLICY_REQUIRED', '请先阅读并同意发布规范与用户协议')
  await db.collection(collections.users).doc(openid).update({ data: {
    preferences: {
      ...(user.preferences || {}),
      communityPolicyVersion: COMMUNITY_POLICY_VERSION,
      communityPolicyAcceptedAt: now(),
    },
    updatedAt: now(),
  } })
}

const enforceCreateRate = async (openid, user) => {
  const current = user?.communityCreateRate || {}
  const startedAt = current.startedAt ? new Date(current.startedAt).getTime() : 0
  const insideWindow = startedAt > Date.now() - CREATE_WINDOW_MS
  const count = insideWindow ? Number(current.count || 0) : 0
  assert(count < CREATE_WINDOW_LIMIT, 'COMMUNITY_RATE_LIMITED', '发布得有点快，请稍后再试')
  await db.collection(collections.users).doc(openid).update({ data: {
    communityCreateRate: { startedAt: insideWindow ? current.startedAt : now(), count: count + 1 },
    updatedAt: now(),
  } })
}

const checkTextSafety = async (openid, content) => {
  if (!content) return
  assert(cloud.openapi?.security?.msgSecCheck, 'COMMUNITY_SECURITY_UNAVAILABLE', '内容安全服务暂时不可用，请稍后再试')
  try {
    const result = await cloud.openapi.security.msgSecCheck({ openid, scene: 4, version: 2, content })
    const suggest = result?.result?.suggest || result?.result?.label
    const safe = result?.errCode === 0 && (!suggest || suggest === 'pass' || suggest === 100)
    assert(safe, 'COMMUNITY_CONTENT_RISK', '内容未通过安全检查，请修改后再试')
  } catch (error) {
    if (error?.code === 'COMMUNITY_CONTENT_RISK' || error?.code === 'COMMUNITY_SECURITY_UNAVAILABLE') throw error
    if (error?.errCode === 87014) assert(false, 'COMMUNITY_CONTENT_RISK', '内容未通过安全检查，请修改后再试')
    console.error('Community text safety check unavailable', { message: error instanceof Error ? error.message : String(error) })
    assert(false, 'COMMUNITY_SECURITY_UNAVAILABLE', '内容安全服务暂时不可用，请稍后再试')
  }
}

const identitySnapshot = (author, partner) => {
  const authorName = cleanText(author?.nickname, 24) || 'Love Points 用户'
  const partnerName = cleanText(partner?.nickname, 24) || 'TA'
  return {
    authorSnapshot: { nickname: authorName, avatarUrl: cleanText(author?.avatarUrl, 500) },
    coupleSnapshot: { pairLabel: `${authorName} × ${partnerName}` },
  }
}

const mapPost = (item, openid, coupleId = '') => ({
  id: item._id,
  title: item.title || '',
  content: item.content || '',
  media: Array.isArray(item.media) ? item.media : [],
  visibility: 'couple',
  status: 'couple_only',
  authorName: item.authorSnapshot?.nickname || 'Love Points 情侣',
  authorAvatarUrl: item.authorSnapshot?.avatarUrl || '',
  pairLabel: item.coupleSnapshot?.pairLabel || '两个人的日常',
  authorIsSelf: item.authorOpenId === openid,
  canDelete: item.authorOpenId === openid,
  contentVersion: Math.max(1, Number(item.contentVersion || 1)),
  belongsToCurrentCouple: Boolean(coupleId && item.coupleId === coupleId),
  createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
})

const list = async ({ openid }) => {
  const user = await getDoc(collections.users, openid)
  const coupleId = user?.coupleId || ''
  if (!coupleId) return []
  const result = await db.collection(collections.communityPosts)
    .where({ coupleId, status: 'couple_only', deleted: command.neq(true) })
    .orderBy('createdAt', 'desc').limit(60).get()
  return result.data.map((item) => mapPost(item, openid, coupleId))
}

const create = async ({ openid, payload }) => {
  const { coupleId, partnerId } = await requireCouple(openid)
  const [author, partner] = await Promise.all([
    getDoc(collections.users, openid),
    getDoc(collections.users, partnerId),
  ])
  assert(author?.profileCompleted || author?.nickname, 'PROFILE_REQUIRED', '请先完成个人资料')
  const title = cleanText(payload.title, 60)
  const content = cleanText(payload.content, 1000)
  const media = validateMedia(payload.media || [])
  assert(title, 'COMMUNITY_TITLE_REQUIRED', '请填写帖子标题')
  assert(content, 'COMMUNITY_EMPTY', '请填写帖子正文')
  await checkTextSafety(openid, `${title} ${content}`.trim())
  assertCommunityMediaSafe(media)
  await ensurePolicyAccepted(openid, author, payload)
  await enforceCreateRate(openid, author)

  const postId = makeId('post')
  const authorName = cleanText(author.nickname, 24) || '我'
  await db.collection(collections.communityPosts).doc(postId).set({ data: {
    coupleId,
    authorOpenId: openid,
    ...identitySnapshot(author, partner),
    title,
    content,
    media,
    visibility: 'couple',
    status: 'couple_only',
    publishedAt: null,
    deleted: false,
    contentVersion: 1,
    createdAt: now(),
    updatedAt: now(),
  } })
  await writeOperationLog({ coupleId, openid, action: 'community.create', targetId: postId })
  await createNotification({
    recipientOpenId: partnerId,
    coupleId,
    type: 'community',
    title: 'TA 发了一条新帖子',
    body: `${authorName}发布了“${title}”`,
    actionPath: '/pages/community/index',
    sourceId: postId,
  })
  await heat.grant({ openid, code: 'HR05', businessResourceId: postId })
  return list({ openid })
}

const update = async ({ openid, payload }) => {
  const { coupleId, partnerId } = await requireCouple(openid)
  const postId = cleanText(payload.postId, 100)
  const [post, author, partner] = await Promise.all([
    getDoc(collections.communityPosts, postId),
    getDoc(collections.users, openid),
    getDoc(collections.users, partnerId),
  ])
  assert(post && post.coupleId === coupleId && post.deleted !== true, 'COMMUNITY_POST_NOT_FOUND', '帖子不存在或已经删除')
  assert(post.authorOpenId === openid, 'FORBIDDEN', '只能编辑自己发布的帖子')
  const title = cleanText(payload.title, 60)
  const content = cleanText(payload.content, 1000)
  const media = validateMedia(payload.media || [])
  assert(title, 'COMMUNITY_TITLE_REQUIRED', '请填写帖子标题')
  assert(content, 'COMMUNITY_EMPTY', '请填写帖子正文')
  await checkTextSafety(openid, `${title} ${content}`.trim())
  assertCommunityMediaSafe(media)
  await db.collection(collections.communityPosts).doc(postId).update({ data: {
    title,
    content,
    media,
    ...identitySnapshot(author, partner),
    visibility: 'couple',
    status: 'couple_only',
    contentVersion: Math.max(1, Number(post.contentVersion || 1)) + 1,
    updatedAt: now(),
  } })
  await writeOperationLog({ coupleId, openid, action: 'community.update', targetId: postId })
  return list({ openid })
}

const remove = async ({ openid, payload }) => {
  const { coupleId } = await requireCouple(openid)
  const postId = cleanText(payload.postId, 100)
  const post = await getDoc(collections.communityPosts, postId)
  assert(post && post.coupleId === coupleId && post.deleted !== true, 'COMMUNITY_POST_NOT_FOUND', '帖子不存在或已经删除')
  assert(post.authorOpenId === openid, 'FORBIDDEN', '只能删除自己发布的帖子')
  await db.collection(collections.communityPosts).doc(postId).update({ data: {
    deleted: true, status: 'deleted', visibility: 'couple', publishedAt: null, deletedAt: now(), deletedByOpenId: openid, mediaCleanupPending: true, updatedAt: now(),
  } })
  await writeOperationLog({ coupleId, openid, action: 'community.delete', targetId: postId })
  return list({ openid })
}

module.exports = { COMMUNITY_POLICY_VERSION, list, create, update, remove }
