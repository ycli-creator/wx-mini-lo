// Shared with miniprogram/utils/health-domain.js; scripts/sync-health-domain.cjs checks parity.
const DAY_MS = 86400000
const MOODS = ['超开心', '开心', '还行', '不开心', '伤心']
const HABITS = ['吃早饭', '吃水果', '多喝水', '运动', '排便']
const METHODS = ['无措施', '避孕套', '避孕药', '其他措施']
const FLOW_LABELS = ['很少', '较少', '适中', '较多', '很多']
const PAIN_LABELS = ['基本无痛感', '轻微间歇痛', '中度间歇痛', '重度持续痛', '剧烈痛']
const MOOD_VALUES = ['超开心', '开心', '平静', '生气', '伤心']
const moodIndex = (value) => {
  if (!value) return -1
  if (['超开心', '得意', '调皮', '惊讶'].includes(value)) return 0
  if (['开心', '暖心'].includes(value)) return 1
  if (['生气', '不开心', '着急', '鄙视', '愤怒', '烦躁', '闹心'].includes(value)) return 3
  if (['伤心', '疼痛', '郁闷'].includes(value)) return 4
  return 2
}
// The daily selection is shared by diary and health views; changing it replaces
// its one observation without discarding separately accumulated mood records.
const setDayMood = (source, value) => {
  const day = JSON.parse(JSON.stringify(source))
  if (day.moodValue === value) return day
  const previous = moodIndex(day.moodValue)
  const next = moodIndex(value)
  if (previous >= 0) day.moods[previous] = Math.max(0, day.moods[previous] - 1)
  if (next >= 0) day.moods[next] = Math.min(99, day.moods[next] + 1)
  day.moodValue = value
  return day
}
const clone = (value) => JSON.parse(JSON.stringify(value))
const fail = (message) => { throw new Error(message) }
const dateNumber = (value) => Date.parse(`${value}T00:00:00Z`)
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(dateNumber(value)) && new Date(dateNumber(value)).toISOString().slice(0, 10) === value
  && value >= '1970-01-01' && value <= '2100-12-31'
const todayKey = (at = Date.now()) => new Date(at + 8 * 3600000).toISOString().slice(0, 10)
const timeKey = (at = Date.now()) => new Date(at + 8 * 3600000).toISOString().slice(11, 16)
const addDays = (date, days) => new Date(dateNumber(date) + days * DAY_MS).toISOString().slice(0, 10)
const diffDays = (from, to) => Math.round((dateNumber(to) - dateNumber(from)) / DAY_MS)
const emptyProfile = () => ({ version: 0, settings: { cycleLength: 30, periodLength: 5 }, cycles: [], recentOperations: [] })
const emptyDay = (date) => ({ date, flow: null, pain: null, moods: [0, 0, 0, 0, 0], habits: [false, false, false, false, false], intimacy: [] })
const cycleEnd = (cycle, settings) => cycle.end || addDays(cycle.start, settings.periodLength - 1)
const cycleAt = (profile, date) => profile.cycles.find((cycle) => date >= cycle.start && date <= cycleEnd(cycle, profile.settings)) || null
const hasDailyData = (day) => day.flow !== null || day.pain !== null || day.moods.some(Boolean) || day.habits.some(Boolean) || day.intimacy.length > 0
const validateRange = (start, end) => {
  if (!validDate(start) || !validDate(end) || end < start || diffDays(start, end) > 62) fail('请选择不超过 63 天的有效日期范围')
}
const validateCycles = (cycles, settings, today) => {
  const sorted = [...cycles].sort((a, b) => a.start.localeCompare(b.start))
  sorted.forEach((cycle, index) => {
    if (!validDate(cycle.start) || cycle.start > today) fail('经期开始日期不能晚于今天')
    if (cycle.end !== null && (!validDate(cycle.end) || cycle.end < cycle.start || cycle.end > today)) fail('结束日期应在开始日期与今天之间')
    if (diffDays(cycle.start, cycleEnd(cycle, settings)) >= settings.cycleLength) fail('经期长度应小于或等于周期长度，请检查起止日期或周期设置')
    if (index > 0 && cycle.start <= cycleEnd(sorted[index - 1], settings)) fail('这段经期与已有记录重叠，请先修改已有记录')
    if (cycle.end === null && index !== sorted.length - 1) fail('历史经期请填写结束日期；未确认结束的记录只能保留在最近一段')
  })
  return sorted
}

