import { lovePointsService } from '../../services/love-points'
import type { DailyRecord } from '../../types/index'
import { showError } from '../../utils/ui'
import { healthService } from '../../services/health'
import { emptyProfile, emptyDay, validDate, todayKey as healthToday, timeKey, addDays, cycleAt, predictionFor, summaryFor, MOODS, HABITS, METHODS, FLOW_LABELS, PAIN_LABELS } from '../../utils/health-domain'
import type { HealthSnapshot, HealthChange } from '../../utils/health-domain'
import { MOOD_ICONS, HABIT_ICONS, HABIT_COLORS } from '../../utils/health-views'

type CalendarDay = {
  key: string
  date: string
  day: number
  inMonth: boolean
  isToday: boolean
  selected: boolean
  moodEmojis: string[]
  hasEvent: boolean
  hasPeriod: boolean
  phase: string
  phaseLabel: string
  hasHealth: boolean
}

type DisplayRecord = DailyRecord & {
  typeLabel: string
  typeIcon: string
  summary: string
  visibilityLabel: string
}

const pad = (value: number) => String(value).padStart(2, '0')
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const todayKey = healthToday

const recordMeta = {
  mood: { label: '情绪', icon: '🙂' },
  event: { label: '事件', icon: '✦' },
  period: { label: '经期', icon: '♥' },
}

