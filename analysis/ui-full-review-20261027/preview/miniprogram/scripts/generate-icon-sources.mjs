import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Optional offline asset-generation tool. Pass the directory containing sharp.
const require = createRequire(import.meta.url)
const sharp = require(process.argv[2] ? path.join(process.argv[2], 'sharp') : 'sharp')
const root = fileURLToPath(new URL('../', import.meta.url))
const directory = path.join(root, 'assets/icons/mingcute')
const sources = {}
fs.mkdirSync(path.join(directory, 'png'), { recursive: true })
for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.svg')).sort()) {
  const svg = fs.readFileSync(path.join(directory, file), 'utf8').trim()
    .replace('<svg ', '<svg width="24" height="24" ')
  sources[file] = svg
  await sharp(Buffer.from(svg)).resize(96, 96).png().toFile(path.join(directory, 'png', file.replace('.svg', '.png')))
}
fs.writeFileSync(path.join(root, 'components/base/lp-icon/sources.ts'),
  '// Generated from assets/icons/mingcute by scripts/generate-icon-sources.mjs.\n'
  + 'export const ICON_SOURCES: Record<string, string> = ' + JSON.stringify(sources, null, 2) + '\n')
console.log(`Generated ${Object.keys(sources).length} SVG sources and PNG fallbacks`)