// Input operations describe user intent; no caller-supplied ownership or whole-document replacement.
const applyChange = (sourceProfile, sourceDay, input, today = todayKey()) => {
  const profile = clone(sourceProfile)
  const day = clone(sourceDay)
  if (typeof input.operationId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(input.operationId)) fail('操作标识无效，请刷新后重试')
  if (profile.recentOperations.includes(input.operationId)) return { profile, day, duplicate: true, dayChanged: false }
  if (!Number.isInteger(input.version) || input.version !== profile.version) fail('记录已在其他页面或设备更新，请刷新后重试')
  if (!validDate(input.date) || input.date > today) fail('只能记录今天或过去的日期')
  let dayChanged = false
  switch (input.kind) {
    case 'settings': {
      const { cycleLength, periodLength } = input
      if (!Number.isInteger(cycleLength) || cycleLength < 15 || cycleLength > 100) fail('周期长度应为 15～100 天')
      if (!Number.isInteger(periodLength) || periodLength < 2 || periodLength > 14) fail('经期长度应为 2～14 天')
      profile.settings = { cycleLength, periodLength }
      profile.cycles = validateCycles(profile.cycles, profile.settings, today)
      break
    }
    case 'cycle.save': {
      const existing = input.id ? profile.cycles.find((item) => item.id === input.id) : null
      if (input.id && !existing) fail('经期记录不存在，请刷新')
      const cycle = { id: existing ? existing.id : `cycle_${input.operationId}`, start: input.start, end: input.end === '' || input.end == null ? null : input.end }
      profile.cycles = validateCycles([...profile.cycles.filter((item) => item.id !== cycle.id), cycle], profile.settings, today)
      break
    }
    case 'cycle.delete':
      if (!profile.cycles.some((item) => item.id === input.id)) fail('经期记录不存在，请刷新')
      profile.cycles = profile.cycles.filter((item) => item.id !== input.id)
      break
    case 'flow':
    case 'pain': {
      if (input.value !== null && (!Number.isInteger(input.value) || input.value < 1 || input.value > 5)) fail('请选择 1～5 档或取消记录')
      if (input.value !== null && !cycleAt(profile, input.date)) fail('请先记录这一天所属的经期')
      day[input.kind] = input.value
      dayChanged = true
      break
    }
    case 'mood':
      if (!Number.isInteger(input.index) || input.index < 0 || input.index > 4 || ![1, -1].includes(input.delta)) fail('心情操作无效')
      if (day.moods[input.index] + input.delta > 99) fail('这项心情当天已记录 99 次')
      day.moods[input.index] = Math.max(0, day.moods[input.index] + input.delta)
      if (input.delta > 0) day.moodValue = MOOD_VALUES[input.index]
      else if (moodIndex(day.moodValue) === input.index && !day.moods[input.index]) {
        const remaining = day.moods.findIndex(Boolean)
        day.moodValue = remaining < 0 ? '' : MOOD_VALUES[remaining]
      }
      dayChanged = true
      break
    case 'habit':
      if (!Number.isInteger(input.index) || input.index < 0 || input.index > 4 || typeof input.checked !== 'boolean') fail('习惯选项无效')
      day.habits[input.index] = input.checked
      dayChanged = true
      break
    case 'intimacy.save': {
      if (typeof input.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) fail('请选择有效的小时和分钟')
      if (!Number.isInteger(input.method) || input.method < 0 || input.method > 3) fail('请选择措施')
      const existing = input.id ? day.intimacy.find((item) => item.id === input.id) : null
      if (input.id && !existing) fail('亲密记录不存在，请刷新')
      if (!existing && day.intimacy.length >= 20) fail('这一天最多记录 20 次')
      const event = { id: existing ? existing.id : `love_${input.operationId}`, time: input.time, method: input.method }
      day.intimacy = [...day.intimacy.filter((item) => item.id !== event.id), event]
        .sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id))
      dayChanged = true
      break
    }
    case 'intimacy.delete':
      if (!day.intimacy.some((item) => item.id === input.id)) fail('亲密记录不存在，请刷新')
      day.intimacy = day.intimacy.filter((item) => item.id !== input.id)
      dayChanged = true
      break
    default: fail('不支持的健康记录操作')
  }
  profile.version += 1
  profile.recentOperations = [...profile.recentOperations, input.operationId].slice(-40)
  return { profile, day, duplicate: false, dayChanged }
}

