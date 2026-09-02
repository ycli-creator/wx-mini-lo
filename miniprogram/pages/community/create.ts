import { COMMUNITY_POLICY_VERSION } from '../../config/env'
import { lovePointsService } from '../../services/love-points'
import { showError, showSuccess } from '../../utils/ui'

type DraftMedia = {
  type: 'image' | 'video'
  localPath: string
  posterPath: string
  width: number
  height: number
  duration: number
}

Page({
  data: {
    postId: '',
    editing: false,
    title: '',
    content: '',
    media: [] as DraftMedia[],
    busy: false,
    uploadProgress: '',
    syncToCommunity: false,
    privateMode: false,
    policyAccepted: false,
  },
  onLoad(query: Record<string, string | undefined>) { this.setData({ postId: query.id || '', editing: Boolean(query.id) }) },
  async onShow() {
    try {
      const state = await lovePointsService.getState()
      const policyAccepted = state.preferences.communityPolicyVersion === COMMUNITY_POLICY_VERSION
      if (this.data.postId) {
        const posts = await lovePointsService.listCommunityPosts()
        const post = posts.find((item) => item.id === this.data.postId && item.authorIsSelf)
        if (!post) throw new Error('只能编辑自己发布的帖子')
        this.setData({
          privateMode: state.profile.privacy.privateMode,
          title: post.title,
          content: post.content,
          syncToCommunity: post.syncToCommunity && !state.profile.privacy.privateMode,
          media: post.media.map((item) => ({ type: item.type, localPath: item.fileId, posterPath: item.posterFileId || '', width: Number(item.width || 0), height: Number(item.height || 0), duration: Number(item.duration || 0) })),
          policyAccepted,
        })
      } else this.setData({ privateMode: state.profile.privacy.privateMode, syncToCommunity: false, policyAccepted })
      if (!state.preferences.communityGuideSeen) {
        await wx.showModal({ title: '先记录，再决定是否公开', content: '帖子默认只保存在情侣空间。只有主动开启“同步到社区”，并经过 TA 确认后，其他人才会看到。', showCancel: false, confirmText: '我知道了', confirmColor: '#f65f6b' })
        await lovePointsService.markGuideSeen('community')
      }
    } catch (error) { showError(error) }
  },
  handleTitle(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ title: event.detail.value }) },
  handleContent(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ content: event.detail.value }) },
  toggleCommunity(event: WechatMiniprogram.SwitchChange) {
    if (event.detail.value && this.data.media.length) {
      wx.showModal({ title: '公开社区暂不支持媒体', content: '图片和视频审核能力接通前，这篇帖子只能保存在情侣空间。纯文字帖子仍可申请公开。', showCancel: false, confirmText: '我知道了' })
      this.setData({ syncToCommunity: false })
      return
    }
    this.setData({ syncToCommunity: event.detail.value })
  },
  togglePolicy() { this.setData({ policyAccepted: !this.data.policyAccepted }) },
  openPolicies() { wx.navigateTo({ url: '/pages/legal/index?section=community' }) },
  removeMedia(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ media: this.data.media.filter((_, itemIndex) => itemIndex !== index) })
  },
  async publish() {
    if (this.data.busy) return
    if (!this.data.title.trim()) {
      wx.showToast({ title: '请填写帖子标题', icon: 'none' })
      return
    }
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请填写帖子正文', icon: 'none' })
      return
    }
    if (this.data.media.length) {
      wx.showToast({ title: '请先移除历史图片或视频', icon: 'none' })
      return
    }
    if (this.data.syncToCommunity && !this.data.policyAccepted) {
      wx.showToast({ title: '请先同意社区规范', icon: 'none' })
      return
    }
    this.setData({ busy: true, uploadProgress: '正在提交' })
    try {
      const input = {
        title: this.data.title,
        content: this.data.content,
        media: [],
        syncToCommunity: this.data.syncToCommunity,
        policyAccepted: this.data.policyAccepted,
        policyVersion: COMMUNITY_POLICY_VERSION,
      }
      if (this.data.editing) await lovePointsService.updateCommunityPost(this.data.postId, input)
      else await lovePointsService.createCommunityPost(input)
      showSuccess(this.data.syncToCommunity ? '已发送给 TA 确认' : this.data.editing ? '帖子修改已保存' : '已保存到情侣空间')
      wx.navigateBack()
    } catch (error) { showError(error) }
    finally {
      this.setData({ busy: false, uploadProgress: '' })
    }
  },
})
