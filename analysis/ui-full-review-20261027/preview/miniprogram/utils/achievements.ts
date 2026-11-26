import type { AchievementItem, LovePointsState } from '../types/index'

const DAY = 24 * 60 * 60 * 1000

export const relationshipDays = (startedAt: string) => {
  const started = startedAt ? new Date(startedAt).getTime() : 0
  if (!started || Number.isNaN(started)) return 0
  return Math.max(1, Math.floor((Date.now() - started) / DAY) + 1)
}

export const buildAchievements = (state: LovePointsState): AchievementItem[] => {
  const days = relationshipDays(state.relationshipStartedAt)
  const completedTasks = state.tasks.filter((item) => item.status === 'done').length
  const groups = [
    { category: 'relationship' as const, prefix: '相伴', value: days, targets: [1, 7, 30, 100, 365, 520, 999] },
    { category: 'task' as const, prefix: '并肩', value: completedTasks, targets: [10, 30, 100, 999] },
    { category: 'heat' as const, prefix: '升温', value: state.heat.totalHeat, targets: [10, 30, 100, 999] },
  ]
  return groups.flatMap((group) => group.targets.map((target, index) => ({
    id: `${group.category}-${target}`,
    title: `${group.prefix} ${target}`,
    description: group.category === 'relationship' ? `相伴满 ${target} 天` : group.category === 'task' ? `共同完成 ${target} 个任务` : `情侣热力达到 ${target}`,
    category: group.category,
    target,
    progress: Math.min(group.value, target),
    unlocked: group.value >= target,
    badge: `${group.category.slice(0, 1).toUpperCase()}${String(index + 1).padStart(2, '0')}`,
  })))
}
