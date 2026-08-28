const {
  db, collections, now, makeId, hashCode, randomCode, queryOne, getDoc,
  requireCouple, projectState, writeOperationLog, seedCouple,
} = require('../lib/shared')
const { assert } = require('../lib/errors')

const create = async ({ openid }) => {
  const user = await getDoc(collections.users, openid)
  assert(!user?.coupleId, 'ALREADY_BOUND', '你已经处于一个情侣空间中')

  const code = randomCode()
  const inviteId = makeId('invite')
  await db.collection(collections.invites).where({ creatorOpenId: openid, status: 'open' }).update({
    data: { status: 'superseded', updatedAt: db.serverDate() },
  })
  await db.collection(collections.invites).doc(inviteId).set({
    data: {
      creatorOpenId: openid,
      applicantOpenId: null,
      codeHash: hashCode(code),
      status: 'open',
      useCount: 0,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      createdAt: now(),
      updatedAt: now(),
    },
  })
  await writeOperationLog({ openid, action: 'invite.create', targetId: inviteId })
  return { ...(await projectState(openid)), inviteCode: code }
}

const apply = async ({ openid, payload }) => {
  const code = String(payload.code || '').replace(/\D/g, '')
  assert(/^\d{6}$/.test(code), 'INVALID_CODE', '请输入完整的 6 位数字短码')
  const user = await getDoc(collections.users, openid)
  assert(!user?.coupleId, 'ALREADY_BOUND', '你已经处于一个情侣空间中')

  const invite = await queryOne(collections.invites, { codeHash: hashCode(code), status: 'open' }, { field: 'createdAt', direction: 'desc' })
  assert(invite, 'INVITE_NOT_FOUND', '短码不存在或已被使用')
  assert(new Date(invite.expiresAt).getTime() > Date.now(), 'INVITE_EXPIRED', '短码已过期，请让对方重新邀请')
  assert(invite.creatorOpenId !== openid, 'SELF_BINDING', '不能与自己绑定')

  await db.runTransaction(async (transaction) => {
    const latestInvite = (await transaction.collection(collections.invites).doc(invite._id).get()).data
    const latestApplicant = (await transaction.collection(collections.users).doc(openid).get()).data
    assert(latestInvite?.status === 'open', 'INVITE_ALREADY_USED', '短码已被使用，请让对方重新邀请')
    assert(new Date(latestInvite.expiresAt).getTime() > Date.now(), 'INVITE_EXPIRED', '短码已过期，请让对方重新邀请')
    assert(latestInvite.creatorOpenId !== openid, 'SELF_BINDING', '不能与自己绑定')
    assert(!latestApplicant?.coupleId, 'ALREADY_BOUND', '你已经处于一个情侣空间中')
    await transaction.collection(collections.invites).doc(invite._id).update({
      data: { applicantOpenId: openid, status: 'applied', useCount: 1, updatedAt: now() },
    })
  })
  await writeOperationLog({ openid, action: 'invite.apply', targetId: invite._id })
  const state = await projectState(openid)
  state.joinCode = code
  return state
}

const review = async ({ openid, payload }) => {
  const invite = await queryOne(collections.invites, { creatorOpenId: openid, status: 'applied' }, { field: 'updatedAt', direction: 'desc' })
  assert(invite?.applicantOpenId, 'NO_PENDING_INVITE', '当前没有待确认的绑定申请')
  if (!payload.approved) {
    await db.collection(collections.invites).doc(invite._id).update({ data: { status: 'rejected', updatedAt: db.serverDate() } })
    await writeOperationLog({ openid, action: 'invite.reject', targetId: invite._id })
    return projectState(openid)
  }

  const coupleId = makeId('couple')
  await db.runTransaction(async (transaction) => {
    const latestInvite = (await transaction.collection(collections.invites).doc(invite._id).get()).data
    const creator = (await transaction.collection(collections.users).doc(openid).get()).data
    const applicant = (await transaction.collection(collections.users).doc(invite.applicantOpenId).get()).data
    assert(latestInvite?.status === 'applied', 'INVITE_ALREADY_HANDLED', '该申请已被处理')
    assert(!creator?.coupleId && !applicant?.coupleId, 'ALREADY_BOUND', '其中一方已经加入其他情侣空间')
    await seedCouple(transaction, { coupleId, creatorId: openid, applicantId: invite.applicantOpenId, inviteId: invite._id })
    await transaction.collection(collections.invites).doc(invite._id).update({
      data: { status: 'accepted', coupleId, updatedAt: now() },
    })
  })
  await writeOperationLog({ coupleId, openid, action: 'invite.review.approve', targetId: invite._id })
  return projectState(openid)
}

const pending = async ({ openid }) => {
  const invite = await queryOne(collections.invites, { creatorOpenId: openid, status: 'applied' }, { field: 'updatedAt', direction: 'desc' })
  return { invite: invite ? { id: invite._id, status: invite.status, hasApplicant: Boolean(invite.applicantOpenId) } : null }
}

const status = async ({ openid }) => {
  const invite = await queryOne(collections.invites, { applicantOpenId: openid }, { field: 'updatedAt', direction: 'desc' })
  if (!invite) return { invite: null }
  return {
    invite: {
      id: invite._id,
      status: invite.status,
      expiresAt: invite.expiresAt,
    },
  }
}

module.exports = { create, apply, review, pending, status }
