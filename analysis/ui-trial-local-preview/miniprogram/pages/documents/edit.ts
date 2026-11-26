import { lovePointsService } from '../../services/love-points'
import { showError, showSuccess } from '../../utils/ui'

let lockRefreshTimer: number | undefined

Page({
  data: { title: '', body: '', locked: false, documentId: '', groupId: '', isNew: false, loading: true, loadError: false, busy: false },
  startLockRefresh(documentId: string) {
    if (lockRefreshTimer) clearInterval(lockRefreshTimer)
    lockRefreshTimer = setInterval(() => {
      void lovePointsService.lockDocument(documentId).catch((error) => {
        // A transient renewal error does not prove that the five-minute lock
        // has expired. Keep the draft editable; save will revalidate ownership.
        showError(error)
      })
    }, 4 * 60 * 1000)
  },
  async onLoad(query: Record<string, string | undefined>) {
    const documentId = query.id || ''
    const groupId = query.groupId || ''
    const isNew = query.new === '1' || !documentId
    this.setData({ documentId, groupId, isNew })
    await this.refresh()
  },
  async refresh() {
    const { documentId, isNew } = this.data
    let locked = false
    this.setData({ loading: true, loadError: false })
    if (!isNew) {
      try {
        await lovePointsService.lockDocument(documentId)
        this.startLockRefresh(documentId)
      } catch (error) {
        locked = true
        showError(error)
      }
    }
    try {
      const document = isNew ? null : (await lovePointsService.getDocument(documentId)).document
      if (!isNew && !document) throw new Error('文档不存在或已经删除')
      this.setData({
        title: isNew ? '' : document?.title || '',
        body: isNew ? '' : document?.body || '',
        locked,
        loading: false,
      })
    } catch (error) { this.setData({ locked: true, loading: false, loadError: true }); showError(error) }
  },
  onUnload() {
    if (lockRefreshTimer) clearInterval(lockRefreshTimer)
    lockRefreshTimer = undefined
    if (this.data.documentId) void lovePointsService.unlockDocument(this.data.documentId)
  },
  handleTitle(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ title: event.detail.value }) },
  handleBody(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ body: event.detail.value }) },
  async retryLock() {
    if (!this.data.documentId || this.data.busy) return
    this.setData({ busy: true })
    try {
      await lovePointsService.lockDocument(this.data.documentId)
      this.startLockRefresh(this.data.documentId)
      this.setData({ locked: false })
      showSuccess('现在可以继续编辑')
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async save() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await lovePointsService.saveDocument(this.data.title, this.data.body, this.data.documentId || undefined, this.data.groupId || undefined)
      if (lockRefreshTimer) clearInterval(lockRefreshTimer)
      lockRefreshTimer = undefined
      showSuccess('文档已保存')
      wx.navigateBack()
    } catch (error) {
      if (error instanceof Error && error.message.includes('编辑锁')) this.setData({ locked: true })
      showError(error)
    }
    finally { this.setData({ busy: false }) }
  },
  goBack() { wx.navigateBack() },
})
