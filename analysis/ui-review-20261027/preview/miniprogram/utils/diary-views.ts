import type { DiaryEntry } from '../services/diary'

export const diaryToday = (now = new Date()): string => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export const publishedDiaries = (entries: DiaryEntry[]) => entries.filter((entry) => !entry.deleted && !entry.draft && !entry.hidden)
export const diaryWords = (body: string): number => body.replace(/\s/g, '').length
export const diaryChrome = () => {
  const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : null
  const capsule = typeof wx.getMenuButtonBoundingClientRect === 'function' ? wx.getMenuButtonBoundingClientRect() : null
  const navTop = capsule?.bottom ? capsule.bottom + 8 : (info?.statusBarHeight || 24) + 8
  return { navTop, navBottom: navTop + 54 }
}
export const diaryStatistics = (entries: DiaryEntry[], today = diaryToday()) => {
  const rows = publishedDiaries(entries)
  const dates = [...new Set(rows.map((entry) => entry.date))].sort()
  const firstDate = dates[0] || ''
  const recordedDays = new Set(dates.filter((date) => date <= today).map(dayNumber))
  let cursor = dayNumber(today)
  if (!recordedDays.has(cursor)) cursor -= 1
  let streak = 0
  while (recordedDays.has(cursor)) { streak += 1; cursor -= 1 }
  return {
    total: rows.length, wordCount: rows.reduce((sum, row) => sum + diaryWords(row.body), 0),
    imageCount: rows.reduce((sum, row) => sum + (row.images || []).length, 0), activeDays: dates.length,
    firstDate, durationDays: firstDate ? Math.max(0, dayNumber(today) - dayNumber(firstDate) + 1) : 0, streak,
  }
}
export const feedPreview = (entry: DiaryEntry): string => {
  const text = entry.markdown ? entry.body.replace(/^#{1,6}\s+/gm, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|__|~~|`/g, '') : entry.body
  return text.trim().slice(0, 240)
}
export const diaryFeed = (entries: DiaryEntry[]) => entries.slice()
  .sort((a, b) => Number(b.pinned) - Number(a.pinned) || `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`) || a.id.localeCompare(b.id))
  .map((entry, index, sorted) => {
    const photos = [...(entry.images || []).map((image) => image.src), ...(entry.drawing ? [entry.drawing] : [])]
    return { ...entry, displayTitle: entry.titleVisible === false ? entry.date : entry.title || '无标题日记',
      showTitle: entry.titleVisible !== false && Boolean(entry.title), preview: feedPreview(entry), photos: photos.slice(0, 3),
      extraPhotos: Math.max(0, photos.length - 3), audioCount: (entry.audio || []).length,
      showDate: index === 0 || sorted[index - 1].date !== entry.date,
      dayLabel: String(Number(entry.date.slice(8))), monthLabel: `${Number(entry.date.slice(5, 7))}月`,
      weekdayLabel: weekdays[new Date(`${entry.date}T12:00:00Z`).getUTCDay()],
    }
  })

export interface DiaryMemory {
  id: string; kind: 'anniversary' | 'random'; label: string; date: string; dates: string[]; count: number
  cover: string; preview: string; revealed: boolean; empty: boolean
}
// Stable during one day, including refresh/search; a new day brings another draw.
const shuffledDates = (dates: string[], seed: string) => {
  let state = 2166136261
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0
  const result = [...dates].sort()
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const selected = state % (index + 1)
    ;[result[index], result[selected]] = [result[selected], result[index]]
  }
  return result
}
export const diaryMemories = (entries: DiaryEntry[], today = diaryToday()): DiaryMemory[] => {
  const past = publishedDiaries(entries).filter((entry) => entry.date < today)
  const groups = new Map<string, DiaryEntry[]>()
  for (const row of past) groups.set(row.date, [...(groups.get(row.date) || []), row])
  const anniversaryDates = [...groups.keys()].filter((date) => date.slice(5) === today.slice(5) && date.slice(0, 4) < today.slice(0, 4)).sort().reverse()
  const card = (kind: DiaryMemory['kind'], date: string, dates: string[], index: number): DiaryMemory => {
    const rows = groups.get(date) || []
    const lead = rows.slice().sort((a, b) => b.time.localeCompare(a.time))[0]
    return { id: kind === 'anniversary' ? 'anniversary' : `random-${date}`, kind, label: kind === 'anniversary' ? '往年今日' : `时光盲盒 ${String(index).padStart(2, '0')}`,
      date, dates, count: dates.reduce((sum, day) => sum + (groups.get(day) || []).length, 0), cover: lead?.images?.[0]?.src || lead?.drawing || '',
      preview: lead ? feedPreview(lead).slice(0, 52) || '那一天，你留下了一些画面。' : '', revealed: false, empty: !lead }
  }
  const candidates = [...groups.keys()].filter((date) => !anniversaryDates.includes(date))
  const random = shuffledDates(candidates, `${today}:${[...groups.keys()].sort().join(',')}`).slice(0, 5)
  return [card('anniversary', anniversaryDates[0] || '', anniversaryDates, 0), ...random.map((date, index) => card('random', date, [date], index + 1))]
}

export type DiaryCalendarMode = 'images' | 'mood' | 'weather' | 'words'
export interface DiaryDay {
  date: string; day: number; count: number; image: string; mood: string; weather: string; words: number
  future: boolean; today: boolean; empty: boolean
}
export interface DiaryMonth { id: string; month: string; label: string; count: number; days: DiaryDay[] }
const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']
export const diaryYear = (entries: DiaryEntry[], year: number, today = diaryToday()): DiaryMonth[] => {
  const groups = new Map<string, DiaryEntry[]>()
  for (const row of publishedDiaries(entries)) groups.set(row.date, [...(groups.get(row.date) || []), row])
  return monthNames.map((label, index) => {
    const month = `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}`
    const offset = new Date(`${month}-01T12:00:00Z`).getUTCDay()
    const monthEnd = new Date(`${month}-01T12:00:00Z`)
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0)
    const length = monthEnd.getUTCDate()
    const totalCells = Math.ceil((offset + length) / 7) * 7
    let count = 0
    const days = Array.from({ length: totalCells }, (_, cell): DiaryDay => {
      const day = cell - offset + 1
      if (day < 1 || day > length) return { date: '', day: 0, count: 0, image: '', mood: '', weather: '', words: 0, future: false, today: false, empty: true }
      const date = `${month}-${String(day).padStart(2, '0')}`
      const rows = (groups.get(date) || []).slice().sort((a, b) => b.time.localeCompare(a.time))
      count += rows.length
      return { date, day, count: rows.length, image: rows.flatMap((row) => (row.images || []).map((image) => image.src).concat(row.drawing ? [row.drawing] : []))[0] || '',
        mood: rows.find((row) => row.mood)?.mood || '', weather: rows.find((row) => row.weather)?.weather || '',
        words: rows.reduce((sum, row) => sum + diaryWords(row.body), 0), future: date > today, today: date === today, empty: false }
    })
    return { id: `month-${index + 1}`, month, label, count, days }
  })
}
export const diaryYears = (entries: DiaryEntry[], today = diaryToday()) => [...new Set([
  ...Array.from({ length: 52 }, (_, index) => Number(today.slice(0, 4)) + 1 - index),
  ...publishedDiaries(entries).map((entry) => Number(entry.date.slice(0, 4))),
])].sort((a, b) => b - a).map(String)
