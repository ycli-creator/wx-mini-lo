import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { TaskItem } from '../../types/index'
import { showError, showSuccess } from '../../utils/ui'

Page({
  data: { state: createInitialState(), task: createInitialState().tasks[0] as TaskItem, taskId: '', note: '', loading: true, loadError: false, busy: false },
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
      if (!task) throw new Error('任务不存在或已经删除')
      this.setData({ state, task, taskId: task.id, note: task.latestNote || state.taskNote, loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  handleNote(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ note: event.detail.value }) },
  async submit() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      const state = await lovePointsService.submitTask(this.data.note, this.data.taskId)
      showSuccess('已提交审批')
      if (state.taskCanReview) wx.redirectTo({ url: `/pages/task/review?id=${encodeURIComponent(this.data.taskId)}` })
      else wx.switchTab({ url: '/pages/task/index' })
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  goHome() { wx.switchTab({ url: '/pages/home/index' }) },
})
