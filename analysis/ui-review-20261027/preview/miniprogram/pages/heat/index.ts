import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import { showError, showSuccess } from '../../utils/ui'

Page({
  data: { heat: createInitialState().heat, bound: false, loading: true },
  async onShow() {
    try {
      const state = await lovePointsService.getState()
      this.setData({ bound: state.bound, heat: state.heat, loading: false })
    } catch (error) { this.setData({ loading: false }); showError(error) }
  },
  async checkIn() {
    try { this.setData({ heat: await lovePointsService.checkInHeat() }); showSuccess('今天的打卡已记录') } catch (error) { showError(error) }
  },
  openTask(event: WechatMiniprogram.TouchEvent) {
    const path = String(event.currentTarget.dataset.path || '')
    const code = String(event.currentTarget.dataset.code || '')
    if (code === 'HF01') { void this.checkIn(); return }
    if (!path) return
    if (path === '/pages/task/index' || path === '/pages/chat/index') wx.switchTab({ url: path })
    else wx.navigateTo({ url: path.replace('date=today', `date=${new Date().toISOString().slice(0, 10)}`) })
  },
  async cue(event: WechatMiniprogram.TouchEvent) {
    const code = String(event.currentTarget.dataset.code || '')
    const task = this.data.heat.tasks.find((item) => item.code === code)
    if (!task) return
    try {
      await lovePointsService.cuePartner({ type: 'heat_task', title: task.title, description: task.description, resourceType: 'heat_task', resourceId: task.code, actionPath: task.actionPath, actionText: task.actionText })
      showSuccess('已在情侣聊天中 @TA')
    } catch (error) { showError(error) }
  },
  onShareAppMessage(event: WechatMiniprogram.Page.IShareAppMessageOption) {
    const code = String(event.target?.dataset?.code || 'HF01')
    const task = this.data.heat.tasks.find((item) => item.code === code) || this.data.heat.tasks[0]
    const title = `还差你一起完成「${task.title}」`
    return { title, path: '/pages/start/index', promise: lovePointsService.createShareIntent({ type: 'heat_task', resourceId: task.code, targetPath: task.actionPath }).then((intent) => ({ title, path: intent.path })) }
  },
})
