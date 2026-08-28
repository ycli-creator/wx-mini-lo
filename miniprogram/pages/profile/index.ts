import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import { setActiveTab, showError } from '../../utils/ui'

const genderLabels = { female: '女', male: '男', other: '其他', private: '不公开' }

Page({
  data: {
    state: createInitialState(),
    genderLabel: '不公开',
    hobbiesLabel: '还没有填写',
    loading: true,
    loadError: false,
  },
  async onShow() {
    setActiveTab(this, 4)
    await this.refresh()
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      if (!state.profileComplete) {
        wx.navigateTo({ url: '/pages/profile/edit?onboarding=1' })
        this.setData({ loading: false })
        return
      }
      this.setData({
        state,
        genderLabel: genderLabels[state.profile.gender],
        hobbiesLabel: state.profile.hobbies.join('、') || '还没有填写',
        loading: false,
      })
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  editProfile() { wx.navigateTo({ url: '/pages/profile/edit' }) },
  openCalendar() { wx.navigateTo({ url: '/pages/records/index' }) },
  openPoints() { wx.navigateTo({ url: '/pages/points/index' }) },
  openSettings() { wx.navigateTo({ url: '/pages/settings/index' }) },
})
