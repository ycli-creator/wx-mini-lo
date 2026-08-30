import { lovePointsService } from '../../services/love-points'
import type { CommunityMedia, DailyRecord, DailyRecordType } from '../../types/index'
import { isCloudEnabled } from '../../config/env'
import { showError, showSuccess } from '../../utils/ui'

const moods = ['开心', '平静', '心动', '疲惫', '低落', '生气'].map((label, index) => ({ label, emoji: ['😊', '😌', '🥰', '😴', '😔', '😤'][index] }))
const typeOptions: Array<{ value: DailyRecordType; label: string }> = [
  { value: 'mood', label: '情绪' },
  { value: 'event', label: '事件' },
  { value: 'period', label: '经期' },
]
const flowOptions: Array<{ value: DailyRecord['periodFlow']; label: string }> = [
  { value: 'light', label: '少量' },
  { value: 'medium', label: '正常' },
  { value: 'heavy', label: '较多' },
]
type DraftMedia = CommunityMedia & { localPath: string; posterPath: string }
const recordCloudPath = (path: string, type: string) => {
  const extension = path.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || (type === 'video' ? 'mp4' : 'jpg')
  return `records/${type}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`
}

Page({
  data: {
    id: '',
    date: '',
    type: 'mood' as DailyRecordType,
    title: '',
    note: '',
    mood: '😊',
    periodFlow: 'medium' as DailyRecord['periodFlow'],
    shared: false,
    readOnly: false,
    ownerName: '',
    typeOptions,
    moods,
    flowOptions,
    loading: false,
    busy: false,
    media: [] as DraftMedia[],
  },
  async onLoad(query: Record<string, string | undefined>) {
    const date = query.date || new Date().toISOString().slice(0, 10)
    this.setData({ id: query.id || '', date, readOnly: query.readonly === '1' })
    if (query.id) await this.loadRecord(query.id, date)
  },
  async loadRecord(id: string, date: string) {
    this.setData({ loading: true })
    try {
      const records = await lovePointsService.listDailyRecords(date.slice(0, 7))
      const record = records.find((item) => item.id === id)
      if (!record) throw new Error('记录不存在或已不可见')
      this.setData({
        type: record.type,
        title: record.title,
        note: record.note,
        mood: record.mood || '😊',
        periodFlow: record.periodFlow || 'medium',
        shared: record.visibility === 'couple',
        readOnly: this.data.readOnly || !record.ownerIsSelf,
        ownerName: record.ownerName,
        media: record.media.map((item) => ({ ...item, localPath: item.fileId, posterPath: item.posterFileId || '' })),
        loading: false,
      })
    } catch (error) { this.setData({ loading: false }); showError(error) }
  },
  selectType(event: WechatMiniprogram.TouchEvent) { this.setData({ type: event.currentTarget.dataset.value as DailyRecordType }) },
  selectMood(event: WechatMiniprogram.TouchEvent) { this.setData({ mood: String(event.currentTarget.dataset.emoji) }) },
  selectFlow(event: WechatMiniprogram.TouchEvent) { this.setData({ periodFlow: event.currentTarget.dataset.value as DailyRecord['periodFlow'] }) },
  handleDate(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ date: event.detail.value }) },
  handleTitle(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ title: event.detail.value }) },
  handleNote(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ note: event.detail.value }) },
  handleShared(event: WechatMiniprogram.CustomEvent<{ value: boolean }>) { this.setData({ shared: event.detail.value }) },
  async chooseMedia() {
    try {
      const result = await wx.chooseMedia({ count: 9 - this.data.media.length, mediaType: ['image', 'video'], sourceType: ['album', 'camera'], sizeType: ['compressed'], maxDuration: 60 })
      const media = result.tempFiles.filter((file) => file.size <= (file.fileType === 'video' ? 100 * 1024 * 1024 : 10 * 1024 * 1024)).map((file) => ({ type: file.fileType, fileId: '', posterFileId: '', localPath: file.tempFilePath, posterPath: file.fileType === 'video' ? file.thumbTempFilePath || '' : '', width: Number(file.width || 0), height: Number(file.height || 0), duration: Number(file.duration || 0) }))
      this.setData({ media: [...this.data.media, ...media].slice(0, 9) })
    } catch (error) { if (!(error instanceof Error) || !error.message.includes('cancel')) showError(error) }
  },
  removeMedia(event: WechatMiniprogram.TouchEvent) { const index = Number(event.currentTarget.dataset.index); this.setData({ media: this.data.media.filter((_, itemIndex) => itemIndex !== index) }) },
  async upload(path: string, type: string) { if (path.startsWith('cloud://')) return path; if (!isCloudEnabled()) throw new Error('照片和视频需要连接云环境后保存'); return (await wx.cloud.uploadFile({ cloudPath: recordCloudPath(path, type), filePath: path })).fileID },
  async save() {
    if (this.data.readOnly || this.data.busy) return
    this.setData({ busy: true })
    try {
      const media: CommunityMedia[] = []
      for (const item of this.data.media) {
        const fileId = item.fileId || await this.upload(item.localPath, item.type)
        const posterFileId = item.type === 'video' && item.posterPath ? (item.posterFileId || await this.upload(item.posterPath, 'poster')) : ''
        media.push({ type: item.type, fileId, posterFileId, width: item.width, height: item.height, duration: item.duration })
      }
      await lovePointsService.saveDailyRecord({
        id: this.data.id || undefined,
        date: this.data.date,
        type: this.data.type,
        title: this.data.title,
        note: this.data.note,
        mood: this.data.type === 'mood' ? this.data.mood : '',
        periodFlow: this.data.type === 'period' ? this.data.periodFlow : '',
        visibility: this.data.shared ? 'couple' : 'self',
        media,
      })
      showSuccess('记录已保存')
      wx.navigateBack()
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async remove() {
    if (this.data.readOnly || !this.data.id || this.data.busy) return
    const result = await wx.showModal({ title: '删除这条记录？', content: '删除后无法恢复。', confirmText: '删除', confirmColor: '#db3f50' })
    if (!result.confirm) return
    this.setData({ busy: true })
    try {
      await lovePointsService.deleteDailyRecord(this.data.id)
      showSuccess('记录已删除')
      wx.navigateBack()
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
})
