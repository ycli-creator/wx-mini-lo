import { lovePointsService } from '../../services/love-points'
import type { CommunityPost } from '../../types/index'
import { setActiveTab, showError, showSuccess } from '../../utils/ui'

type DisplayPost = CommunityPost & {
  coverUrl: string
  coverType: 'image' | 'video' | 'text'
  mediaCount: number
  statusLabel: string
  statusClass: string
  dateLabel: string
}

const formatDate = (value: string) => {
  if (!value) return '等待确认'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return '今天'
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const displayPost = (post: CommunityPost): DisplayPost => {
  const firstMedia = post.media[0]
  const statusLabel = post.status === 'couple_only' ? '仅我们可见' : post.status === 'pending' ? (post.canReview ? '等你确认' : '等待 TA 确认') : post.status === 'rejected' ? '未通过' : ''
  return {
    ...post,
    coverUrl: firstMedia?.type === 'video' ? firstMedia.posterFileId || '' : firstMedia?.fileId || '',
    coverType: firstMedia?.type || 'text',
    mediaCount: post.media.length,
    statusLabel,
    statusClass: post.status === 'rejected' ? 'status-warning' : post.status === 'couple_only' ? 'status-done' : 'status-pending',
    dateLabel: formatDate(post.publishedAt || post.createdAt),
  }
}

Page({
  data: {
    posts: [] as DisplayPost[],
    leftPosts: [] as DisplayPost[],
    rightPosts: [] as DisplayPost[],
    pendingCount: 0,
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
      const posts = sourcePosts.map(displayPost)
      this.setData({
        posts,
        leftPosts: posts.filter((_, index) => index % 2 === 0),
        rightPosts: posts.filter((_, index) => index % 2 === 1),
        pendingCount: posts.filter((item) => item.status === 'pending').length,
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
    if (!this.data.bound) return wx.showModal({ title: '创建情侣空间后发布', content: '公开帖子来自情侣空间，并默认先保存在两个人之间。你仍然可以浏览社区内容。', showCancel: false, confirmText: '我知道了' })
    wx.navigateTo({ url: '/pages/community/create' })
  },
  previewImage(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id)
    const post = this.data.posts.find((item) => item.id === id)
    const urls = post?.media.filter((item) => item.type === 'image').map((item) => item.fileId) || []
    if (urls.length) wx.previewImage({ current: urls[0], urls })
  },
  async review(event: WechatMiniprogram.TouchEvent) {
    const postId = String(event.currentTarget.dataset.id)
    const approved = event.currentTarget.dataset.approved === true || event.currentTarget.dataset.approved === 'true'
    if (this.data.busyPostId) return
    const result = await wx.showModal({
      title: approved ? '同意公开这条帖子？' : '暂不公开这条帖子？',
      content: approved ? '确认后，这条情侣日常会出现在社区中。' : '帖子会退回给发布人，不会进入社区。',
      confirmText: approved ? '同意发布' : '暂不发布',
      confirmColor: approved ? '#f65f6b' : '#8a7c78',
    })
    if (!result.confirm) return
    this.setData({ busyPostId: postId })
    try {
      await lovePointsService.reviewCommunityPost(postId, approved)
      showSuccess(approved ? '已共同确认发布' : '已退回帖子')
      await this.refresh(false)
    } catch (error) { showError(error) }
    finally { this.setData({ busyPostId: '' }) }
  },
})
