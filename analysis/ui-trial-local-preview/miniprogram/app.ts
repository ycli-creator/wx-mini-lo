import { createInitialState, getTaskCycleMeta } from './store/state'
import { diaryToday } from './utils/diary-views'

App({
  onLaunch() {
    const state = createInitialState()
    state.profile.nickname = '小满'
    state.partnerProfile.nickname = '阿禾'
    state.profile.completed = true
    state.profileComplete = true
    state.preferences.onboardingCompleted = true
    state.bound = true
    state.activeSpaceType = 'couple'
    state.availableSpaces = ['personal', 'couple']
    state.relationshipStartedAt = new Date(Date.now() - 92 * 86400000).toISOString()
    state.sharedPoints = 480
    state.tasks = [
      ...['午休后走十分钟', '今天喝够水', '选一张周末的照片'].map((title, index) => ({
        ...state.tasks[0], ...getTaskCycleMeta('daily'), id: 'preview_task_' + index, templateId: 'preview_task_' + index, title,
        kind: 'recurring' as const, planType: 'daily' as const, status: index === 2 ? 'done' as const : 'todo' as const,
        description: ['午饭后去楼下走一圈。', '记下今天喝了多少杯水。', '留一张这个周末的照片。'][index],
        completionRequirement: index === 1 ? 'note' as const : 'direct' as const, approvalRequired: false,
        pointsType: 'shared' as const, taskType: 'shared' as const,
        spaceType: 'couple' as const, assigneeIsSelf: true, reviewerIsSelf: false,
      })),
      ...state.tasks.slice(1),
    ]
    wx.setStorageSync('lp-ui-trial-synthetic-state-v1', state)
    const date = diaryToday()
    const previous = diaryToday(new Date(Date.now() - 86400000))
    wx.setStorageSync('lp-ui-trial-synthetic-diary-v1', [
      { date, time: '21:10', title: '晚饭后的十分钟', body: '绕着街区走了一圈。面包店快打烊了，橱窗里还亮着一盏灯。' },
      { date, time: '08:25', title: '晨间', body: '出门前泡了一杯茶，今天比想象中暖和。' },
      { date: previous, time: '19:40', title: '图书馆', body: '借到一本惦记了很久的散文集，回家坐在窗边读了几页。' },
    ].map((entry, index) => ({ ...entry, id: 'preview_diary_' + index, version: 1, tags: ['生活'], category: '随记', mood: '平静', weather: '', location: '', favorite: false, pinned: false, draft: false, deleted: false, titleVisible: true, createdAt: '', updatedAt: '' })))
  },
})
