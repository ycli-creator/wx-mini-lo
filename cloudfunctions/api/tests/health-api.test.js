const assert = require('node:assert/strict')
const test = require('node:test')
const fakeCloud = require('./fake-cloud')
const sdkPath = require.resolve('wx-server-sdk')
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: fakeCloud }
const api = require('../index')
const call = async (openid, action, payload) => {
  fakeCloud.currentOpenId = openid
  return api.main({ action, payload })
}
test('health API isolates owners, persists edits, rejects stale versions and deduplicates retries', async () => {
  fakeCloud.reset()
  const range = { start: '2024-02-01', end: '2024-03-10' }
  const input = { kind: 'mood', date: '2024-02-29', index: 2, delta: 1, version: 0, operationId: 'health_test_op_1', rangeStart: range.start, rangeEnd: range.end, ownerOpenId: 'victim' }
  const saved = await call('owner', 'health.change', input)
  assert.equal(saved.ok, true, saved.message)
  assert.equal(saved.data.days[0].moods[2], 1)
  const duplicate = await call('owner', 'health.change', input)
  assert.equal(duplicate.data.profile.version, 1)
  assert.equal(duplicate.data.days[0].moods[2], 1)
  const stale = await call('owner', 'health.change', { ...input, operationId: 'health_test_op_2' })
  assert.equal(stale.ok, false)
  const other = await call('victim', 'health.read', range)
  assert.deepEqual(other.data.days, [])
  assert.equal(other.data.profile.version, 0)
  const own = await call('owner', 'health.read', range)
  assert.equal(own.data.days[0].moods[2], 1)
  assert.equal('ownerOpenId' in own.data.days[0], false)
  const outside = await call('owner', 'health.read', { start: '2024-03-01', end: '2024-03-31' })
  assert.deepEqual(outside.data.days, [])
})
test('legacy monthly records are filtered before pagination and retain more than 500 matching entries', async () => {
  fakeCloud.reset()
  await call('owner', 'auth.login', {})
  const user = fakeCloud.dump('users').find((item) => item._id === 'owner')
  const { requireSpace } = require('../lib/shared')
  const { coupleId } = await requireSpace(user._id)
  for (let index = 0; index < 1100; index++) {
    await fakeCloud.database().collection('daily_records').doc(`record_${index}`).set({ data: {
      coupleId, ownerOpenId: 'owner', visibility: 'self', deleted: false,
      date: index < 550 ? '2024-02-29' : '2024-03-20', type: 'event', title: '历史记录', createdAt: new Date(),
    } })
  }
  const result = await call('owner', 'records.list', { month: '2024-02' })
  assert.equal(result.ok, true, result.message)
  assert.equal(result.data.length, 550)
  assert.equal(result.data.every((item) => item.date === '2024-02-29'), true)
})
