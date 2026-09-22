const ICON_ROOT = '/assets/icons/iconly-curved-outline/'

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
}

const ICON_ALIASES: Record<string, string> = {
  'book-open': 'paper',
  check: 'tick-square',
  'check-circle-filled': 'tick-square',
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

const resolveIconUrl = (name: string) => {
  const resolvedName = ICON_ALIASES[name] || name
  const fileName = ICON_FILES[resolvedName]
  return fileName ? `${ICON_ROOT}${fileName}` : ''
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
      value: '',
    },
    ariaLabel: {
      type: String,
      value: '',
    },
  },
  data: {
    iconUrl: '',
  },
  observers: {
    name(name: string) {
      this.setData({ iconUrl: resolveIconUrl(name) })
    },
  },
})
