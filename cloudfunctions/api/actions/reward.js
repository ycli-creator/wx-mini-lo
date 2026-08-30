const {
  db, command, collections, now, makeId, hashCode, getDoc, queryOne,
  requireSpace, projectState, writeOperationLog,
} = require('../lib/shared')
const { assert } = require('../lib/errors')
const heat = require('./heat')

const list = async ({ openid }) => {
  const { coupleId } = await requireSpace(openid)
  const result = await db.collection(collections.rewards).where({ coupleId, status: 'active' }).orderBy('createdAt', 'desc').limit(100).get()
  return { items: result.data }
}

const create = async ({ openid, payload }) => {
  const { coupleId, spaceType } = await requireSpace(openid)
  const name = String(payload.name || '').trim()
  const cost = Number(payload.cost)
  const pointsType = payload.pointsType === 'personal' ? 'personal' : 'shared'
  assert(name, 'INVALID_NAME', '请填写奖励名称')
  assert(name.length <= 60, 'REWARD_NAME_TOO_LONG', '奖励名称不能超过 60 个字')
  assert(Number.isInteger(cost) && cost > 0 && cost <= 100000, 'INVALID_COST', '奖励积分必须是 1–100000 的整数')
  assert(spaceType !== 'personal' || (pointsType === 'personal' && !payload.approvalRequired), 'COUPLE_REQUIRED', '个人空间只能创建个人积分奖励')
  const description = String(payload.description || '').trim() || '你们共同创建的奖励'
  const expiry = String(payload.expiry || '创建后 365 天内').trim()
  const condition = String(payload.condition || '由双方共同商量使用时间').trim()
  assert(description.length <= 500 && expiry.length <= 100 && condition.length <= 300, 'REWARD_CONTENT_TOO_LONG', '奖励说明、有效期或使用条件超过长度限制')
  const rewardId = makeId('reward')
  await db.collection(collections.rewards).doc(rewardId).set({
    data: {
      coupleId,
      name,
      description,
      cost,
      pointsType,
      expiry,
      condition,
      approvalRequired: Boolean(payload.approvalRequired),
      status: 'active',
      createdBy: openid,
      createdAt: now(),
      updatedAt: now(),
    },
  })
  await writeOperationLog({ coupleId, openid, action: 'reward.create', targetId: rewardId })
  const state = await projectState(openid)
  state.selectedRewardId = rewardId
  return state
}

