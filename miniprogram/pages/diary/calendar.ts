import { diaryService } from '../../services/diary'
import type { DiaryEntry } from '../../services/diary'
import { diaryChrome, diaryYear, diaryYears, diaryToday, publishedDiaries } from '../../utils/diary-views'
import type { DiaryCalendarMode, DiaryMonth } from '../../utils/diary-views'
import { showError } from '../../utils/ui'

Page({
  data: { entries: [] as DiaryEntry[], months: [] as DiaryMonth[], loading: true, loadError: false, requestId: 0,
    navTop: 32, navBottom: 86, year: Number(diaryToday().slice(0, 4)), years: diaryYears([]), yearIndex: 0,
    scrollTarget: '', mode: 'images' as DiaryCalendarMode, filterOpen: false,
    categoryOptions: ['全部分类'], categoryIndex: 0, favoriteOnly: false,
    modes: [{ id: 'images', name: '图片' }, { id: 'mood', name: '心情' }, { id: 'weather', name: '天气' }, { id: 'words', name: '文字' }],
    week: ['日', '一', '二', '三', '四', '五', '六'],
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
      this.setData({ entries, years, yearIndex: Math.max(0, years.indexOf(String(this.data.year))), loading: false,
        categoryOptions: ['全部分类', ...new Set(publishedDiaries(entries).map((entry) => entry.category).filter(Boolean))] })
      this.build()
    } catch (error) { if (requestId === this.data.requestId) this.setData({ loading: false, loadError: true }); showError(error) }
  },
  build() {
    const category = this.data.categoryOptions[this.data.categoryIndex]
    const entries = this.data.entries.filter((entry) => (!this.data.categoryIndex || entry.category === category) && (!this.data.favoriteOnly || entry.favorite))
    this.setData({ months: diaryYear(entries, this.data.year) }, () => {
      if (!this.data.scrollTarget) this.setData({ scrollTarget: `month-${Number(diaryToday().slice(5, 7))}` })
    })
  },
  changeYear(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const yearIndex = Number(event.detail.value)
    this.setData({ yearIndex, year: Number(this.data.years[yearIndex]), scrollTarget: 'month-1' }); this.build()
  },
  changeMode(event: WechatMiniprogram.TouchEvent) {
    const mode = String(event.currentTarget.dataset.mode) as DiaryCalendarMode
    if (this.data.modes.some((item) => item.id === mode)) this.setData({ mode })
  },
  toggleFilter() { this.setData({ filterOpen: !this.data.filterOpen }) },
  category(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ categoryIndex: Number(event.detail.value) }); this.build() },
  favorite() { this.setData({ favoriteOnly: !this.data.favoriteOnly }); this.build() },
  async selectDay(event: WechatMiniprogram.TouchEvent) {
    const date = String(event.currentTarget.dataset.date || '')
    if (!date) return
    // Keep the active calendar filters when opening a day containing records.
    const count = Number(event.currentTarget.dataset.count)
    const category = this.data.categoryIndex ? `&category=${encodeURIComponent(this.data.categoryOptions[this.data.categoryIndex])}` : ''
    await wx.navigateTo({ url: count ? `/pages/diary/index?date=${date}${category}${this.data.favoriteOnly ? '&mode=favorite' : ''}` : `/pages/diary/edit?date=${date}` })
  },
  async monthMenu(event: WechatMiniprogram.TouchEvent) {
    const month = this.data.months.find((item) => item.month === event.currentTarget.dataset.month)
    if (!month) return
    const category = this.data.categoryIndex ? `&category=${encodeURIComponent(this.data.categoryOptions[this.data.categoryIndex])}` : ''
    await wx.navigateTo({ url: `/pages/diary/index?month=${month.month}${category}${this.data.favoriteOnly ? '&mode=favorite' : ''}` })
  },
  back() { if (getCurrentPages().length > 1) wx.navigateBack(); else wx.reLaunch({ url: '/pages/diary/index' }) },
})