Page({
  data: {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    monthLabel: '',
    selectedDate: todayKey(),
    selectedDateLabel: '',
    days: [] as CalendarDay[],
    records: [] as DailyRecord[],
    selectedRecords: [] as DisplayRecord[],
    selectedRecordCount: 0,
    drawerOpen: false,
    loading: true,
    loadError: false,
    health: { profile: emptyProfile(), days: [] } as HealthSnapshot,
    saving: false,
    requestSequence: 0,
    today: todayKey(),
    future: false,
    summary: '',
    activeCycleId: '',
    selectedDay: emptyDay(todayKey()),
    moods: [] as { label: string; count: number; icon: string }[],
    habits: [] as { label: string; checked: boolean; icon: string; color: string }[],
    detailsOpen: false,
    flows: FLOW_LABELS,
    pains: PAIN_LABELS,
    methods: METHODS,
    editor: '',
    editId: '',
    editStart: '',
    editEnd: '',
    editTime: '',
    editMethod: 0,
    editCycleLength: '30',
    editPeriodLength: '5',
  },
  onLoad(query: Record<string, string | undefined>) {
    if (validDate(query.date)) {
      const [year, month] = query.date.split('-').map(Number)
      this.setData({ selectedDate: query.date, year, month })
    }
  },
  async onShow() { await this.refresh(this.data.records.length === 0) },
  async onPullDownRefresh() { await this.refresh(false); wx.stopPullDownRefresh() },
  monthKey() { return `${this.data.year}-${pad(this.data.month)}` },
  range() {
    const first = new Date(this.data.year, this.data.month - 1, 1)
    const start = dateKey(new Date(this.data.year, this.data.month - 1, 1 - first.getDay()))
    return { start, end: addDays(start, 41) }
  },
  buildCalendar(records: DailyRecord[]) {
    const first = new Date(this.data.year, this.data.month - 1, 1)
    const startOffset = first.getDay()
    const start = new Date(this.data.year, this.data.month - 1, 1 - startOffset)
    const cellCount = Math.ceil((startOffset + new Date(this.data.year, this.data.month, 0).getDate()) / 7) * 7
    const days = Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
      const key = dateKey(date)
      const dayRecords = records.filter((item) => item.date === key)
      const latestMoodByOwner = new Map<string, DailyRecord>()
      dayRecords.filter((item) => item.type === 'mood' && item.mood).forEach((item) => {
        const ownerKey = item.ownerIsSelf ? 'self' : `partner-${item.ownerName}`
        const previous = latestMoodByOwner.get(ownerKey)
        if (!previous || String(item.createdAt).localeCompare(String(previous.createdAt)) > 0) latestMoodByOwner.set(ownerKey, item)
      })
      return {
        key,
        date: key,
        day: date.getDate(),
        inMonth: date.getMonth() === this.data.month - 1,
        isToday: key === todayKey(),
        selected: key === this.data.selectedDate,
        moodEmojis: [...latestMoodByOwner.values()].slice(0, 2).map((item) => item.mood),
        hasEvent: dayRecords.some((item) => item.type === 'event'),
        hasPeriod: dayRecords.some((item) => item.type === 'period'),
        phase: predictionFor(this.data.health.profile, key).kind,
        phaseLabel: predictionFor(this.data.health.profile, key).label,
        hasHealth: this.data.health.days.some((item) => item.date === key && (item.moods.some(Boolean) || item.habits.some(Boolean) || item.intimacy.length > 0)),
      }
    })
    const selectedRecords = records.filter((item) => item.date === this.data.selectedDate).map((record) => ({
      ...record,
      typeLabel: recordMeta[record.type].label,
      typeIcon: record.type === 'mood' && record.mood ? record.mood : recordMeta[record.type].icon,
      summary: record.title || record.note || (record.type === 'period' ? '经期记录' : '今天的心情'),
      visibilityLabel: record.visibility === 'couple' ? '双方可见' : '仅自己可见',
    }))
    const [year, month, day] = this.data.selectedDate.split('-').map(Number)
    const selectedDay = this.data.health.days.find((item) => item.date === this.data.selectedDate) || emptyDay(this.data.selectedDate)
    this.setData({
      today: todayKey(),
      future: this.data.selectedDate > todayKey(),
      selectedDay,
      moods: MOODS.map((label, index) => ({ label, count: selectedDay.moods[index], icon: MOOD_ICONS[index] })),
      habits: HABITS.map((label, index) => ({ label, checked: selectedDay.habits[index], icon: HABIT_ICONS[index], color: HABIT_COLORS[index] })),
      activeCycleId: cycleAt(this.data.health.profile, this.data.selectedDate)?.id || '',
      summary: summaryFor(this.data.health.profile),
      days,
      selectedRecords,
      selectedRecordCount: selectedRecords.length,
      monthLabel: `${this.data.year} 年 ${this.data.month} 月`,
      selectedDateLabel: `${year} 年 ${month} 月 ${day} 日`,
    })
  },
  async refresh(showLoading = true) {
    const sequence = this.data.requestSequence + 1
    this.setData({ requestSequence: sequence })
    if (showLoading) this.setData({ loading: true, loadError: false })
    try {
      const { start, end } = this.range()
      const [records, health] = await Promise.all([lovePointsService.listDailyRecords(this.monthKey()), healthService.read(start, end)])
      if (sequence !== this.data.requestSequence) return
      this.setData({ records, health, loading: false, loadError: false })
      this.buildCalendar(records)
    } catch (error) {
      if (sequence !== this.data.requestSequence) return
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  async shiftMonth(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving) return
    const offset = Number(event.currentTarget.dataset.offset)
    const next = new Date(this.data.year, this.data.month - 1 + offset, 1)
    const currentToday = new Date()
    const selectedDate = next.getFullYear() === currentToday.getFullYear() && next.getMonth() === currentToday.getMonth()
      ? todayKey()
      : `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`
    this.setData({ year: next.getFullYear(), month: next.getMonth() + 1, selectedDate, drawerOpen: false })
    await this.refresh()
  },
  selectDate(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving) return
    const selectedDate = String(event.currentTarget.dataset.date)
    if (selectedDate === this.data.selectedDate && this.data.drawerOpen) {
      this.setData({ drawerOpen: false })
      return
    }
    const selected = new Date(`${selectedDate}T00:00:00`)
    if (selected.getFullYear() !== this.data.year || selected.getMonth() + 1 !== this.data.month) {
      this.setData({ year: selected.getFullYear(), month: selected.getMonth() + 1, selectedDate, drawerOpen: true })
      this.refresh()
      return
    }
    this.setData({ selectedDate, drawerOpen: true })
    this.buildCalendar(this.data.records)
  },
  closeDrawer() { this.setData({ drawerOpen: false }) },
  openStatistics() { wx.navigateTo({ url: '/pages/records/statistics' }) },
  toggleDetails() { this.setData({ detailsOpen: !this.data.detailsOpen }) },
  async goToday() {
    if (this.data.saving) return
    const [year, month] = todayKey().split('-').map(Number)
    this.setData({ year, month, selectedDate: todayKey() })
    await this.refresh()
  },
  async changeHealth(change: Omit<HealthChange, 'date' | 'version' | 'operationId'>) {
    if (this.data.saving || this.data.loading || this.data.loadError) return false
    this.setData({ saving: true, requestSequence: this.data.requestSequence + 1 })
    const { start, end } = this.range()
    try {
      const health = await healthService.change({ ...change, date: this.data.selectedDate, version: this.data.health.profile.version, operationId: `op_${Date.now()}_${Math.random().toString(36).slice(2, 12)}` }, start, end)
      this.setData({ health })
      this.buildCalendar(this.data.records)
      return true
    } catch (error) {
      showError(error)
      await this.refresh(false)
      return false
    } finally { this.setData({ saving: false }) }
  },
  async moodChange(event: WechatMiniprogram.TouchEvent) {
    await this.changeHealth({ kind: 'mood', index: Number(event.currentTarget.dataset.index), delta: Number(event.currentTarget.dataset.delta) })
  },
  async habitChange(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    await this.changeHealth({ kind: 'habit', index, checked: !this.data.selectedDay.habits[index] })
  },
  async levelChange(event: WechatMiniprogram.TouchEvent) {
    const kind = event.currentTarget.dataset.kind === 'pain' ? 'pain' : 'flow'
    const value = Number(event.currentTarget.dataset.value)
    await this.changeHealth({ kind, value: this.data.selectedDay[kind] === value ? null : value })
  },
  openSettings() {
    this.setData({ editor: 'settings', editCycleLength: String(this.data.health.profile.settings.cycleLength), editPeriodLength: String(this.data.health.profile.settings.periodLength) })
  },
  openCycle(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || this.data.activeCycleId || '')
    const cycle = this.data.health.profile.cycles.find((item) => item.id === id)
    this.setData({ editor: 'cycle', editId: cycle?.id || '', editStart: cycle?.start || this.data.selectedDate, editEnd: cycle?.end || '' })
  },
  openIntimacy(event: WechatMiniprogram.TouchEvent) {
    const item = this.data.selectedDay.intimacy.find((item) => item.id === event.currentTarget.dataset.id)
    this.setData({ editor: 'intimacy', editId: item?.id || '', editTime: item?.time || timeKey(), editMethod: item?.method || 0 })
  },
  editField(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const field = String(event.currentTarget.dataset.field)
    if (['editStart', 'editEnd', 'editTime', 'editCycleLength', 'editPeriodLength'].includes(field)) this.setData({ [field]: event.detail.value })
    if (field === 'editMethod') this.setData({ editMethod: Number(event.detail.value) })
  },
  clearEnd() { this.setData({ editEnd: '' }) },
  closeEditor() { if (!this.data.saving) this.setData({ editor: '' }) },
  async saveEditor() {
    let change: Omit<HealthChange, 'date' | 'version' | 'operationId'>
    if (this.data.editor === 'settings') change = { kind: 'settings', cycleLength: Number(this.data.editCycleLength), periodLength: Number(this.data.editPeriodLength) }
    else if (this.data.editor === 'cycle') change = { kind: 'cycle.save', id: this.data.editId || undefined, start: this.data.editStart, end: this.data.editEnd || null }
    else change = { kind: 'intimacy.save', id: this.data.editId || undefined, time: this.data.editTime, method: this.data.editMethod }
    if (await this.changeHealth(change)) this.setData({ editor: '' })
  },
  async deleteEditor() {
    const result = await wx.showModal({ title: '删除这条记录？', content: '删除后无法恢复。', confirmText: '删除' })
    if (!result.confirm) return
    if (await this.changeHealth({ kind: this.data.editor === 'cycle' ? 'cycle.delete' : 'intimacy.delete', id: this.data.editId })) this.setData({ editor: '' })
  },
  noop() {},
  addRecord() { wx.navigateTo({ url: `/pages/records/edit?date=${encodeURIComponent(this.data.selectedDate)}` }) },
  openRecord(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id)
    const record = this.data.selectedRecords.find((item) => item.id === id)
    if (!record) return
    if (!record.ownerIsSelf) {
      wx.navigateTo({ url: `/pages/records/edit?id=${encodeURIComponent(id)}&date=${encodeURIComponent(record.date)}&readonly=1` })
      return
    }
    wx.navigateTo({ url: `/pages/records/edit?id=${encodeURIComponent(id)}&date=${encodeURIComponent(record.date)}` })
  },
})
