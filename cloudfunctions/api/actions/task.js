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
  const taskType = payload.taskType === 'shared' ? 'shared' : 'personal'
  const planType = normalizePlanType(payload.planType)
  assert(title, 'INVALID_TITLE', '请填写任务名称')
  assert(title.length <= 60 && description.length <= 200, 'TASK_TOO_LONG', '任务名称或说明超过长度限制')
  assert(Number.isInteger(points) && points > 0 && points <= 10000, 'INVALID_POINTS', '任务积分必须是 1–10000 的整数')
  assert(spaceType !== 'personal' || (taskType === 'personal' && payload.assignee !== 'partner'), 'COUPLE_REQUIRED', '绑定 TA 后才能创建共同任务或指定伴侣完成')
  const taskId = makeId('task')
  const partnerAssigned = payload.assignee === 'partner' || payload.assigneeOpenId === partnerId
  const createdAt = now()
  const task = {
    _id: taskId,
    coupleId,
    title,
    description,
    taskType,
    pointsType: taskType === 'shared' ? 'shared' : 'personal',
    points,
    planType,
    timezone: 'Asia/Shanghai',
    enabled: true,
    startDate: taskCycleWindow('daily', createdAt).cycleKey,
    assigneeOpenId: partnerAssigned ? partnerId : openid,
    reviewerOpenId: partnerAssigned ? openid : partnerId,
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
  const { coupleId } = await requireSpace(openid)
  const note = String(payload.note || '').trim()
  assert(note, 'INVALID_NOTE', '请填写完成说明')
  assert(note.length <= 1000, 'NOTE_TOO_LONG', '完成说明不能超过 1000 个字')
  const referenceId = String(payload.taskCycleId || payload.taskId || '')
  const { task, cycle } = await resolveTaskCycle(coupleId, referenceId, (candidate, item) =>
    candidate.assigneeOpenId === openid && ['todo', 'rejected'].includes(item.status))
  assert(task && cycle, 'TASK_NOT_FOUND', '没有可提交的任务')
  assert(task.assigneeOpenId === openid, 'FORBIDDEN', '只有任务执行人可以提交')
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
      status: 'pending',
      reviewerOpenId: task.reviewerOpenId,
      reviewedAt: null,
      createdAt: now(),
      updatedAt: now(),
    } })
    await transaction.collection(collections.taskCycles).doc(cycle._id).update({
      data: { status: 'pending', latestSubmissionId: submissionId, latestNote: note, rejectionReason: '', updatedAt: now() },
    })
  })
  await writeOperationLog({ coupleId, openid, action: 'task.submit', targetId: cycle._id })
  if (task.reviewerOpenId !== openid) await createNotification({ recipientOpenId: task.reviewerOpenId, coupleId, type: 'task', title: '任务待审批', body: `“${task.title}”已经提交完成`, actionPath: '/pages/task/index', sourceId: cycle._id })
  return projectState(openid)
}

const review = async ({ openid, payload }) => {
  const { coupleId } = await requireSpace(openid)
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
  if (payload.approved) {
    await heat.grant({ openid, code: 'HF03', participantOpenId: task.assigneeOpenId, businessResourceId: cycle._id })
    if (task.taskType === 'shared') await heat.grant({ openid, code: 'HR01', businessResourceId: cycle._id })
  }
  return projectState(openid)
}

module.exports = { list, create, submit, review }
