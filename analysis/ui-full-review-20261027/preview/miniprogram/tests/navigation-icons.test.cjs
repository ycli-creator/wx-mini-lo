const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const calls = []
let home
let iconComponent
Object.assign(globalThis, {
  __LOVE_POINTS_FORCE_LOCAL__: true,
  wx: {
    getStorageSync: () => undefined,
    setStorageSync: () => {},
    switchTab: ({ url }) => calls.push(['tab', url]),
    navigateTo: ({ url }) => calls.push(['push', url]),
    redirectTo: ({ url }) => calls.push(['replace', url]),
  },
  Component: definition => { iconComponent = definition },
  Page: definition => { home = definition },
})
const { MAIN_TABS, openPage } = require('../utils/navigation.ts')
const { resolveIcon } = require('../components/base/lp-icon/index.ts')
const { MOOD_ICONS, HABIT_ICONS } = require('../utils/health-views.ts')
const config = require('../app.json')
assert.deepEqual(config.tabBar.list.map(tab => '/' + tab.pagePath), MAIN_TABS.map(tab => tab.pagePath))
assert.equal(MAIN_TABS.length, 4)
for (const tab of MAIN_TABS) openPage(tab.pagePath)
assert.equal(calls.filter(call => call[0] === 'tab').length, 4)
openPage('/pages/chat/index')
openPage('/pages/chat/index', true)
assert.deepEqual(calls.slice(-2), [['push', '/pages/chat/index'], ['replace', '/pages/chat/index']])

for (const name of [...MAIN_TABS.map(tab => tab.icon), ...MOOD_ICONS, ...HABIT_ICONS, 'book-open', 'money', 'notification', 'chat-filled']) {
  const icon = resolveIcon(name, '#63c5dc')
  const svg = Buffer.from(icon.iconUrl.split(',')[1], 'base64').toString('utf8')
  assert.match(svg, /^<svg /)
  assert.match(svg, /width="24" height="24"/)
  assert.match(svg, /#63c5dc/)
  assert.doesNotMatch(svg, /#2f2928/)
  const fallback = fs.readFileSync(path.join(__dirname, '..', icon.fallbackUrl))
  assert.equal(fallback.subarray(1, 4).toString(), 'PNG')
  assert.ok(fallback.length > 100)
}
const fallback = { data: resolveIcon('notification'), setData(value) { Object.assign(this.data, value) } }
iconComponent.methods.handleImageError.call(fallback)
assert.equal(fallback.data.iconUrl, fallback.data.fallbackUrl)
iconComponent.methods.handleImageError.call(fallback)
assert.equal(fallback.data.iconUrl, fallback.data.fallbackUrl)

require('../pages/home/index.ts')
const { lovePointsService } = require('../services/love-points.ts')
const page = { ...home, data: structuredClone(home.data), setData(value) { Object.assign(this.data, value) } }
async function run() {
  lovePointsService.getUnreadMessages = async () => 2
  lovePointsService.listNotifications = async () => ({ items: [], unread: 3 })
  await page.refreshUnread(true)
  assert.equal(page.data.unread, 5, '聊天与通知均计入首页未读')
  page.openMessages()
  assert.deepEqual(calls.at(-1), ['push', '/pages/chat/index'])
  lovePointsService.getUnreadMessages = async () => 0
  lovePointsService.listNotifications = async () => ({ items: [], unread: 0 })
  await page.refreshUnread(true)
  assert.equal(page.data.unread, 0, '读完返回首页后红点消失')
  lovePointsService.listNotifications = async () => ({ items: [], unread: 1 })
  lovePointsService.getUnreadMessages = async () => { throw Error('未绑定不应调用聊天接口') }
  await page.refreshUnread(false)
  assert.equal(page.data.unread, 1, '未绑定也显示系统通知')
  lovePointsService.listNotifications = async () => { throw Error('暂时离线') }
  await page.refreshUnread(false)
  assert.equal(page.data.unread, 1, '计数读取失败保留上次结果')
  console.log('导航与图标回归通过：四项导航、消息跳转、聊天/系统通知红点、已读刷新、未绑定、离线、SVG 着色与 PNG 回退')
}
run().catch(error => { console.error(error); process.exitCode = 1 })
