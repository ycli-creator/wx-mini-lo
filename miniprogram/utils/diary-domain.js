const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const normalize = (input) => {
  const text = (key, max) => {
    const value = input[key] === undefined ? '' : input[key]
    if (typeof value !== 'string' || value.length > max) throw new Error(`${key} 内容过长或格式不正确`)
    return value
  }
  if (!validDate(input.date)) throw new Error('日记日期不正确')
  if (typeof input.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error('日记时间不正确')
  if (!Number.isInteger(input.version) || input.version < 0) throw new Error('日记版本不正确')
  if (!Array.isArray(input.tags) || input.tags.length > 20 || input.tags.some((tag) => typeof tag !== 'string' || tag.length > 30)) throw new Error('最多添加 20 个标签，每个不超过 30 字')
  for (const key of ['draft', 'favorite', 'pinned', 'deleted']) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new Error('日记状态不正确')
  const mediaSource = (value) => {
    if (typeof value !== 'string' || value.length > 1000 || !/^(cloud:\/\/[^\s]+|wxfile:\/\/[^\s]+|https?:\/\/(tmp|usr)\/[^\s]+|\/[^\s]+)$/.test(value)) throw new Error('附件地址不正确')
    return value
  }
  const media = (key, limit, convert) => {
    const values = input[key] === undefined ? [] : input[key]
    if (!Array.isArray(values) || values.length > limit) throw new Error('附件数量超出限制')
    const ids = new Set()
    return values.map((item) => {
      if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(item.id) || ids.has(item.id)) throw new Error('附件编号不正确')
      ids.add(item.id)
      return { id: item.id, src: mediaSource(item.src), ...convert(item) }
    })
  }
  const images = media('images', 9, (item) => {
    if (![item.width, item.height].every((n) => Number.isFinite(n) && n > 0 && n <= 50000)) throw new Error('图片尺寸不正确')
    return { width: item.width, height: item.height }
  })
  const audio = media('audio', 5, (item) => {
    if (typeof item.name !== 'string' || item.name.length > 100 || !Number.isFinite(item.duration) || item.duration < 0 || item.duration > 86400) throw new Error('音频信息不正确')
    return { name: item.name, duration: item.duration }
  })
  const drawing = input.drawing === undefined || input.drawing === '' ? '' : mediaSource(input.drawing)
  for (const key of ['markdown', 'titleVisible', 'originalImages', 'hidden']) if (input[key] !== undefined && typeof input[key] !== 'boolean') throw new Error('编辑设置不正确')
  const lineHeight = input.lineHeight === undefined ? 1.9 : input.lineHeight
  if (![1.5, 1.9, 2.3].includes(lineHeight)) throw new Error('行距不正确')
  const paper = input.paper === undefined ? 'plain' : input.paper
  if (!['plain', 'lined', 'warm'].includes(paper)) throw new Error('纸张设置不正确')
  const body = text('body', 20000)
  if (!input.draft && !body.trim() && !images.length && !audio.length && !drawing) throw new Error('请写下日记内容或添加附件')
  return { date: input.date, time: input.time, title: text('title', 80), body, mood: text('mood', 30), weather: text('weather', 30), location: text('location', 100), category: text('category', 30), tags: [...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))], favorite: input.favorite === true, pinned: input.pinned === true, deleted: input.deleted === true, draft: input.draft === true, markdown: input.markdown === true, titleVisible: input.titleVisible !== false, originalImages: input.originalImages === true, hidden: input.hidden === true, paper, lineHeight, images, audio, drawing }
}
module.exports = { normalize }
