import { lovePointsService } from '../../services/love-points'
import type { ChatMessage } from '../../types/index'
import { showError } from '../../utils/ui'
import { openPage } from '../../utils/navigation'

Page({
  data: { messages: [] as ChatMessage[], text: '', loading: true, loadError: false, sending: false, partnerName: 'TA', bottomMessage: '', keyboardHeight: 0 },
  async onShow() { await this.refresh() },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      if (!state.bound) { wx.navigateBack(); return }
      const result = await lovePointsService.listMessages()
      this.setData({ loading: false, messages: result.messages, partnerName: state.partnerProfile.nickname || 'TA', bottomMessage: result.messages.length ? 'message-' + result.messages[result.messages.length - 1].id : '' })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  inputText(event: WechatMiniprogram.Input) { this.setData({ text: event.detail.value }) },
  keyboardChange(event: WechatMiniprogram.CustomEvent<{ height: number }>) { this.setData({ keyboardHeight: event.detail.height }) },
  async send() {
    const text = this.data.text.trim()
    if (!text || this.data.sending || this.data.loading || this.data.loadError) return
    this.setData({ sending: true })
    try {
      const result = await lovePointsService.sendMessage(text)
      this.setData({ messages: result.messages, text: this.data.text.trim() === text ? '' : this.data.text, bottomMessage: result.messages.length ? 'message-' + result.messages[result.messages.length - 1].id : '' })
    } catch (error) { showError(error) }
    finally { this.setData({ sending: false }) }
  },
  async openCard(event: WechatMiniprogram.TouchEvent) {
    try { const result = await lovePointsService.openChatCard(String(event.currentTarget.dataset.id || '')); if (result.actionPath) openPage(result.actionPath) } catch (error) { showError(error) }
  },
})
