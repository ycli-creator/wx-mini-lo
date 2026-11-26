const assert = require('node:assert/strict')
const test = require('node:test')
const d = require('../lib/health-domain')
test('health dates use Shanghai days and preserve leap-day boundaries', () => {
  assert.equal(d.todayKey(Date.parse('2024-02-28T16:00:00Z')), '2024-02-29')
  assert.equal(d.addDays('2024-02-28', 2), '2024-03-01')
  assert.equal(d.validDate('2023-02-29'), false)
  assert.equal(d.validDate('2024-02-29'), true)
})
test('cycle edits are explicit, allow one-day periods, reject overlap and preserve daily observations', () => {
  let profile = d.emptyProfile(), day = d.emptyDay('2024-02-29'), sequence = 0
  const change = (input) => {
    const result = d.applyChange(profile, day, { date: day.date, version: profile.version, operationId: `test_operation_${++sequence}`, ...input }, '2024-03-20')
    profile = result.profile; day = result.day
    return result
  }
  change({ kind: 'cycle.save', start: '2024-02-28', end: '2024-03-02' })
  change({ kind: 'flow', value: 5 }); change({ kind: 'pain', value: 1 })
  assert.throws(() => change({ kind: 'cycle.save', start: '2024-03-01', end: '2024-03-03' }), /重叠/)
  change({ kind: 'cycle.save', id: profile.cycles[0].id, start: '2024-02-29', end: '2024-02-29' })
  assert.equal(d.cycleAt(profile, day.date).end, '2024-02-29')
  change({ kind: 'cycle.delete', id: profile.cycles[0].id })
  assert.equal(day.flow, 5)
  assert.throws(() => change({ kind: 'flow', value: 3 }), /先记录/)
  change({ kind: 'flow', value: null })
  assert.equal(day.flow, null)
})
test('moods, habits, intimacy limits and duplicate/conflicting writes', () => {
  let profile = d.emptyProfile(), day = d.emptyDay('2024-02-29'), sequence = 0
  const change = (input) => {
    const result = d.applyChange(profile, day, { date: day.date, version: profile.version, operationId: `event_operation_${++sequence}`, ...input }, '2024-03-20')
    profile = result.profile; day = result.day
    return result
  }
  for (let index = 0; index < 99; index++) change({ kind: 'mood', index: 0, delta: 1 })
  assert.throws(() => change({ kind: 'mood', index: 0, delta: 1 }), /99/)
  change({ kind: 'mood', index: 1, delta: 1 })
  change({ kind: 'mood', index: 0, delta: -1 })
  assert.deepEqual(day.moods, [98, 1, 0, 0, 0])
  change({ kind: 'habit', index: 2, checked: true }); change({ kind: 'habit', index: 2, checked: false })
  assert.equal(day.habits[2], false)
  for (let index = 0; index < 20; index++) change({ kind: 'intimacy.save', time: '00:05', method: index % 4 })
  assert.throws(() => change({ kind: 'intimacy.save', time: '01:00', method: 0 }), /20/)
  const firstId = day.intimacy[0].id
  change({ kind: 'intimacy.save', id: firstId, time: '12:10', method: 3 })
  assert.equal(day.intimacy.length, 20)
  change({ kind: 'intimacy.delete', id: firstId })
  assert.equal(day.intimacy.length, 19)
  const version = profile.version
  const duplicate = change({ kind: 'mood', index: 0, delta: 1, version: 0, operationId: profile.recentOperations[profile.recentOperations.length - 1] })
  assert.equal(duplicate.duplicate, true)
  assert.equal(profile.version, version)
  assert.throws(() => change({ kind: 'mood', index: 0, delta: 1, version: 0 }), /刷新/)
  assert.throws(() => change({ kind: 'habit', index: 0, checked: true, date: '2024-03-21' }), /过去/)
})
test('manual prediction marks future estimates separately and does not fabricate missed historical periods', () => {
  const profile = { ...d.emptyProfile(), cycles: [{ id: 'c1', start: '2024-02-01', end: '2024-02-05' }] }
  assert.equal(d.predictionFor(profile, '2024-02-03', '2024-02-10').kind, 'actual')
  assert.equal(d.predictionFor(profile, '2024-03-02', '2024-02-10').kind, 'predicted')
  assert.equal(d.predictionFor(profile, '2024-02-17', '2024-02-10').kind, 'ovulation')
  assert.equal(d.predictionFor(profile, '2024-02-12', '2024-02-10').kind, 'fertile')
  assert.notEqual(d.predictionFor(profile, '2024-03-02', '2024-03-20').kind, 'actual')
  assert.match(d.summaryFor(profile, '2024-03-20'), /超过预计日期/)
})
