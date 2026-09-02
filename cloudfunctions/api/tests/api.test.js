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
  assert.equal(applicantHome.data.activeSpaceType, 'couple')
  assert.deepEqual(applicantHome.data.availableSpaces, ['personal', 'couple'])
  assert.equal(applicantHome.data.personalPoints, 0)
  assert.equal(applicantHome.data.sharedPoints, 580)
  assert.equal(applicantHome.data.tasks.length, 1)
  assert.equal(applicantHome.data.documentGroups.length, 1)
  assert.equal(applicantHome.data.documents.length, 1)
  const firstCoupleId = fakeCloud.dump('users').find((item) => item._id === creator).coupleId

  const personalSpace = await call(applicant, 'space.switch', { spaceType: 'personal' })
  assert.equal(personalSpace.data.activeSpaceType, 'personal')
  assert.equal(personalSpace.data.sharedPoints, 0)
  assert.equal(personalSpace.data.tasks.length, 0)
  const personalTaskState = await call(applicant, 'task.create', {
    title: '整理个人书单', description: '只属于个人空间', points: 30,
    taskType: 'shared', assignee: 'self', planType: 'long_term', kind: 'one_time', completionRequirement: 'direct',
  })
  const personalTask = personalTaskState.data.tasks.find((item) => item.title === '整理个人书单')
  assert.equal(personalTask.pointsType, 'personal')
  await call(applicant, 'task.submit', { taskId: personalTask.id })
  await call(applicant, 'task.review', { taskId: personalTask.id, approved: true })
  const personalAfterTask = await call(applicant, 'home.summary')
  assert.equal(personalAfterTask.data.personalPoints, 30)
  await call(applicant, 'space.switch', { spaceType: 'couple' })
  const isolatedCoupleSpace = await call(applicant, 'home.summary')
  assert.equal(isolatedCoupleSpace.data.personalPoints, 0)
  assert.equal(isolatedCoupleSpace.data.sharedPoints, 580)
  assert.equal(isolatedCoupleSpace.data.tasks.some((item) => item.id === personalTask.id), false)

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
  assert.equal(afterApproval.data.sharedPoints, 700)
  const sharedLedgerId = afterApproval.data.ledger.find((item) => item.title === '一起完成晚餐').id
  const creatorAfterSharedApproval = await call(creator, 'home.summary')
  assert.equal(creatorAfterSharedApproval.data.ledger.some((item) => item.id === sharedLedgerId), true)

  await call(creator, 'task.review', { taskId: seedTaskId, approved: true })
  const afterDuplicateApproval = await call(applicant, 'home.summary')
  assert.equal(afterDuplicateApproval.data.sharedPoints, 700)
  assert.equal(fakeCloud.dump('point_ledgers').filter((item) => item.sourceType === 'task_approval' && item.coupleId === firstCoupleId).length, 1)

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
  assert.equal(afterSharedTask.data.sharedPoints, 775)

  const projectCreated = await call(applicant, 'task.create', {
    title: '周末爬山', description: '验证大任务分步发放', points: 100,
    kind: 'project', planType: 'long_term', completionRequirement: 'direct',
    projectSteps: [
      { title: '准备食物', assignee: 'self', completionRequirement: 'direct' },
      { title: '准备登山服', assignee: 'partner', completionRequirement: 'note' },
    ],
  })
  const project = projectCreated.data.tasks.find((item) => item.title === '周末爬山')
  assert.equal(project.kind, 'project')
  const applicantStep = project.projectSteps.find((item) => item.assigneeIsSelf)
  const partnerStep = project.projectSteps.find((item) => !item.assigneeIsSelf)
  const afterApplicantStep = await call(applicant, 'task.project.step.complete', { taskId: project.id, stepId: applicantStep.id })
  assert.equal(afterApplicantStep.data.sharedPoints, 785)
  const afterPartnerStep = await call(creator, 'task.project.step.complete', { taskId: project.id, stepId: partnerStep.id, note: '登山服已准备' })
  assert.equal(afterPartnerStep.data.sharedPoints, 795)
  const projectCompleted = await call(applicant, 'task.project.complete', { taskId: project.id })
  assert.equal(projectCompleted.data.sharedPoints, 875)
  assert.equal(projectCompleted.data.tasks.find((item) => item.id === project.id).status, 'done')
  const projectCompletedAgain = await call(creator, 'task.project.complete', { taskId: project.id })
  assert.equal(projectCompletedAgain.data.sharedPoints, 875)
  assert.equal(fakeCloud.dump('point_ledgers').filter((item) => ['project_step', 'project_completion'].includes(item.sourceType)).length, 3)

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
  assert.equal(redeemed.data.sharedPoints, 675)
  const creatorSeesSharedRedemption = await call(creator, 'home.summary')
  const partnerVisibleRedemption = creatorSeesSharedRedemption.data.redemptions.find((item) => item.rewardId === movieReward.id)
  assert.equal(partnerVisibleRedemption.status, 'active')
  assert.equal(partnerVisibleRedemption.requesterIsSelf, false)
  await call(applicant, 'reward.redeem', { rewardId: movieReward.id, idempotencyKey: 'redeem-movie-001' })
  await call(applicant, 'reward.redeem', { rewardId: movieReward.id, idempotencyKey: 'redeem-movie-002' })
  const afterDuplicateRedeem = await call(applicant, 'home.summary')
  assert.equal(afterDuplicateRedeem.data.sharedPoints, 675)
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
  assert.equal(afterRefund.data.sharedPoints, 875)
  assert.equal(afterRefund.data.refundStatus, 'approved')

  const createdReward = await call(applicant, 'reward.create', {
    name: '审批奖励', description: '先审批再扣分', cost: 100, pointsType: 'shared',
    expiry: '30 天内', condition: '双方都有空', approvalRequired: true,
  })
  const approvalReward = createdReward.data.rewards.find((item) => item.name === '审批奖励')
  const pendingReward = await call(applicant, 'reward.redeem', { rewardId: approvalReward.id, idempotencyKey: 'approval-reward-001' })
  assert.equal(pendingReward.data.redemptionStatus, 'pending')
  assert.equal(pendingReward.data.sharedPoints, 875)
  await call(creator, 'reward.redeem.review', { approved: true })
  const afterRewardApproval = await call(applicant, 'home.summary')
  assert.equal(afterRewardApproval.data.sharedPoints, 775)
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

  const coupleOnlyCommunity = await call(applicant, 'community.create', { title: '只给我们', content: '一起散步看到晚霞', media: [] })
  const coupleOnlyPost = coupleOnlyCommunity.data.find((item) => item.title === '只给我们')
  assert.equal(coupleOnlyPost.status, 'couple_only')
  const editedCommunity = await call(applicant, 'community.update', { postId: coupleOnlyPost.id, title: '只给我们的晚霞', content: '标题和正文分别编辑', media: [], syncToCommunity: false })
  assert.equal(editedCommunity.data.find((item) => item.id === coupleOnlyPost.id).title, '只给我们的晚霞')
  assert.equal(editedCommunity.data.find((item) => item.id === coupleOnlyPost.id).content, '标题和正文分别编辑')
  const pendingCommunity = await call(applicant, 'community.create', { title: '周末晚霞', content: '一起散步看到很漂亮的晚霞', media: [], syncToCommunity: true })
  const pendingPost = pendingCommunity.data.find((item) => item.title === '周末晚霞')
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
  const privacyEnabled = await call(applicant, 'profile.privacy.update', {
    searchableByCode: true, showPartner: true, showRelationshipDays: true, showHeat: true, showDocumentCount: true, privateMode: true,
  })
  assert.equal(privacyEnabled.data.profile.privacy.showPartner, false)
  const outsiderAfterPrivacy = await call(outsiderCreator, 'community.list')
  assert.equal(outsiderAfterPrivacy.data.some((item) => item.id === pendingPost.id), false)
  const coupleAfterPrivacy = await call(creator, 'community.list')
  assert.equal(coupleAfterPrivacy.data.find((item) => item.id === pendingPost.id).status, 'couple_only')

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

  const beforeBoth = (await call(applicant, 'home.summary')).data.sharedPoints
  const bothCreated = await call(applicant, 'task.create', {
    title: '每天一起喝水', description: '双方都要完成', points: 20,
    assignee: 'both', planType: 'daily', kind: 'recurring', completionRequirement: 'direct',
  })
  const bothTask = bothCreated.data.tasks.find((item) => item.title === '每天一起喝水' && item.isCurrentCycle)
  assert.equal(bothTask.bothRequired, true)
  const applicantCompleted = await call(applicant, 'task.submit', { taskId: bothTask.id })
  const applicantPartial = applicantCompleted.data.tasks.find((item) => item.id === bothTask.id)
  assert.equal(applicantPartial.status, 'partial')
  assert.equal(applicantPartial.selfCompletion.completed, true)
  assert.equal(applicantPartial.partnerCompletion.completed, false)
  assert.equal(applicantCompleted.data.sharedPoints, beforeBoth + 20)
  const duplicateParticipant = await call(applicant, 'task.submit', { taskId: bothTask.id })
  assert.equal(duplicateParticipant.data.sharedPoints, beforeBoth + 20)
  const creatorBeforeComplete = await call(creator, 'home.summary')
  const creatorView = creatorBeforeComplete.data.tasks.find((item) => item.id === bothTask.id)
  assert.equal(creatorView.selfCompletion.completed, false)
  assert.equal(creatorView.partnerCompletion.completed, true)
  const creatorCompleted = await call(creator, 'task.submit', { taskId: bothTask.id })
  assert.equal(creatorCompleted.data.tasks.find((item) => item.id === bothTask.id).status, 'done')
  assert.equal(creatorCompleted.data.sharedPoints, beforeBoth + 40)
  const bothDone = await call(applicant, 'home.summary')
  const bothDoneTask = bothDone.data.tasks.find((item) => item.id === bothTask.id)
  assert.equal(bothDoneTask.selfCompletion.completed, true)
  assert.equal(bothDoneTask.partnerCompletion.completed, true)
  assert.equal(bothDoneTask.dailyHistory.some((item) => item.date === bothTask.cycleKey && item.selfCompleted && item.partnerCompleted), true)
  assert.equal(fakeCloud.dump('point_ledgers').filter((item) => item.sourceType === 'task_participant_completion' && item.sourceId === bothTask.id).length, 2)
  const editedBoth = await call(creator, 'task.update', { taskId: bothTask.id, title: '每天一起喝水', description: '每天各自完成一次', points: 20, completionRequirement: 'direct' })
  const editedBothTask = editedBoth.data.tasks.find((item) => item.id === bothTask.id)
  assert.equal(editedBothTask.description, '每天各自完成一次')
  assert.equal(editedBothTask.activityLogs.some((item) => item.type === 'updated' && item.actorIsSelf), true)
  const photographedBoth = await call(applicant, 'task.media.add', { taskId: bothTask.id, media: [{ type: 'image', fileId: 'cloud://task-photo.jpg' }] })
  assert.equal(photographedBoth.data.tasks.find((item) => item.id === bothTask.id).media.length, 1)
  const projectWithPhoto = await call(creator, 'task.media.add', { taskId: project.id, stepId: project.projectSteps[0].id, media: [{ type: 'image', fileId: 'cloud://step-photo.jpg' }] })
  assert.equal(projectWithPhoto.data.tasks.find((item) => item.id === project.id).projectSteps[0].media.length, 1)

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
  assert.equal(applicantAfterUnbind.data.activeSpaceType, 'personal')
  assert.equal(applicantAfterUnbind.data.personalPoints, 30)
  assert.equal(fakeCloud.dump('point_ledgers').some((item) => item.coupleId === firstCoupleId), true)
  assert.equal(fakeCloud.dump('document_groups').some((item) => item.coupleId === firstCoupleId), true)
  assert.equal(fakeCloud.dump('community_posts').some((item) => item.coupleId === firstCoupleId), true)
  assert.equal(fakeCloud.dump('daily_records').some((item) => item.coupleId === firstCoupleId), true)
  assert.equal(fakeCloud.dump('task_cycles').some((item) => item.coupleId === firstCoupleId), true)
  assert.equal(fakeCloud.dump('unbind_requests').some((item) => item.coupleId === firstCoupleId && item.status === 'approved'), true)
  assert.equal(fakeCloud.dump('couples').some((item) => item._id === firstCoupleId && item.status === 'archived'), true)
  const outsiderAfterCleanup = await call(outsiderCreator, 'home.summary')
  assert.equal(outsiderAfterCleanup.data.bound, true)
})

