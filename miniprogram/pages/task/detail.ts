import { isCloudEnabled } from '../../config/env'
import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { CommunityMedia, ProjectStep, TaskItem } from '../../types/index'
import { showError, showSuccess } from '../../utils/ui'

type DraftImage = { localPath: string; fileId: string }

Page({
  data: {
    taskId: '',
    task: createInitialState().tasks[0] as TaskItem,
    loading: true,
    loadError: false,
    busy: false,
    activeStepId: '',
    note: '',
    images: [] as DraftImage[],
    allStepsDone: false,
  },
  async onLoad(query: Record<string, string | undefined>) { this.setData({ taskId: query.id || '' }); await this.refresh() },
  async onShow() { if (!this.data.loading) await this.refresh(false) },
  async refresh(showLoading = true) {
    if (showLoading) this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const task = state.tasks.find((item) => item.id === this.data.taskId || item.templateId === this.data.taskId)
      if (!task) throw new Error('任务不存在或已经删除')
      this.setData({ task, taskId: task.id, allStepsDone: task.projectSteps.length > 0 && task.projectSteps.every((step) => step.status === 'done'), loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  selectStep(event: WechatMiniprogram.TouchEvent) {
    const step = this.data.task.projectSteps.find((item) => item.id === String(event.currentTarget.dataset.id))
    if (!step || step.status === 'done') return
    if (!step.assigneeIsSelf) return wx.showToast({ title: '这个环节由 TA 完成，可以使用下方 @TA 提醒', icon: 'none' })
    this.setData({ activeStepId: step.id, note: '', images: [] })
  },
  closeStep() { this.setData({ activeStepId: '', note: '', images: [] }) },
  handleNote(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ note: event.detail.value }) },
  async chooseImage() {
    try {
      const result = await wx.chooseMedia({ count: 3 - this.data.images.length, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] })
      this.setData({ images: [...this.data.images, ...result.tempFiles.map((file) => ({ localPath: file.tempFilePath, fileId: '' }))].slice(0, 3) })
    } catch (error) { if (!(error instanceof Error) || !error.message.includes('cancel')) showError(error) }
  },
  async uploadImages(): Promise<CommunityMedia[]> {
    const uploaded: CommunityMedia[] = []
    for (const image of this.data.images) {
      let fileId = image.fileId || image.localPath
      if (isCloudEnabled() && !fileId.startsWith('cloud://')) {
        const extension = image.localPath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || 'jpg'
        fileId = (await wx.cloud.uploadFile({ cloudPath: `tasks/evidence/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`, filePath: image.localPath })).fileID
      }
      uploaded.push({ type: 'image', fileId })
    }
    return uploaded
  },
  async completeStep() {
    if (this.data.busy) return
    const step = this.data.task.projectSteps.find((item) => item.id === this.data.activeStepId)
    if (!step) return
    this.setData({ busy: true })
    try {
      const evidence = await this.uploadImages()
      await lovePointsService.completeProjectStep(this.data.taskId, step.id, this.data.note, evidence)
      showSuccess('环节已完成，积分已到账')
      this.closeStep()
      await this.refresh(false)
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async completeProject() {
    if (this.data.busy) return
    const result = await wx.showModal({ title: '完成整个大任务？', content: '确认后会一次发放剩余积分，该操作只能成功一次。', confirmText: '确认完成', confirmColor: '#f65f6b' })
    if (!result.confirm) return
    this.setData({ busy: true })
    try { await lovePointsService.completeProject(this.data.taskId); showSuccess('共同计划已完成'); await this.refresh(false) }
    catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  openTaskAction() {
    const task = this.data.task
    if (task.status === 'pending' || task.status === 'done') return wx.navigateTo({ url: `/pages/task/review?id=${encodeURIComponent(task.id)}` })
    if (!task.assigneeIsSelf) return wx.showToast({ title: '这个任务由 TA 完成', icon: 'none' })
    wx.navigateTo({ url: `/pages/task/submit?id=${encodeURIComponent(task.id)}` })
  },
  async cuePartner() {
    const task = this.data.task
    try {
      await lovePointsService.cuePartner({ type: 'custom_task', title: task.title, description: task.description, resourceType: 'task', resourceId: task.id, actionPath: `/pages/task/detail?id=${task.id}`, actionText: '查看进度' })
      showSuccess('已在消息里 @TA')
    } catch (error) { showError(error) }
  },
})
