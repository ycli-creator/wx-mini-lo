import { isCloudEnabled } from '../../config/env'
import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { CommunityMedia, CompletionRequirement, TaskActivity, TaskItem } from '../../types/index'
import { showError, showSuccess } from '../../utils/ui'

type DraftImage = { localPath: string; fileId: string }
type DisplayLog = TaskActivity & { timeLabel: string }
type CalendarCell = { date: string; day: string; month: string; selfCompleted: boolean; partnerCompleted: boolean; isToday: boolean }

const pad = (value: number) => String(value).padStart(2, '0')
const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const formatLogTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

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
    editOpen: false,
    editTitle: '',
    editDescription: '',
    editPoints: '',
    editRequirement: 'direct' as CompletionRequirement,
    logs: [] as DisplayLog[],
    calendarCells: [] as CalendarCell[],
  },
  async onLoad(query: Record<string, string | undefined>) { this.setData({ taskId: query.id || '' }); await this.refresh() },
  async onShow() { if (!this.data.loading) await this.refresh(false) },
  async refresh(showLoading = true) {
    if (showLoading) this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const task = state.tasks.find((item) => item.id === this.data.taskId || item.templateId === this.data.taskId)
      if (!task) throw new Error('待办不存在或已经删除')
      const relatedTasks = state.tasks.filter((item) => item.templateId === task.templateId)
      const history = new Map<string, { selfCompleted: boolean; partnerCompleted: boolean }>()
      relatedTasks.forEach((item) => {
        item.dailyHistory.forEach((entry) => history.set(entry.date, { selfCompleted: entry.selfCompleted, partnerCompleted: entry.partnerCompleted }))
        if (item.planType === 'daily') history.set(item.cycleKey, { selfCompleted: item.selfCompletion.completed, partnerCompleted: item.partnerCompletion.completed })
      })
      const today = new Date()
      const calendarCells = Array.from({ length: 35 }, (_, index) => {
        const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (34 - index))
        const dateKey = dayKey(date)
        const completed = history.get(dateKey) || { selfCompleted: false, partnerCompleted: false }
        return { date: dateKey, day: String(date.getDate()), month: date.getDate() === 1 || index === 0 ? `${date.getMonth() + 1}月` : '', ...completed, isToday: index === 34 }
      })
      const logs = relatedTasks.flatMap((item) => item.activityLogs).filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).map((item) => ({ ...item, timeLabel: formatLogTime(item.createdAt) }))
      this.setData({ task, taskId: task.id, allStepsDone: task.projectSteps.length > 0 && task.projectSteps.every((step) => step.status === 'done'), calendarCells, logs, loading: false })
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
  async uploadLocalPaths(paths: string[], folder: string): Promise<CommunityMedia[]> {
    const uploaded: CommunityMedia[] = []
    for (const localPath of paths) {
      let fileId = localPath
      if (isCloudEnabled()) {
        const extension = localPath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || 'jpg'
        fileId = (await wx.cloud.uploadFile({ cloudPath: `tasks/${folder}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`, filePath: localPath })).fileID
      }
      uploaded.push({ type: 'image', fileId })
    }
    return uploaded
  },
  async addGalleryPhotos(event?: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return
    const stepId = String(event?.currentTarget.dataset.stepId || '')
    this.setData({ busy: true })
    try {
      const result = await wx.chooseMedia({ count: 3, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] })
      const media = await this.uploadLocalPaths(result.tempFiles.map((file) => file.tempFilePath), 'gallery')
      await lovePointsService.addTaskPhotos(this.data.taskId, media, stepId)
      showSuccess(stepId ? '环节照片已添加' : '待办照片已添加')
      await this.refresh(false)
    } catch (error) { if (!(error instanceof Error) || !error.message.includes('cancel')) showError(error) }
    finally { this.setData({ busy: false }) }
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
    const result = await wx.showModal({ title: '完成整个大计划？', content: '确认后会一次发放剩余积分，该操作只能成功一次。', confirmText: '确认完成', confirmColor: '#f65f6b' })
    if (!result.confirm) return
    this.setData({ busy: true })
    try { await lovePointsService.completeProject(this.data.taskId); showSuccess('共同计划已完成'); await this.refresh(false) }
    catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  openTaskAction() {
    const task = this.data.task
    if (task.bothRequired) {
      if (task.selfCompletion.completed) return wx.showToast({ title: task.partnerCompletion.completed ? '双方今天都已完成' : '你已完成，等待 TA', icon: 'none' })
      return wx.navigateTo({ url: `/pages/task/submit?id=${encodeURIComponent(task.id)}` })
    }
    if (task.status === 'pending' || task.status === 'done') return wx.navigateTo({ url: `/pages/task/review?id=${encodeURIComponent(task.id)}` })
    if (!task.assigneeIsSelf) return wx.showToast({ title: '这个待办由 TA 完成', icon: 'none' })
    wx.navigateTo({ url: `/pages/task/submit?id=${encodeURIComponent(task.id)}` })
  },
  toggleEdit() {
    if (this.data.editOpen) return this.setData({ editOpen: false })
    const task = this.data.task
    this.setData({ editOpen: true, editTitle: task.title, editDescription: task.description, editPoints: String(task.points), editRequirement: task.completionRequirement })
  },
  handleEditTitle(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ editTitle: event.detail.value }) },
  handleEditDescription(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ editDescription: event.detail.value }) },
  handleEditPoints(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ editPoints: event.detail.value.replace(/\D/g, '') }) },
  selectEditRequirement(event: WechatMiniprogram.TouchEvent) { this.setData({ editRequirement: event.currentTarget.dataset.requirement as CompletionRequirement }) },
  async saveEdit() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await lovePointsService.updateTask(this.data.taskId, { title: this.data.editTitle, description: this.data.editDescription, points: Number(this.data.editPoints), completionRequirement: this.data.editRequirement })
      showSuccess('待办已更新并记录修改')
      this.setData({ editOpen: false })
      await this.refresh(false)
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  async cuePartner() {
    const task = this.data.task
    try {
      await lovePointsService.cuePartner({ type: 'custom_task', title: task.title, description: task.description, resourceType: 'task', resourceId: task.id, actionPath: `/pages/task/detail?id=${task.id}`, actionText: '查看进度' })
      showSuccess('已在消息里 @TA')
    } catch (error) { showError(error) }
  },
})
