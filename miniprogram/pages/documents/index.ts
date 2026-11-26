import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import { showError, showSuccess } from '../../utils/ui'

type DisplayGroup = {
  id: string
  name: string
  documentCount: number
  documents: Array<{ id: string; title: string; lockedByOther: boolean }>
}

Page({
  data: {
    state: createInitialState(),
    groups: [] as DisplayGroup[],
    loading: true,
    loadError: false,
    busy: false,
    createOpen: false,
    groupName: '',
  },
  async onShow() {
    await this.refresh()
  },
  async refresh() {
    this.setData({ loading: true, loadError: false })
    try {
      const state = await lovePointsService.getState()
      const groups = state.documentGroups.map((group) => {
        const documents = state.documents.filter((document) => document.groupId === group.id)
        return {
          id: group.id,
          name: group.name,
          documentCount: documents.length,
          documents: documents.map((document) => ({ id: document.id, title: document.title, lockedByOther: document.lockedByOther })),
        }
      })
      this.setData({ state, groups, loading: false })
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  toggleCreate() {
    if (this.data.busy) return
    this.setData({ createOpen: !this.data.createOpen })
    if (this.data.createOpen) wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  handleGroupName(event: WechatMiniprogram.CustomEvent<{ value: string }>) { this.setData({ groupName: event.detail.value }) },
  async createGroup() {
    if (this.data.busy) return
    this.setData({ busy: true })
    try {
      await lovePointsService.createDocumentGroup(this.data.groupName)
      this.setData({ groupName: '', createOpen: false })
      showSuccess('文档组已创建')
      await this.refresh()
    } catch (error) { showError(error) }
    finally { this.setData({ busy: false }) }
  },
  openDocument(event: WechatMiniprogram.TouchEvent) {
    const documentId = String(event.currentTarget.dataset.id)
    lovePointsService.selectDocument(documentId)
    wx.navigateTo({ url: `/pages/documents/edit?id=${encodeURIComponent(documentId)}` })
  },
  startGroupDocument(event: WechatMiniprogram.TouchEvent) {
    const groupId = String(event.currentTarget.dataset.id)
    wx.navigateTo({ url: `/pages/documents/edit?new=1&groupId=${encodeURIComponent(groupId)}` })
  },
})
