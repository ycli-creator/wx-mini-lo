import { isCloudEnabled } from '../../config/env'
import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import type { ProfileGender } from '../../types/index'
import { showError, showSuccess } from '../../utils/ui'

const genderOptions: Array<{ value: ProfileGender; label: string }> = [
  { value: 'female', label: '女' },
  { value: 'male', label: '男' },
  { value: 'other', label: '其他' },
  { value: 'private', label: '不公开' },
]

Page({
  data: {
    state: createInitialState(),
    onboarding: false,
    nickname: '',
    avatarUrl: '',
    backgroundUrl: '',
    gender: 'private' as ProfileGender,
    region: '',
    hobbiesText: '',
    genderOptions,
    loading: true,
    loadError: false,
    busy: false,
  },
  onLoad(query: Record<string, string | undefined>) {
    this.setData({ onboarding: query.onboarding === '1' })
  },
  async onShow() {
    if (!this.data.loading) return
    await this.refresh()
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      this.setData({
        state,
        nickname: state.profile.nickname,
        avatarUrl: state.profile.avatarUrl,
        backgroundUrl: state.profile.backgroundUrl,
        gender: state.profile.gender,
        region: state.profile.region,
        hobbiesText: state.profile.hobbies.join('、'),
        loading: false,
      })
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  handleNickname(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ nickname: event.detail.value }) },
  handleRegion(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ region: event.detail.value }) },
  handleHobbies(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ hobbiesText: event.detail.value }) },
  selectGender(event: WechatMiniprogram.TouchEvent) { this.setData({ gender: event.currentTarget.dataset.value as ProfileGender }) },
  handleAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) { this.setData({ avatarUrl: event.detail.avatarUrl }) },
  async chooseBackground() { try { const result = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] }); this.setData({ backgroundUrl: result.tempFiles[0]?.tempFilePath || this.data.backgroundUrl }) } catch (error) { if (!(error instanceof Error) || !error.message.includes('cancel')) showError(error) } },
  async uploadAvatarIfNeeded() {
    const avatarUrl = this.data.avatarUrl
    if (!avatarUrl || !isCloudEnabled() || avatarUrl.startsWith('cloud://') || avatarUrl.startsWith('https://')) return avatarUrl
    const extension = avatarUrl.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || 'jpg'
    const result = await wx.cloud.uploadFile({
      cloudPath: `profiles/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`,
      filePath: avatarUrl,
    })
    return result.fileID
  },
  async save() {
    if (this.data.busy) return
    if (!this.data.nickname.trim()) {
      wx.showToast({ title: '请填写你的用户名', icon: 'none' })
      return
    }
    this.setData({ busy: true })
    try {
      const avatarUrl = await this.uploadAvatarIfNeeded()
      let backgroundUrl = this.data.backgroundUrl
      if (backgroundUrl && isCloudEnabled() && !backgroundUrl.startsWith('cloud://') && !backgroundUrl.startsWith('https://')) {
        const extension = backgroundUrl.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || 'jpg'
        backgroundUrl = (await wx.cloud.uploadFile({ cloudPath: `profiles/backgrounds/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`, filePath: backgroundUrl })).fileID
      }
      await lovePointsService.updateProfile({
        nickname: this.data.nickname,
        avatarUrl,
        gender: this.data.gender,
        region: this.data.region,
        hobbies: this.data.hobbiesText.split(/[，,、\s]+/).filter(Boolean),
        backgroundUrl,
      })
      showSuccess('个人资料已保存')
      wx.navigateBack()
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
})
