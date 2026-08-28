import { API_FUNCTION_NAME, isCloudEnabled } from '../config/env'
import type { ApiResult } from '../types/index'

const retryableReadActions = new Set([
  'auth.login', 'home.summary', 'points.summary', 'points.ledger',
  'invite.pending', 'invite.status', 'task.list', 'reward.list',
  'documents.list', 'documents.groups', 'documents.detail',
  'community.list', 'records.list',
])

const silentActions = new Set(['documents.lock', 'documents.unlock'])

export const runAction = async <T>(
  action: string,
  payload: Record<string, unknown>,
  localAction: () => T | Promise<T>,
): Promise<T> => {
  if (!isCloudEnabled()) return localAction()

  let loadingShown = false
  const loadingTimer = silentActions.has(action) ? undefined : setTimeout(() => {
    loadingShown = true
    wx.showLoading({ title: '正在同步', mask: true })
  }, 180)
  const invoke = () => wx.cloud.callFunction({ name: API_FUNCTION_NAME, data: { action, payload } })
  let response: Awaited<ReturnType<typeof wx.cloud.callFunction>>
  try {
    try {
      response = await invoke()
    } catch (error) {
      if (!retryableReadActions.has(action)) throw error
      response = await invoke()
    }
  } finally {
    if (loadingTimer !== undefined) clearTimeout(loadingTimer)
    if (loadingShown) wx.hideLoading()
  }
  const result = response.result as ApiResult<T>
  if (!result?.ok) throw new Error(result?.message || '请求失败，请稍后重试')
  return result.data
}
