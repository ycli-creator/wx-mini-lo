import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'))
const errors = []

if (appConfig.pages.length !== 31) {
  errors.push(`应有 31 个页面，当前为 ${appConfig.pages.length} 个`)
}

for (const page of appConfig.pages) {
  for (const extension of ['ts', 'wxml', 'json']) {
    const file = path.join(root, `${page}.${extension}`)
    if (!fs.existsSync(file)) errors.push(`缺少页面文件：${page}.${extension}`)
  }
}

const tabPages = appConfig.tabBar?.list?.map((item) => item.pagePath) || []
if (tabPages.length !== 5) errors.push(`应有 5 个主 Tab，当前为 ${tabPages.length} 个`)
for (const page of tabPages) {
  if (!appConfig.pages.includes(page)) errors.push(`Tab 页面未注册：${page}`)
}

const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'miniprogram_npm') continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(absolute)
    if (entry.isFile() && entry.name.endsWith('.wxml')) {
      const source = fs.readFileSync(absolute, 'utf8')
      if (/\{\{[^}]*\.(?:trim|slice|map|filter)\s*\(/.test(source)) {
        errors.push(`WXML 中包含不支持的方法调用：${path.relative(root, absolute)}`)
      }
    }
  }
}

walk(root)

const requiredActions = [
  'home.summary', 'invite.create', 'invite.apply', 'invite.review', 'invite.pending', 'invite.status',
  'task.create', 'task.submit', 'task.review', 'task.project.step.complete', 'task.project.complete', 'reward.create', 'reward.redeem', 'reward.redeem.review',
  'reward.refund.request', 'reward.refund.review', 'documents.groups.create', 'documents.detail', 'documents.save',
  'documents.lock', 'documents.unlock',
  'unbind.request', 'unbind.cancel', 'unbind.review',
  'profile.update', 'profile.privacy.update', 'profile.preferences.update', 'space.switch',
  'community.list', 'community.create', 'community.review',
  'records.list', 'records.save', 'records.delete',
  'heat.summary', 'heat.checkin',
  'chat.list', 'chat.unread', 'chat.send', 'chat.cue', 'chat.open',
  'share.create', 'share.resolve',
  'notifications.list', 'notifications.read',
  'friends.search', 'friends.request', 'friends.list', 'friends.review',
  'relationship.list', 'relationship.request', 'relationship.review', 'relationship.public.revoke',
  'achievements.list',
]
const serviceSource = fs.readFileSync(path.join(root, 'services/love-points.ts'), 'utf8')
for (const action of requiredActions) {
  if (!serviceSource.includes(`'${action}'`)) errors.push(`服务层缺少 Action：${action}`)
}

if (errors.length) {
  console.error(errors.map((message) => `- ${message}`).join('\n'))
  process.exit(1)
}

console.log(`结构检查通过：${appConfig.pages.length} 个页面、${tabPages.length} 个主 Tab、${requiredActions.length} 个业务 Action。`)
