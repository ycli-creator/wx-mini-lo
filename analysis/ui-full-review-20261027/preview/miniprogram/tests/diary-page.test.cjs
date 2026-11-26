const assert = require('node:assert/strict')
const storage = new Map()
let definition
const routes = []
Object.assign(globalThis, {
  __LOVE_POINTS_FORCE_LOCAL__: true,
  Page(options) { definition = options },
  wx: {
    getStorageSync: (key) => storage.has(key) ? structuredClone(storage.get(key)) : undefined,
    setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
    showToast() {}, enableAlertBeforeUnload() {}, disableAlertBeforeUnload() {}, stopPullDownRefresh() {},
    navigateTo(options) { routes.push(options.url) }, navigateBack() {},
    showModal: async () => ({ confirm: true }), setClipboardData: async () => ({}),
  },
})
const pageFrom = () => ({ ...definition, data: structuredClone(definition.data), setData(values) { Object.assign(this.data, structuredClone(values)) } })
const input = (field, value) => ({ currentTarget: { dataset: { field } }, detail: { value } })
const tap = (dataset) => ({ currentTarget: { dataset } })
require('../pages/diary/edit.ts')
const editor = pageFrom()
require('../pages/diary/index.ts')
const list = pageFrom()
const { diaryService } = require('../services/diary.ts')
async function run() {
  await editor.onLoad({ date: '2024-02-29' })
  editor.input(input('title', '闰日散步'))
  editor.input(input('body', '看见河边的树。'))
  editor.input(input('category', '生活'))
  editor.inputTags(input('', '散步，周末'))
  await editor.save()
  assert.equal(editor.data.entry.version, 1)
  assert.equal(editor.data.dirty, false)
  await list.refresh()
  assert.equal(list.data.total, 1)
  list.search(input('', '河边'))
  assert.equal(list.data.visible.length, 1)
  list.search(input('', '不存在'))
  assert.equal(list.data.visible.length, 0)
  list.clearFilters()
  list.selectDate(tap({ date: '2024-02-29' }))
  assert.equal(list.data.visible.length, 1)
  await editor.favorite()
  await editor.pin()
  await list.refresh()
  list.changeMode(tap({ mode: 'favorite' }))
  assert.equal(list.data.visible.length, 1)
  assert.equal(list.data.visible[0].pinned, true)
  await editor.remove()
  await list.refresh()
  assert.equal(list.data.total, 0)
  list.changeMode(tap({ mode: 'trash' }))
  assert.equal(list.data.visible.length, 1)
  await editor.restore()
  editor.edit()
  editor.input(input('body', '修改后的日记'))
  await editor.save()
  assert.equal((await diaryService.list())[0].body, '修改后的日记')
  // Use the editor factory again for a new empty draft.
  const newEditor = { ...editor, data: { ...structuredClone(editor.data), id: '', entry: { ...structuredClone(editor.data.entry), id: '', version: 0, title: '', body: '', deleted: false }, editing: true } }
  newEditor.input(input('category', '草稿专属'))
  await newEditor.save(tap({ draft: true }))
  assert.equal(newEditor.data.entry.draft, true)
  await list.refresh()
  list.changeMode(tap({ mode: 'draft' }))
  assert.equal(list.data.visible.length, 1)
  assert.ok(list.data.categoryOptions.includes('草稿专属'))
  list.setData({ month: '2024-02' }); list.filter()
  assert.equal(list.data.days.find((item) => item.date === '2024-02-29').count, 1)
  // Failed saves preserve text and generated identity; retries reuse that identity.
  const save = diaryService.save
  let submitted
  diaryService.save = async (entry) => { submitted = entry.id; throw new Error('模拟网络中断') }
  newEditor.setData({ entry: { ...newEditor.data.entry, id: '', version: 0 }, id: '' })
  newEditor.input(input('body', '不能丢失的内容'))
  await newEditor.save()
  assert.equal(newEditor.data.entry.id, submitted)
  // A committed write whose response is lost must reconcile before later edits.
  const uncertainEditor = { ...editor, data: { ...structuredClone(editor.data), id: '', entry: { ...structuredClone(editor.data.entry), id: '', version: 0, body: '第一次输入' }, editing: true, pendingSave: null } }
  diaryService.save = async (entry) => { await save(entry); throw new Error('响应丢失') }
  await uncertainEditor.save()
  const uncertainId = uncertainEditor.data.entry.id
  assert.equal((await diaryService.list()).find((row) => row.id === uncertainId).body, '第一次输入')
  uncertainEditor.input(input('body', '响应丢失后继续修改'))
  diaryService.save = save
  await uncertainEditor.save(tap({ draft: true }))
  const reconciled = (await diaryService.list()).find((row) => row.id === uncertainId)
  assert.equal(reconciled.body, '响应丢失后继续修改')
  assert.equal(reconciled.draft, true)
  assert.equal(reconciled.version, 2)
  assert.equal(uncertainEditor.data.dirty, false)
  assert.equal(newEditor.data.entry.body, '不能丢失的内容')
  assert.equal(newEditor.data.dirty, true)
  assert.equal(newEditor.data.busy, false)
  diaryService.save = save
  await newEditor.save()
  assert.equal(newEditor.data.entry.id, submitted)
  // A stale refresh cannot overwrite newer results.
  const read = diaryService.list
  const pending = []
  diaryService.list = () => new Promise((resolve) => pending.push(resolve))
  const first = list.refresh(); const second = list.refresh()
  pending[1]([newEditor.data.entry]); await second
  pending[0]([]); await first
  assert.equal(list.data.entries.length, 1)
  diaryService.list = read
  require('../pages/home/index.ts')
  definition.openDiary()
  assert.equal(routes.at(-1), '/pages/diary/index')
  console.log('日记页面流程通过：入口、保存回显、搜索、日期、收藏、草稿、回收站恢复、失败保留、过期请求隔离')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
