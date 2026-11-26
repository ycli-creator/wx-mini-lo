const assert = require('node:assert/strict')
const test = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const fakeCloud = require('./fake-cloud')
const sdkPath = require.resolve('wx-server-sdk')
require.cache[sdkPath] = { id: sdkPath, filename: sdkPath, loaded: true, exports: fakeCloud }
const api = require('../index')
const call = async (openid, action, payload) => {
  fakeCloud.currentOpenId = openid
  return api.main({ action, payload })
}
const entry = (patch = {}) => ({ id: 'entry_test_001', version: 0, date: '2024-02-29', time: '23:59', title: '', body: '我的日记', mood: '开心', weather: '晴', location: '', category: '生活', tags: ['日常'], favorite: false, draft: false, deleted: false, ...patch })
test('diary owner isolation, retry idempotency, optimistic conflicts, trash and drafts', async () => {
  fakeCloud.reset()
  const input = entry({ ownerOpenId: 'victim', coupleId: 'forged' })
  const saved = await call('owner', 'diary.save', input)
  assert.equal(saved.ok, true, saved.message)
  assert.equal(saved.data.version, 1)
  assert.equal(saved.data.pinned, false)
  assert.equal('ownerOpenId' in saved.data, false)
  const duplicate = await call('owner', 'diary.save', input)
  assert.deepEqual(duplicate.data, saved.data)
  assert.equal(fakeCloud.dump('diaries').length, 1)
  assert.deepEqual((await call('victim', 'diary.list', {})).data.entries, [])
  const stale = await call('owner', 'diary.save', entry({ body: '冲突' }))
  assert.equal(stale.code, 'DIARY_CONFLICT')
  const deleted = await call('owner', 'diary.save', { ...saved.data, deleted: true })
  assert.equal(deleted.data.deleted, true)
  const restored = await call('owner', 'diary.save', { ...deleted.data, deleted: false })
  assert.equal(restored.data.body, '我的日记')
  assert.equal(restored.data.version, 3)
  const pinned = await call('owner', 'diary.save', { ...restored.data, pinned: true })
  assert.equal(pinned.data.pinned, true)
  assert.equal(pinned.data.favorite, false)
  assert.equal((await call('owner', 'diary.save', entry({ id: 'draft_test_001', body: '', draft: true }))).ok, true)
  for (const patch of [{ date: '2023-02-29' }, { time: '24:00' }, { title: '字'.repeat(81) }, { body: '' }, { body: '字'.repeat(20001) }, { tags: ['字'.repeat(31)] }, { favorite: 'yes' }, { pinned: 'yes' }]) {
    const invalid = await call('owner', 'diary.save', entry(patch))
    assert.equal(invalid.code, 'DIARY_INPUT_INVALID')
  }
})
test('diary pagination retains over 500 records including drafts and trash', async () => {
  fakeCloud.reset()
  for (let i = 0; i < 555; i++) {
    const id = `entry_${String(i).padStart(8, '0')}`
    await fakeCloud.database().collection('diaries').doc(id).set({ data: { ...entry({ id, version: 1, draft: i % 2 === 0, deleted: i % 3 === 0 }), ownerOpenId: 'owner' } })
  }
  let cursor = ''
  const rows = []
  do {
    const result = await call('owner', 'diary.list', { cursor })
    assert.equal(result.ok, true, result.message)
    rows.push(...result.data.entries)
    cursor = result.data.cursor
  } while (cursor)
  assert.equal(rows.length, 555)
  assert.equal(new Set(rows.map((row) => row.id)).size, 555)
})
test('client and server diary validation stay identical', () => {
  assert.equal(fs.readFileSync(path.resolve(__dirname, '../lib/diary-domain.js'), 'utf8'), fs.readFileSync(path.resolve(__dirname, '../../../miniprogram/utils/diary-domain.js'), 'utf8'))
})

test('editor media and settings persist; bounded history is private and ignores forged history', async () => {
  fakeCloud.reset()
  const input = entry({ markdown: true, titleVisible: false, hidden: true, lineHeight: 2.3, originalImages: true,
    images: [{ id: 'media_image_001', src: 'cloud://env.bucket/diary/private/images/media_image_001.jpg', width: 640, height: 480 }],
    audio: [{ id: 'media_audio_001', src: 'cloud://env.bucket/diary/private/audio/media_audio_001.mp3', name: '雨声', duration: 10 }],
    drawing: 'cloud://env.bucket/diary/private/drawings/media_drawing_001.png', history: [{ entry: 'forged' }],
  })
  let saved = await call('owner', 'diary.save', input)
  assert.equal(saved.ok, true, saved.message)
  assert.equal(saved.data.images[0].width, 640)
  assert.equal(saved.data.hidden, true)
  assert.equal(saved.data.titleVisible, false)
  assert.equal('history' in saved.data, false)
  assert.deepEqual((await call('owner', 'diary.history', { id: input.id })).data, [])
  for (let i = 0; i < 12; i++) {
    saved = await call('owner', 'diary.save', { ...saved.data, body: `修改 ${i}` })
    assert.equal(saved.ok, true, saved.message)
  }
  const history = await call('owner', 'diary.history', { id: input.id })
  assert.equal(history.data.length, 10)
  assert.equal(history.data[0].version, 3)
  assert.equal('ownerOpenId' in history.data[0].entry, false)
  assert.equal((await call('other', 'diary.history', { id: input.id })).code, 'DIARY_NOT_FOUND')
  const legacyEdit = entry({ id: input.id, version: saved.data.version, body: '旧版本编辑器修改文字' })
  const legacySaved = await call('owner', 'diary.save', legacyEdit)
  assert.equal(legacySaved.data.images.length, 1)
  assert.equal(legacySaved.data.hidden, true)
  assert.equal(legacySaved.data.markdown, true)
  assert.notEqual((await call('owner', 'diary.scope', {})).data, (await call('other', 'diary.scope', {})).data)
  for (const patch of [{ images: [{ ...input.images[0], src: 'https://example.com/public.jpg' }] }, { drawing: false }, { drawing: 'wxfile://usr/local.png' }, { lineHeight: 99 }, { hidden: 'yes' }]) {
    assert.equal((await call('owner', 'diary.save', entry({ ...patch, id: 'entry_invalid_001' }))).code, 'DIARY_INPUT_INVALID')
  }
  const mediaOnly = await call('owner', 'diary.save', { ...input, id: 'entry_media_only', body: '' })
  assert.equal(mediaOnly.ok, true, mediaOnly.message)
})
