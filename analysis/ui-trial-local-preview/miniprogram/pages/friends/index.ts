import { lovePointsService } from '../../services/love-points'
import type { FriendProfile } from '../../types/index'
import { showError } from '../../utils/ui'

Page({
  data: { code: '', result: null as FriendProfile | null, friends: [] as FriendProfile[], requests: [] as Array<{ id: string; user: FriendProfile }>, loading: true, loadError: false, busy: false, searching: false, searched: false },
  async onShow() { await this.refresh() },
  async refresh() { this.setData({ loading: true, loadError: false }); try { const data = await lovePointsService.listFriends(); this.setData({ ...data, loading: false }) } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) } },
  inputCode(event: WechatMiniprogram.Input) { this.setData({ code: event.detail.value.toUpperCase(), result: null, searched: false }) },
  async search() {
    const code = this.data.code.trim()
    if (!code || this.data.searching) return
    this.setData({ searching: true, searched: false, result: null })
    try { const data = await lovePointsService.searchFriend(code); if (this.data.code.trim() === code) this.setData({ result: data.user, searched: true }) }
    catch (error) { showError(error) }
    finally { this.setData({ searching: false }) }
  },
  async addFriend() { if (this.data.busy || !this.data.result) return; this.setData({ busy: true }); try { const data = await lovePointsService.requestFriend(this.data.code); this.setData({ ...data, result: null, searched: false }); wx.showToast({ title: '好友申请已发送', icon: 'none' }) } catch (error) { showError(error) } finally { this.setData({ busy: false }) } },
  async review(event: WechatMiniprogram.TouchEvent) { if (this.data.busy) return; this.setData({ busy: true }); try { const data = await lovePointsService.reviewFriend(String(event.currentTarget.dataset.id || ''), event.currentTarget.dataset.approved === true); this.setData(data) } catch (error) { showError(error) } finally { this.setData({ busy: false }) } },
})
