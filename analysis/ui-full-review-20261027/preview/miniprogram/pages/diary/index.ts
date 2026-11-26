import { diaryService } from '../../services/diary'
import type { DiaryEntry } from '../../services/diary'
import { showError } from '../../utils/ui'
import { isCloudEnabled } from '../../config/env'
import { diaryChrome, diaryFeed, diaryMemories, diaryStatistics, diaryToday } from '../../utils/diary-views'
import type { DiaryMemory } from '../../utils/diary-views'

const dateString = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
Page({
  data: {
    entries: [] as DiaryEntry[], visible: [] as ReturnType<typeof diaryFeed>,
    loading: true, loadError: false, query: '', category: '', tag: '', categories: [] as string[], tags: [] as string[],
    mode: 'all', calendarOpen: false, month: dateString(new Date()).slice(0, 7), selectedDate: '',
    days: [] as Array<{ date: string; day: number; inMonth: boolean; count: number }>,
    total: 0, wordCount: 0, requestId: 0, categoryOptions: ['全部分类'], tagOptions: ['全部标签'],
    navTop: 32, navBottom: 86, titleDate: '', drawerOpen: false, moreOpen: false, searchOpen: false, filtersOpen: false,
    monthFilter: '', modeLabel: '', streak: 0, memories: [] as DiaryMemory[], memoryVisible: true,
    storageLabel: isCloudEnabled() ? '已同步' : '仅本机',
    memoryPickerOpen: false, memoryDates: [] as string[],
  },
  onLoad(query: Record<string, string | undefined>) {
    this.setData(diaryChrome())
    if (['all', 'favorite', 'draft', 'hidden', 'trash'].includes(query.mode || '')) this.setData({ mode: query.mode })
    if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)) this.setData({ selectedDate: query.date })
    if (query.month && /^\d{4}-\d{2}$/.test(query.month)) this.setData({ monthFilter: query.month })
    if (query.category) this.setData({ category: query.category })
    this.updateHeading()
  },
  onShow() { void this.refresh() },
  async onPullDownRefresh() { await this.refresh(); wx.stopPullDownRefresh() },
  async refresh() {
    const requestId = this.data.requestId + 1
    this.setData({ requestId, loading: true, loadError: false })
    try {
      const entries = await diaryService.list()
      if (this.data.requestId !== requestId) return
      const stats = diaryStatistics(entries)
      const old = new Map(this.data.memories.map((memory) => [memory.id, memory]))
      const memories = diaryMemories(entries).map((memory) => ({ ...memory, revealed: old.get(memory.id)?.date === memory.date && old.get(memory.id)?.revealed === true }))
      this.setData({ entries, loading: false, total: stats.total, wordCount: stats.wordCount, streak: stats.streak, memories })
      this.filter()
    } catch (error) { if (this.data.requestId === requestId) this.setData({ loading: false, loadError: true }); showError(error) }
  },
  filter() {
    const { entries, query, mode, category, tag, selectedDate } = this.data
    const needle = query.trim().toLocaleLowerCase()
    const candidates = entries.filter((item) => {
      if (mode === 'trash' ? !item.deleted : item.deleted) return false
      if (mode !== 'trash' && (mode === 'draft' ? !item.draft : item.draft)) return false
      if (mode !== 'trash' && mode !== 'draft' && (mode === 'hidden' ? !item.hidden : item.hidden)) return false
      return (mode !== 'favorite' || item.favorite)
        && (!needle || [item.title, item.body, item.location, item.category, ...item.tags].join(' ').toLocaleLowerCase().includes(needle))
    })
    const categories = [...new Set(candidates.map((item) => item.category).filter(Boolean))]
    const tags = [...new Set(candidates.flatMap((item) => item.tags))]
    const filtered = candidates.filter((item) => (!category || item.category === category) && (!tag || item.tags.includes(tag)))
    const visible = diaryFeed(filtered.filter((item) => (!selectedDate || item.date === selectedDate) && (!this.data.monthFilter || item.date.startsWith(this.data.monthFilter))))
    const memoryVisible = mode === 'all' && !needle && !category && !tag && !selectedDate && !this.data.monthFilter
    this.setData({ visible, categories, tags, categoryOptions: ['全部分类', ...categories], tagOptions: ['全部标签', ...tags], memoryVisible })
    this.updateHeading()
    this.buildCalendar(filtered)
  },
  buildCalendar(entries: DiaryEntry[]) {
    const [year, month] = this.data.month.split('-').map(Number)
    const first = new Date(year, month - 1, 1)
    const offset = (first.getDay() + 6) % 7
    const days = Array.from({ length: 42 }, (_, index) => {
      const day = new Date(year, month - 1, 1 - offset + index)
      const date = dateString(day)
      return { date, day: day.getDate(), inMonth: day.getMonth() === month - 1,
        count: entries.filter((item) => item.date === date).length }
    })
    this.setData({ days })
  },
  search(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ query: event.detail.value }); this.filter() },
  changeMode(event: WechatMiniprogram.TouchEvent) { this.setData({ mode: String(event.currentTarget.dataset.mode), selectedDate: '', monthFilter: '', category: '', tag: '', drawerOpen: false }); this.filter() },
  toggleCalendar() { this.openCalendar() },
  changeMonth(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ month: event.detail.value, selectedDate: '' }); this.filter() },
  selectDate(event: WechatMiniprogram.TouchEvent) { this.setData({ selectedDate: String(event.currentTarget.dataset.date) }); this.filter() },
  clearFilters() { this.setData({ selectedDate: '', monthFilter: '', query: '', category: '', tag: '' }); this.filter() },
  selectCategory(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ category: ['', ...this.data.categories][Number(event.detail.value)] }); this.filter() },
  selectTag(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ tag: ['', ...this.data.tags][Number(event.detail.value)] }); this.filter() },
  create() { wx.navigateTo({ url: `/pages/diary/edit?date=${this.data.selectedDate || dateString(new Date())}` }) },
  open(event: WechatMiniprogram.TouchEvent) { wx.navigateTo({ url: `/pages/diary/edit?id=${encodeURIComponent(String(event.currentTarget.dataset.id))}` }) },
  updateHeading() {
    const date = this.data.selectedDate || diaryToday()
    const labels: Record<string, string> = { all: '', favorite: '收藏', hidden: '隐藏日记', draft: '草稿箱', trash: '回收站' }
    this.setData({ titleDate: `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`, modeLabel: labels[this.data.mode] || '' })
  },
  toggleDrawer() { this.setData({ drawerOpen: !this.data.drawerOpen, moreOpen: false }) },
  toggleMore() { this.setData({ moreOpen: !this.data.moreOpen, drawerOpen: false }) },
  toggleSearch() { this.setData({ searchOpen: !this.data.searchOpen }); if (!this.data.searchOpen) { this.setData({ query: '' }); this.filter() } },
  toggleFilters() { this.setData({ filtersOpen: !this.data.filtersOpen, moreOpen: false }) },
  closePanels() { this.setData({ drawerOpen: false, moreOpen: false, memoryPickerOpen: false }) },
  noop() {},
  openCalendar() { this.closePanels(); wx.navigateTo({ url: '/pages/diary/calendar' }) },
  openStatistics() { this.closePanels(); wx.navigateTo({ url: '/pages/diary/statistics' }) },
  revealMemory(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const memory = this.data.memories[index]
    if (!memory || memory.empty) return
    this.setData({ memories: this.data.memories.map((item, position) => position === index ? { ...item, revealed: true } : item) })
  },
  async openMemory(event: WechatMiniprogram.TouchEvent) {
    const memory = this.data.memories[Number(event.currentTarget.dataset.index)]
    if (!memory || !memory.revealed || !memory.date) return
    let date = memory.date
    if (memory.dates.length > 1) {
      this.setData({ memoryDates: memory.dates, memoryPickerOpen: true }); return
    }
    this.setData({ selectedDate: date }); this.filter()
    if (typeof wx.pageScrollTo === 'function') void wx.pageScrollTo({ scrollTop: 0, duration: 200 })
  },
  chooseMemoryDate(event: WechatMiniprogram.TouchEvent) {
    const date = String(event.currentTarget.dataset.date)
    if (!this.data.memoryDates.includes(date)) return
    this.setData({ selectedDate: date, memoryPickerOpen: false }); this.filter()
  },
})
