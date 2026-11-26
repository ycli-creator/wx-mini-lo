import { ICON_SOURCES } from './sources'
import { LINE_ICON_SOURCES } from './line-sources'

const ICON_ROOT = '/assets/icons/mingcute/'

const LINE_NAMES: Record<string, string> = {
  'arrow-left-2': 'back', 'arrow-right-2': 'right', 'arrow-down-2': 'down', down: 'down',
  plus: 'plus', close: 'close', 'settings-3': 'settings', '3-user': 'people',
  usergroup: 'people', 'usergroup-add': 'invite', chat: 'chat', 'chat-filled': 'chat',
  notification: 'bell', document: 'file', file: 'file', 'file-paste': 'file', 'book-open': 'book',
  gift: 'gift', calendar: 'calendar', wallet: 'wallet', money: 'wallet', heart: 'heart',
  'error-circle': 'alert', 'info-circle': 'info', 'user-avatar': 'profile',
  check: 'tick', 'check-circle-filled': 'check', circle: 'task', 'tick-square': 'checklist',
  'task-checked': 'checklist', 'user-circle': 'profile', profile: 'profile',
  image: 'image', camera: 'camera', microphone: 'microphone', audio: 'audio', draw: 'brush',
  'lock-on': 'lock', lock: 'lock', history: 'history', information: 'info', shield: 'shield',
}

const ICON_FILES: Record<string, string> = {
  '3-user': '3-user.svg',
  'add-user': 'add-user.svg',
  'arrow-down-2': 'arrow-down-2.svg',
  'arrow-left-2': 'arrow-left-2.svg',
  'arrow-right-2': 'arrow-right-2.svg',
  'bag-2': 'bag-2.svg',
  calendar: 'calendar.svg',
  camera: 'camera.svg',
  chat: 'chat.svg',
  'close-square': 'close-square.svg',
  'danger-circle': 'danger-circle.svg',
  document: 'document.svg',
  heart: 'heart.svg',
  home: 'home.svg',
  image: 'image.svg',
  'info-square': 'info-square.svg',
  lock: 'lock.svg',
  notification: 'notification.svg',
  paper: 'paper.svg',
  plus: 'plus.svg',
  profile: 'profile.svg',
  'shield-done': 'shield-done.svg',
  swap: 'swap.svg',
  'tick-square': 'tick-square.svg',
  'time-circle': 'time-circle.svg',
  upload: 'upload.svg',
  wallet: 'wallet.svg',
  'toilet-paper': 'toilet-paper.svg',
  'laugh': 'laugh.svg',
  'happy': 'happy.svg',
  'meh': 'meh.svg',
  'angry': 'angry.svg',
  'sad': 'sad.svg',
  'bread': 'bread.svg',
  'apple-fruit': 'apple-fruit.svg',
  'drink': 'drink.svg',
  'football': 'football.svg',
  'emoji': 'emoji.svg',
  'drop': 'drop.svg',
  'history': 'history.svg',
  'information': 'information.svg',
  'settings-3': 'settings-3.svg',
  down: 'down.svg',
  check: 'check.svg',
  close: 'close.svg',
  microphone: 'microphone.svg',
  audio: 'audio.svg',
  draw: 'draw.svg',
}

const ICON_ALIASES: Record<string, string> = {
  'book-open': 'paper',
  'check-circle-filled': 'tick-square',
  'chat-filled': 'chat',
  circle: 'time-circle',
  cloud: 'upload',
  'error-circle': 'danger-circle',
  file: 'document',
  'file-paste': 'document',
  gift: 'bag-2',
  'heart-filled': 'heart',
  'image-filled': 'image',
  'info-circle': 'info-square',
  'lock-on': 'lock',
  money: 'wallet',
  shield: 'shield-done',
  task: 'tick-square',
  'task-checked': 'tick-square',
  'task-filled': 'tick-square',
  'thumb-up': 'heart',
  time: 'time-circle',
  'user-avatar': 'profile',
  'user-circle': 'profile',
  'user-circle-filled': 'profile',
  usergroup: '3-user',
  'usergroup-add': 'add-user',
}

const base64 = (value: string) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let encoded = ''
  for (let i = 0; i < value.length; i += 3) {
    const bits = (value.charCodeAt(i) << 16) | ((value.charCodeAt(i + 1) || 0) << 8) | (value.charCodeAt(i + 2) || 0)
    encoded += alphabet[(bits >>> 18) & 63] + alphabet[(bits >>> 12) & 63]
      + (i + 1 < value.length ? alphabet[(bits >>> 6) & 63] : '=')
      + (i + 2 < value.length ? alphabet[bits & 63] : '=')
  }
  return encoded
}

export const resolveIcon = (name: string, color = '#e84a57') => {
  const safeColor = /^#[\da-f]{3,8}$/i.test(color) ? color : '#e84a57'
  const lineName = name.startsWith('line-') ? name.slice(5) : LINE_NAMES[name]
  const lineSource = LINE_ICON_SOURCES[lineName]
  if (lineSource) {
    const white = safeColor.toLowerCase() === '#ffffff' && ['plus', 'compose', 'tick'].includes(lineName)
    return {
      iconUrl: `data:image/svg+xml;base64,${base64(lineSource.replace('#2f2928', safeColor))}`,
      fallbackUrl: `/assets/icons/line/${lineName}${white ? '-white' : ''}.png`,
    }
  }
  const resolvedName = ICON_ALIASES[name] || name
  const fileName = ICON_FILES[resolvedName] || ICON_FILES['info-square']
  const source = ICON_SOURCES[fileName]
  const svg = source.replace(/#2f2928/g, safeColor)
  return {
    iconUrl: `data:image/svg+xml;base64,${base64(svg)}`,
    fallbackUrl: `${ICON_ROOT}png/${fileName.replace('.svg', '.png')}`,
  }
}

Component({
  options: {
    addGlobalClass: true,
  },
  properties: {
    name: {
      type: String,
      value: '',
    },
    size: {
      type: String,
      value: '32rpx',
    },
    color: {
      type: String,
      value: '#e84a57',
    },
    ariaLabel: {
      type: String,
      value: '',
    },
  },
  data: {
    iconUrl: '',
    fallbackUrl: '',
  },
  observers: {
    'name, color'(name: string, color: string) {
      this.setData(resolveIcon(name, color))
    },
  },
  methods: {
    handleImageError() {
      if (this.data.iconUrl !== this.data.fallbackUrl) this.setData({ iconUrl: this.data.fallbackUrl })
    },
  },
})
