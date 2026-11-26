const assert = require('node:assert/strict')
const test = require('node:test')
const cloud = require('./fake-cloud')
const sdk = require.resolve('wx-server-sdk')
require.cache[sdk] = { id: sdk, filename: sdk, loaded: true, exports: cloud }
const api = require('../index')
const call = async (owner, action, payload) => { cloud.currentOpenId = owner; const result = await api.main({ action, payload }); assert.equal(result.ok, true, result.message); return result.data }
const entry = { id: 'shared_mood_entry', version: 0, date: '2024-02-29', time: '12:00', title: '', body: '同一天的心情', mood: '暖心', weather: '', location: '', category: '', tags: [], draft: false, deleted: false }
const range = { start: entry.date, end: entry.date }

test('diary and health share daily mood in both directions without duplicate observations or cross-user access', async () => {
  cloud.reset()
  const saved = await call('owner', 'diary.save', entry)
  let health = await call('owner', 'health.read', range)
  assert.equal(health.days[0].moodValue, '暖心')
  assert.deepEqual(health.days[0].moods, [0, 1, 0, 0, 0])
  await call('owner', 'diary.save', entry)
  assert.equal((await call('owner', 'health.statistics', { year: 2024 })).totalMoodCount, 1)
  await call('owner', 'diary.save', { ...saved, body: '只修改正文' })
  health = await call('owner', 'health.read', range)
  assert.equal(health.profile.version, 1)
  health = await call('owner', 'health.change', { kind: 'mood', index: 3, delta: 1, date: entry.date, version: health.profile.version, operationId: 'shared_mood_change', rangeStart: entry.date, rangeEnd: entry.date })
  assert.equal((await call('owner', 'diary.list', {})).entries[0].mood, '生气')
  // Returning explicitly to the diary's original label must replace the newer
  // health selection even though the stored diary label still has that value.
  const restored = await call('owner', 'diary.save', { ...(await call('owner', 'diary.list', {})).entries[0], mood: '暖心', moodChanged: true })
  assert.equal(restored.mood, '暖心')
  const current = (await call('owner', 'diary.list', {})).entries[0]
  const changed = await call('owner', 'diary.save', { ...current, mood: '平静' })
  health = await call('owner', 'health.read', range)
  assert.equal(changed.mood, '平静')
  assert.deepEqual(health.days[0].moods, [0, 1, 1, 0, 0])
  assert.equal((await call('other', 'health.statistics', { year: 2024 })).totalMoodCount, 0)
  assert.deepEqual((await call('other', 'health.read', range)).days, [])
  assert.deepEqual((await call('other', 'diary.list', {})).entries, [])
})

test('diary and shared mood roll back together when either write fails; drafts do not publish moods', async () => {
  cloud.reset()
  cloud.failNextSet('diaries')
  cloud.currentOpenId = 'owner'
  const failed = await api.main({ action: 'diary.save', payload: entry })
  assert.equal(failed.ok, false)
  assert.deepEqual(cloud.dump('health_days'), [])
  assert.deepEqual(cloud.dump('health_profiles'), [])
  assert.deepEqual(cloud.dump('diaries'), [])
  const draft = await call('owner', 'diary.save', { ...entry, draft: true })
  assert.deepEqual((await call('owner', 'health.read', range)).days, [])
  await call('owner', 'diary.save', { ...draft, draft: false })
  assert.equal((await call('owner', 'health.statistics', { year: 2024 })).totalMoodCount, 1)
})

test('statistics read beyond one page, separate selected-year cells from lifetime totals, and count habit days once', async () => {
  cloud.reset()
  const { ownerId } = require('../actions/health')
  const { emptyDay, addDays } = require('../lib/health-domain')
  for (let i = 0; i < 130; i++) {
    const date = addDays('2023-12-01', i)
    await cloud.database().collection('health_days').doc(`${ownerId('owner')}_${date}`).set({ data: { ...emptyDay(date), ownerOpenId: 'owner', moods: [1, 0, 0, 0, 0], habits: [true, true, false, false, false] } })
  }
  const stats = await call('owner', 'health.statistics', { year: 2024, ownerOpenId: 'other' })
  assert.equal(stats.totalHabitDays, 130)
  assert.equal(stats.totalMoodCount, 130)
  assert.equal(stats.firstHabitDate, '2023-12-01')
  assert.equal(stats.days.length, 99)
  assert.ok(stats.days.every((day) => day.date.startsWith('2024-')))
})
