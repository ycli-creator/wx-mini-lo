const {
  db, collections, now, makeId, requireSpace, projectState, writeOperationLog, createNotification,
  normalizePlanType, taskCycleWindow, ensureTaskCycles,
} = require('../lib/shared')
const { assert } = require('../lib/errors')
const heat = require('./heat')

const loadTaskDocuments = async (coupleId) => {
  const result = await db.collection(collections.tasks).where({ coupleId, deleted: false }).orderBy('createdAt', 'asc').limit(100).get()
  return result.data
}

const resolveTaskCycle = async (coupleId, referenceId, predicate = () => true) => {
  const tasks = await loadTaskDocuments(coupleId)
  const taskById = new Map(tasks.map((task) => [task._id, task]))
  const cycles = await ensureTaskCycles(tasks, coupleId)
  let cycle = referenceId ? cycles.find((item) => item._id === referenceId) : null
  if (!cycle && referenceId && taskById.has(referenceId)) {
    const task = taskById.get(referenceId)
    const currentKey = taskCycleWindow(task.planType).cycleKey
    cycle = cycles.find((item) => item.taskId === task._id && item.cycleKey === currentKey) || null
  }
  if (!cycle && !referenceId) cycle = cycles.find((item) => {
    const task = taskById.get(item.taskId)
    return task && predicate(task, item)
  }) || null
  const task = cycle ? taskById.get(cycle.taskId) : null
  return { task, cycle }
}

const list = async ({ openid }) => projectState(openid)

const create = async ({ openid, payload }) => {
  const { coupleId, partnerId, spaceType } = await requireSpace(openid)
  const title = String(payload.title || '').trim()
  const description = String(payload.description || '').trim()
  const points = Number(payload.points)
  const kind = payload.kind === 'project' ? 'project' : payload.kind === 'recurring' || ['daily', 'weekly'].includes(payload.planType) ? 'recurring' : 'one_time'
  const taskType = spaceType === 'couple' ? 'shared' : 'personal'
  const planType = kind === 'project' || kind === 'one_time' ? 'long_term' : payload.planType === 'weekly' ? 'weekly' : 'daily'
  const completionRequirement = ['direct', 'note', 'image'].includes(payload.completionRequirement) ? payload.completionRequirement : 'note'
  assert(title, 'INVALID_TITLE', '请填写任务名称')
  assert(title.length <= 60 && description.length <= 200, 'TASK_TOO_LONG', '任务名称或说明超过长度限制')
  assert(Number.isInteger(points) && points > 0 && points <= 10000, 'INVALID_POINTS', '任务积分必须是 1–10000 的整数')
  assert(spaceType !== 'personal' || (taskType === 'personal' && payload.assignee !== 'partner'), 'COUPLE_REQUIRED', '绑定 TA 后才能创建共同任务或指定伴侣完成')
  assert(kind !== 'project' || spaceType === 'couple', 'COUPLE_REQUIRED', '大任务只能创建在情侣空间')
  const rawSteps = Array.isArray(payload.projectSteps) ? payload.projectSteps : []
  assert(kind !== 'project' || (rawSteps.length >= 2 && rawSteps.length <= 8), 'PROJECT_STEP_COUNT', '大任务需要设置 2–8 个环节')
  const taskId = makeId('task')
  const partnerAssigned = payload.assignee === 'partner' || payload.assigneeOpenId === partnerId
  const createdAt = now()
  const projectSteps = rawSteps.map((step, index) => {
    const stepTitle = String(step?.title || '').trim()
    assert(stepTitle && stepTitle.length <= 60, 'PROJECT_STEP_INVALID', '每个大任务环节都需要填写名称，且不能超过 60 个字')
    return {
      id: `${taskId}_step_${index + 1}`,
      title: stepTitle,
      description: String(step?.description || '').trim().slice(0, 200),
      assigneeOpenId: step?.assignee === 'partner' ? partnerId : openid,
      completionRequirement: ['direct', 'note', 'image'].includes(step?.completionRequirement) ? step.completionRequirement : 'direct',
      status: 'todo',
      completedBy: null,
      completedAt: null,
      note: '',
      evidence: [],
      rewardPoints: Math.floor(points * 0.1),
    }
  })
  const task = {
    _id: taskId,
    coupleId,
    title,
    description,
    taskType,
    pointsType: taskType === 'shared' ? 'shared' : 'personal',
    points,
    kind,
    completionRequirement,
    projectSteps,
    projectFinalized: false,
    planType,
    timezone: 'Asia/Shanghai',
    enabled: true,
    startDate: taskCycleWindow('daily', createdAt).cycleKey,
    assigneeOpenId: partnerAssigned ? partnerId : openid,
    reviewerOpenId: partnerAssigned ? openid : partnerId || openid,
    status: 'todo',
    latestSubmissionId: null,
    latestNote: '',
    rejectionReason: '',
    deleted: false,
    createdBy: openid,
    createdAt,
    updatedAt: createdAt,
  }
  const { _id, ...data } = task
  await db.collection(collections.tasks).doc(taskId).set({ data })
  await ensureTaskCycles([task], coupleId, createdAt)
  await writeOperationLog({ coupleId, openid, action: 'task.create', targetId: taskId })
  return projectState(openid)
}

