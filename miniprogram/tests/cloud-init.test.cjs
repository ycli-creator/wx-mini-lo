const assert = require('node:assert/strict')
const project = require('../../project.config.json')
let definition
const calls = []
Object.assign(globalThis, {
  App: value => { definition = value },
  wx: { cloud: { init: config => calls.push(config) } },
})
const { CLOUD_ENV_ID, WECHAT_APP_ID } = require('../config/env.ts')
require('../app.ts')
assert.equal(WECHAT_APP_ID, project.appid, '云开发所属 AppID 必须与项目配置一致')
globalThis.__LOVE_POINTS_FORCE_LOCAL__ = false
definition.onLaunch()
assert.deepEqual(calls, [{ appid: WECHAT_APP_ID, envid: CLOUD_ENV_ID, env: CLOUD_ENV_ID, traceUser: true }])
globalThis.__LOVE_POINTS_FORCE_LOCAL__ = true
definition.onLaunch()
assert.equal(calls.length, 1, '本机测试模式不初始化云开发')
globalThis.__LOVE_POINTS_FORCE_LOCAL__ = false
globalThis.wx = {}
definition.onLaunch()
assert.equal(calls.length, 1, '不支持云开发的运行时不调用初始化')
console.log('云初始化回归通过：AppID 一致性、原生与多端环境参数、本机模式、云能力检测')
