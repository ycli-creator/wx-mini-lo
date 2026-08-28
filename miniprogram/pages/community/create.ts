import { isCloudEnabled } from '../../config/env'
import { lovePointsService } from '../../services/love-points'
import type { CommunityMedia } from '../../types/index'
import { showError, showSuccess } from '../../utils/ui'

type DraftMedia = {
  type: 'image' | 'video'
  localPath: string
  posterPath: string
  width: number
  height: number
  duration: number
  size: number
}

const cloudPath = (scope: string, localPath: string) => {
  const extension = localPath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || (scope === 'video' ? 'mp4' : 'jpg')
  return `community/${scope}/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`
}

Page({
  data: {
    content: '',
    media: [] as DraftMedia[],
    busy: false,
    uploadProgress: '',
  },
  handleContent(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ content: event.detail.value }) },
  async chooseMedia() {
    try {
      const remaining = 9 - this.data.media.length
      if (remaining <= 0) {
        wx.showToast({ title: '一次最多选择 9 个文件', icon: 'none' })
        return
      }
      const result = await wx.chooseMedia({ count: remaining, mediaType: ['image', 'video'], sourceType: ['album', 'camera'], sizeType: ['compressed'], maxDuration: 60 })
      const accepted = result.tempFiles.filter((file) => file.size <= (file.fileType === 'video' ? 100 * 1024 * 1024 : 10 * 1024 * 1024))
      if (accepted.length !== result.tempFiles.length) wx.showToast({ title: '图片需小于 10MB，视频需小于 100MB', icon: 'none' })
      const next: DraftMedia[] = accepted.map((file) => ({
        type: file.fileType,
        localPath: file.tempFilePath,
        posterPath: file.fileType === 'video' ? file.thumbTempFilePath || '' : '',
        width: Number(file.width || 0),
        height: Number(file.height || 0),
        duration: Number(file.duration || 0),
        size: Number(file.size || 0),
      }))
      this.setData({ media: [...this.data.media, ...next].slice(0, 9) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('cancel')) showError(error)
    }
  },
  removeMedia(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ media: this.data.media.filter((_, itemIndex) => itemIndex !== index) })
  },
  async uploadFile(filePath: string, scope: string) {
    if (!isCloudEnabled()) return filePath
    const result = await wx.cloud.uploadFile({ cloudPath: cloudPath(scope, filePath), filePath })
    return result.fileID
  },
  async publish() {
    if (this.data.busy) return
    if (!this.data.content.trim() && !this.data.media.length) {
      wx.showToast({ title: '写点文字，或选择照片和视频', icon: 'none' })
      return
    }
    this.setData({ busy: true, uploadProgress: this.data.media.length ? '正在上传 0%' : '正在提交' })
    const uploadedIds: string[] = []
    try {
      const uploaded: CommunityMedia[] = []
      for (let index = 0; index < this.data.media.length; index += 1) {
        const item = this.data.media[index]
        const fileId = await this.uploadFile(item.localPath, item.type)
        if (fileId.startsWith('cloud://')) uploadedIds.push(fileId)
        let posterFileId = ''
        if (item.type === 'video' && item.posterPath) {
          posterFileId = await this.uploadFile(item.posterPath, 'poster')
          if (posterFileId.startsWith('cloud://')) uploadedIds.push(posterFileId)
        }
        uploaded.push({ type: item.type, fileId, posterFileId, width: item.width, height: item.height, duration: item.duration })
        this.setData({ uploadProgress: `正在上传 ${Math.round(((index + 1) / this.data.media.length) * 100)}%` })
      }
      await lovePointsService.createCommunityPost({ content: this.data.content, media: uploaded })
      showSuccess('已发送给 TA 确认')
      wx.navigateBack()
    } catch (error) {
      if (uploadedIds.length && isCloudEnabled()) wx.cloud.deleteFile({ fileList: uploadedIds }).catch(() => undefined)
      showError(error)
    } finally {
      this.setData({ busy: false, uploadProgress: '' })
    }
  },
})