test('personal spaces stay private and couple heat, chat, share are isolated and idempotent', async () => {
  fakeCloud.reset()
  const solo = 'solo-user'
  await call(solo, 'profile.update', { nickname: '独处', gender: 'private', region: '', hobbies: [], avatarUrl: '' })
  const soloHome = await call(solo, 'home.summary')
  assert.equal(soloHome.data.bound, false)
  assert.equal(soloHome.data.personalPoints, 0)
  const soloTask = await call(solo, 'task.create', { title: '读十页书', description: '', points: 5, taskType: 'personal', assignee: 'self', planType: 'daily' })
  assert.equal(soloTask.ok, true)
  const normalizedPersonalTask = await call(solo, 'task.create', { title: '输入为共同任务', description: '', points: 5, taskType: 'shared', assignee: 'self' })
  assert.equal(normalizedPersonalTask.ok, true)
  assert.equal(normalizedPersonalTask.data.tasks.find((item) => item.title === '输入为共同任务').pointsType, 'personal')
  const soloCommunity = await call(solo, 'community.list')
  assert.equal(soloCommunity.ok, true)

  const a = 'heat-a'
  const b = 'heat-b'
  const outsider = 'heat-outsider'
  const invite = await call(a, 'invite.create')
  await call(b, 'invite.apply', { code: invite.data.inviteCode })
  await call(a, 'invite.review', { approved: true })
  await call(outsider, 'auth.login')

  const initialHeat = await call(a, 'heat.summary')
  assert.equal(initialHeat.data.tasks.length, 5)
  await call(a, 'heat.checkin')
  await call(a, 'heat.checkin')
  const afterDuplicate = await call(b, 'heat.summary')
  assert.equal(afterDuplicate.data.todayHeat, 1)

  const cue = await call(a, 'chat.cue', { type: 'heat_task', title: '记录今日情绪', description: '一起记录', resourceType: 'heat_task', resourceId: 'HF02', actionPath: '/pages/records/edit?type=mood', actionText: '去记录' })
  assert.equal(cue.ok, true)
  const bMessages = await call(b, 'chat.list')
  assert.equal(bMessages.data.messages.length, 1)
  const opened = await call(b, 'chat.open', { messageId: bMessages.data.messages[0].id })
  assert.equal(opened.ok, true)
  await call(b, 'chat.open', { messageId: bMessages.data.messages[0].id })
  const afterOpen = await call(a, 'heat.summary')
  assert.equal(afterOpen.data.tasks.find((item) => item.code === 'HF04').status, 'done')
  assert.equal(afterOpen.data.todayHeat, 3)

  const share = await call(a, 'share.create', { type: 'heat_task', resourceId: 'HF02', targetPath: '/pages/records/edit?type=mood' })
  assert.equal(share.ok, true)
  assert.equal((await call(b, 'share.resolve', { token: share.data.token })).ok, true)
  const denied = await call(outsider, 'share.resolve', { token: share.data.token })
  assert.equal(denied.code, 'SHARE_FORBIDDEN')
})
