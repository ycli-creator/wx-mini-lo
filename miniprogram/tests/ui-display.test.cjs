const assert = require('node:assert/strict')
let definition
const routes = []
Object.assign(globalThis, { __LOVE_POINTS_FORCE_LOCAL__: true, Page(value) { definition = value }, wx: {
  getStorageSync() {}, setStorageSync() {}, showToast() {},
  navigateTo({ url }) { routes.push(['push', url]) },
  switchTab({ url }) { routes.push(['tab', url]) },
} })
const { lovePointsService: service } = require('../services/love-points.ts')
const { createInitialState } = require('../store/state.ts')
const makePage = () => ({ ...definition, data: structuredClone(definition.data), setData(value) { Object.assign(this.data, value) } })
async function run() {
  const state = createInitialState()
  service.getState = async () => structuredClone(state)
  service.getUnreadMessages = async () => 0
  service.listNotifications = async () => ({ items: [], unread: 0 })
  require('../pages/home/index.ts')
  const home = makePage()
  const daily = { ...state.tasks[0], id: 'daily', kind: 'one_time', planType: 'daily', isCurrentCycle: true, assigneeIsSelf: true, reviewerIsSelf: false, bothRequired: false, status: 'todo' }
  const done = { ...daily, id: 'done', status: 'done' }
  const review = { ...daily, id: 'review', status: 'pending', assigneeIsSelf: false, reviewerIsSelf: true }
  const expired = { ...daily, id: 'old', isCurrentCycle: false }
  state.tasks = [done, expired, daily, review]
  await home.refresh()
  assert.equal(home.data.task.id, 'review')
  assert.equal(home.data.taskSectionTitle, '待我确认')
  state.tasks = [done, expired, daily]
  await home.refresh()
  assert.equal(home.data.task.id, 'daily', '跳过已完成与过期周期')
  state.tasks = [{ ...daily, status: 'partial', bothRequired: true, selfCompletion: { completed: true } }, done, expired]
  await home.refresh()
  assert.equal(home.data.hasTask, false, '双方待办已完成自己的部分后不再提示待我处理')
  state.tasks = [{ ...daily, planType: 'weekly' }]
  await home.refresh()
  assert.equal(home.data.taskSectionTitle, '接下来')
  state.tasks = [{ ...daily, kind: 'project', planType: 'long_term', projectSteps: [{ assigneeIsSelf: false, status: 'todo' }], progressPercent: 50 }]
  await home.refresh()
  assert.equal(home.data.hasTask, false)
  state.tasks[0].progressPercent = 100
  await home.refresh()
  assert.equal(home.data.hasTask, true, '全部环节完成后显示最终结算入口')

  require('../pages/community/index.ts')
  const community = makePage()
  state.bound = true
  service.listCommunityPosts = async () => [
    { id: 'old', content: '第一行\n第二行', media: [], belongsToCurrentCouple: true, createdAt: '2026-10-26T10:00:00Z' },
    { id: 'other', media: [], belongsToCurrentCouple: false, createdAt: '2026-10-28T10:00:00Z' },
    { id: 'new', content: '正文', media: [], belongsToCurrentCouple: true, createdAt: '2026-10-27T10:00:00Z' },
  ]
  await community.refresh()
  assert.deepEqual(community.data.posts.map(post => post.id), ['new', 'old'])
  assert.equal(community.data.posts[1].content, '第一行\n第二行')
  community.createPost()
  assert.deepEqual(routes.at(-1), ['push', '/pages/community/create'])
  community.setData({ bound: false })
  community.createPost()
  assert.deepEqual(routes.at(-1), ['push', '/pages/invite/create'])
  service.listCommunityPosts = async () => { throw Error('offline') }
  await community.refresh()
  assert.equal(community.data.loadError, true)
  assert.equal(community.data.loading, false)

  require('../pages/profile/index.ts')
  const profile = makePage()
  profile.openPosts()
  assert.deepEqual(routes.at(-1), ['tab', '/pages/community/index'])
  profile.openSettings()
  assert.deepEqual(routes.at(-1), ['push', '/pages/settings/index'])
  profile.setData({ state: { ...state, bound: false } })
  profile.createPost()
  assert.deepEqual(routes.at(-1), ['push', '/pages/invite/create'])
  console.log('页面展示回归通过：首页行动优先级、过期/双方任务、项目结算、日常排序与空间隔离、失败恢复、导航和绑定入口')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
