const {
  cloud, db, collections, now, hashCode, queryOne, requireCouple, projectState, writeOperationLog, createNotification,
} = require('../lib/shared')
const { assert } = require('../lib/errors')

const activePending = async (coupleId) => {
  const pending = await queryOne(collections.unbindRequests, { coupleId, status: 'pending' }, { field: 'createdAt', direction: 'desc' })
  if (!pending) return null
  if (pending.expiresAt && new Date(pending.expiresAt).getTime() <= Date.now()) {
    await db.collection(collections.unbindRequests).doc(pending._id).update({ data: { status: 'expired', updatedAt: db.serverDate() } })
    return null
  }
  return pending
}

const request = async ({ openid }) => {
  const { coupleId, partnerId } = await requireCouple(openid)
  const existing = await activePending(coupleId)
  if (!existing) {
    // One stable document per couple prevents rapid double taps from creating
    // multiple pending requests. Rejected/cancelled/expired requests may be
    // safely replaced by a later request for the same relationship.
    const requestId = `unbind_${hashCode(coupleId).slice(0, 40)}`
    await db.collection(collections.unbindRequests).doc(requestId).set({ data: {
      coupleId,
      requesterOpenId: openid,
      reviewerOpenId: partnerId,
      requesterConfirmed: true,
      reviewerConfirmed: false,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: now(),
      updatedAt: now(),
    } })
    await writeOperationLog({ coupleId, openid, action: 'unbind.request', targetId: requestId })
    await createNotification({ recipientOpenId: partnerId, coupleId, type: 'relationship', title: '解除绑定待确认', body: '对方发起了解除情侣关系申请', actionPath: '/pages/unbind/confirm', sourceId: requestId })
  }
  return projectState(openid)
}

const cancel = async ({ openid }) => {
  const { coupleId } = await requireCouple(openid)
  const pending = await activePending(coupleId)
  if (pending && pending.requesterOpenId !== openid) return projectState(openid)
  if (pending) {
    await db.collection(collections.unbindRequests).doc(pending._id).update({ data: { status: 'cancelled', updatedAt: db.serverDate() } })
    await writeOperationLog({ coupleId, openid, action: 'unbind.cancel', targetId: pending._id })
  }
  return projectState(openid)
}

const removeWhere = async (collection, where, exceptId = '') => {
  while (true) {
    const result = await db.collection(collection).where(where).limit(100).get()
    const removable = result.data.filter((item) => item._id !== exceptId)
    if (!removable.length) return
    for (let offset = 0; offset < removable.length; offset += 20) {
      const batch = removable.slice(offset, offset + 20)
      await Promise.all(batch.map((item) => db.collection(collection).doc(item._id).remove()))
    }
    if (result.data.length < 100) return
  }
}

const cleanupCommunityMedia = async (coupleId) => {
  const fileIds = new Set()
  let offset = 0
  while (true) {
    const result = await db.collection(collections.communityPosts).where({ coupleId }).orderBy('createdAt', 'asc').skip(offset).limit(100).get()
    for (const post of result.data) {
      for (const media of Array.isArray(post.media) ? post.media : []) {
        if (String(media.fileId || '').startsWith('cloud://')) fileIds.add(media.fileId)
        if (String(media.posterFileId || '').startsWith('cloud://')) fileIds.add(media.posterFileId)
      }
    }
    if (result.data.length < 100) break
    offset += result.data.length
  }
  const files = [...fileIds]
  for (let index = 0; index < files.length; index += 50) {
    await cloud.deleteFile({ fileList: files.slice(index, index + 50) })
  }
}

const cleanupCoupleData = async (coupleId, members, pendingRequestId) => {
  // Unbinding freezes the former space instead of deleting high-value memories.
  // The archived couple remains inaccessible through requireCouple and is never
  // attached to a future relationship. Export/deletion can be added as a
  // separate dual-consent workflow without risking accidental loss here.
  await db.runTransaction(async (transaction) => {
    const couple = (await transaction.collection(collections.couples).doc(coupleId).get()).data
    if (!couple) return
    for (const memberId of members) {
      await transaction.collection(collections.users).doc(memberId).update({ data: { coupleId: null, activeSpaceType: 'personal', updatedAt: now() } })
    }
    await transaction.collection(collections.unbindRequests).doc(pendingRequestId).update({ data: { status: 'approved', archivedAt: now(), updatedAt: now() } })
    await transaction.collection(collections.couples).doc(coupleId).update({ data: { status: 'archived', archivedAt: now(), updatedAt: now() } })
  })
}

const review = async ({ openid, payload }) => {
  const { coupleId, couple } = await requireCouple(openid)
  const pending = await activePending(coupleId)
  assert(pending && pending.reviewerOpenId === openid, 'NO_PENDING_UNBIND', '当前没有待确认的解绑申请')
  if (!payload.approved) {
    await db.collection(collections.unbindRequests).doc(pending._id).update({ data: { status: 'rejected', reviewerConfirmed: false, updatedAt: db.serverDate() } })
    await writeOperationLog({ coupleId, openid, action: 'unbind.review.reject', targetId: pending._id })
    return projectState(openid)
  }
  await cleanupCoupleData(coupleId, couple.members, pending._id)
  return projectState(openid)
}

module.exports = { request, cancel, review, cleanupCoupleData }
