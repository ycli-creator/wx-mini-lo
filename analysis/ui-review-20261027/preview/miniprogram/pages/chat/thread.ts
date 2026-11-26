import { lovePointsService } from '../../services/love-points'
import type { ChatMessage } from '../../types/index'
import { setTabUnread, showError } from '../../utils/ui'

Page({
  data: { messages: [] as ChatMessage[], text: '', loading: true, partnerName: 'TA' },
  async onShow() { await this.refresh() },
  async refresh() {
    try {
      const state = await lovePointsService.getState()
      if (!state.bound) { wx.navigateBack(); return }
      const result = await lovePointsService.listMessages()
      this.setData({ loading: false, messages: result.messages, partnerName: state.partnerProfile.nickname || 'TA' }); setTabUnread(this, 0)
    } catch (error) { this.setData({ loading: false }); showError(error) }
  },
  inputText(event: WechatMiniprogram.Input) { this.setData({ text: event.detail.value }) },
  async send() { try { const result = await lovePointsService.sendMessage(this.data.text); this.setData({ messages: result.messages, text: '' }) } catch (error) { showError(error) } },
  async openCard(event: WechatMiniprogram.TouchEvent) {
    try { const result = await lovePointsService.openChatCard(String(event.currentTarget.dataset.id || '')); if (!result.actionPath) return; if (result.actionPath === '/pages/task/index' || result.actionPath === '/pages/community/index') wx.switchTab({ url: result.actionPath }); else wx.navigateTo({ url: result.actionPath }) } catch (error) { showError(error) }
  },
})
