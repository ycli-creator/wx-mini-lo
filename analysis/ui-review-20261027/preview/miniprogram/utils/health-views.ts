import { addDays, diffDays, todayKey, predictionFor, MOODS, HABITS } from './health-domain'
import type { HealthStatistics } from './health-domain'

export const MOOD_ICONS = ['laugh', 'happy', 'meh', 'angry', 'sad']
export const HABIT_ICONS = ['bread', 'apple-fruit', 'drink', 'football', 'toilet-paper']
export const HABIT_COLORS = ['#eab253', '#fb745f', '#63c5dc', '#8fbd55', '#d6a467']

export function cycleStatistics(state: HealthStatistics, today = todayKey()) {
  const cycles = [...state.profile.cycles].sort((a, b) => b.start.localeCompare(a.start))
  const setting = state.profile.settings
  const rows = cycles.map((cycle, index) => {
    const next = cycles[index - 1]
    const length = next ? diffDays(cycle.start, next.start) : setting.cycleLength
    const periodDays = cycle.end ? diffDays(cycle.start, cycle.end) + 1 : setting.periodLength
    return { id: cycle.id, date: cycle.start.slice(5), length, estimated: !next,
      width: Math.min(100, (next ? length : Math.max(1, diffDays(cycle.start, today) + 1)) / Math.max(setting.cycleLength, ...cycles.slice(1).map((item, i) => diffDays(item.start, cycles[i].start)), 1) * 100),
      dots: Array.from({ length: Math.min(100, periodDays) }, (_, i) => i),
      periodDays, end: cycle.end, start: cycle.start }
  })
  const completed = rows.filter((row) => !row.estimated)
  const cycleDifferences = completed.filter((row) => row.length !== setting.cycleLength).length
  const ended = rows.filter((row) => row.end)
  const periodDifferences = ended.filter((row) => row.periodDays !== setting.periodLength).length
  const different = rows.filter((row) => (!row.estimated && row.length !== setting.cycleLength) || (row.end && row.periodDays !== setting.periodLength)).length
  return { rows, total: rows.length, cycleDifferences, periodDifferences, differencePercent: rows.length ? Math.round(different / rows.length * 100) : 0,
    matchPercent: rows.length ? Math.round((rows.length - different) / rows.length * 100) : 0 }
}

export function moodStatistics(state: HealthStatistics, year: number, today = todayKey()) {
  const rings = MOODS.map((label, index) => ({ label, icon: MOOD_ICONS[index], count: state.moodCounts[index],
    percent: state.totalMoodCount ? (state.moodCounts[index] / state.totalMoodCount * 100).toFixed(1) : '0.0',
    angle: state.totalMoodCount ? state.moodCounts[index] / state.totalMoodCount * 360 : 0 }))
  const byDate = new Map(state.days.map((day) => [day.date, day]))
  const first = `${year}-01-01`
  const end = year === Number(today.slice(0, 4)) ? today : `${year}-12-31`
  const start = addDays(first, -new Date(`${first}T00:00:00Z`).getUTCDay())
  const weeks = Array.from({ length: Math.ceil((diffDays(start, end) + 1) / 7) }, (_, week) => {
    const cells = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(start, week * 7 + dayIndex)
      const day = byDate.get(date)
      const count = day?.moods.reduce((sum, value) => sum + value, 0) || 0
      const average = count ? day!.moods.reduce((sum, value, i) => sum + value * (5 - i), 0) / count : 0
      const inYear = date >= first && date <= end
      return { date, visible: inYear, color: !count ? '#f5f5f5' : average >= 4 ? '#3eb7e9' : average >= 3 ? '#8ad6f3' : '#c3eaf8',
        period: inYear && predictionFor(state.profile, date, today).kind === 'actual',
        label: `${date}，${count ? `心情 ${count} 次` : '无心情记录'}` }
    })
    return { key: cells[0].date, month: cells.some((cell) => cell.visible && cell.date.endsWith('-01')) ? `${Number(cells.find((cell) => cell.date.endsWith('-01'))!.date.slice(5, 7))}月` : '', cells }
  }).reverse()
  return { rings, weeks }
}

export function habitStatistics(state: HealthStatistics, days: number, end = todayKey()) {
  const dates = Array.from({ length: days }, (_, index) => addDays(end, index - days + 1))
  const byDate = new Map(state.days.map((day) => [day.date, day]))
  return HABITS.map((label, index) => {
    const marks = dates.map((date) => ({ date, checked: byDate.get(date)?.habits[index] || false }))
    return { label, icon: HABIT_ICONS[index], color: HABIT_COLORS[index], marks, count: marks.filter((mark) => mark.checked).length }
  })
}
