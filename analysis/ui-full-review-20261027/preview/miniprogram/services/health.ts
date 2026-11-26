import { runAction } from './client'
import { applyChange, emptyDay, emptyProfile, validateRange, setDayMood, statisticsFor } from '../utils/health-domain'
import type { HealthChange, HealthSnapshot, HealthStatistics } from '../utils/health-domain'

// Local demo data is independent of couple/personal-space switching and never used as a cloud fallback.
const STORAGE_KEY = 'love-points-health-local-v1'
const readLocal = (): HealthSnapshot => wx.getStorageSync<HealthSnapshot>(STORAGE_KEY) || { profile: emptyProfile(), days: [] }
export const localSharedMood = (date: string): string | undefined => readLocal().days.find((day) => day.date === date)?.moodValue
export const setLocalSharedMood = (date: string, value: string) => {
  const state = readLocal()
  const old = state.days.find((day) => day.date === date) || emptyDay(date)
  if (old.moodValue === value) return
  state.days = [...state.days.filter((day) => day.date !== date), setDayMood(old, value)]
  state.profile.version += 1
  wx.setStorageSync(STORAGE_KEY, state)
}
const inRange = (state: HealthSnapshot, start: string, end: string): HealthSnapshot => ({
  profile: state.profile,
  days: state.days.filter((day) => day.date >= start && day.date <= end),
})
export const healthService = {
  statistics: async (year: number): Promise<HealthStatistics> => runAction('health.statistics', { year }, () => statisticsFor(readLocal(), year)),
  read: async (start: string, end: string): Promise<HealthSnapshot> => {
    validateRange(start, end)
    return runAction('health.read', { start, end }, () => inRange(readLocal(), start, end))
  },
  change: async (input: HealthChange, start: string, end: string): Promise<HealthSnapshot> => {
    validateRange(start, end)
    return runAction('health.change', { ...input, rangeStart: start, rangeEnd: end }, () => {
      const state = readLocal()
      const result = applyChange(state.profile, state.days.find((day) => day.date === input.date) || emptyDay(input.date), input)
      if (!result.duplicate) {
        state.profile = result.profile
        if (result.dayChanged) state.days = [...state.days.filter((day) => day.date !== input.date), result.day]
        wx.setStorageSync(STORAGE_KEY, state)
      }
      return inRange(state, start, end)
    })
  },
}
