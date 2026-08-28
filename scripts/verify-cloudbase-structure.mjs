import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const projectConfig = JSON.parse(await readFile(new URL('project.config.json', root), 'utf8'))
const schema = JSON.parse(await readFile(new URL('cloudfunctions/database-schema.json', root), 'utf8'))
const envSource = await readFile(new URL('miniprogram/config/env.ts', root), 'utf8')
const environmentId = envSource.match(/CLOUD_ENV_ID\s*=\s*['"]([^'"]*)['"]/)?.[1]?.trim()
const wechatideBin = process.env.WECHATIDE_BIN
  || '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatide'

if (!environmentId) {
  console.error('CLOUD_ENV_ID 为空；无法核对云端结构')
  process.exit(1)
}

const invoke = (args) => {
  const result = spawnSync(wechatideBin, ['-c', 'codex-love-points', ...args], {
    cwd: new URL('.', root),
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    throw new Error(`wechatide 调用失败：${args[0]}`)
  }

  try {
    return JSON.parse(result.stdout.trim()).result
  } catch {
    throw new Error(`无法解析 wechatide 返回：${result.stdout}`)
  }
}

const commonArgs = ['--appid', projectConfig.appid, '--env', environmentId]
const collectionResult = invoke([
  'cloud_db_read_struct',
  ...commonArgs,
  '--action', 'listCollections',
  '--limit', '100',
])

const expectedCollectionNames = schema.collections.map((item) => item.name).sort()
const actualCollectionNames = collectionResult.collections.map((item) => item.TableName).sort()

if (JSON.stringify(actualCollectionNames) !== JSON.stringify(expectedCollectionNames)) {
  console.error('云端集合与结构定义不一致')
  console.error('期望：', expectedCollectionNames.join(', '))
  console.error('实际：', actualCollectionNames.join(', '))
  process.exit(1)
}

let verifiedIndexCount = 0

for (const collection of schema.collections) {
  if (!collection.indexes?.length) continue

  const indexResult = invoke([
    'cloud_db_read_struct',
    ...commonArgs,
    '--action', 'listIndexes',
    '--collection-name', collection.name,
  ])

  const actualCustomIndexes = indexResult.indexes
    .filter((index) => !index.Name.startsWith('_'))
    .sort((left, right) => left.Name.localeCompare(right.Name))
  const expectedIndexes = [...collection.indexes].sort((left, right) => left.name.localeCompare(right.name))

  if (actualCustomIndexes.length !== expectedIndexes.length) {
    console.error(`${collection.name} 自定义索引数量不一致：期望 ${expectedIndexes.length}，实际 ${actualCustomIndexes.length}`)
    process.exit(1)
  }

  for (const expected of expectedIndexes) {
    const actual = actualCustomIndexes.find((index) => index.Name === expected.name)
    if (!actual) {
      console.error(`${collection.name} 缺少索引 ${expected.name}`)
      process.exit(1)
    }

    const expectedKeys = expected.fields.map((field) => ({
      Name: field.field,
      Direction: field.direction === 'desc' ? '-1' : '1',
    }))

    if (JSON.stringify(actual.Keys) !== JSON.stringify(expectedKeys)) {
      console.error(`${collection.name}.${expected.name} 字段或方向不一致`)
      console.error('期望：', JSON.stringify(expectedKeys))
      console.error('实际：', JSON.stringify(actual.Keys))
      process.exit(1)
    }

    if (Boolean(actual.Unique) !== Boolean(expected.unique)
      || Boolean(actual.Sparse) !== Boolean(expected.sparse)) {
      console.error(`${collection.name}.${expected.name} 的 Unique/Sparse 配置不一致`)
      process.exit(1)
    }

    verifiedIndexCount += 1
  }
}

console.log(`云端数据库结构核对通过：${expectedCollectionNames.length} 个集合、${verifiedIndexCount} 个自定义索引。`)
