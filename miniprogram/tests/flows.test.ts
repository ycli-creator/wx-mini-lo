const storage = new Map<string, unknown>()

Object.assign(globalThis, {
  __LOVE_POINTS_FORCE_LOCAL__: true,
  wx: {
    getStorageSync(key: string) { return storage.get(key) },
    setStorageSync(key: string, value: unknown) { storage.set(key, value) },
    removeStorageSync(key: string) { storage.delete(key) },
    cloud: { callFunction: async () => { throw new Error('测试不应调用云函数') } },
  },
})

const assertEqual = (actual: unknown, expected: unknown, message: string) => {
  if (actual !== expected) throw new Error(`${message}：期望 ${String(expected)}，实际 ${String(actual)}`)
}

const run = async () => {
  const { resetState, rollTaskCycles } = await import('../store/state')
  const { lovePointsService } = await import('../services/love-points')

  resetState()

const profile = await lovePointsService.updateProfile({
  nickname: '林悦', avatarUrl: '', gender: 'female', region: '上海', hobbies: ['旅行', '电影'],
})
assertEqual(profile.profileComplete, true, '首次保存资料后应完成个人信息')
assertEqual(profile.profile.nickname, '林悦', '个人用户名应保存')

const rejectedBinding = await lovePointsService.rejectBinding()
assertEqual(rejectedBinding.bound, false, '拒绝绑定不应建立情侣关系')

const bound = await lovePointsService.confirmBinding()
assertEqual(bound.bound, true, '绑定确认后应进入已绑定状态')

const submitted = await lovePointsService.submitTask('自动化测试提交')
assertEqual(submitted.taskStatus, 'pending', '提交任务后应等待审批')

const approved = await lovePointsService.reviewTask(true)
assertEqual(approved.taskStatus, 'done', '审批通过后任务应完成')
assertEqual(approved.personalPoints, 440, '审批通过后应增加 120 个人积分')
assertEqual(approved.ledger.filter((item) => item.title === '一起完成晚餐' && item.amount === 120).length, 1, '审批只应生成一条流水')

const approvedAgain = await lovePointsService.reviewTask(true)
assertEqual(approvedAgain.personalPoints, 440, '重复审批不应重复加分')
assertEqual(approvedAgain.ledger.filter((item) => item.title === '一起完成晚餐' && item.amount === 120).length, 1, '重复审批不应重复生成流水')

const createdTask = await lovePointsService.createTask({
  title: '自动化共同任务',
  description: '验证任务创建与共同积分',
  points: 75,
  taskType: 'shared',
  assignee: 'self',
  planType: 'long_term',
})
const taskId = createdTask.selectedTaskId
assertEqual(createdTask.tasks.some((item) => item.id === taskId), true, '新任务应进入任务列表')
await lovePointsService.submitTask('共同任务已完成', taskId)
const rejectedSharedTask = await lovePointsService.reviewTask(false, taskId, '请补充完成说明')
assertEqual(rejectedSharedTask.tasks.find((item) => item.id === taskId)?.rejectionReason, '请补充完成说明', '驳回原因应回传给任务执行人')
await lovePointsService.submitTask('已经补充说明并重新提交', taskId)
const approvedSharedTask = await lovePointsService.reviewTask(true, taskId)
assertEqual(approvedSharedTask.sharedPoints, 655, '共同任务通过后应增加共同积分')

const dailyCreated = await lovePointsService.createTask({
  title: '每天拥抱一次', description: '验证每日计划自动更新', points: 15,
  taskType: 'shared', assignee: 'self', planType: 'daily',
})
const dailyTask = dailyCreated.tasks.find((item) => item.title === '每天拥抱一次' && item.isCurrentCycle)
assertEqual(dailyTask?.planType, 'daily', '每日计划应保存正确分类')
await lovePointsService.submitTask('今天已完成', dailyTask?.id)
const pendingDaily = (await lovePointsService.getState()).tasks.find((item) => item.id === dailyTask?.id)
const nextDay = new Date(new Date(pendingDaily?.periodEnd || '').getTime() + 1000)
const rolledDaily = rollTaskCycles(pendingDaily ? [pendingDaily] : [], nextDay)
assertEqual(rolledDaily.some((item) => item.id === pendingDaily?.id && item.status === 'pending'), true, '跨日后旧周期待审批应保留')
assertEqual(rolledDaily.some((item) => item.isCurrentCycle && item.status === 'todo'), true, '跨日后应生成新的每日待完成周期')

const created = await lovePointsService.createReward({
  name: '自动化测试奖励',
  description: '验证兑换和退款幂等',
  cost: 100,
  pointsType: 'personal',
  expiry: '30 天内',
  condition: '双方都有空时使用',
  approvalRequired: false,
})
const rewardId = created.selectedRewardId

const redeemed = await lovePointsService.redeemReward(rewardId)
assertEqual(redeemed.personalPoints, 340, '兑换应扣除正确的个人积分')
assertEqual(redeemed.redeemedRewardId, rewardId, '兑换记录应关联奖励')

const redeemedAgain = await lovePointsService.redeemReward(rewardId)
assertEqual(redeemedAgain.personalPoints, 340, '重复兑换不应重复扣分')

await lovePointsService.requestRefund()
const refunded = await lovePointsService.approveRefund()
assertEqual(refunded.personalPoints, 440, '退款通过后应返还积分')
assertEqual(refunded.refundStatus, 'approved', '退款状态应更新为已通过')

const refundedAgain = await lovePointsService.approveRefund()
assertEqual(refundedAgain.personalPoints, 440, '重复处理退款不应重复返还积分')

const approvalReward = await lovePointsService.createReward({
  name: '需要审批的奖励',
  description: '验证先审批后扣分',
  cost: 50,
  pointsType: 'shared',
  approvalRequired: true,
})
const approvalRewardId = approvalReward.selectedRewardId
const waitingApproval = await lovePointsService.redeemReward(approvalRewardId)
assertEqual(waitingApproval.redemptionStatus, 'pending', '需要审批的奖励应先进入待审批状态')
assertEqual(waitingApproval.sharedPoints, 655, '审批前不应扣除积分')
const approvedRedemption = await lovePointsService.reviewRedemption(true)
assertEqual(approvedRedemption.sharedPoints, 605, '审批通过后才应扣除积分')
assertEqual(approvedRedemption.redemptions.some((item) => item.rewardId === rewardId && item.status === 'refunded'), true, '已退款奖励应保留独立状态')
assertEqual(approvedRedemption.redemptions.some((item) => item.rewardId === approvalRewardId && item.status === 'active'), true, '多个奖励应分别保存兑换状态')

const unaffordableReward = await lovePointsService.createReward({
  name: '余额不足审批奖励',
  description: '审批前也应校验余额',
  cost: 5000,
  pointsType: 'shared',
  approvalRequired: true,
})
let insufficientRejected = false
try {
  await lovePointsService.redeemReward(unaffordableReward.selectedRewardId)
} catch (error) {
  insufficientRejected = error instanceof Error && error.message.includes('积分不足')
}
assertEqual(insufficientRejected, true, '需要审批的奖励也应在申请前校验积分余额')

const document = await lovePointsService.saveDocument('测试文档', '测试正文')
assertEqual(document.documentTitle, '测试文档', '文档标题应保存')
assertEqual(document.documentBody, '测试正文', '文档正文应保存')
const documentDetail = await lovePointsService.getDocument(document.selectedDocumentId)
assertEqual(documentDetail.document.body, '测试正文', '按文档编号应读取完整正文')

const grouped = await lovePointsService.createDocumentGroup('自动化分组')
const groupId = grouped.documentGroups.find((item) => item.name === '自动化分组')?.id || ''
assertEqual(Boolean(groupId), true, '应能创建文档组')
const newDocument = await lovePointsService.saveDocument('分组文档', '新建文档正文', undefined, groupId)
assertEqual(newDocument.documents.some((item) => item.groupId === groupId && item.title === '分组文档'), true, '新文档应保存到指定分组')

const communityPosts = await lovePointsService.createCommunityPost({ content: '一起散步看到晚霞', media: [] })
const communityPostId = communityPosts[0]?.id || ''
assertEqual(communityPosts[0]?.status, 'pending', '帖子提交后应等待伴侣确认')
const publishedPosts = await lovePointsService.reviewCommunityPost(communityPostId, true)
assertEqual(publishedPosts[0]?.status, 'published', '伴侣同意后帖子才应发布')

const privateRecords = await lovePointsService.saveDailyRecord({
  date: '2026-08-25', type: 'period', title: '', note: '第一天', mood: '', periodFlow: 'medium', visibility: 'self',
})
assertEqual(privateRecords.some((item) => item.type === 'period' && item.visibility === 'self'), true, '经期记录默认可仅自己可见')
const sharedRecords = await lovePointsService.saveDailyRecord({
  date: '2026-08-25', type: 'event', title: '一起看展', note: '很开心', mood: '', periodFlow: '', visibility: 'couple',
})
assertEqual(sharedRecords.some((item) => item.title === '一起看展' && item.visibility === 'couple'), true, '生活事件可与伴侣共享')

const unbindRequested = await lovePointsService.requestUnbind()
assertEqual(unbindRequested.unbindRequested, true, '发起解绑时不应立即清空数据')
assertEqual(unbindRequested.bound, true, '等待确认时仍应保持绑定')

const cancelled = await lovePointsService.cancelUnbind()
assertEqual(cancelled.unbindRequested, false, '取消解绑后关系应保持')
assertEqual(cancelled.bound, true, '取消解绑后仍应绑定')

await lovePointsService.requestUnbind()
const unbound = await lovePointsService.approveUnbind()
assertEqual(unbound.bound, false, '双方同意后应解除绑定')
assertEqual(unbound.personalPoints, 320, '解绑后应清空情侣空间并恢复体验初始数据')
assertEqual(unbound.profile.nickname, '林悦', '解绑后应保留个人资料')

  console.log('核心流程测试通过：个人资料、绑定、任务幂等、奖励、社区确认、生活记录、文档与双向解绑。')
}

void run()
