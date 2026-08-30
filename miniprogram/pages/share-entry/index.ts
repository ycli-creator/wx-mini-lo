import { lovePointsService } from '../../services/love-points'

Page({
  data: { message: '正在验证分享内容', targetPath: '' },
  async onLoad(query: Record<string, string>) {
    try {
      const result = await lovePointsService.resolveShareIntent(query.t || '')
      this.setData({ message: '分享内容已通过权限验证。', targetPath: result.targetPath })
    } catch (error) { this.setData({ message: error instanceof Error ? error.message : '分享已失效或无权查看' }) }
  },
  openApp() {
    const path = this.data.targetPath
    if (!path) { wx.reLaunch({ url: '/pages/start/index' }); return }
    if (path === '/pages/task/index' || path === '/pages/chat/index') wx.switchTab({ url: path })
    else wx.redirectTo({ url: path })
  },
})
