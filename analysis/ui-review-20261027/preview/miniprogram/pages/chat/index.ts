import { lovePointsService } from '../../services/love-points'
import { setActiveTab, setTabUnread, showError } from '../../utils/ui'
import type { AppNotification } from '../../types/index'

Page({
  data: { bound: false, loading: true, unread: 0, notificationUnread: 0, notifications: [] as AppNotification[], partnerName: 'TA', preview: '还没有消息，去和 TA 说句话吧' },
  async onShow() { setActiveTab(this, 3); await this.refresh() },
  async refresh() {
    this.setData({ loading: true })
    try {
      const state = await lovePointsService.getState()
      const unread = state.bound ? await lovePointsService.getUnreadMessages() : 0
      const notifications = await lovePointsService.listNotifications()
      const last = state.messages[state.messages.length - 1]
      this.setData({ bound: state.bound, loading: false, unread, notifications: notifications.items, notificationUnread: notifications.unread, partnerName: state.partnerProfile.nickname || 'TA', preview: last ? (last.text || last.title || '一条互动消息') : '还没有消息，去和 TA 说句话吧' })
      setTabUnread(this, unread + notifications.unread)
    } catch (error) { this.setData({ loading: false }); showError(error) }
  },
  openChat() {
    if (!this.data.bound) { wx.showToast({ title: '绑定 TA 后才能私聊', icon: 'none' }); return }
    wx.navigateTo({ url: '/pages/chat/thread' })
  },
  openTasks() { wx.switchTab({ url: '/pages/task/index' }) },
  openCommunity() { wx.switchTab({ url: '/pages/community/index' }) },
  async openNotification(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || '')
    const item = this.data.notifications.find((entry) => entry.id === id)
    if (!item) return
    try {
      await lovePointsService.readNotification(id)
      if (!item.actionPath) { await this.refresh(); return }
      if (['/pages/home/index', '/pages/task/index', '/pages/community/index', '/pages/chat/index', '/pages/profile/index'].includes(item.actionPath)) wx.switchTab({ url: item.actionPath })
      else wx.navigateTo({ url: item.actionPath })
    } catch (error) { showError(error) }
  },
})
