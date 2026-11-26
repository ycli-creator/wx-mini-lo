import { isCloudEnabled } from '../config/env'
import type { CommunityMedia, TaskItem } from '../types/index'

export type DraftImage = { localPath: string; fileId: string }
export const canCompleteTask = (task: TaskItem) =>
  task.kind !== 'project' && (task.planType === 'long_term' || task.isCurrentCycle) &&
  !['pending', 'done', 'missed'].includes(task.status) &&
  (task.bothRequired ? !task.selfCompletion.completed : task.assigneeIsSelf)

export const chooseTaskImages = async (images: DraftImage[]): Promise<DraftImage[]> => {
  if (images.length >= 3) return images
  const result = await wx.chooseMedia({ count: 3 - images.length, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] })
  return [...images, ...result.tempFiles.map(file => ({ localPath: file.tempFilePath, fileId: '' }))].slice(0, 3)
}

export const uploadTaskEvidence = async (images: DraftImage[]): Promise<CommunityMedia[]> => {
  const uploaded: CommunityMedia[] = []
  for (const image of images) {
    if (!image.fileId && isCloudEnabled()) {
      const extension = image.localPath.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || 'jpg'
      const result = await wx.cloud.uploadFile({ cloudPath: `tasks/evidence/${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`, filePath: image.localPath })
      image.fileId = result.fileID
    }
    uploaded.push({ type: 'image', fileId: image.fileId || image.localPath })
  }
  return uploaded
}
