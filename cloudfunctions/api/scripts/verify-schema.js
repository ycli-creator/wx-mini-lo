const fs = require('node:fs')
const path = require('node:path')

const file = path.resolve(__dirname, '../../database-schema.json')
const schema = JSON.parse(fs.readFileSync(file, 'utf8'))
const functionConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../config.json'), 'utf8'))
const required = [
  'users', 'couples', 'invites', 'tasks', 'task_cycles', 'task_submissions', 'point_accounts',
  'point_ledgers', 'rewards', 'redemptions', 'document_groups', 'documents',
  'notifications', 'unbind_requests', 'operation_logs', 'community_posts', 'daily_records',
]
const names = new Set(schema.collections.map((collection) => collection.name))
const missing = required.filter((name) => !names.has(name))
if (missing.length) throw new Error(`数据库结构缺少集合：${missing.join(', ')}`)
if (names.size !== schema.collections.length) throw new Error('数据库结构包含重复集合名称')
for (const collection of schema.collections) {
  const indexNames = new Set()
  for (const index of collection.indexes || []) {
    if (!index.name || indexNames.has(index.name)) throw new Error(`${collection.name} 包含空或重复索引名称`)
    indexNames.add(index.name)
    if (!Array.isArray(index.fields) || !index.fields.length) throw new Error(`${collection.name}.${index.name} 缺少索引字段`)
    for (const field of index.fields) {
      if (!field.field || !['asc', 'desc'].includes(field.direction)) throw new Error(`${collection.name}.${index.name} 的字段或方向无效`)
    }
  }
}
if (schema.permissionMode !== 'ADMIN_ONLY' || !String(schema.permissionPolicy || '').toLowerCase().includes('deny direct')) {
  throw new Error('数据库结构必须声明禁止小程序客户端直接读写')
}
if (!Number.isInteger(functionConfig.timeout) || functionConfig.timeout < 10) {
  throw new Error('api 云函数超时时间至少应为 10 秒')
}
console.log(`数据库结构检查通过：${schema.collections.length} 个集合。`)
