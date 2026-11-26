import type { LovePointsState, Reward, RewardRedemption } from '../types/index'

export type RewardFilter = 'all' | 'available' | 'purchased' | 'pending' | 'refund'
export type DisplayReward = Reward & {
  enough: boolean
  redeemed: boolean
  pointsLabel: string
  statusLabel: string
  statusClass: string
}

const labels = {
  available: { statusLabel: '可兑换', statusClass: 'status-todo' },
  insufficient: { statusLabel: '积分不足', statusClass: 'status-warning' },
  pending: { statusLabel: '待确认', statusClass: 'status-pending' },
  purchased: { statusLabel: '已兑换', statusClass: 'status-done' },
  refund: { statusLabel: '退款中', statusClass: 'status-pending' },
  rejected: { statusLabel: '退款未通过', statusClass: 'status-warning' },
}

function rewardStatus(redemption: RewardRedemption | undefined, enough: boolean): keyof typeof labels {
  if (!redemption) return enough ? 'available' : 'insufficient'
  if (redemption.status === 'pending') return 'pending'
  if (redemption.refundStatus === 'requested') return 'refund'
  if (redemption.refundStatus === 'rejected') return 'rejected'
  return 'purchased'
}

export function rewardsForFilter(state: LovePointsState, filter: RewardFilter): DisplayReward[] {
  const visible: DisplayReward[] = []
  for (const reward of state.rewards) {
    const shared = reward.pointsType === 'shared'
    const enough = (shared ? state.sharedPoints : state.personalPoints) >= reward.cost
    const redemption = state.redemptions.find(item => item.rewardId === reward.id && item.status !== 'refunded')
    const status = rewardStatus(redemption, enough)
    const matches = filter === 'all' || filter === status || (filter === 'purchased' && Boolean(redemption))
    if (matches) visible.push({ ...reward, enough, redeemed: Boolean(redemption), pointsLabel: shared ? '共同' : '个人', ...labels[status] })
  }
  return visible
}
