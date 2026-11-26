import { uploadDiaryDrawing } from '../../services/diary-media'

interface Point { x: number; y: number }
interface Stroke { color: string; width: number; points: Point[] }
interface CanvasNode { node: WechatMiniprogram.Canvas; width: number; height: number }
type CanvasContext = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D
interface DrawingState {
  canvas: WechatMiniprogram.Canvas | null
  context: CanvasContext | null
  width: number
  height: number
  strokes: Stroke[]
  current: Stroke | null
  savedSrc: string
}
const createDrawingState = (): DrawingState => ({ canvas: null, context: null, width: 0, height: 0, strokes: [], current: null, savedSrc: '' })
const paintStroke = (context: CanvasContext, stroke: Stroke) => {
  if (!stroke.points.length) return
  context.strokeStyle = stroke.color
  context.fillStyle = stroke.color
  context.lineWidth = stroke.width
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  const first = stroke.points[0]
  if (stroke.points.length === 1) {
    context.arc(first.x, first.y, stroke.width / 2, 0, Math.PI * 2)
    context.fill()
    return
  }
  context.moveTo(first.x, first.y)
  stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y))
  context.stroke()
}

Page({
  data: {
    ready: false, busy: false, hasDrawing: false, error: '', color: '#2f2928', width: 4,
    colors: [
      { value: '#2f2928', name: '墨黑' }, { value: '#f65f6b', name: '珊瑚红' },
      { value: '#e7942f', name: '暖橙' }, { value: '#688f3b', name: '草绿' },
      { value: '#4d84c6', name: '蓝色' },
    ],
    widths: [{ value: 2, name: '细' }, { value: 4, name: '中' }, { value: 8, name: '粗' }],
  },
  drawing: createDrawingState(),
  onLoad() { this.drawing = createDrawingState() },
  onReady() { this.initializeCanvas() },
  initializeCanvas() {
    this.setData({ error: '' })
    this.createSelectorQuery().select('#diary-drawing').fields({ node: true, size: true }).exec((result: unknown[]) => {
      const candidate = result[0] as Partial<CanvasNode> | undefined
      if (!candidate || !candidate.node || !candidate.width || !candidate.height) {
        this.setData({ error: '画布未能打开，请重试' })
        return
      }
      const canvas = candidate.node
      const context = canvas.getContext('2d')
      const ratio = wx.getWindowInfo().pixelRatio || 1
      canvas.width = Math.round(candidate.width * ratio)
      canvas.height = Math.round(candidate.height * ratio)
      context.scale(ratio, ratio)
      this.drawing.canvas = canvas
      this.drawing.context = context
      this.drawing.width = candidate.width
      this.drawing.height = candidate.height
      this.redraw()
      this.setData({ ready: true })
    })
  },
  redraw() {
    const drawing = this.drawing
    if (!drawing.context) return
    drawing.context.fillStyle = '#ffffff'
    drawing.context.fillRect(0, 0, drawing.width, drawing.height)
    drawing.strokes.forEach((stroke) => paintStroke(drawing.context!, stroke))
    if (drawing.current) paintStroke(drawing.context, drawing.current)
  },
  beginStroke(event: WechatMiniprogram.TouchCanvas) {
    if (!this.data.ready || this.data.busy || !event.touches.length) return
    const point = event.touches[0]
    this.drawing.current = { color: this.data.color, width: this.data.width, points: [{ x: point.x, y: point.y }] }
    this.drawing.savedSrc = ''
    this.redraw()
  },
  continueStroke(event: WechatMiniprogram.TouchCanvas) {
    const stroke = this.drawing.current
    if (!stroke || this.data.busy || !event.touches.length) return
    const point = event.touches[0]
    const previous = stroke.points[stroke.points.length - 1]
    const next = { x: Math.max(0, Math.min(this.drawing.width, point.x)), y: Math.max(0, Math.min(this.drawing.height, point.y)) }
    stroke.points.push(next)
    if (this.drawing.context) paintStroke(this.drawing.context, { color: stroke.color, width: stroke.width, points: [previous, next] })
  },
  endStroke() {
    if (!this.drawing.current) return
    this.drawing.strokes.push(this.drawing.current)
    this.drawing.current = null
    this.setData({ hasDrawing: true, error: '' })
    wx.enableAlertBeforeUnload({ message: '画稿还未添加到日记，确定离开吗？' })
  },
  chooseColor(event: WechatMiniprogram.TouchEvent) {
    const color = String(event.currentTarget.dataset.color)
    if (!this.data.busy && this.data.colors.some((item) => item.value === color)) this.setData({ color })
  },
  chooseWidth(event: WechatMiniprogram.TouchEvent) {
    const width = Number(event.currentTarget.dataset.width)
    if (!this.data.busy && this.data.widths.some((item) => item.value === width)) this.setData({ width })
  },
  undo() {
    if (this.data.busy) return
    this.drawing.current = null
    this.drawing.strokes.pop()
    this.drawing.savedSrc = ''
    this.redraw()
    this.setData({ hasDrawing: this.drawing.strokes.length > 0, error: '' })
    if (!this.data.hasDrawing) wx.disableAlertBeforeUnload()
  },
  async clear() {
    if (this.data.busy || !this.data.hasDrawing) return
    const result = await wx.showModal({ title: '清空画布', content: '当前画稿会被清空，是否继续？', confirmText: '清空', confirmColor: '#e84a57' })
    if (!result.confirm) return
    this.drawing.strokes = []
    this.drawing.current = null
    this.drawing.savedSrc = ''
    this.redraw()
    this.setData({ hasDrawing: false, error: '' })
    wx.disableAlertBeforeUnload()
  },
  async save() {
    if (this.data.busy || !this.drawing.canvas || !this.data.hasDrawing) return
    this.setData({ busy: true, error: '' })
    try {
      if (!this.drawing.savedSrc) {
        const canvas = this.drawing.canvas
        const path = await new Promise<string>((resolve, reject) => wx.canvasToTempFilePath({
          canvas, fileType: 'png', destWidth: canvas.width, destHeight: canvas.height,
          success: (result) => resolve(result.tempFilePath), fail: reject,
        }))
        this.drawing.savedSrc = await uploadDiaryDrawing(path)
      }
      const channel = this.getOpenerEventChannel()
      if (!channel.emit) throw new Error('日记页面连接已失效，请返回重试')
      channel.emit('drawingSaved', { src: this.drawing.savedSrc })
      wx.disableAlertBeforeUnload()
      await wx.navigateBack()
    } catch (error) {
      this.setData({ error: error instanceof Error ? error.message : '画稿保存失败，请重试' })
      // Keep every stroke and the uploaded ID, so retry never loses the drawing.
    } finally {
      this.setData({ busy: false })
    }
  },
})
