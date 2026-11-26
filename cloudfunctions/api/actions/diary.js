const { db, collections, hashCode } = require('../lib/shared')
const { ApiError, assert } = require('../lib/errors')
const { normalize } = require('../lib/diary-domain')
const health = require('./health')
const healthDomain = require('../lib/health-domain')
const project = (doc) => ({ id: doc.id, version: doc.version, ...normalize(doc), createdAt: doc.createdAt, updatedAt: doc.updatedAt })
const list = async ({ openid, payload = {} }) => {
  const cursor = payload.cursor || ''
  assert(typeof cursor === 'string' && (!cursor || /^[a-zA-Z0-9_-]{8,100}$/.test(cursor)), 'DIARY_INPUT_INVALID', '分页标记不正确')
  const where = { ownerOpenId: openid }
  if (cursor) where.id = db.command.gte(cursor)
  const result = await db.collection(collections.diaries).where(where).orderBy('id', 'asc').limit(50).get()
  const rows = result.data.filter((row) => row.id !== cursor)
  const dates = [...new Set(rows.filter((row) => !row.draft && !row.deleted).map((row) => row.date))]
  const days = dates.length ? (await db.collection(collections.healthDays).where({ ownerOpenId: openid, date: db.command.in(dates) }).limit(100).get()).data : []
  const sharedMoods = new Map(days.filter((day) => typeof day.moodValue === 'string').map((day) => [day.date, day.moodValue]))
  return { entries: rows.map((row) => ({ ...project(row), ...(!row.draft && !row.deleted && sharedMoods.has(row.date) ? { mood: sharedMoods.get(row.date) } : {}) })), cursor: result.data.length === 50 ? rows[rows.length - 1].id : '' }
}
const save = async ({ openid, payload = {} }) => {
  assert(typeof payload.id === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(payload.id), 'DIARY_INPUT_INVALID', '日记编号不正确')
  let values
  try { values = normalize(payload) } catch (error) { throw new ApiError('DIARY_INPUT_INVALID', error.message) }
  const sources = [...values.images, ...values.audio].map((item) => item.src).concat(values.drawing ? [values.drawing] : [])
  assert(sources.every((src) => /^cloud:\/\/[^/]+\/diary\/private\/(images|audio|drawings)\/[a-zA-Z0-9_.-]+$/.test(src)), 'DIARY_INPUT_INVALID', '请先上传日记私密附件再保存')
  const id = `diary_${hashCode(`${openid}:${payload.id}`)}`
  return db.runTransaction(async (transaction) => {
    let stored
    try { stored = (await transaction.collection(collections.diaries).doc(id).get()).data }
    catch (error) {
      if (!String(error.errMsg || error.message || error).includes(`document with _id ${id} does not exist`)) throw error
    }
    // Older app builds omit editor extensions. Preserve them on an ordinary text edit.
    if (stored) {
      values = { ...values }
      for (const key of ['markdown', 'titleVisible', 'lineHeight', 'originalImages', 'hidden', 'paper', 'images', 'audio', 'drawing']) {
        if (payload[key] === undefined && stored[key] !== undefined) values[key] = stored[key]
      }
    }
    const fingerprint = hashCode(JSON.stringify({ version: payload.version, ...values }))
    if (stored && stored.lastMutation === fingerprint) {
      const day = !stored.draft && !stored.deleted ? await health.getOne(transaction, collections.healthDays, `${health.ownerId(openid)}_${stored.date}`) : null
      return { ...project(stored), ...(typeof day?.moodValue === 'string' ? { mood: day.moodValue } : {}) }
    }
    assert((stored ? stored.version : 0) === payload.version, 'DIARY_CONFLICT', '日记已在其他页面修改，请重新打开后再保存')
    assert(stored || !values.deleted, 'DIARY_NOT_FOUND', '日记不存在')
    const timestamp = new Date().toISOString()
    const history = stored ? [...(stored.history || []), { version: stored.version, savedAt: stored.updatedAt, entry: project(stored) }].slice(-10) : []
    const entry = { ...values, id: payload.id, version: payload.version + 1, ownerOpenId: openid, lastMutation: fingerprint, createdAt: stored ? stored.createdAt : timestamp, updatedAt: timestamp, history }
    // Diary and daily mood commit in the same owner-scoped transaction.
    let dailyMood
    if (!values.draft && !values.deleted && values.date <= healthDomain.todayKey()) {
      const profileId = health.ownerId(openid)
      const dayId = `${profileId}_${values.date}`
      const dayDoc = await health.getOne(transaction, collections.healthDays, dayId)
      const day = dayDoc ? health.projectDay(dayDoc) : healthDomain.emptyDay(values.date)
      if (payload.moodChanged === true || values.mood !== (stored?.mood || '') || (values.mood && (!stored || stored.draft || stored.date !== values.date))) {
        const next = healthDomain.setDayMood(day, values.mood)
        if (next.moodValue !== day.moodValue) {
          const profile = health.projectProfile(await health.getOne(transaction, collections.healthProfiles, profileId))
          await transaction.collection(collections.healthProfiles).doc(profileId).set({ data: { ...profile, version: profile.version + 1, ownerOpenId: openid, updatedAt: new Date() } })
          await transaction.collection(collections.healthDays).doc(dayId).set({ data: { ...next, ownerOpenId: openid, updatedAt: new Date() } })
        }
        dailyMood = next.moodValue
      } else dailyMood = day.moodValue
    }
    await transaction.collection(collections.diaries).doc(id).set({ data: entry })
    return { ...project(entry), ...(dailyMood !== undefined ? { mood: dailyMood } : {}) }
  })
}
const history = async ({ openid, payload = {} }) => {
  assert(typeof payload.id === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(payload.id), 'DIARY_INPUT_INVALID', '日记编号不正确')
  const result = await db.collection(collections.diaries).where({ ownerOpenId: openid, id: payload.id }).limit(1).get()
  assert(result.data.length, 'DIARY_NOT_FOUND', '日记不存在或无权查看')
  return result.data[0].history || []
}
module.exports = { list, save, history, scope: async ({ openid }) => hashCode(`diary-recovery:${openid}`) }
