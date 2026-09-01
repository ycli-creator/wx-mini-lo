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
  const onboarded = await lovePointsService.updateUsageMode('record')
  assertEqual(onboarded.preferences.onboardingCompleted, true, '首次选择使用方式后应完成引导')
  assertEqual(onboarded.preferences.usageMode, 'record', '记录模式应被保存')

  const personalCreated = await lovePointsService.createTask({
    title: '读完一本书', description: '个人空间任务', points: 120,
    taskType: 'shared', assignee: 'self', planType: 'long_term', kind: 'one_time', completionRequirement: 'note',
  })
  const personalTaskId = personalCreated.selectedTaskId
  assertEqual(personalCreated.tasks.find((item) => item.id === personalTaskId)?.pointsType, 'personal', '个人空间任务只能发个人积分')
  await lovePointsService.submitTask('已经读完', personalTaskId)
  const personalApproved = await lovePointsService.reviewTask(true, personalTaskId)
  assertEqual(personalApproved.personalPoints, 120, '个人任务完成后应发放个人积分')

  const rejectedBinding = await lovePointsService.rejectBinding()
  assertEqual(rejectedBinding.bound, false, '拒绝绑定不应建立情侣关系')
  const bound = await lovePointsService.confirmBinding()
  assertEqual(bound.bound, true, '绑定确认后应进入已绑定状态')
  assertEqual(bound.activeSpaceType, 'couple', '绑定后默认进入情侣空间')
  assertEqual(bound.personalPoints, 120, '绑定不会改变个人空间积分')

  const createdTask = await lovePointsService.createTask({
    title: '自动化共同任务', description: '验证任务创建与共同积分', points: 75,
    taskType: 'personal', assignee: 'self', planType: 'long_term', kind: 'one_time', completionRequirement: 'note',
  })
  const taskId = createdTask.selectedTaskId
  assertEqual(createdTask.tasks.find((item) => item.id === taskId)?.pointsType, 'shared', '情侣空间任务只能发情侣积分')
  await lovePointsService.submitTask('共同任务已完成', taskId)
  const rejectedSharedTask = await lovePointsService.reviewTask(false, taskId, '请补充完成说明')
  assertEqual(rejectedSharedTask.tasks.find((item) => item.id === taskId)?.rejectionReason, '请补充完成说明', '驳回原因应回传给任务执行人')
  await lovePointsService.submitTask('已经补充说明并重新提交', taskId)
  const approvedSharedTask = await lovePointsService.reviewTask(true, taskId)
  assertEqual(approvedSharedTask.sharedPoints, 655, '共同任务通过后应增加情侣积分')
  const approvedAgain = await lovePointsService.reviewTask(true, taskId)
  assertEqual(approvedAgain.sharedPoints, 655, '重复审批不应重复加分')

  const dailyCreated = await lovePointsService.createTask({
    title: '每天拥抱一次', description: '验证每日计划自动更新', points: 15,
    taskType: 'shared', assignee: 'self', planType: 'daily', kind: 'recurring', completionRequirement: 'direct',
  })
  const dailyTask = dailyCreated.tasks.find((item) => item.title === '每天拥抱一次' && item.isCurrentCycle)
  await lovePointsService.submitTask('', dailyTask?.id)
  const pendingDaily = (await lovePointsService.getState()).tasks.find((item) => item.id === dailyTask?.id)
  const nextDay = new Date(new Date(pendingDaily?.periodEnd || '').getTime() + 1000)
  const rolledDaily = rollTaskCycles(pendingDaily ? [pendingDaily] : [], nextDay)
  assertEqual(rolledDaily.some((item) => item.id === pendingDaily?.id && item.status === 'pending'), true, '跨日后旧周期待审批应保留')
  assertEqual(rolledDaily.some((item) => item.isCurrentCycle && item.status === 'todo'), true, '跨日后应生成新的每日待完成周期')

  const projectCreated = await lovePointsService.createTask({
    title: '周末爬山', description: '验证大任务分步完成', points: 100,
    taskType: 'shared', assignee: 'self', planType: 'long_term', kind: 'project', completionRequirement: 'direct',
    projectSteps: [
      { title: '准备食物', assignee: 'self', completionRequirement: 'direct' },
      { title: '准备登山服', assignee: 'self', completionRequirement: 'note' },
    ],
  })
  const projectId = projectCreated.selectedTaskId
  const project = projectCreated.tasks.find((item) => item.id === projectId)
  await lovePointsService.completeProjectStep(projectId, project?.projectSteps[0]?.id || '')
  const afterSecondStep = await lovePointsService.completeProjectStep(projectId, project?.projectSteps[1]?.id || '', '已经准备好')
  assertEqual(afterSecondStep.sharedPoints, 675, '每个大任务环节应发放总奖励的 10%')
  const projectDone = await lovePointsService.completeProject(projectId)
  assertEqual(projectDone.sharedPoints, 755, '全部环节完成后应一次性发放剩余积分')
  const projectDoneAgain = await lovePointsService.completeProject(projectId)
  assertEqual(projectDoneAgain.sharedPoints, 755, '大任务最终奖励只能发放一次')

  const createdReward = await lovePointsService.createReward({
    name: '自动化情侣奖励', description: '验证兑换和退款幂等', cost: 100,
    pointsType: 'personal', expiry: '30 天内', condition: '双方都有空时使用', approvalRequired: false, beneficiaryType: 'couple',
  })
  const rewardId = createdReward.selectedRewardId
  assertEqual(createdReward.rewards.find((item) => item.id === rewardId)?.pointsType, 'shared', '情侣空间奖励只使用情侣积分')
  const redeemed = await lovePointsService.redeemReward(rewardId)
  assertEqual(redeemed.sharedPoints, 655, '兑换应扣除正确的情侣积分')
  const redeemedAgain = await lovePointsService.redeemReward(rewardId)
  assertEqual(redeemedAgain.sharedPoints, 655, '重复兑换不应重复扣分')
  await lovePointsService.requestRefund(rewardId)
  const refunded = await lovePointsService.approveRefund(rewardId)
  assertEqual(refunded.sharedPoints, 755, '退款通过后应返还情侣积分')

  const approvalReward = await lovePointsService.createReward({
    name: '需要审批的奖励', description: '验证先审批后扣分', cost: 50,
    pointsType: 'shared', approvalRequired: true, beneficiaryType: 'partner',
  })
  const approvalRewardId = approvalReward.selectedRewardId
  const waitingApproval = await lovePointsService.redeemReward(approvalRewardId)
  assertEqual(waitingApproval.redemptionStatus, 'pending', '需要审批的奖励应先进入待审批状态')
  assertEqual(waitingApproval.sharedPoints, 755, '审批前不应扣除积分')
  const approvedRedemption = await lovePointsService.reviewRedemption(true, approvalRewardId)
  assertEqual(approvedRedemption.sharedPoints, 705, '审批通过后才应扣除积分')

  const unaffordableReward = await lovePointsService.createReward({
    name: '余额不足审批奖励', description: '审批前也应校验余额', cost: 5000,
    pointsType: 'shared', approvalRequired: true,
  })
  let insufficientRejected = false
  try { await lovePointsService.redeemReward(unaffordableReward.selectedRewardId) }
  catch (error) { insufficientRejected = error instanceof Error && error.message.includes('积分不足') }
  assertEqual(insufficientRejected, true, '需要审批的奖励也应在申请前校验积分余额')

  const coupleOnlyPosts = await lovePointsService.createCommunityPost({ title: '晚霞', content: '一起散步看到晚霞', media: [] })
  assertEqual(coupleOnlyPosts[0]?.status, 'couple_only', '帖子默认只发布到情侣空间')
  const publicPosts = await lovePointsService.createCommunityPost({ title: '周末散步', content: '想把这一刻分享出去', media: [], syncToCommunity: true })
  const communityPostId = publicPosts[0]?.id || ''
  assertEqual(publicPosts[0]?.status, 'pending', '显式同步社区后应等待伴侣确认')
  const publishedPosts = await lovePointsService.reviewCommunityPost(communityPostId, true)
  assertEqual(publishedPosts[0]?.status, 'published', '伴侣同意后帖子才应发布')

  const privateMode = await lovePointsService.updateProfilePrivacy({
    searchableByCode: true, showPartner: true, showRelationshipDays: true, showHeat: true, showDocumentCount: true, privateMode: true,
  })
  assertEqual(privateMode.profile.privacy.showPartner, false, '一键不展示应关闭身份与关系详情')
  assertEqual(privateMode.communityPosts.some((item) => item.status === 'published'), false, '一键不展示应撤回已经公开的帖子')
  const forcedPrivate = await lovePointsService.createCommunityPost({ title: '仅记录', content: '即使勾选公开也保持私密', media: [], syncToCommunity: true })
  assertEqual(forcedPrivate[0]?.status, 'couple_only', '一键不展示时不能同步到社区')

  const privateRecords = await lovePointsService.saveDailyRecord({
    date: '2026-08-25', type: 'period', title: '', note: '第一天', mood: '', periodFlow: 'medium', visibility: 'self',
  })
  assertEqual(privateRecords.some((item) => item.type === 'period' && item.visibility === 'self'), true, '经期记录默认可仅自己可见')

  const personalSpace = await lovePointsService.switchSpace('personal')
  assertEqual(personalSpace.activeSpaceType, 'personal', '绑定后仍可切回个人空间')
  const visiblePersonal = await lovePointsService.getState()
  assertEqual(visiblePersonal.tasks.some((item) => item.id === projectId), false, '个人空间不展示情侣大任务')
  assertEqual(visiblePersonal.personalPoints, 120, '个人空间积分不受情侣空间兑换影响')
  const personalReward = await lovePointsService.createReward({
    name: '给自己买束花', description: '个人奖励', cost: 50,
    pointsType: 'shared', approvalRequired: true, beneficiaryType: 'couple',
  })
  const personalRewardItem = personalReward.rewards.find((item) => item.id === personalReward.selectedRewardId)
  assertEqual(personalRewardItem?.pointsType, 'personal', '个人空间奖励只能使用个人积分')
  assertEqual(personalRewardItem?.beneficiaryType, 'self', '个人空间奖励只能属于自己')
  const personalRedeemed = await lovePointsService.redeemReward(personalReward.selectedRewardId)
  assertEqual(personalRedeemed.personalPoints, 70, '个人奖励只扣除个人积分')

  const document = await lovePointsService.saveDocument('测试文档', '测试正文')
  const documentDetail = await lovePointsService.getDocument(document.selectedDocumentId)
  assertEqual(documentDetail.document.body, '测试正文', '按文档编号应读取完整正文')

  await lovePointsService.switchSpace('couple')
  const beforeBothPoints = (await lovePointsService.getState()).sharedPoints
  const bothCreated = await lovePointsService.createTask({
    title: '每天一起喝水', description: '双方都要完成', points: 20,
    taskType: 'shared', assignee: 'both', planType: 'daily', kind: 'recurring', completionRequirement: 'direct',
  })
  const bothTask = bothCreated.tasks.find((item) => item.title === '每天一起喝水' && item.isCurrentCycle)
  assertEqual(bothTask?.bothRequired, true, '双方每日待办应记录双方完成模式')
  const afterSelfBoth = await lovePointsService.submitTask('', bothTask?.id)
  const partialBoth = afterSelfBoth.tasks.find((item) => item.id === bothTask?.id)
  assertEqual(partialBoth?.status, 'partial', '一人完成后待办应显示完成一半')
  assertEqual(partialBoth?.selfCompletion.completed, true, '应记录本人完成情况')
  assertEqual(afterSelfBoth.sharedPoints, beforeBothPoints + 20, '本人完成双方待办后应立即发放积分')
  const duplicateBoth = await lovePointsService.submitTask('', bothTask?.id)
  assertEqual(duplicateBoth.sharedPoints, beforeBothPoints + 20, '重复完成双方待办不应重复发分')
  const editedBoth = await lovePointsService.updateTask(bothTask?.id || '', { title: '每天一起喝水', description: '每天各自完成一次', points: 20, completionRequirement: 'direct' })
  assertEqual(editedBoth.tasks.find((item) => item.id === bothTask?.id)?.activityLogs.some((item) => item.type === 'updated'), true, '编辑待办应写入修改日志')
  const withTaskPhoto = await lovePointsService.addTaskPhotos(bothTask?.id || '', [{ type: 'image', fileId: 'local-task-photo.jpg' }])
  assertEqual(withTaskPhoto.tasks.find((item) => item.id === bothTask?.id)?.media.length, 1, '双方都可为待办添加照片')
  const unbindRequested = await lovePointsService.requestUnbind()
  assertEqual(unbindRequested.unbindRequested, true, '发起解绑时不应立即清空数据')
  const cancelled = await lovePointsService.cancelUnbind()
  assertEqual(cancelled.bound, true, '取消解绑后仍应绑定')
  await lovePointsService.requestUnbind()
  const unbound = await lovePointsService.approveUnbind()
  assertEqual(unbound.bound, false, '双方同意后应解除绑定')
  assertEqual(unbound.activeSpaceType, 'personal', '解绑后应回到个人空间')
  assertEqual(unbound.personalPoints, 70, '解绑后应保留个人空间积分')
  assertEqual(unbound.profile.nickname, '林悦', '解绑后应保留个人资料')

  console.log('核心流程测试通过：引导、空间隔离、任务、项目任务、奖励、社区隐私、记录、文档与解绑。')
}

void run()