const submit = async ({ openid, payload }) => {
  const { coupleId, spaceType } = await requireSpace(openid)
  const note = String(payload.note || '').trim()
  assert(note.length <= 1000, 'NOTE_TOO_LONG', '完成说明不能超过 1000 个字')
  const evidence = Array.isArray(payload.evidence) ? payload.evidence.slice(0, 9) : []
  const referenceId = String(payload.taskCycleId || payload.taskId || '')
  const { task, cycle } = await resolveTaskCycle(coupleId, referenceId, (candidate, item) =>
    candidate.assigneeOpenId === openid && ['todo', 'rejected'].includes(item.status))
  assert(task && cycle, 'TASK_NOT_FOUND', '没有可提交的任务')
  assert(task.kind !== 'project', 'PROJECT_STEP_REQUIRED', '请进入大任务详情完成具体环节')
  assert(task.assigneeOpenId === openid, 'FORBIDDEN', '只有任务执行人可以提交')
  const completionRequirement = ['direct', 'note', 'image'].includes(task.completionRequirement) ? task.completionRequirement : 'note'
  assert(completionRequirement !== 'note' || note, 'INVALID_NOTE', '请填写完成说明')
  assert(completionRequirement !== 'image' || evidence.length, 'TASK_EVIDENCE_REQUIRED', '请至少上传一张完成图片')
  const planType = normalizePlanType(task.planType)
  assert(planType === 'long_term' || cycle.cycleKey === taskCycleWindow(planType).cycleKey, 'TASK_CYCLE_ENDED', '这个周期已经结束，不能补交')

  const submissionId = makeId('submission')
  await db.runTransaction(async (transaction) => {
    const latestCycle = (await transaction.collection(collections.taskCycles).doc(cycle._id).get()).data
    assert(latestCycle && ['todo', 'rejected'].includes(latestCycle.status), 'TASK_STATE_CHANGED', '任务状态已变化，请刷新后重试')
    await transaction.collection(collections.submissions).doc(submissionId).set({ data: {
      coupleId,
      taskId: task._id,
      taskCycleId: cycle._id,
      cycleKey: cycle.cycleKey,
      submitterOpenId: openid,
      note,
      evidence,
      status: 'pending',
      reviewerOpenId: task.reviewerOpenId,
      reviewedAt: null,
      createdAt: now(),
      updatedAt: now(),
    } })
    await transaction.collection(collections.taskCycles).doc(cycle._id).update({
      data: { status: 'pending', latestSubmissionId: submissionId, latestNote: note, evidence, rejectionReason: '', updatedAt: now() },
    })
  })
  await writeOperationLog({ coupleId, openid, action: 'task.submit', targetId: cycle._id })
  if (task.reviewerOpenId !== openid) await createNotification({ recipientOpenId: task.reviewerOpenId, coupleId, type: 'task', title: '任务待审批', body: `“${task.title}”已经提交完成`, actionPath: '/pages/task/index', sourceId: cycle._id })
  if (spaceType === 'personal' && task.reviewerOpenId === openid) return review({ openid, payload: { taskId: cycle._id, approved: true } })
  return projectState(openid)
}

