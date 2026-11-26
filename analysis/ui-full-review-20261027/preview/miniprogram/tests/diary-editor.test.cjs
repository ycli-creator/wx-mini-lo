const assert = require('node:assert/strict')
const storage = new Map()
const navigation = []
let definition
Object.assign(globalThis, {
  __LOVE_POINTS_FORCE_LOCAL__: true,
  Page(options) { definition = options },
  getCurrentPages: () => [{}, {}],
  wx: {
    env: { USER_DATA_PATH: 'http://usr' },
    getStorageSync: (key) => structuredClone(storage.get(key)),
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    showToast() {}, enableAlertBeforeUnload() {}, disableAlertBeforeUnload() {},
    showModal: async () => ({ confirm: true }), navigateBack() { navigation.push('back') },
  },
})
require('../pages/diary/edit.ts')
const create = () => ({ ...definition, data: structuredClone(definition.data), setData(values) { Object.assign(this.data, structuredClone(values)) } })
const event = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } })
const tap = (dataset) => ({ currentTarget: { dataset } })
const { diaryService } = require('../services/diary.ts')
const { markdownHtml } = require('../utils/diary-format.ts')
async function run() {
  const page = create()
  await page.onLoad({})
  assert.equal(page.data.entry.titleVisible, false)
  assert.match(page.data.displayDate, /^\d+月\d+日$/)
  page.keyboardChange({ detail: { height: 300 } })
  assert.equal(page.data.keyboardOpen, true)
  assert.equal(page.data.keyboardHeight, 300)
  page.keyboardChange({ detail: { height: 0 } })
  assert.equal(page.data.keyboardOpen, false)
  page.input(event('body', '未保存的想法'))
  const key = page.data.recoveryKey
  assert.equal(storage.get(key).entry.body, '未保存的想法')
  const reopened = create()
  await reopened.onLoad({})
  assert.equal(reopened.data.sheet, 'recovery')
  reopened.recover()
  assert.equal(reopened.data.entry.body, '未保存的想法')
  reopened.setData({ cursor: reopened.data.entry.body.length })
  reopened.tool(tap({ action: 'bold' }))
  assert.equal(reopened.data.entry.markdown, true)
  assert.match(reopened.data.entry.body, /\*\*文字\*\*$/)
  reopened.tool(tap({ action: 'undo' }))
  assert.equal(reopened.data.entry.body, '未保存的想法')
  reopened.tool(tap({ action: 'redo' }))
  assert.match(reopened.data.entry.body, /\*\*文字\*\*$/)
  await reopened.menuAction(tap({ action: 'hidden' }))
  await reopened.menuAction(tap({ action: 'title' }))
  assert.equal(reopened.data.entry.titleVisible, true)
  await reopened.menuAction(tap({ action: 'title' }))
  assert.equal(reopened.data.entry.titleVisible, false)
  reopened.setData({ entry: { ...reopened.data.entry, images: [{ id: 'media_test_image', src: 'http://usr/diary-image.jpg', width: 200, height: 100 }] } })
  await reopened.save()
  assert.equal(reopened.data.dirty, false)
  assert.equal(storage.get(key), null)
  assert.equal(reopened.data.entry.hidden, true)
  assert.equal(reopened.data.entry.images[0].src, 'http://usr/diary-image.jpg')
  assert.equal('history' in reopened.data.entry, false)
  reopened.edit()
  reopened.input(event('body', '第二个版本'))
  await reopened.save()
  assert.equal((await diaryService.history(reopened.data.id)).length, 1)
  await reopened.menuAction(tap({ action: 'history' }))
  await reopened.restoreRevision(tap({ index: 0 }))
  assert.match(reopened.data.entry.body, /\*\*文字\*\*$/)
  assert.equal(reopened.data.entry.version, 2)
  assert.equal(reopened.data.dirty, true)
  await reopened.save()
  require('../pages/diary/index.ts')
  const list = create()
  await list.refresh()
  assert.equal(list.data.visible.length, 0)
  assert.equal(list.data.total, 0)
  list.changeMode(tap({ mode: 'hidden' }))
  assert.equal(list.data.visible.length, 1)
  assert.equal(list.data.visible[0].displayTitle, reopened.data.entry.date)
  reopened.edit()
  reopened.input(event('body', '返回时自动保存'))
  await reopened.leave()
  assert.equal(navigation.at(-1), 'back')
  assert.equal((await diaryService.list())[0].body, '返回时自动保存')
  assert.equal(reopened.data.dirty, false)
  globalThis.__LOVE_POINTS_FORCE_LOCAL__ = false
  const calls = []
  wx.cloud = { callFunction: async ({ data }) => { calls.push(data.action); return { result: { ok: false, message: 'ACTION_NOT_FOUND' } } } }
  await assert.rejects(diaryService.save({ ...reopened.data.entry, body: '不应覆盖' }), /ACTION_NOT_FOUND/)
  assert.deepEqual(calls, ['diary.scope'])
  const html = markdownHtml('# 标题\n**加粗**\n<script>alert(1)</script>\n[危险](javascript:alert(1))\n```\n**原样代码**\n```')
  assert.match(html, /<h1>标题<\/h1>/)
  assert.match(html, /<strong>加粗<\/strong>/)
  assert.equal(html.includes('<script>'), false)
  assert.equal(html.includes('href="javascript:'), false)
  assert.match(html, /<code>\*\*原样代码\*\*<\/code>/)
  console.log('日记编辑器验证通过：恢复缓存、格式撤销重做、隐藏过滤、附件持久化、历史恢复、旧后端保护、安全预览')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
