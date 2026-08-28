import { lovePointsService } from '../../services/love-points'
import { createInitialState } from '../../store/state'
import { setActiveTab, showError, showSuccess } from '../../utils/ui'

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
    createMode: 'document' as 'document' | 'group',
    groupName: '',
    selectedGroupId: '',
  },
  async onShow() {
    setActiveTab(this, 3)
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
      this.setData({ state, groups, selectedGroupId: this.data.selectedGroupId || groups[0]?.id || '', loading: false })
    } catch (error) {
      this.setData({ loading: false, loadError: true })
      showError(error)
    }
  },
  toggleCreate() { this.setData({ createOpen: !this.data.createOpen }) },
  selectCreateMode(event: WechatMiniprogram.TouchEvent) { this.setData({ createMode: event.currentTarget.dataset.mode as 'document' | 'group' }) },
  selectGroup(event: WechatMiniprogram.TouchEvent) { this.setData({ selectedGroupId: String(event.currentTarget.dataset.id) }) },
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
  startDocument() {
    if (!this.data.selectedGroupId) {
      wx.showToast({ title: '请先创建一个文档组', icon: 'none' })
      return
    }
    wx.navigateTo({ url: `/pages/documents/edit?new=1&groupId=${encodeURIComponent(this.data.selectedGroupId)}` })
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
