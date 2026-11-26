export const MAIN_TABS = [
  { pagePath: '/pages/home/index', text: '首页', icon: 'home' },
  { pagePath: '/pages/task/index', text: '待办', icon: 'task' },
  { pagePath: '/pages/community/index', text: '日常', icon: 'image' },
  { pagePath: '/pages/profile/index', text: '我的', icon: 'profile' },
]

export const openPage = (url: string, replace = false) => {
  if (MAIN_TABS.some(tab => tab.pagePath === url.split('?')[0])) wx.switchTab({ url })
  else if (replace) wx.redirectTo({ url })
  else wx.navigateTo({ url })
}
