import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { AchievementItem } from '../../types/index'
import { buildAchievements, relationshipDays } from '../../utils/achievements'
import { setActiveTab, showError } from '../../utils/ui'

Page({
  data: { state: createInitialState(), loading: true, loadError: false, activeTab: 'posts', achievements: [] as AchievementItem[], unlockedCount: 0, relationshipDays: 0, friendCount: 0 },
  async onShow() { setActiveTab(this, 4); await this.refresh() },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      if (!state.profileComplete) { wx.navigateTo({ url: '/pages/profile/edit?onboarding=1' }); this.setData({ loading: false }); return }
      const [achievements, friends, posts] = await Promise.all([
        state.bound ? lovePointsService.listAchievements(state) : Promise.resolve(buildAchievements(state)),
        lovePointsService.listFriends(),
        state.bound ? lovePointsService.listCommunityPosts() : Promise.resolve([]),
      ])
      state.communityPosts = posts
      this.setData({ state, achievements, friendCount: friends.friends.length, unlockedCount: achievements.filter((item) => item.unlocked).length, relationshipDays: relationshipDays(state.relationshipStartedAt), loading: false })
    } catch (error) { this.setData({ loading: false, loadError: true }); showError(error) }
  },
  switchSection(event: WechatMiniprogram.TouchEvent) { this.setData({ activeTab: String(event.currentTarget.dataset.tab || 'posts') }) },
  editProfile() { wx.navigateTo({ url: '/pages/profile/edit' }) },
  openCalendar() { wx.navigateTo({ url: '/pages/records/index' }) },
  openPoints() { wx.navigateTo({ url: '/pages/points/index' }) },
  openDocuments() { wx.navigateTo({ url: '/pages/documents/index' }) },
  openSettings() { wx.navigateTo({ url: '/pages/settings/index' }) },
  openFriends() { wx.navigateTo({ url: '/pages/friends/index' }) },
  copyIdentityCode() { wx.setClipboardData({ data: this.data.state.profile.identityCode }) },
})
