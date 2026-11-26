const a = require('../diary/devtools/node_modules/miniprogram-automator')
;(async () => {
  let mini
  const timer = setTimeout(() => { console.error('Visual review timed out'); process.exit(2) }, 45000)
  try {
    mini = await a.connect({ wsEndpoint: 'ws://127.0.0.1:9421' })
    const errors = []
    mini.on('exception', error => errors.push(String(error.message || error)))
    await mini.reLaunch('/pages/home/index')
    let page = await mini.currentPage()
    await page.waitFor(1000)
    console.log('home', JSON.stringify({ path: page.path, loading: await page.data('loading'), error: await page.data('loadError') }))
    await mini.screenshot({ path: __dirname + '/home-today.png' })
    await page.callMethod('switchHomeTab', { currentTarget: { dataset: { tab: 'tools' } } })
    await page.waitFor(200)
    await mini.screenshot({ path: __dirname + '/home-tools.png' })
    await mini.switchTab('/pages/task/index')
    page = await mini.currentPage()
    await page.waitFor(500)
    await mini.screenshot({ path: __dirname + '/tasks.png' })
    await page.callMethod('toggleCreate')
    await page.waitFor(200)
    await mini.screenshot({ path: __dirname + '/task-create.png' })
    console.log('task', JSON.stringify({ loading: await page.data('loading'), createOpen: await page.data('createOpen') }))
    await mini.switchTab('/pages/profile/index')
    page = await mini.currentPage()
    await page.waitFor(500)
    await mini.screenshot({ path: __dirname + '/profile.png' })
    console.log('exceptions', JSON.stringify(errors))
  } finally {
    if (mini) await mini.disconnect()
    clearTimeout(timer)
  }
})().then(() => process.exit(0)).catch(error => { console.error(error.stack); process.exit(1) })
