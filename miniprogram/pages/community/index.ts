import { lovePointsService } from '../../services/love-points'
import type { CommunityPost } from '../../types/index'
import { setActiveTab, showError, showSuccess } from '../../utils/ui'

type DisplayPost = CommunityPost & {
  coverUrl: string
  coverType: 'image' | 'video' | 'text'
  mediaCount: number
  dateLabel: string
}

const formatDate = (value: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return '今天'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const displayPost = (post: CommunityPost): DisplayPost => {
  const firstMedia = post.media[0]
  return {
    ...post,
    coverUrl: firstMedia?.type === 'video' ? firstMedia.posterFileId || '' : firstMedia?.fileId || '',
    coverType: firstMedia?.type || 'text',
    mediaCount: post.media.length,
    dateLabel: formatDate(post.createdAt),
  }
}

Page({
  data: {
    posts: [] as DisplayPost[],
    loading: true,
    loadError: false,
    busyPostId: '',
    bound: false,
  },
  async onShow() {
    setActiveTab(this, 2)
    await this.refresh()
  },
  async onPullDownRefresh() {
    await this.refresh(false)
    wx.stopPullDownRefresh()
  },
  async refresh(showLoading = true) {
    if (showLoading) this.setData({ loading: true, loadError: false })
    try {
      const [state, sourcePosts] = await Promise.all([lovePointsService.getState(), lovePointsService.listCommunityPosts()])
      const posts = sourcePosts.filter((item) => item.belongsToCurrentCouple).map(displayPost)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      this.setData({
        posts,
        bound: state.bound,
        loading: false,
        loadError: false,
      })
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  createPost() {
    if (!this.data.bound) return wx.navigateTo({ url: '/pages/invite/create' })
    wx.navigateTo({ url: '/pages/community/create' })
  },
  async postMenu(event: WechatMiniprogram.TouchEvent) {
    const post = this.data.posts.find(item => item.id === event.currentTarget.dataset.id)
    if (!post || this.data.busyPostId) return
    const choices = [...(post.authorIsSelf ? ['编辑'] : []), ...(post.canDelete ? ['删除'] : [])]
    if (!choices.length) return
    try {
      const { tapIndex } = await wx.showActionSheet({ itemList: choices })
      if (choices[tapIndex] === '编辑') this.editPost(event)
      if (choices[tapIndex] === '删除') await this.deletePost(event)
    } catch (error) {
      if (!/cancel/i.test(String((error as { errMsg?: string }).errMsg || error))) showError(error)
    }
  },
  editPost(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id)
    if (!this.data.posts.some((item) => item.id === id && item.authorIsSelf)) return
    wx.navigateTo({ url: `/pages/community/create?id=${encodeURIComponent(id)}` })
  },
  previewImage(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id)
    const post = this.data.posts.find((item) => item.id === id)
    const urls = post?.media.filter((item) => item.type === 'image').map((item) => item.fileId) || []
    if (urls.length) wx.previewImage({ current: urls[0], urls })
  },
  async deletePost(event: WechatMiniprogram.TouchEvent) {
    const postId = String(event.currentTarget.dataset.id)
    if (this.data.busyPostId || !this.data.posts.some(post => post.id === postId && post.canDelete)) return
    this.setData({ busyPostId: postId })
    try {
      const result = await wx.showModal({ title: '删除这条日常？', content: '删除后将从情侣空间中移除，无法恢复。', confirmText: '删除', confirmColor: '#b72f46' })
      if (!result.confirm) return
      await lovePointsService.deleteCommunityPost(postId)
      showSuccess('日常已删除')
      await this.refresh(false)
    }
    catch (error) { showError(error) }
    finally { this.setData({ busyPostId: '' }) }
  },
})
