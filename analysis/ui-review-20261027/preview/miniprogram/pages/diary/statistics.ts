import { diaryService } from '../../services/diary'
import type { DiaryEntry } from '../../services/diary'
import { diaryChrome, diaryStatistics, diaryToday, diaryYear, diaryYears } from '../../utils/diary-views'
import { showError } from '../../utils/ui'

Page({
  data: { navTop: 32, navBottom: 86, loading: true, loadError: false, requestId: 0,
    entries: [] as DiaryEntry[], stats: diaryStatistics([]), reviewOpen: false,
    years: diaryYears([]), yearIndex: 1, year: Number(diaryToday().slice(0, 4)), yearStats: diaryStatistics([]),
    yearMonths: [] as Array<{ label: string; count: number; width: number }>,
  },
  onLoad() { this.setData(diaryChrome()) },
  onShow() { void this.refresh() },
  async refresh() {
    const requestId = this.data.requestId + 1
    this.setData({ requestId, loading: true, loadError: false })
    try {
      const entries = await diaryService.list()
      if (requestId !== this.data.requestId) return
      const years = diaryYears(entries)
      this.setData({ entries, stats: diaryStatistics(entries), years, yearIndex: Math.max(0, years.indexOf(String(this.data.year))), loading: false })
      this.buildReview()
    } catch (error) { if (requestId === this.data.requestId) this.setData({ loading: false, loadError: true }); showError(error) }
  },
  buildReview() {
    const entries = this.data.entries.filter((entry) => entry.date.startsWith(`${this.data.year}-`))
    const months = diaryYear(entries, this.data.year)
    const maximum = Math.max(1, ...months.map((month) => month.count))
    this.setData({ yearStats: diaryStatistics(entries), yearMonths: months.map((month) => ({ label: month.label, count: month.count, width: month.count / maximum * 100 })) })
  },
  toggleReview() {
    const reviewOpen = !this.data.reviewOpen
    this.setData({ reviewOpen }, () => {
      if (reviewOpen && typeof wx.pageScrollTo === 'function') void wx.pageScrollTo({ selector: '.annual-review', duration: 240 })
    })
  },
  changeYear(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const yearIndex = Number(event.detail.value)
    this.setData({ yearIndex, year: Number(this.data.years[yearIndex]) }); this.buildReview()
  },
  back() { if (getCurrentPages().length > 1) wx.navigateBack(); else wx.reLaunch({ url: '/pages/diary/index' }) },
})
