const fs = require('node:fs')
const path = require('node:path')
const automator = require('../diary/devtools/node_modules/miniprogram-automator')
const { createInitialState } = require('../../miniprogram/store/state.ts')
const routes = require('../../miniprogram/app.json').pages
const stage = process.argv[2] || 'before'
const out = path.join(__dirname, stage)
fs.mkdirSync(out, { recursive: true })
const limit = (promise, ms = 12000) => Promise.race([promise, new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('operation timeout')), ms); timer.unref() })])
;(async () => {
  const mini = await limit(automator.connect({ wsEndpoint: 'ws://127.0.0.1:9423' }))
  const results = [], errors = []
  const backupFile = path.join(__dirname, 'original-local-state.json')
  const recovered = JSON.parse(fs.readFileSync(backupFile, 'utf8'))
  if (!recovered.exact) throw Error('Exact backup required')
  const backup = recovered.value
  await mini.evaluate(() => {
    const old = globalThis.__LOVE_POINTS_FORCE_LOCAL__
    globalThis.__LOVE_POINTS_FORCE_LOCAL__ = true
    return true
  })
  const navigate = async (url) => { await mini.evaluate((target) => { setTimeout(() => wx.reLaunch({url:target}), 30); return true }, url); await new Promise(resolve=>setTimeout(resolve,500)); }
  mini.on('exception', e => errors.push(String(e.message || e)))
  try {
    const proof = createInitialState()
    proof.profile.nickname = 'UI-REVIEW-LOCAL-ONLY'; proof.profile.completed = true; proof.profileComplete = true
    proof.preferences.onboardingCompleted = true
    await mini.callWxMethod('setStorageSync', 'love-points-miniprogram-v1', proof)
    await navigate('/pages/home/index')
    await new Promise(resolve => setTimeout(resolve, 500))
    const proofPage = await mini.currentPage()
    if ((await proofPage.data('state')).profile.nickname !== 'UI-REVIEW-LOCAL-ONLY') throw Error('Local-only mode not confirmed; refusing page mutations')
    console.log('Local-only mode verified; cloud operations disabled for this review')
    for (const route of routes) {
      const seed = createInitialState()
      seed.profile.nickname = '小满'; seed.profile.completed = true; seed.profileComplete = true
      seed.partnerProfile.nickname = '阿禾'; seed.preferences.onboardingCompleted = true
      seed.preferences.communityGuideSeen = true
      seed.bound = true; seed.activeSpaceType = 'couple'; seed.availableSpaces = ['personal', 'couple']
      if (route.includes('/start/') || route.includes('/invite/')) { seed.bound = false; seed.activeSpaceType = 'personal' }
      if (route.includes('/unbind/')) { seed.unbindRequested = true; seed.unbindCanReview = true }
      await limit(mini.callWxMethod('setStorageSync', 'love-points-miniprogram-v1', seed))
      let url = '/' + route
      if (route.includes('/task/') && !route.endsWith('/index')) url += '?id=' + encodeURIComponent(seed.tasks[0].id)
      if (route === 'pages/reward/detail' || route === 'pages/reward/redemption') url += '?id=' + seed.rewards[0].id
      if (route === 'pages/reward/redemption') {
        seed.redemptions = [{rewardId:seed.rewards[0].id,status:'pending',canReview:true,refundStatus:'none',refundCanReview:false,requesterIsSelf:false}]
        await limit(mini.callWxMethod('setStorageSync', 'love-points-miniprogram-v1', seed))
      }
      if (route === 'pages/documents/edit') url += '?new=1&groupId=' + seed.documentGroups[0].id
      try {
        await navigate(url)
        await new Promise(resolve => setTimeout(resolve, 300))
        const page = await limit(mini.currentPage())
        if (!page) throw Error('No page')
        const data = await limit(page.data())
        const file = route.replaceAll('/', '-') + '.png'
        await limit(mini.screenshot({path:path.join(out, file)}))
        const row = {route,actual:page.path,loading:data.loading,loadError:data.loadError,file}
        results.push(row); console.log(JSON.stringify(row))
      } catch (e) { results.push({route,error:e.message}); console.log(route,e.message) }
      fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,errors},null,2))
    }
  } finally {
    await mini.callWxMethod('setStorageSync', 'love-points-miniprogram-v1', backup)
    await mini.evaluate(() => { delete globalThis.__LOVE_POINTS_FORCE_LOCAL__; return true })
    await navigate('/pages/home/index')
    await mini.disconnect()
  }
})().then(()=>process.exit(0)).catch(e => {console.error(e.stack);process.exit(1)})
