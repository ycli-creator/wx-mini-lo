import { lovePointsService } from '../../services/love-points'
import type { DailyRecord } from '../../types/index'
import { showError } from '../../utils/ui'

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
}

type DisplayRecord = DailyRecord & {
  typeLabel: string
  typeIcon: string
  summary: string
  visibilityLabel: string
}

const pad = (value: number) => String(value).padStart(2, '0')
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const todayKey = () => dateKey(new Date())

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
  },
  async onShow() { await this.refresh(this.data.records.length === 0) },
  async onPullDownRefresh() { await this.refresh(false); wx.stopPullDownRefresh() },
  monthKey() { return `${this.data.year}-${pad(this.data.month)}` },
  buildCalendar(records: DailyRecord[]) {
    const first = new Date(this.data.year, this.data.month - 1, 1)
    const startOffset = (first.getDay() + 6) % 7
    const start = new Date(this.data.year, this.data.month - 1, 1 - startOffset)
    const days = Array.from({ length: 42 }, (_, index) => {
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
    this.setData({
      days,
      selectedRecords,
      selectedRecordCount: selectedRecords.length,
      monthLabel: `${this.data.year} 年 ${this.data.month} 月`,
      selectedDateLabel: `${year} 年 ${month} 月 ${day} 日`,
    })
  },
  async refresh(showLoading = true) {
    if (showLoading) this.setData({ loading: true, loadError: false })
    try {
      const records = await lovePointsService.listDailyRecords(this.monthKey())
      this.setData({ records, loading: false, loadError: false })
      this.buildCalendar(records)
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  async shiftMonth(event: WechatMiniprogram.TouchEvent) {
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
