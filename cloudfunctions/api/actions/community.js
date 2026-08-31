const {
  cloud, db, command, collections, now, makeId, getDoc, requireCouple, writeOperationLog, createNotification,
} = require('../lib/shared')
const { assert } = require('../lib/errors')
const heat = require('./heat')

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength)

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

const mapPost = (item, openid) => ({
  id: item._id,
  title: item.title || '',
  content: item.content || '',
  media: Array.isArray(item.media) ? item.media : [],
  visibility: item.visibility === 'community' || item.status === 'published' || item.status === 'pending_approval' ? 'community' : 'couple',
  syncToCommunity: item.visibility === 'community' || item.status === 'published' || item.status === 'pending_approval',
  status: item.status === 'published' ? 'published' : item.status === 'rejected' ? 'rejected' : item.status === 'couple_only' ? 'couple_only' : 'pending',
  authorName: item.authorSnapshot?.nickname || 'Love Points 情侣',
  authorAvatarUrl: item.authorSnapshot?.avatarUrl || '',
  pairLabel: item.coupleSnapshot?.pairLabel || '两个人的日常',
  authorIsSelf: item.authorOpenId === openid,
  canReview: item.status === 'pending_approval' && item.reviewerOpenId === openid,
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
  const posts = [...ownPending.data, ...published.data]
  const unique = [...new Map(posts.map((item) => [item._id, item])).values()]
  return unique.map((item) => mapPost(item, openid))
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
  assert(content || media.length, 'COMMUNITY_EMPTY', '写点正文，或选择照片和视频')
  await checkTextSafety(openid, `${title} ${content}`.trim())
  const syncToCommunity = Boolean(payload.syncToCommunity) && !author.privacy?.privateMode

  const postId = makeId('post')
  const authorName = cleanText(author.nickname, 24) || 'Love Points 用户'
  const partnerName = cleanText(partner?.nickname, 24) || 'TA'
  await db.collection(collections.communityPosts).doc(postId).set({ data: {
    coupleId,
    authorOpenId: openid,
    reviewerOpenId: partnerId,
    authorApproved: true,
    partnerApproved: false,
    authorSnapshot: { nickname: authorName, avatarUrl: cleanText(author.avatarUrl, 500) },
    coupleSnapshot: { pairLabel: `${authorName} × ${partnerName}` },
    title,
    content,
    media,
    visibility: syncToCommunity ? 'community' : 'couple',
    status: syncToCommunity ? 'pending_approval' : 'couple_only',
    rejectionReason: '',
    publishedAt: null,
    deleted: false,
    createdAt: now(),
    updatedAt: now(),
  } })
  await writeOperationLog({ coupleId, openid, action: syncToCommunity ? 'community.create.public' : 'community.create.couple', targetId: postId })
  if (syncToCommunity) await createNotification({ recipientOpenId: partnerId, coupleId, type: 'community', title: '共同帖子待确认', body: `${authorName}希望把“${title}”同步到社区`, actionPath: '/pages/community/index', sourceId: postId })
  return list({ openid })
}

const review = async ({ openid, payload }) => {
  const { coupleId } = await requireCouple(openid)
  const postId = cleanText(payload.postId, 100)
  const post = await getDoc(collections.communityPosts, postId)
  assert(post && post.coupleId === coupleId && post.status === 'pending_approval', 'COMMUNITY_POST_NOT_PENDING', '这条发布申请已经处理')
  assert(post.reviewerOpenId === openid, 'FORBIDDEN', '只有发布人的伴侣可以确认')
  const approved = Boolean(payload.approved)
  await db.collection(collections.communityPosts).doc(postId).update({ data: {
    status: approved ? 'published' : 'rejected',
    partnerApproved: approved,
    rejectionReason: approved ? '' : cleanText(payload.reason, 200),
    publishedAt: approved ? db.serverDate() : null,
    updatedAt: db.serverDate(),
  } })
  await writeOperationLog({ coupleId, openid, action: approved ? 'community.review.approve' : 'community.review.reject', targetId: postId })
  await createNotification({ recipientOpenId: post.authorOpenId, coupleId, type: 'community', title: approved ? '共同帖子已发布' : '共同帖子未通过', body: approved ? '双方已经同意公开这条内容' : '对方没有同意公开这条内容', actionPath: '/pages/community/index', sourceId: postId })
  if (approved) await heat.grant({ openid, code: 'HR05', businessResourceId: postId })
  return list({ openid })
}

module.exports = { list, create, review }
