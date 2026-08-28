const {
  db, collections, now, makeId, getDoc, requireCouple, writeOperationLog,
} = require('../lib/shared')
const { assert } = require('../lib/errors')

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength)
const validDate = (date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const [year, month, day] = date.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

const list = async ({ openid, payload = {} }) => {
  const { coupleId } = await requireCouple(openid)
  const month = cleanText(payload.month, 7)
  assert(/^\d{4}-\d{2}$/.test(month), 'RECORD_MONTH_INVALID', '记录月份不正确')
  const [result, self] = await Promise.all([
    db.collection(collections.dailyRecords).where({ coupleId, visibility: 'couple', deleted: false }).orderBy('date', 'desc').limit(500).get(),
    db.collection(collections.dailyRecords).where({ coupleId, ownerOpenId: openid, deleted: false }).orderBy('date', 'desc').limit(500).get(),
  ])
  const records = [...result.data, ...self.data]
  const unique = [...new Map(records.map((item) => [item._id, item])).values()]
    .filter((item) => String(item.date || '').startsWith(month))
    .sort((left, right) => String(right.date).localeCompare(String(left.date)) || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
  const ownerIds = [...new Set(unique.map((item) => item.ownerOpenId))]
  const owners = await Promise.all(ownerIds.map((id) => getDoc(collections.users, id)))
  const ownerNames = new Map(ownerIds.map((id, index) => [id, cleanText(owners[index]?.nickname, 24) || (id === openid ? '我' : 'TA')]))
  return unique.map((item) => ({
    id: item._id,
    date: item.date,
    type: item.type,
    title: item.title || '',
    note: item.note || '',
    mood: item.mood || '',
    periodFlow: item.periodFlow || '',
    visibility: item.visibility === 'couple' ? 'couple' : 'self',
    ownerIsSelf: item.ownerOpenId === openid,
    ownerName: ownerNames.get(item.ownerOpenId) || 'TA',
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : '',
  }))
}

const save = async ({ openid, payload }) => {
  const { coupleId } = await requireCouple(openid)
  const date = cleanText(payload.date, 10)
  assert(validDate(date), 'RECORD_DATE_INVALID', '记录日期不正确')
  const allowedTypes = new Set(['mood', 'event', 'period'])
  assert(allowedTypes.has(payload.type), 'RECORD_TYPE_INVALID', '记录类型不正确')
  const type = payload.type
  const title = cleanText(payload.title, 60)
  assert(type !== 'event' || title, 'RECORD_TITLE_REQUIRED', '请填写事件名称')
  const visibility = payload.visibility === 'couple' ? 'couple' : 'self'
  const allowedFlows = new Set(['light', 'medium', 'heavy', ''])
  const periodFlow = allowedFlows.has(payload.periodFlow) ? payload.periodFlow : ''
  const recordId = cleanText(payload.id, 100) || makeId('record')
  const existing = payload.id ? await getDoc(collections.dailyRecords, recordId) : null
  if (existing) {
    assert(existing.coupleId === coupleId && existing.ownerOpenId === openid && !existing.deleted, 'FORBIDDEN', '只能编辑自己的记录')
    await db.collection(collections.dailyRecords).doc(recordId).update({ data: {
      date,
      type,
      title,
      note: cleanText(payload.note, 500),
      mood: cleanText(payload.mood, 8),
      periodFlow,
      visibility,
      updatedAt: db.serverDate(),
    } })
  } else {
    await db.collection(collections.dailyRecords).doc(recordId).set({ data: {
      coupleId,
      ownerOpenId: openid,
      date,
      type,
      title,
      note: cleanText(payload.note, 500),
      mood: cleanText(payload.mood, 8),
      periodFlow,
      visibility,
      deleted: false,
      createdAt: now(),
      updatedAt: now(),
    } })
  }
  await writeOperationLog({ coupleId, openid, action: 'records.save', targetId: recordId })
  return list({ openid, payload: { month: date.slice(0, 7) } })
}

const remove = async ({ openid, payload }) => {
  const { coupleId } = await requireCouple(openid)
  const recordId = cleanText(payload.recordId, 100)
  const record = await getDoc(collections.dailyRecords, recordId)
  assert(record && record.coupleId === coupleId && record.ownerOpenId === openid && !record.deleted, 'RECORD_NOT_FOUND', '记录不存在或不可删除')
  await db.collection(collections.dailyRecords).doc(recordId).update({ data: { deleted: true, updatedAt: db.serverDate() } })
  await writeOperationLog({ coupleId, openid, action: 'records.delete', targetId: recordId })
  return list({ openid, payload: { month: String(record.date).slice(0, 7) } })
}

module.exports = { list, save, remove }
