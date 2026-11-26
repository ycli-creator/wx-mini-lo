import { diaryService } from '../../services/diary'
import { healthService } from '../../services/health'
import type { DiaryEntry } from '../../services/diary'
import { showError, showSuccess } from '../../utils/ui'
import { normalize } from '../../utils/diary-domain'
import { markdownHtml, plainHtml } from '../../utils/diary-format'
import { chooseDiaryImages, chooseDiaryAudio, createDiaryRecorder, isDiaryMediaCancellation, diaryMediaUrl } from '../../services/diary-media'
import type { DiaryRecorder, DiaryRecorderState } from '../../services/diary-media'
import type { DiaryRevision } from '../../services/diary'

interface Recovery { entry: DiaryEntry; tagsText: string; pendingSave: DiaryEntry | null; updatedAt: string }
interface Template { name: string; body: string }
const templates: Template[] = [
  { name: '每日记录', body: '今天发生的事\n\n今天的感受\n\n明天想做的事\n' },
  { name: '感恩日记', body: '今天值得感谢的三件事\n1. \n2. \n3. \n\n想对自己说\n' },
  { name: '旅行日记', body: '今天去了哪里\n\n看到的风景\n\n难忘的瞬间\n' },
]

const fresh = (): DiaryEntry => {
  const now = new Date()
  return { id: '', version: 0, date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    title: '', body: '', mood: '', weather: '', location: '', category: '', tags: [], favorite: false, pinned: false, deleted: false, draft: false, createdAt: '', updatedAt: '', images: [], audio: [], drawing: '', markdown: false, titleVisible: false, lineHeight: 1.9, originalImages: false }
}
Page({
  data: {
    entry: fresh(), loading: true, loadError: false, busy: false, editing: false, dirty: false, id: '', tagsText: '',
    moods: ['不记录', '开心', '生气', '伤心', '着急', '得意', '鄙视', '暖心', '调皮', '惊讶', '尴尬', '愤怒', '疼痛', '劳累', '紧张', '闹心', '郁闷', '平静', '忙碌', '烦躁', '超开心'], weatherOptions: ['不记录', '晴', '多云', '阴', '雨', '雷雨', '雪', '风', '雾', '霾'],
    moodIndex: 0, weatherIndex: 0, wordCount: 0, pendingSave: null as DiaryEntry | null,
    menuOpen: false, addOpen: false, formatOpen: false, preview: false, previewHtml: '',
    sheet: '', fieldLabel: '', fieldValue: '', fieldName: '', recoveryKey: '', cacheStatus: '',
    mediaBusy: false, recorderState: 'idle' as DiaryRecorderState, recordPending: false, playingId: '',
    templates, revisions: [] as DiaryRevision[], undoStack: [] as string[], redoStack: [] as string[], cursor: 0,
    paper: 'plain', paperOptions: [{ id: 'plain', name: '素纸' }, { id: 'lined', name: '横线' }, { id: 'warm', name: '暖纸' }],
    headerTop: 32, headerBottom: 96, keyboardHeight: 0, keyboardOpen: false, deviceModel: '',
    displayDate: '', displayWeekday: '', relativeDate: '',
  },
  recorder: null as DiaryRecorder | null,
  player: null as WechatMiniprogram.InnerAudioContext | null,
  alive: true,
  async onLoad(query: Record<string, string | undefined>) {
    this.alive = true
    this.recorder = null
    this.player = null
    this.configureScreen()
    const entry = fresh()
    if (query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date)) entry.date = query.date
    this.setData({ id: query.id || '', entry, editing: !query.id })
    this.updateDateLabels(entry.date)
    await this.refresh()
    if (this.data.loadError) return
    try {
      const scope = await diaryService.recoveryScope()
      this.setData({ recoveryKey: `diary-recovery-v2:${scope}:${query.id || 'new'}` })
      const saved = wx.getStorageSync<Recovery>(this.data.recoveryKey)
      if (saved && saved.entry && (saved.entry.body !== this.data.entry.body || saved.tagsText !== this.data.tagsText || JSON.stringify(saved.entry) !== JSON.stringify(this.data.entry))) {
        this.setData({ sheet: 'recovery', cacheStatus: `发现未完成的编辑 · ${saved.updatedAt}` })
      }
      const custom = wx.getStorageSync<Template[]>(`diary-templates:${scope}`) || []
      this.setData({ templates: [...templates, ...custom] })
    } catch (error) { this.setData({ cacheStatus: '恢复缓存暂不可用，请及时保存' }); showError(error) }
  },
  configureScreen() {
    const windowInfo = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : null
    const capsule = typeof wx.getMenuButtonBoundingClientRect === 'function' ? wx.getMenuButtonBoundingClientRect() : null
    // The WeChat capsule occupies its own row above the original app's toolbar.
    const headerTop = capsule && capsule.bottom ? capsule.bottom + 8 : (windowInfo?.statusBarHeight || 24) + 8
    const device = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : null
    this.setData({ headerTop, headerBottom: headerTop + 60, deviceModel: device?.model || '' })
  },
  updateDateLabels(date: string) {
    const [year, month, day] = date.split('-').map(Number)
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const target = new Date(year, month - 1, day)
    const delta = Math.round((today - target.getTime()) / 86400000)
    this.setData({ displayDate: `${month}月${day}日`, displayWeekday: weekdays[target.getDay()], relativeDate: delta === 0 ? '今天' : delta === 1 ? '昨天' : delta === -1 ? '明天' : '' })
  },
  keyboardChange(event: WechatMiniprogram.CustomEvent<{ height: number }>) {
    const keyboardHeight = Math.max(0, event.detail.height || 0)
    this.setData({ keyboardHeight, keyboardOpen: keyboardHeight > 0 })
  },
  async finish() {
    if (this.data.editing) {
      await this.save()
      if (this.data.dirty || this.data.busy || this.data.mediaBusy || this.data.recordPending || this.data.recorderState !== 'idle') return
    }
    if (getCurrentPages().length > 1) await wx.navigateBack()
    else await wx.reLaunch({ url: '/pages/diary/index' })
  },
  toggleBookmark() {
    if (this.data.busy || this.data.entry.deleted) return
    if (!this.data.editing) { void this.favorite(); return }
    this.setData({ entry: { ...this.data.entry, favorite: !this.data.entry.favorite } }); this.markDirty()
  },
  onHide() { this.cacheRecovery(); if (this.recorder && this.data.recorderState === 'recording') this.recorder.stop(); if (this.player) this.player.pause() },
  onUnload() { this.cacheRecovery(); this.alive = false; if (this.recorder) this.recorder.cancel(); if (this.player) this.player.destroy() },
  cacheRecovery() {
    if (!this.data.dirty || !this.data.recoveryKey) return
    try {
      wx.setStorageSync(this.data.recoveryKey, { entry: this.data.entry, tagsText: this.data.tagsText, pendingSave: this.data.pendingSave, updatedAt: new Date().toLocaleString() })
      this.setData({ cacheStatus: '编辑已自动暂存到本机' })
    } catch (error) { this.setData({ cacheStatus: '本机暂存失败，请手动保存' }) }
  },
  clearRecovery() { if (this.data.recoveryKey) wx.setStorageSync(this.data.recoveryKey, null) },
  recover() {
    const saved = wx.getStorageSync<Recovery>(this.data.recoveryKey)
    if (!saved || !saved.entry) return
    // Keep the old version: a newer cloud write must still cause a conflict.
    this.setEntry(saved.entry)
    this.setData({ tagsText: saved.tagsText, pendingSave: saved.pendingSave, editing: true, sheet: '' })
    this.markDirty()
  },
  discardRecovery() { this.clearRecovery(); this.setData({ sheet: '', cacheStatus: '' }) },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      if (this.data.id) {
        const entry = (await diaryService.list()).find((item) => item.id === this.data.id)
        if (!entry) throw new Error('日记不存在或无权查看')
        this.setEntry(entry)
      } else {
        const shared = await healthService.read(this.data.entry.date, this.data.entry.date)
        const mood = shared.days[0]?.moodValue
        if (mood !== undefined) this.setEntry({ ...this.data.entry, mood })
      }
      this.setData({ loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  setEntry(entry: DiaryEntry) {
    this.updateDateLabels(entry.date)
    this.setData({ entry: { ...entry, images: entry.images || [], audio: entry.audio || [], titleVisible: entry.titleVisible !== false, lineHeight: entry.lineHeight || 1.9 }, id: entry.id, tagsText: entry.tags.join('，'), wordCount: entry.body.replace(/\s/g, '').length,
      previewHtml: entry.markdown ? markdownHtml(entry.body) : plainHtml(entry.body), paper: entry.paper || 'plain',
      moodIndex: Math.max(0, this.data.moods.indexOf(entry.mood)), weatherIndex: Math.max(0, this.data.weatherOptions.indexOf(entry.weather)) })
  },
  markDirty() {
    this.setData({ dirty: true })
    wx.enableAlertBeforeUnload({ message: '日记尚未保存，请先保存或存为草稿。' })
    this.cacheRecovery()
  },
  input(event: WechatMiniprogram.CustomEvent<{ value: string; cursor?: number }>) {
    const field = String(event.currentTarget.dataset.field)
    if (!['title', 'body', 'date', 'time', 'location', 'category'].includes(field)) return
    if (field === 'body') this.setData({ undoStack: [...this.data.undoStack, this.data.entry.body].slice(-5), redoStack: [], cursor: event.detail.cursor === undefined ? event.detail.value.length : event.detail.cursor })
    this.setData({ entry: { ...this.data.entry, [field]: event.detail.value } })
    if (field === 'date') this.updateDateLabels(event.detail.value)
    if (field === 'body') this.setData({ wordCount: event.detail.value.replace(/\s/g, '').length })
    this.markDirty()
  },
  inputTags(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ tagsText: event.detail.value }); this.markDirty() },
  chooseMood(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const moodIndex = Number(event.detail.value)
    this.setData({ moodIndex, entry: { ...this.data.entry, mood: moodIndex ? this.data.moods[moodIndex] : '', moodChanged: true } }); this.markDirty()
  },
  chooseWeather(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const weatherIndex = Number(event.detail.value)
    this.setData({ weatherIndex, entry: { ...this.data.entry, weather: weatherIndex ? this.data.weatherOptions[weatherIndex] : '' } }); this.markDirty()
  },
  edit() { if (!this.data.entry.deleted) this.setData({ editing: true }) },
  async cancelEdit() {
    if (this.data.dirty) {
      const result = await wx.showModal({ title: '放弃这次修改？', content: '还未保存的修改会丢失，也可以取消后存为草稿。', confirmText: '放弃修改' })
      if (!result.confirm) return
    }
    wx.disableAlertBeforeUnload()
    this.clearRecovery()
    this.setData({ dirty: false, pendingSave: null })
    if (!this.data.id) { wx.navigateBack(); return }
    await this.refresh()
    this.setData({ editing: false })
  },
  async save(event?: WechatMiniprogram.TouchEvent, draftOverride?: boolean) {
    if (this.data.busy || this.data.mediaBusy || this.data.recorderState !== 'idle' || this.data.recordPending) return
    const draft = draftOverride === undefined ? event?.currentTarget.dataset.draft === true || event?.currentTarget.dataset.draft === 'true' : draftOverride
    const tags = [...new Set(this.data.tagsText.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean))]
    // Retain identity even if the server saves successfully but the response is lost.
    if (!this.data.entry.id) this.setData({ entry: { ...this.data.entry, id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 12)}` } })
    this.setData({ busy: true })
    try {
      let candidate = { ...this.data.entry, tags, draft }
      normalize(candidate)
      // Resolve a possibly committed request before submitting subsequent edits.
      if (this.data.pendingSave) {
        const previous = await diaryService.save(this.data.pendingSave)
        candidate = { ...candidate, version: previous.version }
        this.setData({ pendingSave: null, entry: { ...this.data.entry, version: previous.version } })
      }
      this.setData({ pendingSave: candidate })
      const saved = await diaryService.save(candidate)
      this.setEntry(saved)
      this.setData({ dirty: false, editing: false, pendingSave: null, preview: false, undoStack: [], redoStack: [] })
      this.clearRecovery()
      wx.disableAlertBeforeUnload()
      showSuccess(draft ? '草稿已保存' : '日记已保存')
    } catch (error) {
      showError(error)
      if (error instanceof Error && error.message.includes('其他页面修改')) {
        const choice = await wx.showModal({ title: '云端有更新的日记', content: '你的输入仍保留。是否读取最新版本号？之后再次保存会用当前输入替换云端内容。', confirmText: '保留输入', cancelText: '稍后处理' })
        if (choice.confirm) {
          try {
            const latest = (await diaryService.list()).find((item) => item.id === this.data.entry.id)
            if (!latest || latest.deleted) throw new Error('日记已移入回收站，请返回列表确认')
            this.setData({ pendingSave: null, entry: { ...this.data.entry, version: latest.version } })
          } catch (refreshError) { showError(refreshError) }
        }
      }
    }
    finally { this.setData({ busy: false }); this.cacheRecovery() }
  },
  closePanels() { this.setData({ menuOpen: false, addOpen: false, sheet: '' }) },
  noop() {},
  toggleMenu() { this.setData({ menuOpen: !this.data.menuOpen, addOpen: false }) },
  toggleAdd() { this.setData({ addOpen: !this.data.addOpen, menuOpen: false }) },
  toggleFormat() { this.setData({ formatOpen: !this.data.formatOpen }) },
  togglePreview() { this.setData({ preview: !this.data.preview, previewHtml: this.data.entry.markdown ? markdownHtml(this.data.entry.body) : plainHtml(this.data.entry.body) }) },
  async menuAction(event: WechatMiniprogram.TouchEvent) {
    const action = String(event.currentTarget.dataset.action)
    this.setData({ menuOpen: false })
    if (['category', 'tags', 'location', 'mood', 'title', 'markdown', 'original', 'hidden', 'templates', 'paper', 'format', 'lineHeight'].includes(action) && !this.data.editing && !this.data.entry.deleted) this.edit()
    if (action === 'mood') { this.setData({ sheet: 'mood' }); return }
    if (action === 'format') { this.toggleFormat(); return }
    if (action === 'preview') { this.togglePreview(); return }
    if (action === 'lineHeight') { this.cycleLineHeight(); return }
    if (action === 'saveDraft') { await this.save(undefined, true); return }
    if (action === 'copy') { await this.copy(); return }
    if (action === 'remove') { await this.remove(); return }
    if (action === 'pin') { await this.pin(); return }
    if (action === 'favorite') { await this.favorite(); return }
    if (action === 'title' || action === 'markdown' || action === 'original' || action === 'hidden') {
      const field = action === 'title' ? 'titleVisible' : action === 'original' ? 'originalImages' : action === 'hidden' ? 'hidden' : 'markdown'
      this.setData({ entry: { ...this.data.entry, [field]: !this.data.entry[field] } }); this.markDirty()
    } else if (action === 'category' || action === 'tags' || action === 'location') {
      this.openField(action)
    } else if (action === 'templates') this.setData({ sheet: 'templates' })
    else if (action === 'paper') this.setData({ sheet: 'paper' })
    else if (action === 'history') {
      if (!this.data.id) { showSuccess('保存后可查看编辑历史'); return }
      this.setData({ busy: true })
      try { this.setData({ revisions: (await diaryService.history(this.data.id)).reverse(), sheet: 'history' }) }
      catch (error) { showError(error) }
      finally { this.setData({ busy: false }) }
    } else if (action === 'drafts') {
      this.cacheRecovery()
      await wx.navigateTo({ url: '/pages/diary/index?mode=draft' })
    } else if (action === 'cache') {
      const saved = this.data.recoveryKey && wx.getStorageSync<Recovery>(this.data.recoveryKey)
      if (saved) this.setData({ sheet: 'recovery' }); else showSuccess('暂无未完成的编辑')
    } else if (action === 'quit') await this.cancelEdit()
  },
  undo() { this.tool({ currentTarget: { dataset: { action: 'undo' } } } as unknown as WechatMiniprogram.TouchEvent) },
  redo() { this.tool({ currentTarget: { dataset: { action: 'redo' } } } as unknown as WechatMiniprogram.TouchEvent) },
  openField(field: string) {
    const fieldLabel = field === 'category' ? '分类' : field === 'tags' ? '标签（用逗号分隔）' : '地点'
    this.setData({ fieldName: field, fieldLabel, fieldValue: field === 'tags' ? this.data.tagsText : field === 'category' ? this.data.entry.category : this.data.entry.location, sheet: 'field', addOpen: false })
  },
  inputField(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ fieldValue: event.detail.value }) },
  confirmField() {
    if (this.data.fieldName === 'tags') this.setData({ tagsText: this.data.fieldValue })
    else if (['category', 'location'].includes(this.data.fieldName)) this.setData({ entry: { ...this.data.entry, [this.data.fieldName]: this.data.fieldValue } })
    this.setData({ sheet: '' }); this.markDirty()
  },
  async useTemplate(event: WechatMiniprogram.TouchEvent) {
    const template = this.data.templates[Number(event.currentTarget.dataset.index)]
    if (!template) return
    if (this.data.entry.body) {
      const result = await wx.showModal({ title: '插入模板', content: '模板会追加到现有内容后面。', confirmText: '插入' })
      if (!result.confirm) return
    }
    this.insertText(`${this.data.entry.body ? '\n\n' : ''}${template.body}`, true)
    this.setData({ sheet: '' })
  },
  async saveTemplate() {
    if (!this.data.entry.body.trim()) { showError(new Error('先写一些内容再存为模板')); return }
    try {
      const scope = await diaryService.recoveryScope()
      const key = `diary-templates:${scope}`
      const custom = wx.getStorageSync<Template[]>(key) || []
      if (custom.length >= 10) throw new Error('最多保存 10 个自定义模板')
      if (this.data.entry.body.length > 5000) throw new Error('模板最多 5000 字')
      const item = { name: this.data.entry.title || `我的模板 ${custom.length + 1}`, body: this.data.entry.body }
      wx.setStorageSync(key, [...custom, item]); this.setData({ templates: [...templates, ...custom, item] }); showSuccess('已存为模板')
    } catch (error) { showError(error) }
  },
  async restoreRevision(event: WechatMiniprogram.TouchEvent) {
    const revision = this.data.revisions[Number(event.currentTarget.dataset.index)]
    if (!revision) return
    const result = await wx.showModal({ title: '恢复这个版本？', content: '历史内容将放回编辑器，保存后生效。', confirmText: '恢复到编辑器' })
    if (!result.confirm) return
    this.setEntry({ ...revision.entry, version: this.data.entry.version })
    this.setData({ editing: true, sheet: '', undoStack: [], redoStack: [] }); this.markDirty()
  },
  choosePaper(event: WechatMiniprogram.TouchEvent) {
    const paper = String(event.currentTarget.dataset.id)
    if (!this.data.paperOptions.some((option) => option.id === paper)) return
    this.setData({ paper, sheet: '', entry: { ...this.data.entry, paper } }); this.markDirty()
  },
  async leave() {
    if (this.data.busy || this.data.mediaBusy || this.data.recorderState !== 'idle' || this.data.recordPending) {
      showError(new Error('请先结束录音或等待附件保存完成')); return
    }
    if (this.data.dirty) {
      const entry = this.data.entry
      const empty = !entry.body.trim() && !(entry.images || []).length && !(entry.audio || []).length && !entry.drawing
      await this.save(undefined, entry.draft || empty)
      if (this.data.dirty) return
    }
    if (getCurrentPages().length > 1) await wx.navigateBack()
    else await wx.reLaunch({ url: '/pages/diary/index' })
  },
  cycleLineHeight() {
    const choices = [1.5, 1.9, 2.3]
    this.setData({ entry: { ...this.data.entry, lineHeight: choices[(choices.indexOf(this.data.entry.lineHeight || 1.9) + 1) % 3] } }); this.markDirty()
  },
  blurBody(event: WechatMiniprogram.CustomEvent<{ cursor: number }>) { this.setData({ cursor: Math.max(0, event.detail.cursor || 0) }) },
  insertText(text: string, append = false) {
    const body = this.data.entry.body
    const cursor = append ? body.length : Math.min(this.data.cursor, body.length)
    const next = body.slice(0, cursor) + text + body.slice(cursor)
    if (next.length > 20000) { showError(new Error('正文最多 20000 字')); return }
    this.setData({ undoStack: [...this.data.undoStack, body].slice(-5), redoStack: [], entry: { ...this.data.entry, body: next }, wordCount: next.replace(/\s/g, '').length })
    this.markDirty()
    this.setData({ cursor: cursor + text.length })
  },
  tool(event: WechatMiniprogram.TouchEvent) {
    const action = String(event.currentTarget.dataset.action)
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const snippets: Record<string, string> = { heading: '\n## 标题\n', line: '\n---\n', bold: '**文字**', italic: '*文字*', strike: '~~文字~~', bullet: '\n- ', quote: '\n> ', link: '[链接文字](https://)', code: '\n```\n代码\n```\n', list: '\n- [ ] ', tab: '    ', time, date, datetime: `${date} ${time}` }
    if (snippets[action] !== undefined) {
      if (['heading', 'line', 'bold', 'italic', 'strike', 'bullet', 'quote', 'link', 'code', 'list'].includes(action)) this.setData({ entry: { ...this.data.entry, markdown: true } })
      this.insertText(snippets[action])
    }
    if (action === 'tags') this.openField('tags')
    if (action === 'paper') this.setData({ sheet: 'paper' })
    if (action === 'undo' || action === 'redo') {
      const source = action === 'undo' ? this.data.undoStack : this.data.redoStack
      const other = action === 'undo' ? this.data.redoStack : this.data.undoStack
      if (!source.length) return
      const body = source[source.length - 1]
      this.setData({ [action === 'undo' ? 'undoStack' : 'redoStack']: source.slice(0, -1), [action === 'undo' ? 'redoStack' : 'undoStack']: [...other, this.data.entry.body], entry: { ...this.data.entry, body }, wordCount: body.replace(/\s/g, '').length }); this.markDirty()
    }
  },
  async addImages() {
    if (this.data.mediaBusy) return
    const count = 9 - (this.data.entry.images || []).length
    if (!count) { showError(new Error('每篇最多 9 张图片')); return }
    this.setData({ mediaBusy: true, addOpen: false })
    try {
      await chooseDiaryImages(count, this.data.entry.originalImages === true, (image) => {
        if (this.alive) { this.setData({ entry: { ...this.data.entry, images: [...(this.data.entry.images || []), image] } }); this.markDirty() }
      })
    } catch (error) { if (!isDiaryMediaCancellation(error)) showError(error) }
    finally { if (this.alive) this.setData({ mediaBusy: false }) }
  },
  async addAudio() {
    if (this.data.mediaBusy || (this.data.entry.audio || []).length >= 5) return
    this.setData({ mediaBusy: true, addOpen: false })
    try { const audio = await chooseDiaryAudio(); if (this.alive && audio) this.appendAudio(audio) }
    catch (error) { if (!isDiaryMediaCancellation(error)) showError(error) }
    finally { if (this.alive) this.setData({ mediaBusy: false }) }
  },
  appendAudio(audio: NonNullable<DiaryEntry['audio']>[number]) {
    this.setData({ entry: { ...this.data.entry, audio: [...(this.data.entry.audio || []), audio] }, recordPending: false }); this.markDirty()
  },
  async record() {
    if (this.data.mediaBusy || (this.data.entry.audio || []).length >= 5) return
    this.setData({ addOpen: false })
    if (!this.recorder) this.recorder = createDiaryRecorder({
      onComplete: (audio) => { if (this.alive) this.appendAudio(audio) },
      onError: (error) => { if (this.alive) { this.setData({ recordPending: this.recorder ? this.recorder.hasPending() : false }); showError(error) } },
      onStateChange: (recorderState) => { if (this.alive) this.setData({ recorderState }) },
    })
    try {
      if (this.data.recorderState === 'recording') this.recorder.stop()
      else if (this.data.recordPending) await this.recorder.retry()
      else await this.recorder.start()
    } catch (error) { showError(error) }
  },
  async draw() {
    this.setData({ addOpen: false })
    try {
      await wx.navigateTo({ url: '/pages/diary/draw', events: { drawingSaved: (result: { src: string }) => {
        if (this.alive) { this.setData({ entry: { ...this.data.entry, drawing: result.src } }); this.markDirty() }
      } } })
    } catch (error) { showError(error) }
  },
  async previewImage(event: WechatMiniprogram.TouchEvent) {
    const src = String(event.currentTarget.dataset.src)
    try {
      const sources = [...(this.data.entry.images || []).map((image) => image.src), ...(this.data.entry.drawing ? [this.data.entry.drawing] : [])]
      const urls = await Promise.all(sources.map(diaryMediaUrl))
      await wx.previewImage({ current: urls[sources.indexOf(src)] || urls[0], urls })
    } catch (error) { showError(error) }
  },
  async playAudio(event: WechatMiniprogram.TouchEvent) {
    const audio = (this.data.entry.audio || []).find((item) => item.id === event.currentTarget.dataset.id)
    if (!audio) return
    if (this.player) { this.player.destroy(); this.player = null }
    if (this.data.playingId === audio.id) { this.setData({ playingId: '' }); return }
    this.setData({ playingId: audio.id })
    let src: string
    try { src = await diaryMediaUrl(audio.src) }
    catch (error) { if (this.alive && this.data.playingId === audio.id) { this.setData({ playingId: '' }); showError(error) }; return }
    if (!this.alive || this.data.playingId !== audio.id) return
    this.player = wx.createInnerAudioContext()
    this.player.onEnded(() => { if (this.alive) this.setData({ playingId: '' }) })
    this.player.onError(() => { if (this.alive) { this.setData({ playingId: '' }); showError(new Error('音频播放失败，请稍后重试')) } })
    this.player.src = src; this.player.play()
  },
  async removeMedia(event: WechatMiniprogram.TouchEvent) {
    const { kind, id } = event.currentTarget.dataset
    const result = await wx.showModal({ title: '移除附件？', content: '保存日记后生效。历史版本仍保留原附件。', confirmText: '移除' })
    if (!result.confirm) return
    const entry = { ...this.data.entry }
    if (kind === 'drawing') entry.drawing = ''
    else if (kind === 'images') entry.images = (entry.images || []).filter((item) => item.id !== id)
    else if (kind === 'audio') entry.audio = (entry.audio || []).filter((item) => item.id !== id)
    this.setData({ entry }); this.markDirty()
  },
  async favorite() {
    if (this.data.busy || !this.data.id) return
    this.setData({ busy: true })
    try { this.setEntry(await diaryService.save({ ...this.data.entry, favorite: !this.data.entry.favorite })) }
    catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async pin() {
    if (this.data.busy || !this.data.id) return
    this.setData({ busy: true })
    try { this.setEntry(await diaryService.save({ ...this.data.entry, pinned: !this.data.entry.pinned })) }
    catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async remove() {
    if (this.data.busy) return
    const result = await wx.showModal({ title: '移到回收站？', content: '之后可以在日记回收站中恢复。', confirmText: '移入回收站' })
    if (!result.confirm) return
    this.setData({ busy: true })
    try { this.setEntry(await diaryService.remove(this.data.entry)); showSuccess('已移到回收站') }
    catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async restore() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try { this.setEntry(await diaryService.restore(this.data.entry)); showSuccess('日记已恢复') }
    catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async copy() {
    const entry = this.data.entry
    try { await wx.setClipboardData({ data: `${entry.date} ${entry.time}\n${entry.title}\n\n${entry.body}\n\n${[entry.mood, entry.weather, entry.location, ...entry.tags.map((tag) => '#' + tag)].filter(Boolean).join(' · ')}` }) }
    catch (error) { showError(error) }
  },
})
