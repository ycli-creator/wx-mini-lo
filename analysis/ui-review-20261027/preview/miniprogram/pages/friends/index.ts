import { lovePointsService } from '../../services/love-points'
import type { FriendProfile } from '../../types/index'
import { showError } from '../../utils/ui'

Page({
  data: { code: '', result: null as FriendProfile | null, friends: [] as FriendProfile[], requests: [] as Array<{ id: string; user: FriendProfile }>, loading: true },
  async onShow() { await this.refresh() },
  async refresh() { try { const data = await lovePointsService.listFriends(); this.setData({ ...data, loading: false }) } catch (error) { this.setData({ loading: false }); showError(error) } },
  inputCode(event: WechatMiniprogram.Input) { this.setData({ code: event.detail.value.toUpperCase(), result: null }) },
  async search() { try { const data = await lovePointsService.searchFriend(this.data.code); this.setData({ result: data.user }) } catch (error) { showError(error) } },
  async addFriend() { try { const data = await lovePointsService.requestFriend(this.data.code); this.setData({ ...data, result: null }); wx.showToast({ title: '好友申请已发送', icon: 'none' }) } catch (error) { showError(error) } },
  async review(event: WechatMiniprogram.TouchEvent) { try { const data = await lovePointsService.reviewFriend(String(event.currentTarget.dataset.id || ''), event.currentTarget.dataset.approved === true); this.setData(data) } catch (error) { showError(error) } },
})
