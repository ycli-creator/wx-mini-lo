import { lovePointsService } from '../../services/love-points'
import { isCloudEnabled } from '../../config/env'
import { showError, showSuccess } from '../../utils/ui'

Page({
  data: { code: '', error: '', busy: false },
  onLoad(query: Record<string, string | undefined>) {
    const code = (query.code || '').replace(/\D/g, '').slice(0, 6)
    this.setData({ code })
  },
  handleCode(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    this.setData({ code: event.detail.value.replace(/\D/g, '').slice(0, 6), error: '' })
  },
  async submit() {
    if (this.data.busy || this.data.code.length !== 6) return
    this.setData({ busy: true, error: '' })
    try {
      await lovePointsService.applyInvite(this.data.code)
      showSuccess('申请已发送')
      wx.navigateTo({ url: isCloudEnabled() ? '/pages/invite/confirm?waiting=1' : '/pages/invite/confirm' })
    } catch (error) {
      const message = error instanceof Error ? error.message : '短码校验失败'
      this.setData({ error: message })
      showError(error)
    }
    finally { this.setData({ busy: false }) }
  },
  goBack() { wx.navigateBack() },
})
