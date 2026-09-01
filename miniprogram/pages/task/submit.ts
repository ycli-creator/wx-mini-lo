import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { TaskItem } from '../../types/index'
import { showError, showSuccess } from '../../utils/ui'
import { isCloudEnabled } from '../../config/env'
import type { CommunityMedia } from '../../types/index'

Page({
  data: { state: createInitialState(), task: createInitialState().tasks[0] as TaskItem, taskId: '', note: '', images: [] as Array<{ localPath: string }>, loading: true, loadError: false, busy: false },
  async onLoad(query: Record<string, string | undefined>) {
    this.setData({ taskId: query.id || '' })
    await this.refresh()
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const taskId = this.data.taskId || state.selectedTaskId
      const task = state.tasks.find((item) => item.id === taskId)
      if (!task) throw new Error('待办不存在或已经删除')
      this.setData({ state, task, taskId: task.id, note: task.latestNote || state.taskNote, loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  handleNote(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ note: event.detail.value }) },
  async chooseImage() {
    try { const result = await wx.chooseMedia({ count: 3 - this.data.images.length, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] }); this.setData({ images: [...this.data.images, ...result.tempFiles.map((file) => ({ localPath: file.tempFilePath }))].slice(0, 3) }) }
    catch (error) { if (!(error instanceof Error) || !error.message.includes('cancel')) showError(error) }
  },
  async uploadImages(): Promise<CommunityMedia[]> {
    const evidence: CommunityMedia[] = []
    for (const image of this.data.images) {
      let fileId = image.localPath
      if (isCloudEnabled()) {
        const extension = image.localPath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || 'jpg'
        fileId = (await wx.cloud.uploadFile({ cloudPath: `tasks/evidence/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`, filePath: image.localPath })).fileID
      }
      evidence.push({ type: 'image', fileId })
    }
    return evidence
  },
  async submit() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const evidence = await this.uploadImages()
      const state = await lovePointsService.submitTask(this.data.note, this.data.taskId, evidence)
      showSuccess(this.data.task.bothRequired ? '今日完成，积分已发放' : state.activeSpaceType === 'personal' ? '待办完成，积分已发放' : '已提交确认')
      if (this.data.task.bothRequired) wx.redirectTo({ url: `/pages/task/detail?id=${encodeURIComponent(this.data.taskId)}` })
      else if (state.activeSpaceType === 'personal') wx.redirectTo({ url: '/pages/points/index' })
      else if (state.taskCanReview) wx.redirectTo({ url: `/pages/task/review?id=${encodeURIComponent(this.data.taskId)}` })
      else wx.switchTab({ url: '/pages/task/index' })
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  goHome() { wx.switchTab({ url: '/pages/home/index' }) },
})
