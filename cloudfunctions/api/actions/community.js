const {
  cloud, db, command, collections, now, makeId, hashCode, getDoc, requireCouple, writeOperationLog, createNotification,
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
  assert(media.length === 0, 'COMMUNITY_MEDIA_UNAVAILABLE', '社区暂仅支持纯文字帖子；图片和视频将在内容审核能力接通后开放')
}

const assertPublicPrivacy = (author, partner) => {
  assert(!author?.privacy?.privateMode && !partner?.privacy?.privateMode, 'COMMUNITY_PRIVACY_BLOCKED', '双方均关闭“一键不展示”后，才能公开帖子')
}

const publicIdentitySnapshot = (author, partner) => {
  const authorName = cleanText(author?.nickname, 24) || 'Love Points 用户'
  const partnerName = cleanText(partner?.nickname, 24) || 'TA'
  const showPair = author?.privacy?.showPartner === true && partner?.privacy?.showPartner === true
  return {
    authorSnapshot: { nickname: authorName, avatarUrl: '' },
    coupleSnapshot: { pairLabel: showPair ? `${authorName} × ${partnerName}` : `${authorName}与 TA 的日常` },
    pairIdentityApproved: showPair,
  }
}

const ensurePolicyAccepted = async (openid, user, payload) => {
  if (user?.preferences?.communityPolicyVersion === COMMUNITY_POLICY_VERSION) return
  assert(payload.policyAccepted === true && payload.policyVersion === COMMUNITY_POLICY_VERSION, 'COMMUNITY_POLICY_REQUIRED', '请先阅读并同意社区规范与用户协议')
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

const mapPost = (item, openid, coupleId = '') => ({
  id: item._id,
  title: item.title || '',
  content: item.content || '',
  media: Array.isArray(item.media) ? item.media : [],
  visibility: item.visibility === 'community' || item.status === 'published' || item.status === 'pending_approval' ? 'community' : 'couple',
  syncToCommunity: item.visibility === 'community' || item.status === 'published' || item.status === 'pending_approval',
  status: item.status === 'published' ? 'published' : item.status === 'rejected' ? 'rejected' : item.status === 'couple_only' ? 'couple_only' : 'pending',
  authorName: item.authorSnapshot?.nickname || 'Love Points 情侣',
  authorAvatarUrl: item.status === 'published' ? '' : item.authorSnapshot?.avatarUrl || '',
  pairLabel: item.status === 'published' && item.pairIdentityApproved !== true
    ? `${item.authorSnapshot?.nickname || 'Love Points 用户'}与 TA 的日常`
    : item.coupleSnapshot?.pairLabel || '两个人的日常',
  authorIsSelf: item.authorOpenId === openid,
  canReview: item.status === 'pending_approval' && item.reviewerOpenId === openid,
  canWithdraw: item.coupleId === coupleId && ['published', 'pending_approval'].includes(item.status),
  canDelete: item.authorOpenId === openid,
  contentVersion: Math.max(1, Number(item.contentVersion || 1)),
  belongsToCurrentCouple: Boolean(coupleId && item.coupleId === coupleId),
  createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
  publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : '',
  rejectionReason: item.rejectionReason || '',
})

const list = async ({ openid }) => {
  const user = await getDoc(collections.users, openid)
  const coupleId = user?.coupleId || ''
  const [published, ownPending] = await Promise.all([
    db.collection(collections.communityPosts)
      .where({ status: 'published', deleted: command.neq(true) })
      .orderBy('publishedAt', 'desc').limit(60).get(),
    coupleId ? db.collection(collections.communityPosts)
      .where({ coupleId, status: command.in(['couple_only', 'pending_approval', 'rejected']), deleted: command.neq(true) })
      .orderBy('createdAt', 'desc').limit(30).get() : Promise.resolve({ data: [] }),
  ])
  const safePublished = published.data.filter((item) => !Array.isArray(item.media) || item.media.length === 0)
  const posts = [...ownPending.data, ...safePublished]
  const unique = [...new Map(posts.map((item) => [item._id, item])).values()]
  return unique.map((item) => mapPost(item, openid, coupleId))
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
  const syncToCommunity = Boolean(payload.syncToCommunity) && !author.privacy?.privateMode
  assertCommunityMediaSafe(media)
  if (syncToCommunity) {
    assertPublicPrivacy(author, partner)
    await ensurePolicyAccepted(openid, author, payload)
  }
  await enforceCreateRate(openid, author)

  const postId = makeId('post')
  const authorName = cleanText(author.nickname, 24) || 'Love Points 用户'
  const partnerName = cleanText(partner?.nickname, 24) || 'TA'
  const identity = syncToCommunity
    ? publicIdentitySnapshot(author, partner)
    : { authorSnapshot: { nickname: authorName, avatarUrl: cleanText(author.avatarUrl, 500) }, coupleSnapshot: { pairLabel: `${authorName} × ${partnerName}` }, pairIdentityApproved: false }
  await db.collection(collections.communityPosts).doc(postId).set({ data: {
    coupleId,
    authorOpenId: openid,
    reviewerOpenId: partnerId,
    authorApproved: true,
    partnerApproved: false,
    ...identity,
    title,
    content,
    media,
    visibility: syncToCommunity ? 'community' : 'couple',
    status: syncToCommunity ? 'pending_approval' : 'couple_only',
    rejectionReason: '',
    publishedAt: null,
    deleted: false,
    contentVersion: 1,
    createdAt: now(),
    updatedAt: now(),
  } })
  await writeOperationLog({ coupleId, openid, action: syncToCommunity ? 'community.create.public' : 'community.create.couple', targetId: postId })
  if (syncToCommunity) await createNotification({ recipientOpenId: partnerId, coupleId, type: 'community', title: '共同帖子待确认', body: `${authorName}希望把“${title}”同步到社区`, actionPath: '/pages/community/index', sourceId: postId })
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
  const syncToCommunity = Boolean(payload.syncToCommunity) && !author?.privacy?.privateMode
  assertCommunityMediaSafe(media)
  if (syncToCommunity) {
    assertPublicPrivacy(author, partner)
    await ensurePolicyAccepted(openid, author, payload)
  }
  const authorName = cleanText(author?.nickname, 24) || 'Love Points 用户'
  const partnerName = cleanText(partner?.nickname, 24) || 'TA'
  const identity = syncToCommunity
    ? publicIdentitySnapshot(author, partner)
    : { authorSnapshot: { nickname: authorName, avatarUrl: cleanText(author?.avatarUrl, 500) }, coupleSnapshot: { pairLabel: `${authorName} × ${partnerName}` }, pairIdentityApproved: false }
  await db.collection(collections.communityPosts).doc(postId).update({ data: {
    title,
    content,
    media,
    ...identity,
    visibility: syncToCommunity ? 'community' : 'couple',
    status: syncToCommunity ? 'pending_approval' : 'couple_only',
    reviewerOpenId: partnerId,
    authorApproved: true,
    partnerApproved: false,
    rejectionReason: '',
    publishedAt: null,
    contentVersion: Math.max(1, Number(post.contentVersion || 1)) + 1,
    updatedAt: now(),
  } })
  await writeOperationLog({ coupleId, openid, action: 'community.update', targetId: postId })
  if (syncToCommunity) await createNotification({ recipientOpenId: partnerId, coupleId, type: 'community', title: '编辑后的帖子待确认', body: `“${title}”修改后希望重新同步到社区`, actionPath: '/pages/community/index', sourceId: postId })
  return list({ openid })
}

const review = async ({ openid, payload }) => {
  const { coupleId, partnerId } = await requireCouple(openid)
  const postId = cleanText(payload.postId, 100)
  const approved = Boolean(payload.approved)
  const reviewedVersion = Math.max(1, Number(payload.contentVersion || 1))
  let post
  await db.runTransaction(async (transaction) => {
    post = (await transaction.collection(collections.communityPosts).doc(postId).get()).data
    assert(post && post.coupleId === coupleId && post.status === 'pending_approval', 'COMMUNITY_POST_NOT_PENDING', '这条发布申请已经处理')
    assert(post.reviewerOpenId === openid, 'FORBIDDEN', '只有发布人的伴侣可以确认')
    assert(Math.max(1, Number(post.contentVersion || 1)) === reviewedVersion, 'COMMUNITY_VERSION_CHANGED', '帖子内容已修改，请刷新后重新确认')
    if (approved) {
      const reviewer = await transaction.collection(collections.users).doc(openid).get()
      const author = await transaction.collection(collections.users).doc(partnerId).get()
      assertPublicPrivacy(author.data, reviewer.data)
      assertCommunityMediaSafe(Array.isArray(post.media) ? post.media : [])
    }
    await transaction.collection(collections.communityPosts).doc(postId).update({ data: {
      status: approved ? 'published' : 'rejected',
      partnerApproved: approved,
      rejectionReason: approved ? '' : cleanText(payload.reason, 200),
      publishedAt: approved ? now() : null,
      updatedAt: now(),
    } })
  })
  await writeOperationLog({ coupleId, openid, action: approved ? 'community.review.approve' : 'community.review.reject', targetId: postId })
  await createNotification({ recipientOpenId: post.authorOpenId, coupleId, type: 'community', title: approved ? '共同帖子已发布' : '共同帖子未通过', body: approved ? '双方已经同意公开这条内容' : '对方没有同意公开这条内容', actionPath: '/pages/community/index', sourceId: postId })
  if (approved) await heat.grant({ openid, code: 'HR05', businessResourceId: postId })
  return list({ openid })
}

const withdraw = async ({ openid, payload }) => {
  const { coupleId } = await requireCouple(openid)
  const postId = cleanText(payload.postId, 100)
  const post = await getDoc(collections.communityPosts, postId)
  assert(post && post.coupleId === coupleId && post.deleted !== true, 'COMMUNITY_POST_NOT_FOUND', '帖子不存在或已经删除')
  assert(['published', 'pending_approval'].includes(post.status), 'COMMUNITY_NOT_PUBLIC', '帖子当前未公开或未在等待确认')
  await db.collection(collections.communityPosts).doc(postId).update({ data: {
    status: 'couple_only', visibility: 'couple', partnerApproved: false, publishedAt: null, updatedAt: now(),
  } })
  await writeOperationLog({ coupleId, openid, action: 'community.withdraw', targetId: postId })
  return list({ openid })
}

const remove = async ({ openid, payload }) => {
  const { coupleId } = await requireCouple(openid)
  const postId = cleanText(payload.postId, 100)
  const post = await getDoc(collections.communityPosts, postId)
  assert(post && post.coupleId === coupleId && post.deleted !== true, 'COMMUNITY_POST_NOT_FOUND', '帖子不存在或已经删除')
  assert(post.authorOpenId === openid, 'FORBIDDEN', '只能删除自己发布的帖子')
  await db.collection(collections.communityPosts).doc(postId).update({ data: {
    deleted: true, status: 'deleted', visibility: 'couple', partnerApproved: false, publishedAt: null, deletedAt: now(), deletedByOpenId: openid, mediaCleanupPending: true, updatedAt: now(),
  } })
  await writeOperationLog({ coupleId, openid, action: 'community.delete', targetId: postId })
  return list({ openid })
}

const report = async ({ openid, payload }) => {
  const postId = cleanText(payload.postId, 100)
  const reason = cleanText(payload.reason, 40)
  const detail = cleanText(payload.detail, 300)
  const allowedReasons = new Set(['色情低俗', '违法违规', '人身攻击', '广告引流', '隐私泄露', '其他'])
  assert(allowedReasons.has(reason), 'COMMUNITY_REPORT_REASON_INVALID', '请选择举报原因')
  const post = await getDoc(collections.communityPosts, postId)
  assert(post && post.status === 'published' && post.deleted !== true, 'COMMUNITY_POST_NOT_PUBLIC', '帖子已不可见，无需重复举报')
  assert(post.authorOpenId !== openid, 'COMMUNITY_REPORT_SELF', '不能举报自己发布的帖子')
  const reportId = `report_${hashCode(`${postId}:${openid}`).slice(0, 40)}`
  const existing = await getDoc(collections.communityReports, reportId)
  if (!existing) {
    await db.collection(collections.communityReports).doc(reportId).set({ data: {
      postId,
      reporterOpenId: openid,
      authorOpenId: post.authorOpenId,
      coupleId: post.coupleId,
      reason,
      detail,
      status: 'pending',
      postSnapshot: { title: post.title || '', content: post.content || '', contentVersion: Number(post.contentVersion || 1) },
      createdAt: now(),
      updatedAt: now(),
    } })
    await writeOperationLog({ openid, action: 'community.report', targetId: postId, detail: reason })
  }
  return { submitted: true, status: existing?.status || 'pending' }
}

module.exports = { COMMUNITY_POLICY_VERSION, list, create, update, review, withdraw, remove, report }
