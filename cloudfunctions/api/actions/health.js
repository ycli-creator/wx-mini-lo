const { db, collections, hashCode } = require('../lib/shared')
const { ApiError, assert } = require('../lib/errors')
const domain = require('../lib/health-domain')

// Ownership always comes from the verified caller, independent of relationship state.
const ownerId = (openid) => `health_${hashCode(openid)}`
const getOne = async (context, collection, id) => {
  try { return (await context.collection(collection).doc(id).get()).data || null }
  catch (error) {
    // wx-server-sdk throws for absent documents by default, including first use.
    if (String(error.errMsg || error.message || error).includes(`document with _id ${id} does not exist`)) return null
    throw error
  }
}
const projectProfile = (doc) => doc ? { version: doc.version, settings: doc.settings, cycles: doc.cycles, recentOperations: doc.recentOperations } : domain.emptyProfile()
const projectDay = (doc) => ({ date: doc.date, flow: doc.flow, pain: doc.pain, moods: doc.moods, habits: doc.habits, intimacy: doc.intimacy, ...(typeof doc.moodValue === 'string' ? { moodValue: doc.moodValue } : {}) })
const validate = (callback) => {
  try { return callback() } catch (error) { throw new ApiError('HEALTH_INPUT_INVALID', error.message) }
}
const read = async ({ openid, payload = {} }) => {
  const { start, end } = payload
  validate(() => domain.validateRange(start, end))
  const profile = projectProfile(await getOne(db, collections.healthProfiles, ownerId(openid)))
  const days = []
  let offset = 0
  while (true) {
    const page = await db.collection(collections.healthDays).where({ ownerOpenId: openid, date: db.command.gte(start).and(db.command.lte(end)) })
      .orderBy('date', 'asc').skip(offset).limit(100).get()
    days.push(...page.data.map(projectDay))
    if (page.data.length < 100) break
    offset += page.data.length
  }
  return { profile, days }
}
const change = async ({ openid, payload = {} }) => {
  validate(() => domain.validateRange(payload.rangeStart, payload.rangeEnd))
  assert(domain.validDate(payload.date), 'HEALTH_DATE_INVALID', '记录日期不正确')
  const profileId = ownerId(openid)
  const dayId = `${profileId}_${payload.date}`
  await db.runTransaction(async (transaction) => {
    const stored = await getOne(transaction, collections.healthProfiles, profileId)
    const storedDay = await getOne(transaction, collections.healthDays, dayId)
    const result = validate(() => domain.applyChange(projectProfile(stored), storedDay ? projectDay(storedDay) : domain.emptyDay(payload.date), payload))
    if (result.duplicate) return
    await transaction.collection(collections.healthProfiles).doc(profileId).set({ data: { ...result.profile, ownerOpenId: openid, updatedAt: new Date() } })
    if (result.dayChanged) await transaction.collection(collections.healthDays).doc(dayId).set({ data: { ...result.day, ownerOpenId: openid, updatedAt: new Date() } })
  })
  return read({ openid, payload: { start: payload.rangeStart, end: payload.rangeEnd } })
}
const statistics = async ({ openid, payload = {} }) => {
  assert(Number.isInteger(payload.year) && payload.year >= 1970 && payload.year <= 2100, 'HEALTH_INPUT_INVALID', '年份不正确')
  const profile = projectProfile(await getOne(db, collections.healthProfiles, ownerId(openid)))
  const days = []
  for (let offset = 0; ; offset += 100) {
    const page = await db.collection(collections.healthDays).where({ ownerOpenId: openid }).orderBy('date', 'asc').skip(offset).limit(100).get()
    days.push(...page.data.map(projectDay))
    if (page.data.length < 100) break
  }
  return domain.statisticsFor({ profile, days }, payload.year)
}
module.exports = { read, change, statistics, ownerId, getOne, projectProfile, projectDay }
