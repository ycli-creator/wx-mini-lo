import { readFile } from 'node:fs/promises'

const projectConfig = JSON.parse(await readFile(new URL('../project.config.json', import.meta.url), 'utf8'))
const envSource = await readFile(new URL('../miniprogram/config/env.ts', import.meta.url), 'utf8')
const envMatch = envSource.match(/CLOUD_ENV_ID\s*=\s*['"]([^'"]*)['"]/)

const failures = []

if (!projectConfig.appid || projectConfig.appid === 'touristappid') {
  failures.push('project.config.json 仍在使用 touristappid，请替换为你的小程序 AppID')
}

if (!envMatch?.[1]?.trim()) {
  failures.push('miniprogram/config/env.ts 中的 CLOUD_ENV_ID 仍为空')
}

if (failures.length) {
  console.error('部署配置尚未完成：')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exitCode = 1
} else {
  console.log(`部署配置检查通过：AppID ${projectConfig.appid}，CloudBase 环境 ${envMatch[1]}`)
}
