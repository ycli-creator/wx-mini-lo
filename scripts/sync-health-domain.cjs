const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'cloudfunctions/api/lib/health-domain.js'), 'utf8')
const target = path.join(root, 'miniprogram/utils/health-domain.js')
if (process.argv.includes('--write')) fs.writeFileSync(target, source)
else if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== source) {
  throw new Error('健康记录共享规则不同步，请执行 node scripts/sync-health-domain.cjs --write')
}
console.log('健康记录本机与云端规则一致')
