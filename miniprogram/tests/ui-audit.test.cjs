const assert = require('node:assert/strict')
let definition
let saveCount = 0
Object.assign(globalThis, { __LOVE_POINTS_FORCE_LOCAL__: true, Page(value) { definition = value }, wx: {
  getStorageSync() {}, setStorageSync() {}, showToast() {}, navigateBack() {}, navigateTo() {}, switchTab() {},
  showModal: async () => ({ confirm: true }),
} })
const { lovePointsService: service } = require('../services/love-points.ts')
const { createInitialState } = require('../store/state.ts')
const page = (file) => { require('../pages/' + file + '.ts'); return { ...definition, data: structuredClone(definition.data), setData(value) { Object.assign(this.data, value) } } }
const fail = async () => { throw Error('offline') }
async function run() {
  const state = createInitialState()
  state.bound = true
  service.getState = async () => structuredClone(state)

  const chat = page('chat/thread')
  service.listMessages = fail
  await chat.refresh()
  assert.equal(chat.data.loadError, true, '聊天失败不能显示成空会话')
  service.listMessages = async () => ({ messages: [], unread: 0 })
  await chat.refresh()
  assert.equal(chat.data.loadError, false)
  let finishSend, sends = 0
  service.sendMessage = () => { sends++; return new Promise(resolve => { finishSend = resolve }) }
  chat.setData({ text: '第一条' })
  const sending = chat.send()
  await chat.send()
  assert.equal(sends, 1, '发送期间不重复提交')
  chat.setData({ text: '下一条草稿' })
  finishSend({ messages: [{ id: 'sent' }], unread: 0 })
  await sending
  assert.equal(chat.data.text, '下一条草稿', '发送成功不清除发送期间继续写的内容')
  assert.equal(chat.data.bottomMessage, 'message-sent')
  service.sendMessage = fail
  await chat.send()
  assert.equal(chat.data.text, '下一条草稿')
  assert.equal(chat.data.sending, false)

  const invite = page('invite/join')
  let finishInvite, invitations = 0
  service.applyInvite = () => { invitations++; return new Promise(resolve => { finishInvite = resolve }) }
  invite.setData({ code: '123456' })
  const applying = invite.submit()
  await invite.submit()
  assert.equal(invitations, 1)
  finishInvite(state)
  await applying
  assert.equal(invite.data.busy, false)

  const record = page('records/edit')
  service.listDailyRecords = fail
  service.saveDailyRecord = async () => { saveCount++ }
  record.setData({ id: 'missing', date: '2026-10-27' })
  await record.refresh()
  assert.equal(record.data.loadError, true)
  await record.save()
  assert.equal(saveCount, 0, '加载失败不允许用空表单覆盖现有记录')
  service.listDailyRecords = async () => [{ id: 'missing', type: 'event', title: '原记录', note: '内容', media: [], ownerIsSelf: true, visibility: 'self' }]
  await record.refresh()
  assert.equal(record.data.loadError, false)
  assert.equal(record.data.title, '原记录')

  const friends = page('friends/index')
  service.listFriends = fail
  await friends.refresh()
  assert.equal(friends.data.loadError, true)
  service.listFriends = async () => ({ friends: [], requests: [] })
  await friends.refresh()
  assert.equal(friends.data.loadError, false)

  const relationship = page('settings/relationship')
  state.bound = false
  let reads = 0
  service.getRelationshipSettings = async () => { reads++; return {} }
  await relationship.refresh()
  assert.equal(reads, 0, '未绑定不读取或显示可提交的情侣关系表单')
  assert.equal(relationship.data.bound, false)
  state.bound = true
  service.getRelationshipSettings = fail
  await relationship.refresh()
  assert.equal(relationship.data.loadError, true)

  const reward = page('reward/detail')
  state.selectedRewardId = state.rewards[0].id
  reward.setData({ rewardId: 'deleted-reward' })
  await reward.refresh()
  assert.equal(reward.data.loadError, true, '指定详情不存在时不替换成另一个心愿')
  reward.setData({ rewardId: state.rewards[0].id })
  state.sharedPoints = 10
  await reward.refresh()
  assert.equal(reward.data.balance, 10)
  assert.equal(reward.data.shortfall, Math.max(0, state.rewards[0].cost - 10))

  const create = page('community/create')
  service.getState = fail
  await create.refresh()
  assert.equal(create.data.loadError, true)
  service.getState = async () => structuredClone(state)
  await create.refresh()
  create.setData({ title: '尚未保存的标题', content: '草稿正文' })
  await create.onShow()
  assert.equal(create.data.title, '尚未保存的标题', '阅读协议返回时保留当前草稿')
  console.log('全量走查回归通过：聊天重试/并发/草稿、邀请防重、记录失败写保护、好友重试、关系边界、心愿精确定位、帖子草稿保护')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
