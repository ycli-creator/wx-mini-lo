const fs = require('node:fs')
const automator = require('../diary/devtools/node_modules/miniprogram-automator')
;(async()=>{
  const original=JSON.parse(fs.readFileSync(__dirname+'/original-local-state.json','utf8'))
  if(!original.exact)throw Error('Exact backup required')
  const mini=await automator.connect({wsEndpoint:'ws://127.0.0.1:9423'})
  const result=await mini.evaluate(value=>{
    wx.setStorageSync('love-points-miniprogram-v1',value)
    delete globalThis.__LOVE_POINTS_FORCE_LOCAL__
    const restored=JSON.stringify(wx.getStorageSync('love-points-miniprogram-v1'))===JSON.stringify(value)
    const cloudMode=globalThis.__LOVE_POINTS_FORCE_LOCAL__!==true
    setTimeout(()=>wx.reLaunch({url:'/pages/home/index'}),50)
    return {restored,cloudMode}
  },original.value)
  console.log(JSON.stringify(result))
  if(!result.restored || !result.cloudMode)throw Error('Restore verification failed')
  await mini.disconnect()
})().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})
