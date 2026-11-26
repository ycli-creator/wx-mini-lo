import { showError } from '../../utils/ui'
import { lovePointsService } from '../../services/love-points'

// Keep existing links working while completion lives in the detail page.
Page({
  data: { taskId: '' },
  async onLoad(query: Record<string, string | undefined>) {
    try {
      const taskId = query.id || (await lovePointsService.getState()).selectedTaskId
      this.setData({ taskId })
      this.openDetail()
    } catch (error) { showError(error) }
  },
  openDetail() {
    wx.redirectTo({ url: `/pages/task/detail?id=${encodeURIComponent(this.data.taskId)}`, fail: showError })
  },
})
