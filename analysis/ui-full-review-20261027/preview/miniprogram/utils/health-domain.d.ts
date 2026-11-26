export interface HealthSettings { cycleLength: number; periodLength: number }
export interface HealthCycle { id: string; start: string; end: string | null }
export interface IntimacyEvent { id: string; time: string; method: number }
export interface HealthDay { date: string; flow: number | null; pain: number | null; moods: number[]; moodValue?: string; habits: boolean[]; intimacy: IntimacyEvent[] }
export interface HealthProfile { version: number; settings: HealthSettings; cycles: HealthCycle[]; recentOperations: string[] }
export interface HealthSnapshot { profile: HealthProfile; days: HealthDay[] }
export interface HealthStatistics extends HealthSnapshot { moodCounts: number[]; totalMoodCount: number; totalHabitDays: number; firstHabitDate: string }
export function statisticsFor(state: HealthSnapshot, year: number): HealthStatistics
export interface HealthChange {
  kind: 'settings' | 'cycle.save' | 'cycle.delete' | 'flow' | 'pain' | 'mood' | 'habit' | 'intimacy.save' | 'intimacy.delete'
  date: string; version: number; operationId: string
  id?: string; start?: string; end?: string | null; cycleLength?: number; periodLength?: number
  value?: number | null; index?: number; delta?: number; checked?: boolean; time?: string; method?: number
}
export const MOODS: string[]
export const MOOD_VALUES: string[]
export function moodIndex(value?: string): number
export function setDayMood(day: HealthDay, value: string): HealthDay
export const HABITS: string[]
export const METHODS: string[]
export const FLOW_LABELS: string[]
export const PAIN_LABELS: string[]
export function validDate(value: unknown): value is string
export function todayKey(at?: number): string
export function timeKey(at?: number): string
export function addDays(date: string, days: number): string
export function diffDays(from: string, to: string): number
export function emptyProfile(): HealthProfile
export function emptyDay(date: string): HealthDay
export function cycleEnd(cycle: HealthCycle, settings: HealthSettings): string
export function cycleAt(profile: HealthProfile, date: string): HealthCycle | null
export function hasDailyData(day: HealthDay): boolean
export function validateRange(start: string, end: string): void
export function applyChange(profile: HealthProfile, day: HealthDay, input: HealthChange, today?: string): { profile: HealthProfile; day: HealthDay; duplicate: boolean; dayChanged: boolean }
export function predictionFor(profile: HealthProfile, date: string, today?: string): { kind: 'actual' | 'predicted' | 'fertile' | 'ovulation' | 'none'; label: string; cycleId: string }
export function summaryFor(profile: HealthProfile, today?: string): string