const redeem = async ({ openid, payload }) => {
  const { coupleId, partnerId } = await requireSpace(openid)
  const rewardId = String(payload.rewardId || '')
  const idempotencyKey = String(payload.idempotencyKey || '').trim()
  assert(idempotencyKey.length >= 12 && idempotencyKey.length <= 180, 'INVALID_IDEMPOTENCY_KEY', '兑换请求缺少有效的幂等键')
  const reward = await getDoc(collections.rewards, rewardId)
  assert(reward && reward.coupleId === coupleId && reward.status === 'active', 'REWARD_NOT_FOUND', '奖励不存在或已下架')

  const existing = await queryOne(collections.redemptions, {
    coupleId,
    requesterOpenId: openid,
    rewardId,
    status: command.in(['pending_approval', 'active', 'refund_requested']),
  }, { field: 'createdAt', direction: 'desc' })
  if (existing) return projectState(openid)

  const redemptionId = `redemption_${hashCode(`${coupleId}:${openid}:${idempotencyKey}`).slice(0, 40)}`
  await db.runTransaction(async (transaction) => {
    const duplicate = (await transaction.collection(collections.redemptions)
      .where({ _id: redemptionId }).limit(1).get()).data[0]
    if (duplicate) return
    const activeForReward = await transaction.collection(collections.redemptions).where({
      coupleId,
      requesterOpenId: openid,
      rewardId,
      status: command.in(['pending_approval', 'active', 'refund_requested']),
    }).limit(1).get()
    if (activeForReward.data.length) return
    const latestReward = (await transaction.collection(collections.rewards).doc(rewardId).get()).data
    const account = (await transaction.collection(collections.accounts).doc(coupleId).get()).data
    assert(latestReward?.status === 'active', 'REWARD_NOT_FOUND', '奖励不存在或已下架')
    assert(account, 'ACCOUNT_NOT_FOUND', '积分账户不存在')

    const personalBalances = { ...(account.personalBalances || {}) }
    const currentBalance = latestReward.pointsType === 'shared'
      ? Number(account.sharedBalance || 0)
      : Number(personalBalances[openid] || 0)
    assert(currentBalance >= latestReward.cost, 'INSUFFICIENT_POINTS', '当前积分不足，先一起完成任务吧')

    if (latestReward.approvalRequired) {
      // Touch the shared account in the same transaction. This gives two
      // simultaneous first-time redemption requests a common conflict point;
      // after CloudBase retries, the query above observes the request that won.
      await transaction.collection(collections.accounts).doc(coupleId).update({
        data: { updatedAt: now() },
      })
      await transaction.collection(collections.redemptions).doc(redemptionId).set({
        data: {
          coupleId,
          rewardId,
          rewardSnapshot: { name: latestReward.name, cost: latestReward.cost, pointsType: latestReward.pointsType },
          requesterOpenId: openid,
          reviewerOpenId: partnerId,
          status: 'pending_approval',
          refundStatus: 'none',
          debitLedgerId: null,
          refundLedgerId: null,
          idempotencyKey,
          createdAt: now(),
          updatedAt: now(),
        },
      })
      return
    }

    const balanceAfter = currentBalance - latestReward.cost
    if (latestReward.pointsType === 'shared') {
      await transaction.collection(collections.accounts).doc(coupleId).update({ data: { sharedBalance: balanceAfter, updatedAt: now() } })
    } else {
      personalBalances[openid] = balanceAfter
      await transaction.collection(collections.accounts).doc(coupleId).update({ data: { personalBalances, updatedAt: now() } })
    }
    const ledgerId = `ledger_redeem_${redemptionId}`
    await transaction.collection(collections.ledgers).doc(ledgerId).set({
      data: {
        coupleId,
        accountOwnerOpenId: latestReward.pointsType === 'personal' ? openid : null,
        pointsType: latestReward.pointsType,
        direction: 'debit',
        amount: -latestReward.cost,
        balanceAfter,
        sourceType: 'reward_redemption',
        sourceId: redemptionId,
        actorOpenId: openid,
        title: `兑换「${latestReward.name}」`,
        detail: '奖励兑换成功',
        idempotencyKey: ledgerId,
        createdAt: now(),
      },
    })
    await transaction.collection(collections.redemptions).doc(redemptionId).set({
      data: {
        coupleId,
        rewardId,
        rewardSnapshot: { name: latestReward.name, cost: latestReward.cost, pointsType: latestReward.pointsType },
        requesterOpenId: openid,
        reviewerOpenId: null,
        status: 'active',
        refundStatus: 'none',
        debitLedgerId: ledgerId,
        refundLedgerId: null,
        idempotencyKey,
        createdAt: now(),
        updatedAt: now(),
      },
    })
  })
  await writeOperationLog({ coupleId, openid, action: 'reward.redeem', targetId: redemptionId })
  const completed = await getDoc(collections.redemptions, redemptionId)
  if (completed && completed.status === 'active' && completed.rewardSnapshot.pointsType === 'shared') await heat.grant({ openid, code: 'HR04', businessResourceId: redemptionId })
  return projectState(openid)
}

const reviewRedemption = async ({ openid, payload }) => {
  const { coupleId } = await requireSpace(openid)
  const where = { coupleId, reviewerOpenId: openid, status: 'pending_approval' }
  if (payload.rewardId) where.rewardId = String(payload.rewardId)
  const redemption = await queryOne(collections.redemptions, where, { field: 'createdAt', direction: 'desc' })
  assert(redemption, 'NO_PENDING_REDEMPTION', '当前没有待审批的奖励兑换')
  if (!payload.approved) {
    await db.collection(collections.redemptions).doc(redemption._id).update({ data: { status: 'rejected', updatedAt: db.serverDate() } })
    return projectState(openid)
  }
  const reward = await getDoc(collections.rewards, redemption.rewardId)
  assert(reward?.status === 'active', 'REWARD_NOT_FOUND', '奖励不存在或已下架')
  await db.runTransaction(async (transaction) => {
    const latest = (await transaction.collection(collections.redemptions).doc(redemption._id).get()).data
    if (latest.status !== 'pending_approval') return
    const account = (await transaction.collection(collections.accounts).doc(coupleId).get()).data
    const personalBalances = { ...(account.personalBalances || {}) }
    const currentBalance = reward.pointsType === 'shared' ? Number(account.sharedBalance || 0) : Number(personalBalances[latest.requesterOpenId] || 0)
    assert(currentBalance >= reward.cost, 'INSUFFICIENT_POINTS', '兑换人的积分已经不足')
    const balanceAfter = currentBalance - reward.cost
    if (reward.pointsType === 'shared') await transaction.collection(collections.accounts).doc(coupleId).update({ data: { sharedBalance: balanceAfter, updatedAt: now() } })
    else {
      personalBalances[latest.requesterOpenId] = balanceAfter
      await transaction.collection(collections.accounts).doc(coupleId).update({ data: { personalBalances, updatedAt: now() } })
    }
    const ledgerId = `ledger_redeem_${redemption._id}`
    await transaction.collection(collections.ledgers).doc(ledgerId).set({ data: {
      coupleId, accountOwnerOpenId: reward.pointsType === 'personal' ? latest.requesterOpenId : null,
      pointsType: reward.pointsType, direction: 'debit', amount: -reward.cost, balanceAfter,
      sourceType: 'reward_redemption', sourceId: redemption._id, actorOpenId: openid,
      title: `兑换「${reward.name}」`, detail: '对方已同意兑换', idempotencyKey: ledgerId, createdAt: now(),
    } })
    await transaction.collection(collections.redemptions).doc(redemption._id).update({ data: { status: 'active', debitLedgerId: ledgerId, updatedAt: now() } })
  })
  return projectState(openid)
}

