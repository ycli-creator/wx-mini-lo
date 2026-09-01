import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { TaskItem } from '../../types/index'
import { showError, showSuccess } from '../../utils/ui'

Page({
  data: { state: createInitialState(), task: createInitialState().tasks[0] as TaskItem, taskId: '', reason: '', loading: true, loadError: false, busy: false },
  onLoad(query: Record<string, string | undefined>) { this.setData({ taskId: query.id || '' }) },
  async onShow() { await this.refresh() },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const taskId = this.data.taskId || state.selectedTaskId
      const task = state.tasks.find((item) => item.id === taskId)
      if (!task) throw new Error('待办不存在或已经删除')
      this.setData({ state, task, taskId: task.id, loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  async approve() {
    if (this.data.task.status === 'done') {
      wx.redirectTo({ url: '/pages/points/index' })
      return
    }
    if (this.data.busy || this.data.task.status !== 'pending') return
    this.setData({ busy: true })
    try {
      await lovePointsService.reviewTask(true, this.data.taskId)
      showSuccess('积分已发放')
      wx.redirectTo({ url: '/pages/points/index' })
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  handleReason(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ reason: event.detail.value }) },
  async reject() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await lovePointsService.reviewTask(false, this.data.taskId, this.data.reason)
      wx.showToast({ title: '已请对方补充', icon: 'none' })
      wx.redirectTo({ url: `/pages/task/submit?id=${encodeURIComponent(this.data.taskId)}` })
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  goTasks() { wx.switchTab({ url: '/pages/task/index' }) },
})
