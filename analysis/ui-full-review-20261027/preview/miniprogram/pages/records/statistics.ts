import { healthService } from '../../services/health'
import { lovePointsService } from '../../services/love-points'
import { todayKey, emptyProfile, statisticsFor, MOODS, HABITS } from '../../utils/health-domain'
import type { HealthStatistics } from '../../utils/health-domain'
import { cycleStatistics, moodStatistics, habitStatistics } from '../../utils/health-views'
import { showError } from '../../utils/ui'

const initial = statisticsFor({ profile: emptyProfile(), days: [] }, Number(todayKey().slice(0, 4)))
Page({
  data: {
    tab: 'cycle', tabs: [{ id: 'cycle', label: '周期' }, { id: 'mood', label: '心情' }, { id: 'habit', label: '好习惯' }],
    year: Number(todayKey().slice(0, 4)), yearOptions: [] as string[], yearIndex: 0,
    loading: true, loadError: false, requestSequence: 0, navTop: 44,
    snapshot: initial as HealthStatistics, cycles: cycleStatistics(initial), moodView: moodStatistics(initial, Number(todayKey().slice(0, 4))),
    habitRows: habitStatistics(initial, 7), habitRanges: ['最近七天', '最近三十天'], habitRange: 0,
    nickname: '我的记录', avatarUrl: '', historyOpen: false, historyRows: [] as { date: string; text: string }[],
  },
  async onLoad(query: Record<string, string | undefined>) {
    if (['cycle', 'mood', 'habit'].includes(query.tab || '')) this.setData({ tab: query.tab! })
    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : null
    const capsule = typeof wx.getMenuButtonBoundingClientRect === 'function' ? wx.getMenuButtonBoundingClientRect() : null
    this.setData({ navTop: capsule?.bottom ? capsule.bottom + 16 : (info?.statusBarHeight || 24) + 54,
      yearOptions: Array.from({ length: Number(todayKey().slice(0, 4)) - 1969 }, (_, i) => String(Number(todayKey().slice(0, 4)) - i)) })
    await this.refresh()
    try { const state = await lovePointsService.getState(); this.setData({ nickname: state.profile.nickname || '我的记录', avatarUrl: state.profile.avatarUrl || '' }) }
    catch (error) { showError(error) }
  },
  async onShow() { if (!this.data.loading) await this.refresh() },
  async refresh() {
    const sequence = this.data.requestSequence + 1
    this.setData({ loading: true, loadError: false, requestSequence: sequence })
    try {
      let snapshot = await healthService.statistics(this.data.year)
      // A recent-30-day habit window can cross New Year; fetch the missing days
      // using the same health source without changing lifetime totals.
      if (this.data.year === Number(todayKey().slice(0, 4)) && todayKey().slice(5, 7) === '01') {
        const previous = await healthService.statistics(this.data.year - 1)
        snapshot = { ...snapshot, days: [...previous.days, ...snapshot.days] }
      }
      if (sequence !== this.data.requestSequence) return
      this.setData({ snapshot, cycles: cycleStatistics(snapshot), moodView: moodStatistics(snapshot, this.data.year), loading: false })
      this.buildHabits()
      this.buildHistory()
    } catch (error) { if (sequence !== this.data.requestSequence) return; this.setData({ loading: false, loadError: true }); showError(error) }
  },
  changeTab(event: WechatMiniprogram.TouchEvent) {
    const tab = String(event.currentTarget.dataset.tab)
    if (!['cycle', 'mood', 'habit'].includes(tab)) return
    this.setData({ tab }); this.buildHistory()
  },
  async changeYear(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const yearIndex = Number(event.detail.value)
    this.setData({ yearIndex, year: Number(this.data.yearOptions[yearIndex]) })
    await this.refresh()
  },
  changeHabitRange(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ habitRange: Number(event.detail.value) }); this.buildHabits() },
  buildHabits() {
    const end = this.data.year === Number(todayKey().slice(0, 4)) ? todayKey() : `${this.data.year}-12-31`
    this.setData({ habitRows: habitStatistics(this.data.snapshot, this.data.habitRange ? 30 : 7, end) })
  },
  buildHistory() {
    const snapshot = this.data.snapshot
    const rows = this.data.tab === 'cycle'
      ? [...snapshot.profile.cycles].map((cycle) => ({ date: cycle.start, text: `经期开始 · ${cycle.end ? `结束于 ${cycle.end}` : '结束待确认'}` }))
      : snapshot.days.filter((day) => day.date.startsWith(`${this.data.year}-`) && (this.data.tab === 'mood' ? day.moods.some(Boolean) : day.habits.some(Boolean)))
        .map((day) => ({ date: day.date, text: this.data.tab === 'mood'
          ? day.moods.map((count, i) => count ? `${MOODS[i]} ${count} 次` : '').filter(Boolean).join(' · ')
          : day.habits.map((checked, i) => checked ? HABITS[i] : '').filter(Boolean).join(' · ') }))
    this.setData({ historyRows: rows.sort((a, b) => b.date.localeCompare(a.date)) })
  },
  openDate(event: WechatMiniprogram.TouchEvent) {
    const date = String(event.currentTarget.dataset.date)
    wx.navigateTo({ url: `/pages/records/index?date=${date}` })
  },
  toggleHistory() { this.setData({ historyOpen: !this.data.historyOpen }) },
  explainCycles() { wx.showModal({ title: '周期统计口径', content: '相邻两次开始日期之间为一个完整周期；最后一段用你设置的周期长度显示预计值。偏差表示与个人周期设置不同，尚未确认的结束日期不计入经期天数偏差。', showCancel: false }) },
  back() { wx.navigateBack() },
  noop() {},
})