const requestRefund = async ({ openid, payload }) => {
  const { coupleId, partnerId } = await requireSpace(openid)
  const where = { coupleId, requesterOpenId: openid, status: 'active' }
  if (payload.rewardId) where.rewardId = String(payload.rewardId)
  const redemption = await queryOne(collections.redemptions, where, { field: 'updatedAt', direction: 'desc' })
  assert(redemption, 'NO_REFUNDABLE_REDEMPTION', '当前没有可退款的奖励')
  await db.collection(collections.redemptions).doc(redemption._id).update({
    data: { status: 'refund_requested', refundStatus: 'requested', refundReviewerOpenId: partnerId, updatedAt: db.serverDate() },
  })
  await writeOperationLog({ coupleId, openid, action: 'reward.refund.request', targetId: redemption._id })
  return projectState(openid)
}

const reviewRefund = async ({ openid, payload }) => {
  const { coupleId } = await requireSpace(openid)
  const where = { coupleId, refundReviewerOpenId: openid, status: 'refund_requested' }
  if (payload.rewardId) where.rewardId = String(payload.rewardId)
  const redemption = await queryOne(collections.redemptions, where, { field: 'updatedAt', direction: 'desc' })
  assert(redemption, 'NO_PENDING_REFUND', '当前没有待处理的退款申请')
  if (!payload.approved) {
    await db.collection(collections.redemptions).doc(redemption._id).update({ data: { status: 'active', refundStatus: 'rejected', updatedAt: db.serverDate() } })
    return projectState(openid)
  }

  await db.runTransaction(async (transaction) => {
    const latest = (await transaction.collection(collections.redemptions).doc(redemption._id).get()).data
    if (latest.status === 'refunded') return
    assert(latest.status === 'refund_requested', 'REFUND_ALREADY_HANDLED', '退款已经处理')
    const account = (await transaction.collection(collections.accounts).doc(coupleId).get()).data
    const snapshot = latest.rewardSnapshot
    const personalBalances = { ...(account.personalBalances || {}) }
    const currentBalance = snapshot.pointsType === 'shared' ? Number(account.sharedBalance || 0) : Number(personalBalances[latest.requesterOpenId] || 0)
    const balanceAfter = currentBalance + snapshot.cost
    if (snapshot.pointsType === 'shared') await transaction.collection(collections.accounts).doc(coupleId).update({ data: { sharedBalance: balanceAfter, updatedAt: now() } })
    else {
      personalBalances[latest.requesterOpenId] = balanceAfter
      await transaction.collection(collections.accounts).doc(coupleId).update({ data: { personalBalances, updatedAt: now() } })
    }
    const ledgerId = `ledger_refund_${redemption._id}`
    await transaction.collection(collections.ledgers).doc(ledgerId).set({ data: {
      coupleId, accountOwnerOpenId: snapshot.pointsType === 'personal' ? latest.requesterOpenId : null,
      pointsType: snapshot.pointsType, direction: 'credit', amount: snapshot.cost, balanceAfter,
      sourceType: 'reward_refund', sourceId: redemption._id, actorOpenId: openid,
      title: `奖励退款「${snapshot.name}」`, detail: '对方已同意退款', idempotencyKey: ledgerId, createdAt: now(),
    } })
    await transaction.collection(collections.redemptions).doc(redemption._id).update({ data: { status: 'refunded', refundStatus: 'approved', refundLedgerId: ledgerId, updatedAt: now() } })
  })
  await writeOperationLog({ coupleId, openid, action: 'reward.refund.review.approve', targetId: redemption._id })
  return projectState(openid)
}

module.exports = { list, create, redeem, reviewRedemption, requestRefund, reviewRefund }
