import { lovePointsService } from '../../services/love-points'
import { showError } from '../../utils/ui'

Page({
  data: { startedAt: '', selectedDate: '', today: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10), publicApproved: false, requests: [] as Array<{ id: string; type: string; value: string; canReview: boolean }>, loading: true },
  async onShow() { await this.refresh() },
  async refresh() { try { const data = await lovePointsService.getRelationshipSettings(); this.setData({ startedAt: data.relationshipStartedAt.slice(0, 10), selectedDate: data.relationshipStartedAt.slice(0, 10), publicApproved: data.publicApproved, requests: data.requests, loading: false }) } catch (error) { this.setData({ loading: false }); showError(error) } },
  chooseDate(event: WechatMiniprogram.PickerChange) { this.setData({ selectedDate: String(event.detail.value) }) },
  async requestDate() { try { const data = await lovePointsService.requestRelationshipChange('date', this.data.selectedDate); this.setData({ requests: data.requests }); wx.showToast({ title: '日期确认已发送', icon: 'none' }) } catch (error) { showError(error) } },
  async requestPublic() { try { const data = await lovePointsService.requestRelationshipChange('public'); this.setData({ requests: data.requests }); wx.showToast({ title: '公开确认已发送', icon: 'none' }) } catch (error) { showError(error) } },
  async revokePublic() { try { const data = await lovePointsService.revokeRelationshipPublic(); this.setData({ publicApproved: data.publicApproved }); wx.showToast({ title: '情侣关系已隐藏', icon: 'none' }) } catch (error) { showError(error) } },
  async review(event: WechatMiniprogram.TouchEvent) { try { const data = await lovePointsService.reviewRelationshipChange(String(event.currentTarget.dataset.id || ''), event.currentTarget.dataset.approved === true); this.setData({ requests: data.requests, publicApproved: data.publicApproved, startedAt: data.relationshipStartedAt.slice(0, 10) }) } catch (error) { showError(error) } },
})
