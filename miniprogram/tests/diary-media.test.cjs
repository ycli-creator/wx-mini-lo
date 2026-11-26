const assert = require('node:assert/strict')
const copied = []
const states = []
const completed = []
let copyFails = false
let uploads = 0
const handlers = {}
Object.assign(globalThis, { __LOVE_POINTS_FORCE_LOCAL__: true, wx: {
  env: { USER_DATA_PATH: 'http://usr' },
  getFileSystemManager: () => ({ copyFile(options) { if (copyFails) options.fail({ errMsg: 'disk full' }); else { copied.push(options); options.success() } } }),
  chooseMedia: async () => ({ tempFiles: [{ tempFilePath: 'http://tmp/photo.jpg' }, { tempFilePath: 'http://tmp/other.jpg' }] }),
  getImageInfo: async () => ({ width: 640, height: 480 }),
  authorize: async () => ({}),
  getRecorderManager: () => ({
    onStart(fn) { handlers.start = fn }, onStop(fn) { handlers.stop = fn }, onError(fn) { handlers.error = fn }, onInterruptionBegin(fn) { handlers.interruption = fn },
    start() { queueMicrotask(() => handlers.start()) },
    stop() { handlers.stop({ tempFilePath: 'http://tmp/recording.mp3', duration: 2500 }) },
  }),
  cloud: { uploadFile: async () => { uploads++; return { fileID: 'cloud://unused' } }, getTempFileURL: async () => ({ fileList: [{ status: 0, tempFileURL: 'https://example.invalid/signed-audio' }] }) },
} })
const { chooseDiaryImages, createDiaryRecorder, uploadDiaryAudio, diaryMediaUrl } = require('../services/diary-media.ts')
const tick = () => new Promise((resolve) => setImmediate(resolve))
async function run() {
  const images = await chooseDiaryImages()
  assert.equal(images.length, 2)
  assert.match(images[0].src, /^http:\/\/usr\/diary-/)
  assert.equal(copied.length, 2)
  // Each completed image is handed to the editor before a later image fails.
  let calls = 0
  wx.getImageInfo = async () => { if (++calls === 2) throw new Error('second image failed'); return { width: 100, height: 100 } }
  const persisted = []
  await assert.rejects(chooseDiaryImages(2, false, (image) => persisted.push(image)), /second image failed/)
  assert.equal(persisted.length, 1)
  const recorder = createDiaryRecorder({ onComplete: (audio) => completed.push(audio), onError() {}, onStateChange: (value) => states.push(value) })
  await recorder.start()
  copyFails = true
  recorder.stop()
  await tick()
  assert.equal(recorder.hasPending(), true)
  assert.equal(completed.length, 0)
  copyFails = false
  await recorder.retry()
  assert.equal(recorder.hasPending(), false)
  assert.equal(completed.length, 1)
  assert.equal(completed[0].duration, 3)
  assert.deepEqual(states, ['recording', 'saving', 'idle', 'saving', 'idle'])
  await recorder.start()
  recorder.cancel()
  await tick()
  assert.equal(completed.length, 1)
  globalThis.__LOVE_POINTS_FORCE_LOCAL__ = false
  await assert.rejects(uploadDiaryAudio({ path: 'http://tmp/private.mp3', name: '私密录音.mp3', duration: 2 }), /私密附件存储尚未配置/)
  assert.equal(uploads, 0)
  assert.equal(await diaryMediaUrl('cloud://env.bucket/diary/private/audio/a.mp3'), 'https://example.invalid/signed-audio')
  assert.equal(await diaryMediaUrl('http://usr/audio.mp3'), 'http://usr/audio.mp3')
  console.log('日记附件验证通过：本机持久化、部分图片成功保留、录音失败重试与取消、云上传关闭、临时播放地址')
}
run().catch((error) => { console.error(error); process.exitCode = 1 })