const completeProjectStep = async ({ openid, payload }) => {
  const { coupleId, partnerId, spaceType } = await requireSpace(openid)
  assert(spaceType === 'couple', 'COUPLE_REQUIRED', '大任务只能在情侣空间完成')
  const referenceId = String(payload.taskId || '')
  const { task } = await resolveTaskCycle(coupleId, referenceId)
  assert(task && task.kind === 'project', 'PROJECT_NOT_FOUND', '大任务不存在')
  const stepId = String(payload.stepId || '')
  const step = (task.projectSteps || []).find((item) => item.id === stepId)
  assert(step, 'PROJECT_STEP_NOT_FOUND', '任务环节不存在')
  assert(step.assigneeOpenId === openid, 'FORBIDDEN', '这个环节由 TA 完成')
  if (step.status === 'done') return projectState(openid)
  const note = String(payload.note || '').trim()
  const evidence = Array.isArray(payload.evidence) ? payload.evidence.slice(0, 9) : []
  assert(step.completionRequirement !== 'note' || note, 'INVALID_NOTE', '请填写完成说明')
  assert(step.completionRequirement !== 'image' || evidence.length, 'TASK_EVIDENCE_REQUIRED', '请至少上传一张完成图片')
  const rewardPoints = Number(step.rewardPoints || Math.floor(Number(task.points || 0) * 0.1))
  const ledgerId = `ledger_project_step_${task._id}_${step.id}`

  await db.runTransaction(async (transaction) => {
    const latestTask = (await transaction.collection(collections.tasks).doc(task._id).get()).data
    const latestSteps = Array.isArray(latestTask.projectSteps) ? latestTask.projectSteps : []
    const latestStep = latestSteps.find((item) => item.id === step.id)
    if (!latestStep || latestStep.status === 'done') return
    const account = (await transaction.collection(collections.accounts).doc(coupleId).get()).data
    assert(account, 'ACCOUNT_NOT_FOUND', '积分账户不存在')
    const balanceAfter = Number(account.sharedBalance || 0) + rewardPoints
    const updatedSteps = latestSteps.map((item) => item.id === step.id ? { ...item, status: 'done', completedBy: openid, completedAt: now(), note, evidence } : item)
    await transaction.collection(collections.accounts).doc(coupleId).update({ data: { sharedBalance: balanceAfter, updatedAt: now() } })
    await transaction.collection(collections.ledgers).doc(ledgerId).set({ data: {
      coupleId, accountOwnerOpenId: null, pointsType: 'shared', direction: 'credit', amount: rewardPoints, balanceAfter,
      sourceType: 'project_step', sourceId: step.id, actorOpenId: openid, title: `${task.title} · ${step.title}`,
      detail: '完成大任务环节', idempotencyKey: ledgerId, createdAt: now(),
    } })
    await transaction.collection(collections.tasks).doc(task._id).update({ data: { projectSteps: updatedSteps, updatedAt: now() } })
  })
  await writeOperationLog({ coupleId, openid, action: 'task.project.step.complete', targetId: step.id })
  if (partnerId) await createNotification({ recipientOpenId: partnerId, coupleId, type: 'task', title: '共同计划有新进展', body: `${task.title} · ${step.title} 已完成`, actionPath: '/pages/task/index', sourceId: task._id })
  return projectState(openid)
}

const completeProject = async ({ openid, payload }) => {
  const { coupleId, partnerId, spaceType } = await requireSpace(openid)
  assert(spaceType === 'couple', 'COUPLE_REQUIRED', '大任务只能在情侣空间完成')
  const { task, cycle } = await resolveTaskCycle(coupleId, String(payload.taskId || ''))
  assert(task && cycle && task.kind === 'project', 'PROJECT_NOT_FOUND', '大任务不存在')
  assert((task.projectSteps || []).length >= 2 && task.projectSteps.every((step) => step.status === 'done'), 'PROJECT_NOT_READY', '完成所有环节后才能结束大任务')
  if (task.projectFinalized || cycle.status === 'approved') return projectState(openid)
  const stepPoints = task.projectSteps.reduce((sum, step) => sum + Number(step.rewardPoints || 0), 0)
  const remaining = Math.max(0, Number(task.points || 0) - stepPoints)
  const ledgerId = `ledger_project_final_${task._id}`
  await db.runTransaction(async (transaction) => {
    const latestTask = (await transaction.collection(collections.tasks).doc(task._id).get()).data
    if (latestTask.projectFinalized) return
    assert((latestTask.projectSteps || []).every((step) => step.status === 'done'), 'PROJECT_NOT_READY', '完成所有环节后才能结束大任务')
    const account = (await transaction.collection(collections.accounts).doc(coupleId).get()).data
    const balanceAfter = Number(account.sharedBalance || 0) + remaining
    await transaction.collection(collections.accounts).doc(coupleId).update({ data: { sharedBalance: balanceAfter, updatedAt: now() } })
    await transaction.collection(collections.ledgers).doc(ledgerId).set({ data: {
      coupleId, accountOwnerOpenId: null, pointsType: 'shared', direction: 'credit', amount: remaining, balanceAfter,
      sourceType: 'project_completion', sourceId: task._id, actorOpenId: openid, title: task.title,
      detail: '共同计划全部完成', idempotencyKey: ledgerId, createdAt: now(),
    } })
    await transaction.collection(collections.tasks).doc(task._id).update({ data: { projectFinalized: true, status: 'approved', updatedAt: now() } })
    await transaction.collection(collections.taskCycles).doc(cycle._id).update({ data: { status: 'approved', settledAt: now(), updatedAt: now() } })
  })
  await writeOperationLog({ coupleId, openid, action: 'task.project.complete', targetId: task._id })
  if (partnerId) await createNotification({ recipientOpenId: partnerId, coupleId, type: 'task', title: '共同计划已完成', body: `“${task.title}”的剩余积分已经发放`, actionPath: '/pages/task/index', sourceId: task._id })
  return projectState(openid)
}

