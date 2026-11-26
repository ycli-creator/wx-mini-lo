const assert = require('node:assert/strict')
const storage = new Map()
let definition
Object.assign(globalThis, {
  __LOVE_POINTS_FORCE_LOCAL__: true,
  Page(options) { definition = options },
  wx: {
    getStorageSync: (key) => storage.has(key) ? structuredClone(storage.get(key)) : undefined,
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    showToast() {}, stopPullDownRefresh() {},
    showModal: async () => ({ confirm: true }),
  },
})
require('../pages/records/index.ts')
const { healthService } = require('../services/health.ts')
const page = { ...definition, data: structuredClone(definition.data), setData(values) { Object.assign(this.data, values) } }
const event = (dataset) => ({ currentTarget: { dataset } })
async function run() {
  page.setData({ year: 2024, month: 2, selectedDate: '2024-02-29', loading: false })
  await page.refresh()
  await page.moodChange(event({ index: 1, delta: 1 }))
  assert.equal(page.data.selectedDay.moods[1], 1)
  await page.habitChange(event({ index: 2 }))
  assert.equal(page.data.selectedDay.habits[2], true)
  page.openCycle(event({}))
  page.setData({ editStart: '2024-02-28', editEnd: '2024-03-02' })
  await page.saveEditor()
  assert.equal(page.data.editor, '')
  assert.ok(page.data.activeCycleId)
  await page.levelChange(event({ kind: 'flow', value: 3 }))
  assert.equal(page.data.selectedDay.flow, 3)
  page.openIntimacy(event({}))
  page.setData({ editTime: '12:30', editMethod: 2 })
  await page.saveEditor()
  const id = page.data.selectedDay.intimacy[0].id
  page.openIntimacy(event({ id }))
  page.setData({ editTime: '13:45' })
  await page.saveEditor()
  assert.equal(page.data.selectedDay.intimacy[0].time, '13:45')
  page.selectDate(event({ date: '2024-02-28' }))
  assert.equal(page.data.selectedDay.moods[1], 0)
  page.selectDate(event({ date: '2024-02-29' }))
  assert.equal(page.data.selectedDay.moods[1], 1)
  await page.moodChange(event({ index: 1, delta: -1 }))
  await page.habitChange(event({ index: 2 }))
  await page.refresh()
  assert.equal(page.data.selectedDay.moods[1], 0)
  assert.equal(page.data.selectedDay.habits[2], false)
  assert.equal(page.data.selectedDay.flow, 3)
  page.openIntimacy(event({ id }))
  await page.deleteEditor()
  assert.deepEqual(page.data.selectedDay.intimacy, [])
  const reloaded = await healthService.read('2024-02-01', '2024-03-10')
  assert.equal(reloaded.days.find((day) => day.date === '2024-02-29').flow, 3)
  assert.equal(reloaded.profile.cycles[0].end, '2024-03-02')
  // Older requests must not overwrite the currently selected month.
  const read = healthService.read
  const deferred = []
  healthService.read = () => new Promise((resolve) => deferred.push(resolve))
  const older = page.refresh()
  const newer = page.refresh()
  deferred[1]({ profile: { ...reloaded.profile, version: 100 }, days: [] })
  await newer
  deferred[0](reloaded)
  await older
  assert.equal(page.data.health.profile.version, 100)
  healthService.read = read
  console.log('健康日历页面流程通过：补记、编辑、取消、删除、保存回显、过期请求隔离')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
