const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const auto = require('../diary/devtools/node_modules/miniprogram-automator')
const phase = process.argv[2]
if (!['before', 'after', 'motion', 'review', 'profile'].includes(phase)) throw Error('Use before, after, motion, review, or profile')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const stop = setTimeout(() => { console.error('capture timed out'); process.exit(2) }, phase === 'review' ? 150000 : 55000)
async function bounded(promise, action, ms = 5500) {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Error('Timed out while ' + action)), ms)
    })])
  } finally { clearTimeout(timer) }
}
async function visit(mini, url, expected = url.split('?')[0]) {
  await bounded(mini.evaluate(target => {
    const tabs = ['/pages/home/index', '/pages/task/index', '/pages/community/index', '/pages/profile/index']
    getApp().reviewNavError = ''
    setTimeout(() => {
      const options = { url: target, fail: error => { getApp().reviewNavError = error.errMsg } }
      if (tabs.includes(target)) wx.switchTab(options)
      else wx.redirectTo(options)
    }, 20)
    return true
  }, '/' + url), 'opening ' + url)
  await sleep(550)
  let lastPath = ''
  for (let i = 0; i < 12; i++) {
    await sleep(250)
    const current = await bounded(mini.currentPage(), 'reading route ' + url)
    lastPath = current?.path || ''
    if (current?.path !== expected) continue
    const state = await bounded(mini.evaluate(() => {
      const page = getCurrentPages().slice(-1)[0]
      return { loading: page?.data.loading, error: page?.data.loadError }
    }), 'reading data ' + url)
    if (!state.loading) {
      if (state.error) throw Error('Load error on ' + url)
      return
    }
  }
  const details = await bounded(mini.evaluate(() => {
    const p = getCurrentPages().slice(-1)[0]
    const stored = wx.getStorageSync('lp-ui-trial-synthetic-state-v1')
    return {route:p?.route, loading:p?.data.loading, bound:stored?.bound, error:getApp().reviewNavError || ''}
  }), 'checking the route result')
  throw Error('Route did not settle: ' + url + ' -> ' + lastPath + ' ' + JSON.stringify(details))
}
async function review(mini) {
  const key = 'lp-ui-trial-synthetic-state-v1'
  console.log('Reading isolated fixture')
  const sample = await bounded(mini.evaluate(key => {
    const saved = wx.getStorageSync(key)
    if (saved?.profile?.nickname !== '小满' || !saved.tasks.some(task=>task.id==='preview_task_0')) return null
    if (typeof getApp().onLaunch === 'function') getApp().onLaunch()
    return wx.getStorageSync(key)
  }, key), 'reading the sample')
  if (sample?.profile?.nickname !== '小满' || !sample.tasks.some(task => task.id.startsWith('preview_task'))) throw Error('Expected sample project')
  const firstTask = encodeURIComponent(sample.tasks[0].id)
  const reward = encodeURIComponent(sample.rewards[0].id)
  try {
    console.log('Checking refund')
    await visit(mini,'pages/reward/detail?id=' + reward)
    console.log('Opened reward detail')
    await bounded(mini.evaluate(() => { void getCurrentPages().slice(-1)[0].redeem(); return true }), 'redeeming the sample wish')
    await sleep(850)
    await visit(mini,'pages/reward/redemption?id=' + reward)
    console.log('Requesting and declining refund')
    await bounded(mini.evaluate(() => { void getCurrentPages().slice(-1)[0].requestRefund(); return true }), 'requesting the refund')
    await sleep(350)
    await bounded(mini.evaluate(() => { void getCurrentPages().slice(-1)[0].rejectRefund(); return true }), 'rejecting the refund')
    await sleep(350)
    await visit(mini,'pages/reward/redemption?id=' + reward)
    const refund = await bounded(mini.evaluate(() => getCurrentPages().slice(-1)[0]?.data.redemption?.refundStatus || 'missing'), 'checking saved refund status')
    if (refund !== 'rejected') throw Error('Rejected refund not persisted')
    console.log('Confirmed persisted refund result')
    if (process.argv.includes('--capture-fixes')) {
      await sleep(1700)
      await bounded(mini.screenshot({path:path.join(__dirname,'refund-rejected.png')}), 'capturing the refund page').catch(error=>console.log(error.message))
    }
    console.log('Checking privacy')
    await visit(mini,'pages/settings/index')
    await bounded(mini.evaluate(() => {
      void getCurrentPages().slice(-1)[0].changePrivacy({currentTarget:{dataset:{key:'privateMode'}},detail:{value:true}})
      return true
    }), 'turning on privacy')
    await sleep(350)
    const privacy = await bounded(mini.evaluate(() => getCurrentPages().slice(-1)[0].data.state.profile.privacy), 'checking privacy')
    if (!privacy.privateMode || Object.entries(privacy).some(([key, value])=>key !== 'privateMode' && value)) throw Error('Privacy not applied')
    console.log('Confirmed master privacy setting and all child settings')
    if (process.argv.includes('--capture-fixes')) await bounded(mini.screenshot({path:path.join(__dirname,'privacy-on.png')}), 'capturing privacy').catch(error=>console.log(error.message))
    await bounded(mini.evaluate(key => {
      const state = wx.getStorageSync(key)
      wx.setStorageSync(key, { ...state, bound: false, activeSpaceType: 'personal' })
      return true
    }, key), 'preparing the single-person invitation flow')
    const routes = require('../../miniprogram/app.json').pages
    const params = {
      'pages/task/detail':'?id='+firstTask, 'pages/task/submit':'?id='+firstTask, 'pages/task/review':'?id='+firstTask,
      'pages/reward/detail':'?id='+reward, 'pages/reward/redemption':'?id='+reward,
      'pages/diary/edit':'?id=preview_diary_0', 'pages/documents/edit':'?new=1&groupId='+encodeURIComponent(sample.documentGroups[0].id),
    }
    const redirects = {'pages/task/submit':'pages/task/detail'}
    for (const route of routes) {
      if (route === 'pages/home/index') {
        await visit(mini, 'pages/legal/index')
        await bounded(mini.evaluate(key => {
          const state = wx.getStorageSync(key)
          wx.setStorageSync(key, { ...state, bound: true, activeSpaceType: 'couple', unbindRequested: true, unbindCanReview: true })
          return true
        }, key), 'preparing the couple and pending request')
      }
      await visit(mini,route + (params[route] || ''), redirects[route] || route)
      console.log('Verified',route)
    }
    console.log('Verified routes:',routes.length)
  } catch (error) { console.error('Native review:', error.message); throw error } finally {
    console.log('Restoring sample')
    await bounded(mini.evaluate((key,state) => {wx.setStorageSync(key,state);return true}, key,sample), 'restoring the sample')
    await visit(mini,'pages/home/index')
  }
}
async function recordCompletion(mini) {
  const page = await mini.currentPage()
  if (page.path !== 'pages/task/index') throw Error('Open the task list first')
  const name = await mini.evaluate(() => getCurrentPages().slice(-1)[0].data.state.profile.nickname)
  if (name !== '小满') throw Error('Expected the isolated sample')
  const button = await Promise.race([page.$('.task-check'), sleep(2800).then(() => null)])
  const files = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-simulator-'))
  const times = []
  const start = Date.now()
  let tapped = false
  while (Date.now() - start < 2800) {
    if (!tapped && Date.now() - start > 650) {
      tapped = true
      if (button) {
        console.log('Tap native WXML button')
        void button.tap().catch(console.error)
      } else {
        console.log('Dispatch the task check handler in the simulator')
        await mini.evaluate(() => {
          const page = getCurrentPages().slice(-1)[0]
          const target = page.data.tasks.find(row => row.canComplete && row.completionRequirement === 'direct' && row.planType === 'daily')
          if (!target) throw Error('Expected a daily task')
          setTimeout(() => page.checkTask({ currentTarget: { dataset: { id: target.id } } }), 70)
          return target.title
        })
      }
    }
    const data = await mini.screenshot()
    times.push(Date.now())
    fs.writeFileSync(path.join(files, String(times.length).padStart(3, '0') + '.png'), Buffer.from(data,'base64'))
    await sleep(22)
  }
  const result = await mini.evaluate(() => {
    const page = getCurrentPages().slice(-1)[0]
    return { count: page.data.todayCompleted, total: page.data.todayTotal, points: page.data.state.sharedPoints }
  })
  if (result.count !== 2 || result.total !== 3 || result.points !== 600) throw Error('Completion did not settle: ' + JSON.stringify(result))
  const durations = times.map((time,i) => i + 1 < times.length ? times[i+1] - time : 900)
  const runtime = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe')
  const encode = "from pathlib import Path\nfrom PIL import Image\nimport sys,json\nframes=[Image.open(p).convert('RGB') for p in sorted(Path(sys.argv[1]).glob('*.png'))]\nframes[0].save(sys.argv[2],save_all=True,append_images=frames[1:],duration=json.loads(sys.argv[3]),loop=0,optimize=True)"
  execFileSync(runtime,['-c',encode,files,path.join(__dirname,'task-completion.gif'),JSON.stringify(durations)])
  console.log('Recorded', times.length, 'frames;', result)
  for (const file of fs.readdirSync(files)) fs.unlinkSync(path.join(files, file))
  fs.rmdirSync(files)
}
async function capture() {
  const portArg = process.argv.find(arg => /^--port=\d+$/.test(arg))
  const port = portArg ? Number(portArg.slice(7)) : 9436
  const mini = await auto.connect({ wsEndpoint: 'ws://127.0.0.1:' + port })
  console.log('Connected to DevTools')
  try {
    const isolated = await bounded(mini.evaluate(() => {
      const sample = wx.getStorageSync('lp-ui-trial-synthetic-state-v1')
      return sample?.profile?.nickname === '小满' && sample.tasks.some(task => task.id === 'preview_task_0')
    }), 'identifying the preview project')
    if (!isolated) throw Error('Open the isolated Love Points preview project')
    if (phase === 'profile') {
      await bounded(mini.mockWxMethod('showToast', function (options) { getApp().reviewToast = options.title; return {errMsg:'showToast:ok'} }), 'capturing the profile error')
      try {
        await visit(mini, 'pages/profile/index').catch(error=>console.log(error.message))
        const summary = await bounded(mini.evaluate(() => {
          const p=getCurrentPages().slice(-1)[0]
          return {path:p.route,error:p.data.loadError,latest:getApp().reviewToast||'',count:p.data.achievements?.length,flatMap:typeof [].flatMap}
        }), 'checking the profile')
        console.log('Profile',summary)
        if(summary.error) throw Error(summary.latest || 'Profile did not load')
      } finally {
        await bounded(mini.restoreWxMethod('showToast'), 'restoring toasts')
        await visit(mini,'pages/home/index')
      }
      return
    }
    if (phase === 'review') { await review(mini); return }
    for (const [key, route, selector] of [['home','home','.memory-banner'],['tasks','task','.task-sections'],['diary','diary','.feed-card']]) {
      if (phase === 'motion' && key !== 'tasks') continue
      const target = '/pages/' + route + '/index'
      let page = await mini.currentPage()
      console.log('Current route', page?.path, 'target', target)
      if (page?.path !== target.slice(1)) {
        await mini.evaluate(url => { setTimeout(() => wx.reLaunch({ url }), 0); return true }, target)
        for (let i = 0; i < 20; i++) {
          await new Promise(resolve => setTimeout(resolve, 200))
          page = await mini.currentPage()
          if (page?.path === target.slice(1)) break
        }
      }
      if (page?.path !== target.slice(1)) throw Error('Wrong preview route')
      await new Promise(resolve => setTimeout(resolve, 800))
      const state = await mini.evaluate(() => {
        const stack = getCurrentPages()
        const page = stack[stack.length - 1]
        return { loaded: !page.data.loading && !page.data.loadError, newTask: typeof page.checkTask === 'function', count: page.data.visible?.length ?? page.data.tasks?.length, name: page.data.state?.profile?.nickname }
      })
      if (!state.loaded || (key === 'tasks' && phase === 'after' && !state.newTask)) throw Error('Preview build not ready: ' + JSON.stringify(state))
      if (phase === 'motion') {
        const backup = await mini.callWxMethod('getStorageSync', 'lp-ui-trial-synthetic-state-v1')
        if (backup.profile?.nickname !== '小满' || backup.sharedPoints !== 480) throw Error('Expected the original sample balance')
        try { await recordCompletion(mini) }
        finally {
          await mini.callWxMethod('setStorageSync', 'lp-ui-trial-synthetic-state-v1', backup)
          await mini.evaluate(() => { setTimeout(() => wx.switchTab({url:'/pages/home/index'}), 20); return true })
        }
        return
      }
      console.log('Capturing', key, selector, state.count)
      await mini.screenshot({ path: path.join(__dirname, phase + '-' + key + '.png') })
      console.log('Saved', key, page.path)
    }
  } finally { await bounded(mini.disconnect(), 'disconnecting the preview', 2000) }
}
capture().then(() => {clearTimeout(stop);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})
