import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const collectionName = process.argv[2]?.trim()

if (!collectionName) {
  console.error('用法：npm run deploy:indexes -- <collectionName>')
  process.exit(1)
}

const projectConfig = JSON.parse(await readFile(new URL('project.config.json', root), 'utf8'))
const schema = JSON.parse(await readFile(new URL('cloudfunctions/database-schema.json', root), 'utf8'))
const envSource = await readFile(new URL('miniprogram/config/env.ts', root), 'utf8')
const environmentId = envSource.match(/CLOUD_ENV_ID\s*=\s*['"]([^'"]*)['"]/)?.[1]?.trim()
const collection = schema.collections.find((item) => item.name === collectionName)

if (!environmentId) {
  console.error('CLOUD_ENV_ID 为空；必须先通过 cloud_env_list 获取，禁止猜测')
  process.exit(1)
}

if (!collection) {
  console.error(`数据库结构中不存在集合：${collectionName}`)
  process.exit(1)
}

if (!collection.indexes?.length) {
  console.error(`集合 ${collectionName} 没有需要部署的自定义索引`)
  process.exit(1)
}

const updateOptions = {
  CreateIndexes: collection.indexes.map((index) => ({
    IndexName: index.name,
    MgoKeySchema: {
      MgoIndexKeys: index.fields.map((field) => ({
        Name: field.field,
        Direction: field.direction === 'desc' ? '-1' : '1',
      })),
      MgoIsUnique: Boolean(index.unique),
      MgoIsSparse: Boolean(index.sparse),
    },
  })),
}

const wechatideBin = process.env.WECHATIDE_BIN
  || '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatide'

const result = spawnSync(wechatideBin, [
  '-c', 'codex-love-points',
  'cloud_db_write_struct',
  '--appid', projectConfig.appid,
  '--env', environmentId,
  '--action', 'updateCollection',
  '--collection-name', collectionName,
  '--update-options', JSON.stringify(updateOptions),
], {
  cwd: new URL('.', root),
  encoding: 'utf8',
})

if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
process.exit(result.status ?? 1)