const predictionFor = (profile, date, today = todayKey()) => {
  const { cycleLength: length, periodLength: duration } = profile.settings
  const actual = cycleAt(profile, date)
  if (actual && date <= today) return { kind: 'actual', label: '经期', cycleId: actual.id }
  if (actual && !actual.end && date > today) return { kind: 'predicted', label: '预计经期', cycleId: actual.id }
  const prior = [...profile.cycles].reverse().find((cycle) => cycle.start <= date)
  if (!prior) return { kind: 'none', label: '', cycleId: '' }
  const nextActual = profile.cycles.find((cycle) => cycle.start > date)
  let nextStart
  if (nextActual) nextStart = nextActual.start
  else {
    // Do not silently shift an overdue cycle to today or invent historical periods.
    const elapsed = diffDays(prior.start, date)
    const number = Math.max(1, Math.floor(elapsed / length))
    const start = addDays(prior.start, number * length)
    if (date > today && date >= start && date <= addDays(start, duration - 1)) return { kind: 'predicted', label: '预计经期', cycleId: '' }
    nextStart = addDays(prior.start, (Math.floor(elapsed / length) + 1) * length)
  }
  const ovulation = addDays(nextStart, -14)
  if (date === ovulation) return { kind: 'ovulation', label: '预计排卵', cycleId: '' }
  if (date >= addDays(ovulation, -5) && date <= addDays(ovulation, 4)) return { kind: 'fertile', label: '预计易孕', cycleId: '' }
  return { kind: 'none', label: '', cycleId: '' }
}
const summaryFor = (profile, today = todayKey()) => {
  const current = cycleAt(profile, today)
  if (current) return `经期第 ${diffDays(current.start, today) + 1} 天${current.end ? '' : ' · 结束待确认'}`
  const latest = profile.cycles[profile.cycles.length - 1]
  if (!latest) return '记录一次经期，开始了解自己的周期'
  if (!latest.end) return '上次经期尚未确认结束，记得补充日期'
  const next = addDays(latest.start, profile.settings.cycleLength)
  const remaining = diffDays(today, next)
  return remaining > 0 ? `预计 ${remaining} 天后经期开始` : remaining === 0 ? '预计今天经期开始' : `已超过预计日期 ${-remaining} 天，可补记或调整周期`
}
const statisticsFor = (state, year) => {
  const moodCounts = [0, 0, 0, 0, 0]
  const habitDates = []
  for (const day of state.days) {
    day.moods.forEach((count, index) => { moodCounts[index] += count })
    if (day.habits.some(Boolean)) habitDates.push(day.date)
  }
  habitDates.sort()
  return { profile: state.profile, days: state.days.filter((day) => day.date.startsWith(`${year}-`)),
    moodCounts, totalMoodCount: moodCounts.reduce((sum, count) => sum + count, 0),
    totalHabitDays: habitDates.length, firstHabitDate: habitDates[0] || '' }
}
module.exports = { MOODS, MOOD_VALUES, moodIndex, setDayMood, statisticsFor, HABITS, METHODS, FLOW_LABELS, PAIN_LABELS, validDate, todayKey, timeKey, addDays, diffDays, emptyProfile, emptyDay, cycleEnd, cycleAt, hasDailyData, validateRange, applyChange, predictionFor, summaryFor }
