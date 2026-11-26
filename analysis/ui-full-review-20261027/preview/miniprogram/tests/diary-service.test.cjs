const assert = require('node:assert/strict')
const storage = new Map()
Object.assign(globalThis, { __LOVE_POINTS_FORCE_LOCAL__: true, wx: {
  getStorageSync: (key) => storage.has(key) ? structuredClone(storage.get(key)) : undefined,
  setStorageSync: (key, value) => storage.set(key, structuredClone(value)),
  showLoading() {}, hideLoading() {}, cloud: {},
} })
const { diaryService } = require('../services/diary.ts')
const entry = { id: '', version: 0, date: '2024-02-29', time: '12:30', title: '', body: '今天很好', mood: '', weather: '', location: '', category: '', tags: [], favorite: false, deleted: false, draft: false, createdAt: '', updatedAt: '' }
async function run() {
  const saved = await diaryService.save(entry)
  assert.ok(entry.id)
  assert.equal((await diaryService.save(entry)).version, 1)
  assert.equal((await diaryService.list()).length, 1)
  await assert.rejects(diaryService.save({ ...entry, body: '旧版本' }), /其他页面修改/)
  const removed = await diaryService.remove(saved)
  assert.equal(removed.deleted, true)
  assert.equal((await diaryService.restore(removed)).deleted, false)
  globalThis.__LOVE_POINTS_FORCE_LOCAL__ = false
  wx.cloud.callFunction = async () => { throw new Error('网络中断') }
  await assert.rejects(diaryService.list(), /网络中断/)
  await assert.rejects(diaryService.save({ ...entry, id: 'cloud_new_entry' }), /网络中断/)
  assert.equal(storage.get('love-points-diary-demo-v1').length, 1)
  const cursors = []
  wx.cloud.callFunction = async ({ data }) => {
    cursors.push(data.payload.cursor)
    return { result: { ok: true, data: { entries: [{ ...saved, id: data.payload.cursor || 'first' }], cursor: data.payload.cursor ? '' : 'next_page' } } }
  }
  assert.equal((await diaryService.list()).length, 2)
  assert.deepEqual(cursors, ['', 'next_page'])
  console.log('日记服务验证通过：本机持久化、幂等、冲突、恢复、云端故障隔离与分页。')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
