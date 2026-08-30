const {
  db, collections, now, makeId, getDoc, queryOne, requireSpace, projectState, writeOperationLog,
} = require('../lib/shared')
const { assert } = require('../lib/errors')
const heat = require('./heat')

const list = async ({ openid }) => {
  const { coupleId } = await requireSpace(openid)
  const [groups, documents] = await Promise.all([
    db.collection(collections.documentGroups).where({ coupleId }).orderBy('order', 'asc').limit(50).get(),
    db.collection(collections.documents).where({ coupleId, deleted: false }).orderBy('updatedAt', 'desc').limit(100).get(),
  ])
  return {
    groups: groups.data.map((group) => ({ id: group._id, name: group.name, order: Number(group.order || 0) })),
    documents: documents.data.map((item) => ({ id: item._id, groupId: item.groupId || '', title: item.title })),
  }
}

const detail = async ({ openid, payload }) => {
  const { coupleId } = await requireSpace(openid)
  const document = await getDoc(collections.documents, String(payload.documentId || ''))
  assert(document && document.coupleId === coupleId && document.deleted !== true, 'DOCUMENT_NOT_FOUND', '文档不存在')
  return {
    document: {
      id: document._id,
      groupId: document.groupId || '',
      title: document.title,
      body: document.body || '',
      lockedByOther: Boolean(
        document.lockOwnerOpenId
        && document.lockOwnerOpenId !== openid
        && document.lockExpiresAt
        && new Date(document.lockExpiresAt).getTime() > Date.now()
      ),
    },
  }
}

const createGroup = async ({ openid, payload }) => {
  const { coupleId } = await requireSpace(openid)
  const name = String(payload.name || '').trim()
  assert(name, 'INVALID_GROUP_NAME', '请填写文档组名称')
  assert(name.length <= 30, 'GROUP_NAME_TOO_LONG', '文档组名称不能超过 30 个字')
  const groupId = makeId('group')
  await db.collection(collections.documentGroups).doc(groupId).set({ data: {
    coupleId, name, order: Number(payload.order || 0), createdBy: openid, createdAt: now(), updatedAt: now(),
  } })
  return projectState(openid)
}

const lock = async ({ openid, payload }) => {
  const { coupleId } = await requireSpace(openid)
  const document = payload.documentId
    ? await getDoc(collections.documents, String(payload.documentId))
    : await queryOne(collections.documents, { coupleId, deleted: false }, { field: 'updatedAt', direction: 'desc' })
  assert(document && document.coupleId === coupleId, 'DOCUMENT_NOT_FOUND', '文档不存在')
  const lockExpiresAt = new Date(Date.now() + 5 * 60 * 1000)
  await db.runTransaction(async (transaction) => {
    const latest = (await transaction.collection(collections.documents).doc(document._id).get()).data
    assert(latest && latest.coupleId === coupleId && latest.deleted !== true, 'DOCUMENT_NOT_FOUND', '文档不存在')
    const lockExpired = !latest.lockExpiresAt || new Date(latest.lockExpiresAt).getTime() <= Date.now()
    assert(lockExpired || latest.lockOwnerOpenId === openid, 'DOCUMENT_LOCKED', '对方正在编辑，请稍后再试')
    await transaction.collection(collections.documents).doc(document._id).update({ data: {
      lockOwnerOpenId: openid, lockExpiresAt, lockUpdatedAt: now(),
    } })
  })
  return { documentId: document._id, lockExpiresAt: lockExpiresAt.toISOString() }
}

const unlock = async ({ openid, payload }) => {
  const { coupleId } = await requireSpace(openid)
  const document = payload.documentId
    ? await getDoc(collections.documents, String(payload.documentId))
    : await queryOne(collections.documents, { coupleId, lockOwnerOpenId: openid, deleted: false }, { field: 'updatedAt', direction: 'desc' })
  if (!document || document.coupleId !== coupleId || document.lockOwnerOpenId !== openid) return { ok: true }
  await db.collection(collections.documents).doc(document._id).update({ data: { lockOwnerOpenId: null, lockExpiresAt: null, lockUpdatedAt: db.serverDate() } })
  return { ok: true }
}

const save = async ({ openid, payload }) => {
  const { coupleId } = await requireSpace(openid)
  const title = String(payload.title || '').trim()
  const body = String(payload.body || '').trim()
  assert(title, 'INVALID_TITLE', '文档标题不能为空')
  assert(title.length <= 60 && body.length <= 5000, 'DOCUMENT_TOO_LONG', '文档内容超过长度限制')
  const requestedDocumentId = String(payload.documentId || '')
  const requestedGroupId = String(payload.groupId || '')
  const document = requestedDocumentId ? await getDoc(collections.documents, requestedDocumentId) : null

  if (!requestedDocumentId) {
    const group = requestedGroupId
      ? await getDoc(collections.documentGroups, requestedGroupId)
      : await queryOne(collections.documentGroups, { coupleId }, { field: 'order', direction: 'asc' })
    assert(group && group.coupleId === coupleId, 'DOCUMENT_GROUP_NOT_FOUND', '请选择有效的文档组')
    const documentId = makeId('document')
    await db.collection(collections.documents).doc(documentId).set({ data: {
      coupleId, groupId: group._id, title, body, createdBy: openid, lastEditedBy: openid,
      lockOwnerOpenId: null, lockExpiresAt: null, deleted: false, createdAt: now(), updatedAt: now(),
    } })
    await writeOperationLog({ coupleId, openid, action: 'documents.create', targetId: documentId })
    const state = await projectState(openid)
    state.selectedDocumentId = documentId
    return state
  }

  assert(document, 'DOCUMENT_NOT_FOUND', '文档不存在')
  assert(document.coupleId === coupleId, 'FORBIDDEN', '你无权编辑该文档')
  const lockExpired = !document.lockExpiresAt || new Date(document.lockExpiresAt).getTime() <= Date.now()
  assert(document.lockOwnerOpenId === openid && !lockExpired, 'DOCUMENT_LOCK_REQUIRED', '编辑锁已失效，请重新打开文档后再保存')
  await db.runTransaction(async (transaction) => {
    const latest = (await transaction.collection(collections.documents).doc(document._id).get()).data
    const latestLockExpired = !latest?.lockExpiresAt || new Date(latest.lockExpiresAt).getTime() <= Date.now()
    assert(latest && latest.coupleId === coupleId, 'DOCUMENT_NOT_FOUND', '文档不存在')
    assert(latest.lockOwnerOpenId === openid && !latestLockExpired, 'DOCUMENT_LOCK_REQUIRED', '编辑锁已失效，请重新打开文档后再保存')
    await transaction.collection(collections.documents).doc(document._id).update({ data: {
      title, body, lastEditedBy: openid, lockOwnerOpenId: null, lockExpiresAt: null, updatedAt: now(),
    } })
  })
  await writeOperationLog({ coupleId, openid, action: 'documents.save', targetId: document._id })
  await heat.grant({ openid, code: 'HR02', businessResourceId: document._id })
  return projectState(openid)
}

module.exports = { list, detail, createGroup, lock, unlock, save }
