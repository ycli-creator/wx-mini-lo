import { CLOUD_ENV_ID, DIARY_PRIVATE_MEDIA_ENABLED, isCloudEnabled } from '../config/env'
import { runAction } from './client'

export interface DiaryImage { id: string; src: string; width: number; height: number }
export interface DiaryAudio { id: string; src: string; name: string; duration: number }
export type DiaryRecorderState = 'idle' | 'recording' | 'saving'
interface AudioInput { path: string; name: string; duration: number }
interface RecorderCallbacks {
  onComplete(audio: DiaryAudio): void
  onError(error: Error): void
  onStateChange?(state: DiaryRecorderState): void
}
export interface DiaryRecorder {
  start(): Promise<void>
  stop(): void
  cancel(): void
  retry(): Promise<void>
  hasPending(): boolean
}

const createId = () => `media_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'errMsg' in error) return String(error.errMsg)
  return '附件保存失败，请重试'
}
export const isDiaryMediaCancellation = (error: unknown) => /cancel/i.test(errorMessage(error))
const toError = (error: unknown) => new Error(errorMessage(error))
const extension = (path: string, fallback: string) => {
  const match = path.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)
  return match ? match[1].toLowerCase() : fallback
}

// Persist file IDs, never public or expiring download URLs. The diary/private/
// prefix must have creator-only read/write rules in the CloudBase environment.
const persistMedia = async (path: string, kind: 'images' | 'audio' | 'drawings', id: string, ext: string): Promise<string> => {
  if (!path) throw new Error('未找到附件文件，请重新选择')
  if (path.startsWith('cloud://')) return path
  if (/^https?:\/\//i.test(path) && !/^http:\/\/tmp\//i.test(path) && !path.startsWith(`${wx.env.USER_DATA_PATH}/`)) {
    throw new Error('请选择设备中的附件文件')
  }
  if (isCloudEnabled()) {
    if (!DIARY_PRIVATE_MEDIA_ENABLED) throw new Error('私密附件存储尚未配置，附件暂未上传；文字日记仍可保存')
    await runAction('diary.scope', {}, () => 'local-demo')
    const uploaded = await wx.cloud.uploadFile({
      cloudPath: `diary/private/${kind}/${id}.${ext}`,
      filePath: path,
      config: { env: CLOUD_ENV_ID },
    })
    if (!uploaded.fileID || !uploaded.fileID.startsWith('cloud://')) throw new Error('附件上传未完成，请重试')
    return uploaded.fileID
  }
  if (path.startsWith(`${wx.env.USER_DATA_PATH}/`)) return path
  const destination = `${wx.env.USER_DATA_PATH}/diary-${id}.${ext}`
  await new Promise<void>((resolve, reject) => wx.getFileSystemManager().copyFile({
    srcPath: path, destPath: destination, success: () => resolve(), fail: reject,
  }))
  return destination
}

export const chooseDiaryImages = async (count = 9, original = false, onPersist?: (image: DiaryImage) => void): Promise<DiaryImage[]> => {
  let selection: WechatMiniprogram.ChooseMediaSuccessCallbackResult
  try {
    selection = await wx.chooseMedia({ count: Math.max(1, Math.min(9, count)), mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: [original ? 'original' : 'compressed'] })
  } catch (error) {
    if (isDiaryMediaCancellation(error)) return []
    throw toError(error)
  }
  const images: DiaryImage[] = []
  for (const file of selection.tempFiles) {
    const info = await wx.getImageInfo({ src: file.tempFilePath })
    const id = createId()
    const src = await persistMedia(file.tempFilePath, 'images', id, extension(file.tempFilePath, 'jpg'))
    const image = { id, src, width: info.width, height: info.height }
    images.push(image)
    if (onPersist) onPersist(image)
  }
  return images
}

const audioDuration = (path: string): Promise<number> => new Promise((resolve) => {
  const context = wx.createInnerAudioContext()
  let finished = false
  let readTimer: ReturnType<typeof setTimeout> | undefined
  const complete = (duration: number) => {
    if (finished) return
    finished = true
    clearTimeout(timeout)
    if (readTimer !== undefined) clearTimeout(readTimer)
    context.destroy()
    resolve(Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0)
  }
  const timeout = setTimeout(() => complete(context.duration), 2000)
  context.onCanplay(() => {
    // WeChat may populate duration shortly after the canplay event.
    readTimer = setTimeout(() => complete(context.duration), 100)
  })
  context.onError(() => complete(0))
  context.src = path
})

export const uploadDiaryAudio = async (input: AudioInput): Promise<DiaryAudio> => {
  const id = createId()
  return {
    id,
    src: await persistMedia(input.path, 'audio', id, extension(input.name, extension(input.path, 'mp3'))),
    name: input.name || '录音',
    duration: Number.isFinite(input.duration) ? Math.max(0, Math.round(input.duration)) : 0,
  }
}

export const chooseDiaryAudio = async (): Promise<DiaryAudio | null> => {
  let selection: WechatMiniprogram.ChooseMessageFileSuccessCallbackResult
  try {
    selection = await wx.chooseMessageFile({ count: 1, type: 'file', extension: ['mp3', 'm4a', 'aac', 'wav'] })
  } catch (error) {
    if (isDiaryMediaCancellation(error)) return null
    throw toError(error)
  }
  const file = selection.tempFiles[0]
  if (!file) return null
  if (!/\.(mp3|m4a|aac|wav)$/i.test(file.name)) throw new Error('请选择 MP3、M4A、AAC 或 WAV 音频')
  if (file.size > 50 * 1024 * 1024) throw new Error('音频文件不能超过 50 MB')
  return uploadDiaryAudio({ path: file.path, name: file.name, duration: await audioDuration(file.path) })
}

export const uploadDiaryDrawing = (path: string): Promise<string> => persistMedia(path, 'drawings', createId(), 'png')

export const diaryMediaUrl = async (src: string): Promise<string> => {
  if (!src.startsWith('cloud://')) return src
  const result = await wx.cloud.getTempFileURL({ fileList: [src], config: { env: CLOUD_ENV_ID } })
  const file = result.fileList[0]
  if (!file || file.status !== 0 || !file.tempFileURL) throw new Error('附件暂时无法读取，请重试')
  return file.tempFileURL
}

interface RecordingSession {
  callbacks: RecorderCallbacks
  cancelled: boolean
  recording: boolean
  saving: boolean
  pending: AudioInput | null
  resolveStart: (() => void) | null
  rejectStart: ((error: Error) => void) | null
}
let recorderManager: WechatMiniprogram.RecorderManager | null = null
let activeSession: RecordingSession | null = null
const state = (session: RecordingSession, value: DiaryRecorderState) => {
  if (!session.cancelled && session.callbacks.onStateChange) session.callbacks.onStateChange(value)
}
const saveRecording = async (session: RecordingSession): Promise<void> => {
  if (session.cancelled || session.saving || !session.pending) return
  session.saving = true
  state(session, 'saving')
  try {
    const audio = await uploadDiaryAudio(session.pending)
    session.pending = null
    if (!session.cancelled) session.callbacks.onComplete(audio)
  } catch (error) {
    // Keep the original file available for retry after an upload failure.
    if (!session.cancelled) session.callbacks.onError(toError(error))
  } finally {
    session.saving = false
    state(session, 'idle')
  }
}
const manager = (): WechatMiniprogram.RecorderManager => {
  if (recorderManager) return recorderManager
  recorderManager = wx.getRecorderManager()
  recorderManager.onStart(() => {
    const session = activeSession
    if (!session) return
    session.recording = true
    if (session.cancelled) { recorderManager!.stop(); return }
    state(session, 'recording')
    if (session.resolveStart) session.resolveStart()
    session.resolveStart = null
    session.rejectStart = null
  })
  recorderManager.onStop((result) => {
    const session = activeSession
    activeSession = null
    if (!session) return
    session.recording = false
    if (session.cancelled) return
    session.pending = { path: result.tempFilePath, name: `录音-${Date.now()}.mp3`, duration: result.duration / 1000 }
    void saveRecording(session)
  })
  recorderManager.onError((error) => {
    const session = activeSession
    activeSession = null
    if (!session) return
    session.recording = false
    if (session.rejectStart) session.rejectStart(toError(error))
    else if (!session.cancelled) session.callbacks.onError(toError(error))
    session.resolveStart = null
    session.rejectStart = null
    state(session, 'idle')
  })
  recorderManager.onInterruptionBegin(() => {
    if (activeSession && activeSession.recording) recorderManager!.stop()
  })
  return recorderManager
}

export const createDiaryRecorder = (callbacks: RecorderCallbacks): DiaryRecorder => {
  const session: RecordingSession = { callbacks, cancelled: false, recording: false, saving: false, pending: null, resolveStart: null, rejectStart: null }
  return {
    async start() {
      if (activeSession || session.saving) throw new Error('正在录音或保存，请稍候')
      if (session.pending) throw new Error('上一段录音尚未保存，请先重试保存')
      session.cancelled = false
      activeSession = session
      try {
        await wx.authorize({ scope: 'scope.record' })
        if (session.cancelled) { activeSession = null; return }
        await new Promise<void>((resolve, reject) => {
          session.resolveStart = resolve
          session.rejectStart = reject
          manager().start({ duration: 600000, sampleRate: 44100, numberOfChannels: 1, encodeBitRate: 128000, format: 'mp3' })
        })
      } catch (error) {
        if (activeSession === session) activeSession = null
        session.resolveStart = null
        session.rejectStart = null
        state(session, 'idle')
        throw toError(error)
      }
    },
    stop() { if (activeSession === session && session.recording) manager().stop() },
    cancel() {
      session.cancelled = true
      session.pending = null
      if (session.resolveStart) session.resolveStart()
      session.resolveStart = null
      session.rejectStart = null
      if (activeSession === session && session.recording) manager().stop()
    },
    retry: () => saveRecording(session),
    hasPending: () => session.pending !== null,
  }
}
