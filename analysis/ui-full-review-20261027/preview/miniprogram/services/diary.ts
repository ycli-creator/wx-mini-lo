import { runAction } from './client'
import { normalize } from '../utils/diary-domain'
import { localSharedMood, setLocalSharedMood } from './health'
import { todayKey } from '../utils/health-domain'

export interface DiaryEntry {
  id: string; version: number; date: string; time: string; title: string; body: string
  mood: string; weather: string; location: string; category: string; tags: string[]
  moodChanged?: boolean
  favorite: boolean; pinned: boolean; deleted: boolean; draft: boolean; createdAt: string; updatedAt: string
  markdown?: boolean; titleVisible?: boolean; lineHeight?: number; originalImages?: boolean; hidden?: boolean; paper?: string
  images?: Array<{ id: string; src: string; width: number; height: number }>
  audio?: Array<{ id: string; src: string; name: string; duration: number }>
  drawing?: string
}
export interface DiaryRevision { version: number; savedAt: string; entry: DiaryEntry }
interface LocalEntry extends DiaryEntry { lastMutation?: string; history?: DiaryRevision[] }
interface DiaryPage { entries: DiaryEntry[]; cursor: string }
const STORAGE_KEY = 'love-points-diary-demo-v1'
const readLocal = (): LocalEntry[] => wx.getStorageSync<LocalEntry[]>(STORAGE_KEY) || []
const project = (entry: LocalEntry): DiaryEntry => ({ ...normalize(entry), ...(!entry.draft && !entry.deleted && localSharedMood(entry.date) !== undefined ? { mood: localSharedMood(entry.date)! } : {}), id: entry.id, version: entry.version, createdAt: entry.createdAt, updatedAt: entry.updatedAt })
const save = async (input: DiaryEntry): Promise<DiaryEntry> => {
  const values = normalize(input)
  // Older deployments silently discard the new fields. Check before any write.
  await runAction('diary.scope', {}, () => 'local-demo')
  // Keep the generated ID on the editor object so a failed response can be retried safely.
  if (!input.id) input.id = `entry_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
  const payload = { ...values, id: input.id, version: input.version, ...(input.moodChanged ? { moodChanged: true } : {}) }
  return runAction<DiaryEntry>('diary.save', payload, () => {
    const rows = readLocal()
    const old = rows.find((row) => row.id === input.id)
    const fingerprint = JSON.stringify(payload)
    if (old?.lastMutation === fingerprint) return project(old)
    if ((old?.version || 0) !== input.version) throw new Error('日记已在其他页面修改，请重新打开后再保存')
    if (!old && values.deleted) throw new Error('日记不存在')
    const now = new Date().toISOString()
    const history = old ? [...(old.history || []), { version: old.version, savedAt: old.updatedAt, entry: { ...normalize(old), id: old.id, version: old.version, createdAt: old.createdAt, updatedAt: old.updatedAt } }].slice(-10) : []
    const saved = { ...payload, version: input.version + 1, createdAt: old?.createdAt || now, updatedAt: now, lastMutation: fingerprint, history }
    if (!values.draft && !values.deleted && values.date <= todayKey() && (input.moodChanged || values.mood !== (old?.mood || '') || (values.mood && (!old || old.draft || old.date !== values.date)))) setLocalSharedMood(values.date, values.mood)
    wx.setStorageSync(STORAGE_KEY, [...rows.filter((row) => row.id !== input.id), saved])
    return project(saved)
  })
}
export const diaryService = {
  recoveryScope: (): Promise<string> => runAction('diary.scope', {}, () => 'local-demo'),
  history: (id: string): Promise<DiaryRevision[]> => runAction('diary.history', { id }, () => readLocal().find((row) => row.id === id)?.history || []),
  list: async (): Promise<DiaryEntry[]> => {
    const entries: DiaryEntry[] = []
    let cursor = ''
    do {
      const page = await runAction<DiaryPage>('diary.list', { cursor }, () => ({ entries: readLocal().map(project), cursor: '' }))
      entries.push(...page.entries)
      if (page.cursor && page.cursor === cursor) throw new Error('日记分页读取失败，请重试')
      cursor = page.cursor
    } while (cursor)
    return entries.sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
  },
  save,
  remove: (entry: DiaryEntry): Promise<DiaryEntry> => save({ ...entry, deleted: true }),
  restore: (entry: DiaryEntry): Promise<DiaryEntry> => save({ ...entry, deleted: false }),
}
