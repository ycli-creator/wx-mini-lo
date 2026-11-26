const assert = require('node:assert/strict')
const storage = new Map()
const opened = []
let definition
Object.assign(globalThis, {
  __LOVE_POINTS_FORCE_LOCAL__: true,
  Page(value) { definition = value },
  wx: {
    getStorageSync: key => structuredClone(storage.get(key)),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    removeStorageSync: key => storage.delete(key),
    showToast() {},
    navigateTo: ({ url }) => opened.push(url),
    chooseMedia: async () => ({ tempFiles: [{ tempFilePath: '/sample.jpg' }] }),
  },
})
const { lovePointsService: service } = require('../services/love-points.ts')
const { createInitialState, updateState } = require('../store/state.ts')
const { rewardsForFilter } = require('../utils/reward-views.ts')
const tap = id => ({ currentTarget: { dataset: { id } } })
function page(file) {
  require('../pages/' + file + '.ts')
  return {
    ...definition, data: structuredClone(definition.data),
    setData(values) {
      for (const [key, value] of Object.entries(values)) {
        const segments = key.split('.')
        const leaf = segments.pop()
        const target = segments.reduce((obj, name) => obj[name], this.data)
        target[leaf] = value
      }
    },
  }
}
async function run() {
  updateState(draft => { draft.bound = true; draft.activeSpaceType = 'couple'; draft.sharedPoints = 1000 })
  const reward = (await service.getState()).rewards.find(item => item.pointsType === 'shared')
  await service.redeemReward(reward.id)
  await service.requestRefund(reward.id)
  await service.reviewRefund(false, reward.id)
  const declined = await service.getState()
  assert.equal(declined.redemptions.find(item => item.rewardId === reward.id).refundStatus, 'rejected')
  assert.equal(declined.sharedPoints, 1000 - reward.cost)
  assert.equal(rewardsForFilter(declined, 'purchased').find(item => item.id === reward.id).statusLabel, '退款未通过')
  assert.ok(!rewardsForFilter(declined, 'refund').some(item => item.id === reward.id))
  await assert.rejects(service.reviewRefund(false, reward.id))
  await service.requestRefund(reward.id)
  assert.equal(rewardsForFilter(await service.getState(), 'refund')[0].statusLabel, '退款中')
  assert.equal((await service.approveRefund(reward.id)).sharedPoints, 1000)

  updateState(draft => { draft.profile.nickname = '小满'; draft.relationshipStartedAt = '2026-01-01' })
  const profile = page('profile/index')
  await profile.refresh()
  assert.equal(profile.data.loadError, false)
  assert.ok(profile.data.achievements.length > 0)
  assert.equal(profile.data.unlockedCount, profile.data.achievements.filter(item => item.unlocked).length)
  profile.switchSection({ currentTarget: { dataset: { tab: 'achievements' } } })
  assert.equal(profile.data.activeTab, 'achievements')
  profile.openDocuments()
  assert.equal(opened.at(-1), '/pages/documents/index')

  const settings = page('settings/index')
  await settings.refresh()
  const toggle = (key, value) => settings.changePrivacy({ currentTarget: { dataset: { key } }, detail: { value } })
  await toggle('searchableByCode', true)
  await toggle('privateMode', true)
  const save = service.updateProfilePrivacy
  let writes = 0
  service.updateProfilePrivacy = async value => { writes++; return save(value) }
  await toggle('searchableByCode', true)
  assert.equal(writes, 0)
  assert.equal(settings.data.state.profile.privacy.searchableByCode, false)
  await toggle('privateMode', false)
  assert.equal(settings.data.state.profile.privacy.searchableByCode, false)
  await toggle('searchableByCode', true)
  assert.equal(settings.data.state.profile.privacy.searchableByCode, true)
  service.updateProfilePrivacy = async () => { throw Error('offline') }
  await toggle('privateMode', true)
  assert.equal(settings.data.state.profile.privacy.privateMode, false)
  assert.equal(settings.data.state.profile.privacy.searchableByCode, true)

  const state = createInitialState()
  const base = { ...state.tasks[0], planType: 'daily', isCurrentCycle: true, assigneeIsSelf: true, approvalRequired: false, bothRequired: false, completionRequirement: 'direct' }
  state.tasks = [
    { ...base, id: 'direct' },
    { ...base, id: 'photo', completionRequirement: 'image' },
    { ...base, id: 'note', completionRequirement: 'note', approvalRequired: true },
    { ...base, id: 'both', bothRequired: true },
    { ...base, id: 'other', assigneeIsSelf: false },
    { ...base, id: 'expired', isCurrentCycle: false },
    { ...base, id: 'project', kind: 'project' },
  ]
  state.activeSpaceType = 'couple'
  const tasks = page('task/index')
  tasks.displayState(state)
  const submissions = []
  let finish
  service.submitTask = (note, id, evidence) => {
    submissions.push({ id, note, evidence })
    return new Promise(resolve => { finish = status => {
      const result = structuredClone(tasks.data.state)
      const task = result.tasks.find(item => item.id === id)
      task.status = status
      task.selfCompletion.completed = true
      resolve(result)
    } })
  }
  for (const id of ['project', 'other', 'expired']) await tasks.checkTask(tap(id))
  tasks.toggleTask(tap('direct'))
  assert.equal(tasks.data.expandedTaskId, 'direct')
  tasks.toggleTask(tap('direct'))
  assert.equal(tasks.data.expandedTaskId, '')
  assert.equal(submissions.length, 0)
  const click = tasks.checkTask(tap('direct'))
  await tasks.checkTask(tap('direct'))
  assert.equal(submissions.length, 1)
  assert.equal(tasks.data.completedId, '')
  finish('done')
  await click
  assert.ok(tasks.data.taskSections.find(group => group.id === 'done').tasks.some(item => item.id === 'direct'))
  assert.equal(tasks.data.todayCompleted, 1)
  await tasks.checkTask(tap('note'))
  assert.equal(tasks.data.expandedTaskId, 'note')
  await tasks.submitInline(tap('note'))
  assert.equal(submissions.length, 1)
  tasks.inlineNote({ ...tap('note'), detail: { value: '已经走完了' } })
  const pending = tasks.submitInline(tap('note'))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(submissions.at(-1).note, '已经走完了')
  finish('pending')
  await pending
  assert.equal(tasks.data.todayCompleted, 1)
  assert.equal(tasks.data.taskSections.find(group => group.id === 'pending').tasks[0].id, 'note')
  const partial = tasks.checkTask(tap('both'))
  await new Promise(resolve => setImmediate(resolve))
  finish('partial')
  await partial
  assert.equal(tasks.data.tasks.find(item => item.id === 'both').canComplete, false)
  assert.equal(tasks.data.todayCompleted, 1)
  await tasks.checkTask(tap('photo'))
  await tasks.inlinePhoto(tap('photo'))
  service.submitTask = async (_note, _id, evidence) => {
    assert.equal(evidence[0].fileId, '/sample.jpg')
    throw Error('offline')
  }
  await tasks.submitInline(tap('photo'))
  assert.equal(tasks.data.drafts.photo.images.length, 1)
  assert.equal(tasks.data.expandedTaskId, 'photo')
  assert.equal(tasks.data.busy, false)

  const chat = page('chat/index')
  chat.openChat()
  assert.equal(opened.at(-1), '/pages/invite/create')
  chat.setData({ bound: true })
  chat.openChat()
  assert.equal(opened.at(-1), '/pages/chat/thread')
  const calendar = page('records/index')
  calendar.setData({ selectedDate: '2026-11-23' })
  calendar.addRecord()
  const url = new URL(opened.at(-1), 'https://preview.local')
  const editor = page('records/edit')
  await editor.onLoad(Object.fromEntries(url.searchParams))
  assert.equal(editor.data.date, '2026-11-23')
  assert.equal(editor.data.type, 'event')

  const community = page('community/index')
  community.setData({ posts: [
    { id: 'owned', authorIsSelf: true, canDelete: true },
    { id: 'shared', authorIsSelf: false, canDelete: true },
    { id: 'readonly', authorIsSelf: false, canDelete: false },
  ] })
  const menus = []
  wx.showActionSheet = async ({ itemList }) => { menus.push(itemList); return { tapIndex: 0 } }
  await community.postMenu(tap('readonly'))
  assert.equal(menus.length, 0)
  await community.postMenu(tap('owned'))
  assert.deepEqual(menus.at(-1), ['编辑', '删除'])
  assert.equal(opened.at(-1), '/pages/community/create?id=owned')
  const deleted = []
  service.deleteCommunityPost = async id => { deleted.push(id) }
  community.refresh = async () => {}
  wx.showModal = async () => ({ confirm: false })
  await community.postMenu(tap('shared'))
  assert.deepEqual(menus.at(-1), ['删除'])
  assert.deepEqual(deleted, [])
  wx.showModal = async () => ({ confirm: true })
  await community.postMenu(tap('shared'))
  assert.deepEqual(deleted, ['shared'])
  assert.equal(community.data.busyPostId, '')
  console.log('退款拒绝与重申、隐私联动与回滚、待办双触区与提交分支、邀请与日期入口、日常的操作权限与删除确认验证通过')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