const review = async ({ openid, payload }) => {
  const { coupleId, spaceType } = await requireSpace(openid)
  const referenceId = String(payload.taskCycleId || payload.taskId || '')
  const { task, cycle } = await resolveTaskCycle(coupleId, referenceId, (candidate, item) =>
    candidate.reviewerOpenId === openid && item.status === 'pending')
  if (!task || !cycle) return projectState(openid)
  assert(task.reviewerOpenId === openid, 'FORBIDDEN', '只有指定审批人可以处理任务')
  if (cycle.status === 'approved') return projectState(openid)
  assert(cycle.latestSubmissionId, 'SUBMISSION_NOT_FOUND', '找不到任务提交记录')

  await db.runTransaction(async (transaction) => {
    const latestCycle = (await transaction.collection(collections.taskCycles).doc(cycle._id).get()).data
    if (latestCycle.status !== 'pending') return
    const submission = (await transaction.collection(collections.submissions).doc(latestCycle.latestSubmissionId).get()).data
    assert(submission?.status === 'pending', 'SUBMISSION_ALREADY_HANDLED', '该提交已经处理')
    if (!payload.approved) {
      const rejectionReason = String(payload.reason || '').trim()
      assert(rejectionReason.length <= 300, 'REJECTION_REASON_TOO_LONG', '驳回原因不能超过 300 个字')
      await transaction.collection(collections.submissions).doc(submission._id).update({
        data: { status: 'rejected', reviewerOpenId: openid, rejectionReason, reviewedAt: now(), updatedAt: now() },
      })
      await transaction.collection(collections.taskCycles).doc(cycle._id).update({ data: { status: 'rejected', rejectionReason, updatedAt: now() } })
      return
    }

    const account = (await transaction.collection(collections.accounts).doc(coupleId).get()).data
    assert(account, 'ACCOUNT_NOT_FOUND', '积分账户不存在')
    const ledgerId = `ledger_task_${submission._id}`
    let balanceAfter
    const personalBalances = { ...(account.personalBalances || {}) }
    if (task.pointsType === 'shared') {
      balanceAfter = Number(account.sharedBalance || 0) + task.points
      await transaction.collection(collections.accounts).doc(coupleId).update({ data: { sharedBalance: balanceAfter, updatedAt: now() } })
    } else {
      balanceAfter = Number(personalBalances[task.assigneeOpenId] || 0) + task.points
      personalBalances[task.assigneeOpenId] = balanceAfter
      await transaction.collection(collections.accounts).doc(coupleId).update({ data: { personalBalances, updatedAt: now() } })
    }
    await transaction.collection(collections.ledgers).doc(ledgerId).set({ data: {
      coupleId,
      accountOwnerOpenId: task.pointsType === 'personal' ? task.assigneeOpenId : null,
      pointsType: task.pointsType,
      direction: 'credit',
      amount: task.points,
      balanceAfter,
      sourceType: 'task_approval',
      sourceId: submission._id,
      actorOpenId: openid,
      title: task.title,
      detail: `${cycle.cycleLabel || cycle.cycleKey}计划审批通过`,
      idempotencyKey: ledgerId,
      createdAt: now(),
    } })
    await transaction.collection(collections.submissions).doc(submission._id).update({ data: { status: 'approved', reviewerOpenId: openid, reviewedAt: now(), updatedAt: now() } })
    await transaction.collection(collections.taskCycles).doc(cycle._id).update({ data: { status: 'approved', rejectionReason: '', settledAt: now(), updatedAt: now() } })
  })
  await writeOperationLog({ coupleId, openid, action: payload.approved ? 'task.review.approve' : 'task.review.reject', targetId: cycle._id })
  if (task.assigneeOpenId !== openid) await createNotification({ recipientOpenId: task.assigneeOpenId, coupleId, type: 'task', title: payload.approved ? '任务已通过' : '任务被驳回', body: `“${task.title}”的审批结果已更新`, actionPath: '/pages/task/index', sourceId: cycle._id })
  if (payload.approved && spaceType === 'couple') {
    await heat.grant({ openid, code: 'HF03', participantOpenId: task.assigneeOpenId, businessResourceId: cycle._id })
    if (task.taskType === 'shared') await heat.grant({ openid, code: 'HR01', businessResourceId: cycle._id })
  }
  return projectState(openid)
}

module.exports = { list, create, submit, review, completeProjectStep, completeProject }
