const assert = require('node:assert/strict')
const storage = new Map()
Object.assign(globalThis, { __LOVE_POINTS_FORCE_LOCAL__: true, wx: {
  getStorageSync: (key) => structuredClone(storage.get(key)), setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
} })
const { emptyDay, emptyProfile, statisticsFor } = require('../utils/health-domain')
const { cycleStatistics, moodStatistics, habitStatistics } = require('../utils/health-views.ts')
const { diaryService } = require('../services/diary.ts')
const { healthService } = require('../services/health.ts')

async function run() {
  const profile = emptyProfile()
  profile.cycles = [{ id: 'first', start: '2024-01-30', end: '2024-02-03' }, { id: 'second', start: '2024-02-29', end: '2024-03-04' }]
  const state = { profile, days: [{ ...emptyDay('2024-02-29'), moods: [1, 1, 0, 0, 0], habits: [true, true, false, false, false] }] }
  const stats = statisticsFor(state, 2024)
  assert.equal(stats.totalHabitDays, 1)
  const cycle = cycleStatistics(stats, '2024-03-05')
  assert.equal(cycle.rows.find((row) => row.id === 'first').length, 30)
  assert.equal(cycle.cycleDifferences, 0)
  const mood = moodStatistics(stats, 2024, '2024-03-05')
  assert.equal(mood.rings[0].percent, '50.0')
  const leap = mood.weeks.flatMap((week) => week.cells).filter((cell) => cell.visible && cell.date === '2024-02-29')
  assert.equal(leap.length, 1)
  assert.equal(leap[0].period, true)
  const habits = habitStatistics(stats, 7, '2024-03-05')
  assert.equal(habits[0].count, 1)
  assert.equal(habits[0].marks.length, 7)
  assert.equal(habitStatistics(stats, 30, '2024-03-05')[0].marks.length, 30)
  const input = { id: 'diary_local_shared', version: 0, date: '2024-02-29', time: '12:00', title: '', body: '心情同步', mood: '开心', weather: '', location: '', category: '', tags: [], favorite: false, deleted: false, draft: false, createdAt: '', updatedAt: '' }
  await diaryService.save(input)
  await diaryService.save(input)
  let health = await healthService.read(input.date, input.date)
  assert.equal(health.days[0].moods[1], 1)
  await healthService.change({ kind: 'mood', index: 4, delta: 1, version: health.profile.version, date: input.date, operationId: 'local_shared_mood_change' }, input.date, input.date)
  assert.equal((await diaryService.list())[0].mood, '伤心')
  const saved = (await diaryService.list())[0]
  await diaryService.save({ ...saved, mood: '平静' })
  assert.equal((await healthService.read(input.date, input.date)).days[0].moodValue, '平静')
  assert.equal((await healthService.statistics(2024)).totalMoodCount, 2)
  console.log('健康视图与共用心情通过：双向同步、重复保存、闰日热力图、周期长度与习惯计数')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
