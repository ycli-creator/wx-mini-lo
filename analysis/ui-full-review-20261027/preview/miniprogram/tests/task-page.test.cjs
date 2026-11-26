const assert = require('node:assert/strict')
let definition
const messages = []
Object.assign(globalThis, { __LOVE_POINTS_FORCE_LOCAL__: true, Page: (value) => { definition = value }, wx: {
  getStorageSync() {}, setStorageSync() {}, pageScrollTo() {},
  showToast: (value) => messages.push(value.title),
  chooseMedia: async () => ({ tempFiles: [{ tempFilePath: '/photo.jpg' }] }),
  redirectTo: (value) => messages.push(value.url),
} })
const { lovePointsService: service } = require('../services/love-points.ts')
const { createInitialState } = require('../store/state.ts')
const makePage = () => ({ ...definition, data: structuredClone(definition.data), setData(values) { Object.assign(this.data, values) } })
async function run() {
  require('../pages/task/detail.ts')
  const page = makePage()
  const state = createInitialState()
  const task = { ...state.tasks[0], id: 'photo', kind: 'one_time', planType: 'long_term', bothRequired: false, status: 'todo', assigneeIsSelf: true, completionRequirement: 'image', approvalRequired: false }
  state.tasks = [task]; state.activeSpaceType = 'personal'
  service.getState = async () => state
  await page.onLoad({ id: task.id })
  assert.equal(page.data.canComplete, true)
  assert.equal(page.data.detailsOpen, false)
  let calls = 0
  service.submitTask = async (note, id, evidence) => { calls++; assert.equal(id, task.id); assert.equal(evidence.length, 1); throw new Error('网络中断') }
  await page.completeTask()
  assert.equal(calls, 0)
  await page.chooseImage()
  await page.completeTask()
  assert.equal(page.data.images.length, 1, 'Failed submission preserves photos')
  assert.equal(page.data.busy, false)
  service.submitTask = async () => { calls++; task.status = 'done' }
  await page.completeTask()
  assert.equal(calls, 2)
  assert.equal(page.data.canComplete, false)
  assert.equal(new Date(`${page.data.calendarCells[0].date}T12:00:00`).getDay(), 1, 'Calendar columns start on Monday')
  assert.equal(page.data.images.length, 0)
  await page.completeTask()
  assert.equal(calls, 2)
  task.status = 'todo'; task.assigneeIsSelf = false
  await page.refresh()
  assert.equal(page.data.canComplete, false)
  task.bothRequired = true; task.status = 'partial'; task.selfCompletion.completed = false; task.partnerCompletion.completed = true
  await page.refresh()
  assert.equal(page.data.canComplete, true)
  task.selfCompletion.completed = true
  await page.refresh()
  assert.equal(page.data.canComplete, false)
  task.bothRequired = false; task.assigneeIsSelf = true; task.status = 'todo'; task.planType = 'daily'; task.isCurrentCycle = false
  await page.refresh()
  assert.equal(page.data.canComplete, false)
  page.setData({ images: [{ localPath: '/a' }, { localPath: '/b' }] })
  page.removeImage({ currentTarget: { dataset: { index: 0 } } })
  assert.equal(page.data.images[0].localPath, '/b')
  task.planType = 'long_term'; task.isCurrentCycle = true; task.status = 'todo'; task.completionRequirement = 'direct'; task.approvalRequired = true; state.activeSpaceType = 'couple'
  await page.refresh()
  assert.equal(page.data.needsApproval, true)
  let finish
  service.submitTask = async () => { calls++; await new Promise((resolve) => { finish = resolve }); task.status = 'pending' }
  const completing = page.completeTask()
  await new Promise((resolve) => setImmediate(resolve))
  const before = calls
  await page.completeTask()
  assert.equal(calls, before, 'Busy submission cannot repeat')
  finish(); await completing
  assert.equal(page.data.task.status, 'pending')
  assert.equal(page.data.canComplete, false)
  require('../pages/task/index.ts')
  const list = makePage()
  state.tasks = ['todo', 'pending', 'done', 'missed'].map((status) => ({ ...task, id: status, status, kind: 'recurring', planType: 'daily', isCurrentCycle: true }))
  await list.refresh()
  assert.deepEqual(list.data.taskSections.find((section) => section.id === 'today').tasks.map((item) => item.status), ['todo'])
  assert.equal(list.data.taskSections.find((section) => section.id === 'pending').tasks.length, 1)
  assert.equal(list.data.taskSections.find((section) => section.id === 'done').tasks.length, 2)
  assert.equal(list.data.todayTotal, 3, 'Daily progress excludes expired tasks')
  assert.equal(list.data.todayCompleted, 1)
  assert.equal(list.data.todayPercent, 33)
  assert.equal(list.data.completionRequirement, 'direct')
  assert.equal(list.data.moreOptionsOpen, false)
  require('../pages/task/submit.ts')
  await makePage().onLoad({ id: 'task with space' })
  assert.ok(messages.includes('/pages/task/detail?id=task%20with%20space'))
  console.log('待办页面流程通过：照片必填、失败保留、完成回显、防重复、双方权限、过期周期、分类与旧入口。')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
