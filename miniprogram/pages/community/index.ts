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
  const statusLabel = post.status === 'couple_only' ? '仅我们可见' : post.status === 'pending' ? (post.canReview ? '等你确认' : '等待 TA 确认') : post.status === 'rejected' ? '未通过' : '已公开'
  return {
    ...post,
    coverUrl: firstMedia?.type === 'video' ? firstMedia.posterFileId || '' : firstMedia?.fileId || '',
    coverType: firstMedia?.type || 'text',
    mediaCount: post.media.length,
    statusLabel,
    statusClass: post.status === 'rejected' ? 'status-warning' : ['couple_only', 'published'].includes(post.status) ? 'status-done' : 'status-pending',
    dateLabel: formatDate(post.publishedAt || post.createdAt),
  }
}

Page({
  data: {
    posts: [] as DisplayPost[],
    allPosts: [] as DisplayPost[],
    leftPosts: [] as DisplayPost[],
    rightPosts: [] as DisplayPost[],
    pendingCount: 0,
    loading: true,
    loadError: false,
    busyPostId: '',
    bound: false,
    activeFilter: 'public' as 'public' | 'ours' | 'pending',
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
      const allPosts = sourcePosts.map(displayPost)
      const posts = this.filterPosts(allPosts, this.data.activeFilter)
      this.setData({
        posts,
        allPosts,
        leftPosts: posts.filter((_, index) => index % 2 === 0),
        rightPosts: posts.filter((_, index) => index % 2 === 1),
        pendingCount: allPosts.filter((item) => item.status === 'pending' && item.belongsToCurrentCouple).length,
        bound: state.bound,
        loading: false,
        loadError: false,
      })
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  filterPosts(posts: DisplayPost[], filter: 'public' | 'ours' | 'pending') {
    if (filter === 'pending') return posts.filter((item) => item.belongsToCurrentCouple && item.status === 'pending')
    if (filter === 'ours') return posts.filter((item) => item.belongsToCurrentCouple)
    return posts.filter((item) => item.status === 'published')
  },
  changeFilter(event: WechatMiniprogram.TouchEvent) {
    const activeFilter = String(event.currentTarget.dataset.filter || 'public') as 'public' | 'ours' | 'pending'
    const posts = this.filterPosts(this.data.allPosts, activeFilter)
    this.setData({
      activeFilter,
      posts,
      leftPosts: posts.filter((_, index) => index % 2 === 0),
      rightPosts: posts.filter((_, index) => index % 2 === 1),
    })
  },
  createPost() {
    if (!this.data.bound) return wx.showModal({ title: '创建情侣空间后发布', content: '公开帖子来自情侣空间，并默认先保存在两个人之间。你仍然可以浏览社区内容。', showCancel: false, confirmText: '我知道了' })
    wx.navigateTo({ url: '/pages/community/create' })
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
      const post = this.data.posts.find((item) => item.id === postId)
      if (!post) throw new Error('帖子已经更新，请刷新后重试')
      await lovePointsService.reviewCommunityPost(postId, approved, post.contentVersion)
      showSuccess(approved ? '已共同确认发布' : '已退回帖子')
      await this.refresh(false)
    } catch (error) { showError(error) }
    finally { this.setData({ busyPostId: '' }) }
  },
  async withdrawPost(event: WechatMiniprogram.TouchEvent) {
    const postId = String(event.currentTarget.dataset.id)
    if (this.data.busyPostId) return
    const result = await wx.showModal({ title: '撤回公开帖子？', content: '撤回后帖子只在情侣空间可见，之前的分享入口也会失效。', confirmText: '确认撤回', confirmColor: '#f65f6b' })
    if (!result.confirm) return
    this.setData({ busyPostId: postId })
    try { await lovePointsService.withdrawCommunityPost(postId); showSuccess('帖子已撤回'); await this.refresh(false) }
    catch (error) { showError(error) }
    finally { this.setData({ busyPostId: '' }) }
  },
  async deletePost(event: WechatMiniprogram.TouchEvent) {
    const postId = String(event.currentTarget.dataset.id)
    if (this.data.busyPostId) return
    const result = await wx.showModal({ title: '删除这条帖子？', content: '删除后将从情侣空间和公开社区中移除，无法在小程序中恢复。', confirmText: '删除', confirmColor: '#d84b56' })
    if (!result.confirm) return
    this.setData({ busyPostId: postId })
    try { await lovePointsService.deleteCommunityPost(postId); showSuccess('帖子已删除'); await this.refresh(false) }
    catch (error) { showError(error) }
    finally { this.setData({ busyPostId: '' }) }
  },
  async reportPost(event: WechatMiniprogram.TouchEvent) {
    const postId = String(event.currentTarget.dataset.id)
    if (this.data.busyPostId) return
    const reasons = ['色情低俗', '违法违规', '人身攻击', '广告引流', '隐私泄露', '其他']
    try {
      const choice = await wx.showActionSheet({ itemList: reasons })
      this.setData({ busyPostId: postId })
      await lovePointsService.reportCommunityPost(postId, reasons[choice.tapIndex])
      showSuccess('举报已提交')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('cancel')) showError(error)
    } finally { this.setData({ busyPostId: '' }) }
  },
})
