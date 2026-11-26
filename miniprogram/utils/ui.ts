export const showSuccess = (title: string) => wx.showToast({ title, icon: 'success', duration: 1800 })

export const showError = (error: unknown) => {
  const title = error instanceof Error ? error.message : '操作失败，请稍后再试'
  wx.showToast({ title, icon: 'none', duration: 2400 })
}

export const setActiveTab = (page: WechatMiniprogram.Page.Instance<{}, {}>, selected: number) => {
  const pageWithTabBar = page as WechatMiniprogram.Page.Instance<{}, {}> & {
    getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
  }
  pageWithTabBar.getTabBar?.()?.setData({ selected })
}
