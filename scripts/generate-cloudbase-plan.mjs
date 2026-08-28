import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const projectConfig = JSON.parse(await readFile(new URL('project.config.json', root), 'utf8'))
const schema = JSON.parse(await readFile(new URL('cloudfunctions/database-schema.json', root), 'utf8'))
const envSource = await readFile(new URL('miniprogram/config/env.ts', root), 'utf8')
const environmentId = envSource.match(/CLOUD_ENV_ID\s*=\s*['"]([^'"]*)['"]/)?.[1]?.trim()

if (!environmentId) {
  throw new Error('miniprogram/config/env.ts 中的 CLOUD_ENV_ID 为空；必须先通过 cloud_env_list 获取，禁止猜测')
}

const direction = (value) => value === 'desc' ? '-1' : '1'

const collections = schema.collections.map((collection) => ({
  name: collection.name,
  create: {
    action: 'createCollection',
    collectionName: collection.name,
  },
  indexes: (collection.indexes || []).length ? {
    action: 'updateCollection',
    collectionName: collection.name,
    updateOptions: {
      CreateIndexes: collection.indexes.map((index) => ({
        IndexName: index.name,
        MgoKeySchema: {
          MgoIndexKeys: index.fields.map((field) => ({
            Name: field.field,
            Direction: direction(field.direction),
          })),
          MgoIsUnique: Boolean(index.unique),
          MgoIsSparse: Boolean(index.sparse),
        },
      })),
    },
  } : null,
}))

const plan = {
  appid: projectConfig.appid,
  environmentId,
  permissionMode: `${schema.permissionMode}: 仅管理端可读写（小程序客户端无权限；云函数与控制台可读写）`,
  source: 'cloudfunctions/database-schema.json',
  collections,
}

process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
