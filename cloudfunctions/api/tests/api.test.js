const assert = require('node:assert/strict')
const test = require('node:test')

const fakeCloud = require('./fake-cloud')
const sdkPath = require.resolve('wx-server-sdk')
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: fakeCloud }
const api = require('../index')
const { ensureTaskCycles } = require('../lib/shared')

const call = async (openid, action, payload = {}) => {
  fakeCloud.currentOpenId = openid
  return api.main({ action, payload })
}

test('two users can complete the full cloud flow with idempotent point mutations', async () => {
  fakeCloud.reset()
  const creator = 'user-a'
  const applicant = 'user-b'

  const creatorProfile = await call(creator, 'profile.update', {
    nickname: '林悦', gender: 'female', region: '上海', hobbies: ['旅行', '电影'], avatarUrl: '',
  })
  assert.equal(creatorProfile.data.profileComplete, true)
  assert.equal(creatorProfile.data.profile.nickname, '林悦')
  await call(applicant, 'profile.update', {
    nickname: '阿辰', gender: 'male', region: '上海', hobbies: ['摄影'], avatarUrl: '',
  })

  const invite = await call(creator, 'invite.create')
  assert.equal(invite.ok, true)
  assert.match(invite.data.inviteCode, /^\d{6}$/)

  const applied = await call(applicant, 'invite.apply', { code: invite.data.inviteCode })
  assert.equal(applied.ok, true)
  assert.equal(applied.data.bound, false)

  const reusedInvite = await call('user-c', 'invite.apply', { code: invite.data.inviteCode })
  assert.equal(reusedInvite.ok, false)
  assert.equal(reusedInvite.code, 'INVITE_NOT_FOUND')

  const rejected = await call(creator, 'invite.review', { approved: false })
  assert.equal(rejected.ok, true)
  assert.equal(rejected.data.bound, false)
  const rejectedStatus = await call(applicant, 'invite.status')
  assert.equal(rejectedStatus.data.invite.status, 'rejected')

  const inviteAgain = await call(creator, 'invite.create')
  await call(applicant, 'invite.apply', { code: inviteAgain.data.inviteCode })
  const bound = await call(creator, 'invite.review', { approved: true })
  assert.equal(bound.ok, true)
  assert.equal(bound.data.bound, true)

  const applicantHome = await call(applicant, 'home.summary')
  assert.equal(applicantHome.data.bound, true)
  assert.equal(applicantHome.data.personalPoints, 320)
  assert.equal(applicantHome.data.sharedPoints, 580)
  assert.equal(applicantHome.data.tasks.length, 1)
  assert.equal(applicantHome.data.documentGroups.length, 1)
  assert.equal(applicantHome.data.documents.length, 1)
  const firstCoupleId = fakeCloud.dump('users').find((item) => item._id === creator).coupleId

  const dailyCreated = await call(applicant, 'task.create', {
    title: '每天拥抱一次', description: '验证每日计划跨日更新', points: 15,
    taskType: 'shared', assignee: 'self', planType: 'daily',
  })
  const dailyTask = dailyCreated.data.tasks.find((item) => item.title === '每天拥抱一次')
  assert.equal(dailyTask.planType, 'daily')
  await call(applicant, 'task.submit', { taskId: dailyTask.id, note: '今天已完成' })
  const dailyTemplate = fakeCloud.dump('tasks').find((item) => item._id === dailyTask.templateId)
  const nextDay = new Date(new Date(dailyTask.periodEnd).getTime() + 1000)
  await ensureTaskCycles([dailyTemplate], firstCoupleId, nextDay)
  const dailyCycles = fakeCloud.dump('task_cycles').filter((item) => item.taskId === dailyTask.templateId)
  assert.equal(dailyCycles.some((item) => item._id === dailyTask.id && item.status === 'pending'), true)
  assert.equal(dailyCycles.some((item) => item.cycleKey !== dailyTask.cycleKey && item.status === 'todo'), true)

  fakeCloud.failNextAdd('operation_logs')
  const logFailureSafeTask = await call(applicant, 'task.create', {
    title: '日志失败不影响任务', description: '验证辅助日志失败不伪装业务失败', points: 10, taskType: 'personal', assignee: 'self',
  })
  assert.equal(logFailureSafeTask.ok, true)
  assert.equal(logFailureSafeTask.data.tasks.some((item) => item.title === '日志失败不影响任务'), true)

  const outsiderCreator = 'user-c'
  const outsiderApplicant = 'user-d'
  const outsiderInvite = await call(outsiderCreator, 'invite.create')
  await call(outsiderApplicant, 'invite.apply', { code: outsiderInvite.data.inviteCode })
  const outsiderBound = await call(outsiderCreator, 'invite.review', { approved: true })
  assert.equal(outsiderBound.data.bound, true)
  const outsiderTaskAttempt = await call(outsiderCreator, 'task.submit', {
    taskId: applicantHome.data.tasks[0].id,
    note: '尝试操作其他情侣空间的任务',
  })
  assert.equal(outsiderTaskAttempt.ok, false)
  assert.equal(outsiderTaskAttempt.code, 'TASK_NOT_FOUND')
  const outsiderDocumentAttempt = await call(outsiderCreator, 'documents.lock', {
    documentId: applicantHome.data.documents[0].id,
  })
  assert.equal(outsiderDocumentAttempt.ok, false)
  assert.equal(outsiderDocumentAttempt.code, 'DOCUMENT_NOT_FOUND')
  const outsiderDocumentRead = await call(outsiderCreator, 'documents.detail', {
    documentId: applicantHome.data.documents[0].id,
  })
  assert.equal(outsiderDocumentRead.ok, false)
  assert.equal(outsiderDocumentRead.code, 'DOCUMENT_NOT_FOUND')

  const seedTaskId = applicantHome.data.tasks[0].id
  const submitted = await call(applicant, 'task.submit', { taskId: seedTaskId, note: '完成晚餐并拍照' })
  assert.equal(submitted.data.tasks.find((item) => item.id === seedTaskId).status, 'pending')

  const approved = await call(creator, 'task.review', { taskId: seedTaskId, approved: true })
  assert.equal(approved.ok, true)
  const afterApproval = await call(applicant, 'home.summary')
  assert.equal(afterApproval.data.tasks.find((item) => item.id === seedTaskId).status, 'done')
  assert.equal(afterApproval.data.personalPoints, 440)
  const personalLedgerId = afterApproval.data.ledger.find((item) => item.title === '一起完成晚餐').id
  const creatorAfterPersonalApproval = await call(creator, 'home.summary')
  assert.equal(creatorAfterPersonalApproval.data.ledger.some((item) => item.id === personalLedgerId), false)

  await call(creator, 'task.review', { taskId: seedTaskId, approved: true })
  const afterDuplicateApproval = await call(applicant, 'home.summary')
  assert.equal(afterDuplicateApproval.data.personalPoints, 440)
  assert.equal(fakeCloud.dump('point_ledgers').filter((item) => item.sourceType === 'task_approval').length, 1)

  const createdTask = await call(applicant, 'task.create', {
    title: '自动化共同任务', description: '验证任务列表', points: 75, taskType: 'shared', assignee: 'self',
  })
  const sharedTask = createdTask.data.tasks.find((item) => item.title === '自动化共同任务')
  assert.ok(sharedTask)
  await call(applicant, 'task.submit', { taskId: sharedTask.id, note: '共同任务完成' })
  await call(creator, 'task.review', { taskId: sharedTask.id, approved: false, reason: '请补充完成说明' })
  const rejectedTask = await call(applicant, 'home.summary')
  assert.equal(rejectedTask.data.tasks.find((item) => item.id === sharedTask.id).status, 'rejected')
  assert.equal(rejectedTask.data.tasks.find((item) => item.id === sharedTask.id).rejectionReason, '请补充完成说明')
  await call(applicant, 'task.submit', { taskId: sharedTask.id, note: '已经补充说明并重新提交' })
  await call(creator, 'task.review', { taskId: sharedTask.id, approved: true })
  const afterSharedTask = await call(applicant, 'home.summary')
  assert.equal(afterSharedTask.data.sharedPoints, 655)

  const movieReward = afterDuplicateApproval.data.rewards.find((item) => item.cost === 200)
  const outsiderRewardAttempt = await call(outsiderCreator, 'reward.redeem', {
    rewardId: movieReward.id,
    idempotencyKey: 'outsider-redeem-001',
  })
  assert.equal(outsiderRewardAttempt.ok, false)
  assert.equal(outsiderRewardAttempt.code, 'REWARD_NOT_FOUND')

  const expensiveRewardState = await call(applicant, 'reward.create', {
    name: '余额不足奖励', description: '验证余额保护', cost: 5000, pointsType: 'shared', approvalRequired: false,
  })
  const expensiveReward = expensiveRewardState.data.rewards.find((item) => item.name === '余额不足奖励')
  const insufficient = await call(applicant, 'reward.redeem', {
    rewardId: expensiveReward.id,
    idempotencyKey: 'insufficient-redeem-001',
  })
  assert.equal(insufficient.ok, false)
  assert.equal(insufficient.code, 'INSUFFICIENT_POINTS')
  const expensiveApprovalRewardState = await call(applicant, 'reward.create', {
    name: '余额不足审批奖励', description: '审批前也要校验余额', cost: 5000, pointsType: 'shared', approvalRequired: true,
  })
  const expensiveApprovalReward = expensiveApprovalRewardState.data.rewards.find((item) => item.name === '余额不足审批奖励')
  const insufficientApproval = await call(applicant, 'reward.redeem', {
    rewardId: expensiveApprovalReward.id,
    idempotencyKey: 'insufficient-approval-redeem-001',
  })
  assert.equal(insufficientApproval.ok, false)
  assert.equal(insufficientApproval.code, 'INSUFFICIENT_POINTS')

  const redeemed = await call(applicant, 'reward.redeem', { rewardId: movieReward.id, idempotencyKey: 'redeem-movie-001' })
  assert.equal(redeemed.data.sharedPoints, 455)
  const creatorSeesSharedRedemption = await call(creator, 'home.summary')
  const partnerVisibleRedemption = creatorSeesSharedRedemption.data.redemptions.find((item) => item.rewardId === movieReward.id)
  assert.equal(partnerVisibleRedemption.status, 'active')
  assert.equal(partnerVisibleRedemption.requesterIsSelf, false)
  await call(applicant, 'reward.redeem', { rewardId: movieReward.id, idempotencyKey: 'redeem-movie-001' })
  await call(applicant, 'reward.redeem', { rewardId: movieReward.id, idempotencyKey: 'redeem-movie-002' })
  const afterDuplicateRedeem = await call(applicant, 'home.summary')
  assert.equal(afterDuplicateRedeem.data.sharedPoints, 455)
  assert.equal(fakeCloud.dump('redemptions').filter((item) => item.rewardId === movieReward.id).length, 1)
  assert.equal(fakeCloud.dump('point_ledgers').filter((item) => item.sourceType === 'reward_redemption').length, 1)

  const refundRequested = await call(applicant, 'reward.refund.request')
  assert.equal(refundRequested.data.refundStatus, 'requested')
  const refundApproved = await call(creator, 'reward.refund.review', { approved: true })
  assert.equal(refundApproved.ok, true)
  const duplicateRefundApproval = await call(creator, 'reward.refund.review', { approved: true, rewardId: movieReward.id })
  assert.equal(duplicateRefundApproval.ok, false)
  assert.equal(duplicateRefundApproval.code, 'NO_PENDING_REFUND')
  const afterRefund = await call(applicant, 'home.summary')
  assert.equal(afterRefund.data.sharedPoints, 655)
  assert.equal(afterRefund.data.refundStatus, 'approved')

  const createdReward = await call(applicant, 'reward.create', {
    name: '审批奖励', description: '先审批再扣分', cost: 100, pointsType: 'shared',
    expiry: '30 天内', condition: '双方都有空', approvalRequired: true,
  })
  const approvalReward = createdReward.data.rewards.find((item) => item.name === '审批奖励')
  const pendingReward = await call(applicant, 'reward.redeem', { rewardId: approvalReward.id, idempotencyKey: 'approval-reward-001' })
  assert.equal(pendingReward.data.redemptionStatus, 'pending')
  assert.equal(pendingReward.data.sharedPoints, 655)
  await call(creator, 'reward.redeem.review', { approved: true })
  const afterRewardApproval = await call(applicant, 'home.summary')
  assert.equal(afterRewardApproval.data.sharedPoints, 555)
  assert.equal(afterRewardApproval.data.redemptions.some((item) => item.rewardId === movieReward.id && item.status === 'refunded'), true)
  assert.equal(afterRewardApproval.data.redemptions.some((item) => item.rewardId === approvalReward.id && item.status === 'active'), true)

  const locked = await call(applicant, 'documents.lock')
  assert.equal(locked.ok, true)
  const blockedLock = await call(creator, 'documents.lock')
  assert.equal(blockedLock.ok, false)
  assert.equal(blockedLock.code, 'DOCUMENT_LOCKED')
  const saved = await call(applicant, 'documents.save', { title: '云端日记', body: '双人同步成功' })
  assert.equal(saved.data.documentTitle, '云端日记')
  const savedDocument = saved.data.documents.find((item) => item.title === '云端日记')
  const documentDetail = await call(creator, 'documents.detail', { documentId: savedDocument.id })
  assert.equal(documentDetail.data.document.body, '双人同步成功')
  const unlockedOverwrite = await call(creator, 'documents.save', { documentId: savedDocument.id, title: '越权覆盖', body: '不应保存' })
  assert.equal(unlockedOverwrite.ok, false)
  assert.equal(unlockedOverwrite.code, 'DOCUMENT_LOCK_REQUIRED')

  const grouped = await call(applicant, 'documents.groups.create', { name: '自动化分组' })
  const group = grouped.data.documentGroups.find((item) => item.name === '自动化分组')
  assert.ok(group)
  const newDocument = await call(applicant, 'documents.save', { groupId: group.id, title: '分组文档', body: '独立新文档' })
  assert.ok(newDocument.data.documents.some((item) => item.groupId === group.id && item.title === '分组文档'))

  const pendingCommunity = await call(applicant, 'community.create', { content: '一起散步看到很漂亮的晚霞', media: [] })
  const pendingPost = pendingCommunity.data.find((item) => item.content.includes('晚霞'))
  assert.ok(pendingPost)
  assert.equal(pendingPost.status, 'pending')
  assert.equal(pendingPost.authorIsSelf, true)
  assert.equal(pendingPost.canReview, false)
  const creatorCommunity = await call(creator, 'community.list')
  assert.equal(creatorCommunity.data.find((item) => item.id === pendingPost.id).canReview, true)
  const outsiderBeforeApproval = await call(outsiderCreator, 'community.list')
  assert.equal(outsiderBeforeApproval.data.some((item) => item.id === pendingPost.id), false)
  const outsiderReview = await call(outsiderCreator, 'community.review', { postId: pendingPost.id, approved: true })
  assert.equal(outsiderReview.ok, false)
  await call(creator, 'community.review', { postId: pendingPost.id, approved: true })
  const outsiderAfterApproval = await call(outsiderCreator, 'community.list')
  assert.equal(outsiderAfterApproval.data.some((item) => item.id === pendingPost.id && item.status === 'published'), true)
  assert.equal(outsiderAfterApproval.data.find((item) => item.id === pendingPost.id).pairLabel, '阿辰 × 林悦')

  const selfRecordList = await call(applicant, 'records.save', {
    date: '2026-08-25', type: 'period', title: '', note: '第一天', mood: '', periodFlow: 'medium', visibility: 'self',
  })
  const selfRecord = selfRecordList.data.find((item) => item.type === 'period')
  assert.ok(selfRecord)
  const creatorCannotSeePrivate = await call(creator, 'records.list', { month: '2026-08' })
  assert.equal(creatorCannotSeePrivate.data.some((item) => item.id === selfRecord.id), false)
  const sharedRecordList = await call(applicant, 'records.save', {
    date: '2026-08-25', type: 'event', title: '一起看展', note: '很开心', mood: '', periodFlow: '', visibility: 'couple',
  })
  const sharedRecord = sharedRecordList.data.find((item) => item.title === '一起看展')
  assert.ok(sharedRecord)
  const creatorSeesShared = await call(creator, 'records.list', { month: '2026-08' })
  assert.equal(creatorSeesShared.data.some((item) => item.id === sharedRecord.id && item.ownerIsSelf === false), true)
  const creatorDeletePartnerRecord = await call(creator, 'records.delete', { recordId: sharedRecord.id })
  assert.equal(creatorDeletePartnerRecord.ok, false)
  assert.equal(creatorDeletePartnerRecord.code, 'RECORD_NOT_FOUND')

  const requestedUnbind = await call(applicant, 'unbind.request')
  assert.equal(requestedUnbind.data.bound, true)
  assert.equal(requestedUnbind.data.unbindRequested, true)
  await call(applicant, 'unbind.request')
  assert.equal(fakeCloud.dump('unbind_requests').filter((item) => item.coupleId === firstCoupleId && item.status === 'pending').length, 1)
  const rejectedUnbind = await call(creator, 'unbind.review', { approved: false })
  assert.equal(rejectedUnbind.data.bound, true)
  assert.equal(fakeCloud.dump('documents').some((item) => item.coupleId === firstCoupleId), true)
  await call(applicant, 'unbind.request')
  const cancelledUnbind = await call(applicant, 'unbind.cancel')
  assert.equal(cancelledUnbind.data.bound, true)
  assert.equal(cancelledUnbind.data.unbindRequested, false)
  await call(applicant, 'unbind.request')
  const approvedUnbind = await call(creator, 'unbind.review', { approved: true })
  assert.equal(approvedUnbind.data.bound, false)
  const applicantAfterUnbind = await call(applicant, 'home.summary')
  assert.equal(applicantAfterUnbind.data.bound, false)
  assert.equal(fakeCloud.dump('point_ledgers').filter((item) => item.coupleId === firstCoupleId).length, 0)
  assert.equal(fakeCloud.dump('document_groups').filter((item) => item.coupleId === firstCoupleId).length, 0)
  assert.equal(fakeCloud.dump('community_posts').filter((item) => item.coupleId === firstCoupleId).length, 0)
  assert.equal(fakeCloud.dump('daily_records').filter((item) => item.coupleId === firstCoupleId).length, 0)
  assert.equal(fakeCloud.dump('task_cycles').filter((item) => item.coupleId === firstCoupleId).length, 0)
  assert.equal(fakeCloud.dump('invites').some((item) => [creator, applicant].includes(item.creatorOpenId) || [creator, applicant].includes(item.applicantOpenId)), false)
  assert.equal(fakeCloud.dump('operation_logs').some((item) => [creator, applicant].includes(item.actorOpenId)), false)
  assert.equal(fakeCloud.dump('unbind_requests').filter((item) => item.coupleId === firstCoupleId).length, 0)
  assert.equal(fakeCloud.dump('couples').some((item) => item._id === firstCoupleId), false)
  const outsiderAfterCleanup = await call(outsiderCreator, 'home.summary')
  assert.equal(outsiderAfterCleanup.data.bound, true)
})
