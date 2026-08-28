import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import { BookOpen, Gift, Heart, ListChecks, UserRound } from 'lucide-react'

type PageId =
  | 'start'
  | 'invite-create'
  | 'invite-join'
  | 'bind-confirm'
  | 'home'
  | 'tasks'
  | 'task-submit'
  | 'task-review'
  | 'points'
  | 'rewards'
  | 'reward-detail'
  | 'redemption'
  | 'documents'
  | 'document-edit'
  | 'settings'
  | 'unbind-pending'
  | 'unbind-confirm'

type TaskStatus = 'todo' | 'pending' | 'done'
type RefundStatus = 'none' | 'requested' | 'approved'

type Reward = {
  id: string
  name: string
  description: string
  cost: number
  pointsType: 'shared' | 'personal'
  expiry: string
  condition: string
  approvalRequired: boolean
}

type LedgerEntry = {
  id: string
  title: string
  detail: string
  amount: number
  balance: number
  type: 'shared' | 'personal'
}

type PrototypeState = {
  bound: boolean
  taskStatus: TaskStatus
  taskNote: string
  personalPoints: number
  sharedPoints: number
  redeemedRewardId: string | null
  refundStatus: RefundStatus
  documentTitle: string
  documentBody: string
  unbindRequested: boolean
  rewards: Reward[]
  ledger: LedgerEntry[]
}

const pageDirectory: Array<{ id: PageId; number: string; label: string }> = [
  { id: 'start', number: '01', label: '初次进入' },
  { id: 'invite-create', number: '02', label: '创建邀请' },
  { id: 'invite-join', number: '03', label: '输入短码' },
  { id: 'bind-confirm', number: '04', label: '绑定确认' },
  { id: 'home', number: '05', label: '首页' },
  { id: 'tasks', number: '05A', label: '任务列表（补充）' },
  { id: 'task-submit', number: '06', label: '提交任务' },
  { id: 'task-review', number: '07', label: '审批任务' },
  { id: 'points', number: '08', label: '积分中心' },
  { id: 'rewards', number: '09', label: '奖励商店' },
  { id: 'reward-detail', number: '10', label: '奖励详情' },
  { id: 'redemption', number: '11', label: '已兑换与退款' },
  { id: 'documents', number: '12', label: '文档库' },
  { id: 'document-edit', number: '13', label: '文档编辑' },
  { id: 'settings', number: '14', label: '设置' },
  { id: 'unbind-pending', number: '15', label: '等待解绑确认' },
  { id: 'unbind-confirm', number: '16', label: '对方确认解绑' },
]

const initialRewards: Reward[] = [
  {
    id: 'movie-night',
    name: '双人电影之夜',
    description: '选一部期待很久的电影',
    cost: 200,
    pointsType: 'shared',
    expiry: '2026 年 12 月 31 日',
    condition: '周末或节假日',
    approvalRequired: false,
  },
  {
    id: 'weekend-trip',
    name: '周末短途旅行',
    description: '周末一起出发',
    cost: 800,
    pointsType: 'shared',
    expiry: '2027 年 06 月 30 日',
    condition: '提前一周商量目的地',
    approvalRequired: true,
  },
]

const initialState: PrototypeState = {
  bound: false,
  taskStatus: 'todo',
  taskNote: '今晚一起做了番茄牛腩，还拍了照片留念。',
  personalPoints: 320,
  sharedPoints: 580,
  redeemedRewardId: null,
  refundStatus: 'none',
  documentTitle: '我们的第一篇共同日记',
  documentBody: '今天一起完成了晚餐任务，番茄牛腩比想象中更成功。下次想试试做甜点。',
  unbindRequested: false,
  rewards: initialRewards,
  ledger: [
    {
      id: 'ledger-task-demo',
      title: '任务审批通过',
      detail: '今天 20:30',
      amount: 120,
      balance: 320,
      type: 'personal',
    },
    {
      id: 'ledger-refund-demo',
      title: '奖励退款',
      detail: '刚刚由清清通过',
      amount: 200,
      balance: 580,
      type: 'shared',
    },
  ],
}

const storageKey = 'love-points-web-prototype-v1'
const mainTabPages: PageId[] = ['home', 'tasks', 'rewards', 'documents', 'settings']

function readState(): PrototypeState {
  try {
    const saved = window.localStorage.getItem(storageKey)
    return saved ? { ...initialState, ...JSON.parse(saved) } : initialState
  } catch {
    return initialState
  }
}

function App() {
  const [page, setPage] = useState<PageId>(() => {
    const saved = window.sessionStorage.getItem(`${storageKey}-page`) as PageId | null
    return saved && pageDirectory.some((item) => item.id === saved) ? saved : 'start'
  })
  const [state, setState] = useState<PrototypeState>(readState)
  const [selectedRewardId, setSelectedRewardId] = useState('movie-night')
  const [pointsTab, setPointsTab] = useState<'personal' | 'shared'>('personal')
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState('')
  const [toast, setToast] = useState('')
  const [rewardModalOpen, setRewardModalOpen] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(state))
  }, [state])

  useEffect(() => {
    window.sessionStorage.setItem(`${storageKey}-page`, page)
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.querySelector<HTMLDivElement>('.screen-container')?.scrollTo({ top: 0, behavior: 'instant' })
  }, [page])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2400)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!rewardModalOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setRewardModalOpen(false)
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [rewardModalOpen])

  const selectedReward =
    state.rewards.find((reward) => reward.id === selectedRewardId) ?? state.rewards[0]

  const navigate = (target: PageId) => setPage(target)

  const showToast = (message: string) => setToast(message)

  const submitJoinCode = () => {
    if (!/^\d{6}$/.test(joinCode)) {
      setJoinError('请输入完整的 6 位数字短码')
      return
    }
    setJoinError('')
    showToast('绑定申请已发送')
    navigate('bind-confirm')
  }

  const approveTask = () => {
    if (state.taskStatus !== 'done') {
      setState((current) => ({
        ...current,
        taskStatus: 'done',
        personalPoints: current.personalPoints + 120,
        ledger: [
          {
            id: `task-${Date.now()}`,
            title: '一起完成晚餐',
            detail: '刚刚由林悦审批通过',
            amount: 120,
            balance: current.personalPoints + 120,
            type: 'personal',
          },
          ...current.ledger,
        ],
      }))
    }
    showToast('审批通过，已发放 120 积分')
    navigate('points')
  }

  const redeemReward = () => {
    if (!selectedReward || state.redeemedRewardId === selectedReward.id) {
      navigate('redemption')
      return
    }
    const balance =
      selectedReward.pointsType === 'shared' ? state.sharedPoints : state.personalPoints
    if (balance < selectedReward.cost) {
      showToast('当前积分不足，先一起完成任务吧')
      return
    }

    setState((current) => {
      const nextBalance = balance - selectedReward.cost
      return {
        ...current,
        sharedPoints:
          selectedReward.pointsType === 'shared' ? nextBalance : current.sharedPoints,
        personalPoints:
          selectedReward.pointsType === 'personal' ? nextBalance : current.personalPoints,
        redeemedRewardId: selectedReward.id,
        refundStatus: 'none',
        ledger: [
          {
            id: `redeem-${Date.now()}`,
            title: `兑换「${selectedReward.name}」`,
            detail: '刚刚兑换成功',
            amount: -selectedReward.cost,
            balance: nextBalance,
            type: selectedReward.pointsType,
          },
          ...current.ledger,
        ],
      }
    })
    showToast('兑换成功，已加入共同记录')
    navigate('redemption')
  }

  const approveRefund = () => {
    if (!selectedReward || state.refundStatus === 'approved') return
    setState((current) => {
      const isShared = selectedReward.pointsType === 'shared'
      const nextBalance =
        (isShared ? current.sharedPoints : current.personalPoints) + selectedReward.cost
      return {
        ...current,
        sharedPoints: isShared ? nextBalance : current.sharedPoints,
        personalPoints: isShared ? current.personalPoints : nextBalance,
        refundStatus: 'approved',
        redeemedRewardId: null,
        ledger: [
          {
            id: `refund-${Date.now()}`,
            title: `奖励退款「${selectedReward.name}」`,
            detail: '刚刚由对方审批通过',
            amount: selectedReward.cost,
            balance: nextBalance,
            type: selectedReward.pointsType,
          },
          ...current.ledger,
        ],
      }
    })
    showToast('退款已通过，积分已返还')
  }

  const resetPrototype = () => {
    setState(initialState)
    setJoinCode('')
    setJoinError('')
    setSelectedRewardId('movie-night')
    setPointsTab('personal')
    setPage('start')
    window.localStorage.removeItem(storageKey)
    showToast('演示数据已重置')
  }

  const screen = useMemo(() => {
    const common = { navigate, state, setState, showToast }

    switch (page) {
      case 'start':
        return <StartScreen navigate={navigate} />
      case 'invite-create':
        return <InviteCreateScreen navigate={navigate} showToast={showToast} />
      case 'invite-join':
        return (
          <InviteJoinScreen
            navigate={navigate}
            code={joinCode}
            error={joinError}
            setCode={(value) => {
              setJoinCode(value.replace(/\D/g, '').slice(0, 6))
              setJoinError('')
            }}
            submit={submitJoinCode}
          />
        )
      case 'bind-confirm':
        return <BindConfirmScreen {...common} />
      case 'home':
        return <HomeScreen {...common} />
      case 'tasks':
        return <TasksScreen {...common} />
      case 'task-submit':
        return <TaskSubmitScreen {...common} />
      case 'task-review':
        return <TaskReviewScreen {...common} approve={approveTask} />
      case 'points':
        return (
          <PointsScreen
            {...common}
            tab={pointsTab}
            setTab={setPointsTab}
          />
        )
      case 'rewards':
        return (
          <RewardsScreen
            {...common}
            setSelectedRewardId={setSelectedRewardId}
            openCreate={() => setRewardModalOpen(true)}
          />
        )
      case 'reward-detail':
        return (
          <RewardDetailScreen
            {...common}
            reward={selectedReward}
            redeem={redeemReward}
          />
        )
      case 'redemption':
        return (
          <RedemptionScreen
            {...common}
            reward={selectedReward}
            approveRefund={approveRefund}
          />
        )
      case 'documents':
        return <DocumentsScreen {...common} />
      case 'document-edit':
        return <DocumentEditScreen {...common} />
      case 'settings':
        return <SettingsScreen {...common} />
      case 'unbind-pending':
        return <UnbindPendingScreen {...common} />
      case 'unbind-confirm':
        return <UnbindConfirmScreen {...common} resetPrototype={resetPrototype} />
      default:
        return null
    }
  }, [
    page,
    state,
    selectedReward,
    pointsTab,
    joinCode,
    joinError,
  ])

  return (
    <div className="prototype-shell">
      <a className="skip-link" href="#app-view">跳到应用内容</a>
      <aside className="prototype-panel" aria-label="原型页面目录">
        <div>
          <p className="panel-kicker">LOCAL PROTOTYPE</p>
          <div className="panel-title">Love Points</div>
          <p className="panel-copy">16 个设计页面，加上补充的任务主页面，已经串成可点击 App。</p>
        </div>
        <nav className="page-directory">
          {pageDirectory.map((item) => (
            <button
              className={page === item.id ? 'directory-item is-active' : 'directory-item'}
              key={item.id}
              onClick={() => navigate(item.id)}
              aria-current={page === item.id ? 'page' : undefined}
            >
              <span>{item.number}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <button className="reset-button" onClick={resetPrototype}>重置演示数据</button>
      </aside>

      <div className="device-area">
        <div className="device-meta">
          <span>390 × 844</span>
          <span>本地 Mock 数据</span>
        </div>
        <main className={mainTabPages.includes(page) ? 'phone-frame has-tabbar' : 'phone-frame'} id="app-view">
          <div className="screen-container">
            {screen}
          </div>
          <div className={toast ? 'toast is-visible' : 'toast'} role="status" aria-live="polite">
            {toast}
          </div>
          {mainTabPages.includes(page) && <BottomTabBar page={page} navigate={navigate} />}
        </main>
      </div>

      {rewardModalOpen && (
        <CreateRewardModal
          close={() => setRewardModalOpen(false)}
          create={(reward) => {
            setState((current) => ({ ...current, rewards: [...current.rewards, reward] }))
            setSelectedRewardId(reward.id)
            setRewardModalOpen(false)
            showToast('奖励已创建')
          }}
        />
      )}
    </div>
  )
}

type NavigateProps = { navigate: (page: PageId) => void }
type SharedProps = NavigateProps & {
  state: PrototypeState
  setState: React.Dispatch<React.SetStateAction<PrototypeState>>
  showToast: (message: string) => void
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  )
}

function BottomTabBar({ page, navigate }: { page: PageId; navigate: (page: PageId) => void }) {
  const tabs: Array<{ id: PageId; label: string; icon: ReactNode }> = [
    { id: 'home', label: '首页', icon: <Heart /> },
    { id: 'tasks', label: '任务', icon: <ListChecks /> },
    { id: 'rewards', label: '奖励', icon: <Gift /> },
    { id: 'documents', label: '文档', icon: <BookOpen /> },
    { id: 'settings', label: '我的', icon: <UserRound /> },
  ]

  return (
    <nav className="bottom-tabbar" aria-label="主要导航">
      {tabs.map((tab) => (
        <button
          className={page === tab.id ? 'tab-item is-active' : 'tab-item'}
          key={tab.id}
          onClick={() => navigate(tab.id)}
          aria-current={page === tab.id ? 'page' : undefined}
        >
          <span className="tab-icon" aria-hidden="true">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}

function PrimaryButton({ children, onClick, disabled = false }: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button className="button button-primary" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

function TextButton({ children, onClick, danger = false }: {
  children: ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button className={danger ? 'button button-text is-danger' : 'button button-text'} onClick={onClick}>
      {children}
    </button>
  )
}

function AssetIcon({ src, className = '' }: { src: string; className?: string }) {
  return <img className={`asset-icon ${className}`} src={src} alt="" aria-hidden="true" />
}

function CheckIcon({ muted = false }: { muted?: boolean }) {
  return (
    <span className={muted ? 'icon-stack checkbox-icon is-muted' : 'icon-stack checkbox-icon'} aria-hidden="true">
      <AssetIcon src="/icons/home-01.svg" />
      <AssetIcon src="/icons/home-02.svg" />
    </span>
  )
}

function GiftIcon({ muted = false }: { muted?: boolean }) {
  return (
    <span className={muted ? 'icon-stack gift-icon is-muted' : 'icon-stack gift-icon'} aria-hidden="true">
      <AssetIcon src="/icons/reward-04.svg" />
      <AssetIcon src="/icons/reward-03.svg" />
    </span>
  )
}

function CoinIcon({ muted = false }: { muted?: boolean }) {
  return (
    <span className={muted ? 'icon-stack coin-icon is-muted' : 'icon-stack coin-icon'} aria-hidden="true">
      <AssetIcon src="/icons/reward-07.svg" />
      <AssetIcon src="/icons/reward-01.svg" />
    </span>
  )
}

function Chevron() {
  return <AssetIcon src="/icons/home-09.svg" className="chevron-icon" />
}

function StartScreen({ navigate }: NavigateProps) {
  return (
    <section className="screen">
      <PageHeader title="Love Points" subtitle="两个人的小任务、积分和共同记录" />
      <div className="notice-card notice-brand">
        <h2>先绑定你的另一半</h2>
        <p>通过微信小程序卡片和短码，建立一对一情侣空间。</p>
      </div>
      <div className="action-stack">
        <PrimaryButton onClick={() => navigate('invite-create')}>邀请 TA</PrimaryButton>
        <button className="button button-soft" onClick={() => navigate('invite-join')}>输入短码</button>
      </div>
      <p className="prototype-hint">本地原型阶段：微信分享和登录将用模拟交互代替。</p>
    </section>
  )
}

function InviteCreateScreen({ navigate, showToast }: NavigateProps & { showToast: (message: string) => void }) {
  return (
    <section className="screen">
      <PageHeader title="邀请 TA" subtitle="把小程序卡片发给对方，再由 TA 输入短码" />
      <div className="form-card invite-code-card">
        <span className="field-label">绑定短码 · 30 分钟内有效</span>
        <strong>528 913</strong>
      </div>
      <PrimaryButton onClick={() => {
        navigator.clipboard?.writeText('528913').catch(() => undefined)
        showToast('本地演示：短码已复制，可继续模拟对方输入')
      }}>分享小程序卡片</PrimaryButton>
      <TextButton onClick={() => navigate('start')}>返回</TextButton>
    </section>
  )
}

function InviteJoinScreen({ navigate, code, setCode, error, submit }: NavigateProps & {
  code: string
  setCode: (value: string) => void
  error: string
  submit: () => void
}) {
  return (
    <section className="screen">
      <PageHeader title="输入短码" subtitle="输入对方分享给你的 6 位绑定短码" />
      <label className="form-card input-card">
        <span className="field-label">绑定短码</span>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="请输入 6 位数字"
          aria-describedby={error ? 'join-error' : undefined}
        />
      </label>
      {error && <p className="field-error" id="join-error">{error}</p>}
      <PrimaryButton onClick={submit}>提交绑定申请</PrimaryButton>
      <TextButton onClick={() => navigate('start')}>返回</TextButton>
    </section>
  )
}

function BindConfirmScreen({ navigate, setState, showToast }: SharedProps) {
  return (
    <section className="screen">
      <PageHeader title="确认绑定" subtitle="确认后将建立专属的情侣空间" />
      <div className="notice-card notice-brand">
        <h2>林悦申请与你绑定</h2>
        <p>绑定后可共同管理任务、积分、奖励和文档。解绑必须由双方确认。</p>
      </div>
      <PrimaryButton onClick={() => {
        setState((current) => ({ ...current, bound: true }))
        showToast('绑定成功，欢迎来到你们的情侣空间')
        navigate('home')
      }}>确认绑定</PrimaryButton>
      <TextButton onClick={() => {
        showToast('已暂不处理绑定申请')
        navigate('start')
      }}>暂不绑定</TextButton>
    </section>
  )
}

function TaskCard({ status, onClick }: { status: TaskStatus; onClick?: () => void }) {
  const label = status === 'todo' ? '待完成' : status === 'pending' ? '待审核' : '已完成'
  return (
    <button className="task-card" onClick={onClick} disabled={!onClick}>
      <div className="task-card-heading">
        <span className={status === 'pending' ? 'task-icon blue' : 'task-icon'}><CheckIcon /></span>
        <span className="task-title-block">
          <strong>一起完成晚餐</strong>
          <small>今天 20:00 截止</small>
        </span>
        <span className={`status-tag status-${status}`}>{label}</span>
      </div>
      <p>{status === 'pending' ? '已完成晚餐并上传了一张照片。' : status === 'done' ? '已完成并通过审批，积分已经到账。' : '准备两个人都喜欢的菜，完成后一起记录。'}</p>
      <div className="progress-row">
        <span>进度 {status === 'todo' ? '25%' : status === 'pending' ? '75%' : '100%'}</span>
        <span className="progress-track"><i style={{ width: status === 'todo' ? '25%' : status === 'pending' ? '75%' : '100%' }} /></span>
      </div>
    </button>
  )
}

function HomeScreen({ navigate, state }: SharedProps) {
  return (
    <section className="screen">
      <PageHeader title="今天也一起加一点分" subtitle="你与林悦已经绑定 12 天" />
      <TaskCard
        status={state.taskStatus}
        onClick={() => navigate(state.taskStatus === 'pending' ? 'task-review' : 'task-submit')}
      />
      <div className="home-links">
        <button className="list-cell" onClick={() => navigate('points')}>
          <span className="cell-icon"><CheckIcon /></span>
          <span className="cell-copy"><strong>积分中心</strong><small>查看个人与共同积分</small></span>
          <span className="cell-value">+{state.sharedPoints + state.personalPoints}</span>
          <Chevron />
        </button>
        <button className="list-cell" onClick={() => navigate('rewards')}>
          <span className="cell-copy"><strong>奖励商店</strong><small>兑换双方自定义奖励</small></span>
          <Chevron />
        </button>
        <button className="list-cell" onClick={() => navigate('documents')}>
          <span className="cell-icon document-icon"><AssetIcon src="/icons/home-06.svg" /></span>
          <span className="cell-copy"><strong>共享文档</strong><small>日记、攻略与共同计划</small></span>
          <Chevron />
        </button>
        <button className="list-cell" onClick={() => navigate('settings')}>
          <span className="cell-copy"><strong>设置</strong><small>绑定关系与其他设置</small></span>
          <Chevron />
        </button>
      </div>
    </section>
  )
}

function TasksScreen({ navigate, state }: SharedProps) {
  return (
    <section className="screen">
      <PageHeader title="我们的任务" subtitle="把想一起完成的事，一件件变成积分" />
      <div className="task-overview">
        <div><strong>2</strong><span>进行中</span></div>
        <div><strong>{state.taskStatus === 'pending' ? '1' : '0'}</strong><span>待审批</span></div>
        <div><strong>8</strong><span>本月完成</span></div>
      </div>
      <div className="section-heading">
        <h2>{state.taskStatus === 'done' ? '最近完成' : '今天'}</h2>
        <span>轻轻一点，继续推进</span>
      </div>
      <TaskCard
        status={state.taskStatus}
        onClick={() => navigate(state.taskStatus === 'pending' ? 'task-review' : 'task-submit')}
      />
      <div className="section-heading">
        <h2>接下来</h2>
        <span>2 项共同计划</span>
      </div>
      <div className="compact-task-list">
        <div className="compact-task-row">
          <span className="compact-check"><CheckIcon muted /></span>
          <span className="cell-copy"><strong>周末一起散步</strong><small>周六 18:30 · 共同任务</small></span>
          <span className="task-points">+80</span>
        </div>
        <div className="compact-task-row">
          <span className="compact-check"><CheckIcon muted /></span>
          <span className="cell-copy"><strong>整理旅行照片</strong><small>周日截止 · 个人任务</small></span>
          <span className="task-points">+60</span>
        </div>
      </div>
    </section>
  )
}

function TaskSubmitScreen({ navigate, state, setState, showToast }: SharedProps) {
  return (
    <section className="screen">
      <PageHeader title="提交任务" subtitle="完成后由对方审批，审批通过才会获得积分" />
      <TaskCard status={state.taskStatus === 'done' ? 'done' : 'todo'} />
      <label className="form-card textarea-card">
        <span className="field-label">完成说明</span>
        <textarea
          value={state.taskNote}
          onChange={(event) => setState((current) => ({ ...current, taskNote: event.target.value }))}
          rows={3}
        />
      </label>
      <PrimaryButton disabled={!state.taskNote.trim()} onClick={() => {
        setState((current) => ({ ...current, taskStatus: 'pending' }))
        showToast('任务已提交给对方审批')
        navigate('task-review')
      }}>提交给对方审批</PrimaryButton>
      <TextButton onClick={() => navigate('home')}>返回首页</TextButton>
    </section>
  )
}

function TaskReviewScreen({ navigate, state, setState, showToast, approve }: SharedProps & { approve: () => void }) {
  return (
    <section className="screen">
      <PageHeader title="审批任务" subtitle="林悦提交了一项个人任务" />
      <TaskCard status="pending" />
      <div className="notice-card notice-blue">
        <h2>审批通过后</h2>
        <p>林悦将获得 120 个人积分。</p>
      </div>
      <PrimaryButton onClick={approve}>{state.taskStatus === 'done' ? '已审批，查看积分' : '同意并发放积分'}</PrimaryButton>
      <TextButton danger onClick={() => {
        setState((current) => ({ ...current, taskStatus: 'todo' }))
        showToast('已驳回，对方可以修改后重新提交')
        navigate('task-submit')
      }}>驳回</TextButton>
    </section>
  )
}

function PointsScreen({ navigate, state, tab, setTab }: SharedProps & {
  tab: 'personal' | 'shared'
  setTab: (tab: 'personal' | 'shared') => void
}) {
  const entries = state.ledger.filter((entry) => entry.type === tab)
  return (
    <section className="screen">
      <PageHeader title="积分中心" subtitle="个人积分归个人，共同积分由双方共享" />
      <div className="points-summary">
        <div><span>我的积分</span><strong>{state.personalPoints}</strong></div>
        <div><span>共同积分</span><strong>{state.sharedPoints}</strong></div>
      </div>
      <div className="segment" aria-label="积分类型">
        <button className={tab === 'personal' ? 'is-active' : ''} onClick={() => setTab('personal')}>个人积分</button>
        <button className={tab === 'shared' ? 'is-active' : ''} onClick={() => setTab('shared')}>共同积分</button>
      </div>
      <div className="ledger-list">
        {entries.length ? entries.map((entry) => (
          <div className="ledger-row" key={entry.id}>
            <span className="ledger-icon"><CoinIcon /></span>
            <span className="ledger-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></span>
            <span className={entry.amount >= 0 ? 'ledger-amount positive' : 'ledger-amount negative'}>
              <strong>{entry.amount >= 0 ? '+' : ''}{entry.amount} 积分</strong>
              <small>余额 {entry.balance}</small>
            </span>
          </div>
        )) : (
          <div className="empty-state"><strong>还没有共同积分记录</strong><p>完成共同任务或兑换奖励后会显示在这里。</p></div>
        )}
      </div>
      <PrimaryButton onClick={() => navigate('rewards')}>去奖励商店</PrimaryButton>
      <TextButton onClick={() => navigate('home')}>返回首页</TextButton>
    </section>
  )
}

function RewardsScreen({ navigate, state, setSelectedRewardId, openCreate }: SharedProps & {
  setSelectedRewardId: (id: string) => void
  openCreate: () => void
}) {
  return (
    <section className="screen">
      <div className="title-with-action">
        <PageHeader title="奖励商店" subtitle="双方都可以添加只属于你们的奖励" />
        <button className="mini-action" onClick={openCreate}>新建</button>
      </div>
      <div className="points-banner">
        <strong>共同积分 {state.sharedPoints}</strong>
        <span>奖励可指定使用个人积分或共同积分。</span>
      </div>
      <div className="reward-list">
        {state.rewards.map((reward) => {
          const balance = reward.pointsType === 'shared' ? state.sharedPoints : state.personalPoints
          const enough = balance >= reward.cost
          const redeemed = state.redeemedRewardId === reward.id
          return (
            <button
              className="reward-card"
              key={reward.id}
              onClick={() => {
                setSelectedRewardId(reward.id)
                navigate(redeemed ? 'redemption' : 'reward-detail')
              }}
            >
              <div className="reward-heading">
                <span className={enough ? 'reward-icon' : 'reward-icon is-muted'}><GiftIcon muted={!enough} /></span>
                <span className="reward-copy"><strong>{reward.name}</strong><small>{reward.description}</small></span>
                <span className={redeemed ? 'status-tag status-done' : enough ? 'status-tag status-todo' : 'status-tag status-warning'}>
                  {redeemed ? '已兑换' : enough ? '可兑换' : '积分不足'}
                </span>
              </div>
              <div className="reward-cost"><CoinIcon muted={!enough} /> {reward.cost} {reward.pointsType === 'shared' ? '共同' : '个人'}积分</div>
            </button>
          )
        })}
      </div>
      <TextButton onClick={() => navigate('home')}>返回首页</TextButton>
    </section>
  )
}

function RewardDetailScreen({ navigate, state, reward, redeem }: SharedProps & {
  reward: Reward
  redeem: () => void
}) {
  const balance = reward.pointsType === 'shared' ? state.sharedPoints : state.personalPoints
  const alreadyRedeemed = state.redeemedRewardId === reward.id
  return (
    <section className="screen">
      <PageHeader title={reward.name} subtitle="兑换前确认奖励规则" />
      <div className="reward-card detail-card">
        <div className="reward-heading">
          <span className="reward-icon"><GiftIcon /></span>
          <span className="reward-copy"><strong>{reward.name}</strong><small>{reward.description}</small></span>
          <span className="status-tag status-todo">{alreadyRedeemed ? '已兑换' : balance >= reward.cost ? '可兑换' : '积分不足'}</span>
        </div>
        <div className="reward-cost"><CoinIcon /> {reward.cost} {reward.pointsType === 'shared' ? '共同' : '个人'}积分</div>
      </div>
      <div className="form-card info-card">
        <h2>使用说明</h2>
        <dl>
          <div><dt>有效期</dt><dd>{reward.expiry}</dd></div>
          <div><dt>使用场景</dt><dd>{reward.condition}</dd></div>
          <div><dt>审批</dt><dd>{reward.approvalRequired ? '需要对方同意' : '无需额外审批'}</dd></div>
        </dl>
      </div>
      <PrimaryButton onClick={redeem} disabled={!alreadyRedeemed && balance < reward.cost}>
        {alreadyRedeemed ? '查看已兑换奖励' : '确认兑换'}
      </PrimaryButton>
      <TextButton onClick={() => navigate('rewards')}>返回商店</TextButton>
    </section>
  )
}

function RedemptionScreen({ navigate, state, setState, showToast, reward, approveRefund }: SharedProps & {
  reward: Reward
  approveRefund: () => void
}) {
  const refunded = state.refundStatus === 'approved'
  const requested = state.refundStatus === 'requested'
  return (
    <section className="screen">
      <PageHeader
        title={refunded ? '退款完成' : '兑换成功'}
        subtitle={refunded ? '积分已返还，你们可以继续积攒' : '奖励已加入你们的共同记录'}
      />
      <div className="reward-card detail-card">
        <div className="reward-heading">
          <span className={refunded ? 'reward-icon is-muted' : 'reward-icon success'}><GiftIcon muted={refunded} /></span>
          <span className="reward-copy"><strong>{reward.name}</strong><small>{refunded ? '本次兑换已退款' : '等待找一个合适的周末'}</small></span>
          <span className="status-tag status-done">{refunded ? '已退款' : '已兑换'}</span>
        </div>
        <div className="reward-cost"><CoinIcon muted={refunded} /> {reward.cost} {reward.pointsType === 'shared' ? '共同' : '个人'}积分</div>
      </div>
      <div className="notice-card notice-success">
        <h2>使用说明</h2>
        <p>{refunded ? '对方已经同意退款，对应积分已回到原账户。' : '有效期内使用；如果计划取消，可以向对方申请退款。'}</p>
      </div>
      {!refunded && !requested && (
        <button className="button button-soft" onClick={() => {
          setState((current) => ({ ...current, refundStatus: 'requested' }))
          showToast('退款申请已发送给对方')
        }}>申请退款</button>
      )}
      {requested && (
        <>
          <div className="inline-status"><span>退款申请等待对方处理</span><strong>待确认</strong></div>
          <PrimaryButton onClick={approveRefund}>模拟对方同意退款</PrimaryButton>
        </>
      )}
      <TextButton onClick={() => navigate('points')}>返回积分中心</TextButton>
    </section>
  )
}

function DocumentsScreen({ navigate }: SharedProps) {
  const groups = [
    ['恋爱日记', '12 篇文档', '12'],
    ['旅行攻略', '3 篇文档', '3'],
    ['共同计划', '5 篇文档', '5'],
  ]
  return (
    <section className="screen">
      <PageHeader title="共享文档库" subtitle="按文档组整理日记、攻略和共同计划" />
      <div className="document-groups">
        {groups.map(([name, count, value]) => (
          <button className="list-cell document-cell" key={name} onClick={() => navigate('document-edit')}>
            <span className="cell-copy"><strong>{name}</strong><small>{count}</small></span>
            <span className="cell-value">{value}</span>
            <Chevron />
          </button>
        ))}
      </div>
      <PrimaryButton onClick={() => navigate('document-edit')}>新建文档</PrimaryButton>
      <TextButton onClick={() => navigate('home')}>返回首页</TextButton>
    </section>
  )
}

function DocumentEditScreen({ navigate, state, setState, showToast }: SharedProps) {
  const [draftTitle, setDraftTitle] = useState(state.documentTitle)
  const [draftBody, setDraftBody] = useState(state.documentBody)
  return (
    <section className="screen">
      <PageHeader title="编辑文档" subtitle="首版采用单人编辑，保存后同步给对方" />
      <label className="form-card input-card">
        <span className="field-label">标题</span>
        <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
      </label>
      <label className="form-card textarea-card document-textarea">
        <span className="field-label">正文</span>
        <textarea value={draftBody} onChange={(event) => setDraftBody(event.target.value)} rows={5} />
      </label>
      <PrimaryButton disabled={!draftTitle.trim() || !draftBody.trim()} onClick={() => {
        setState((current) => ({ ...current, documentTitle: draftTitle, documentBody: draftBody }))
        showToast('文档已保存并同步给对方')
        navigate('documents')
      }}>保存文档</PrimaryButton>
      <TextButton onClick={() => navigate('documents')}>取消</TextButton>
    </section>
  )
}

function SettingsScreen({ navigate, state, setState, showToast }: SharedProps) {
  return (
    <section className="screen">
      <PageHeader title="设置" subtitle="管理情侣关系与原型信息" />
      <div className="notice-card notice-brand">
        <h2>你与林悦</h2>
        <p>{state.bound ? '已绑定 12 天 · 情侣空间正常使用中' : '本地演示关系 · 尚未接入微信身份'}</p>
      </div>
      <div className="settings-list">
        <div className="list-cell static-cell">
          <span className="cell-copy"><strong>绑定关系</strong><small>双方确认后才可以解除</small></span>
          <span className="cell-value">已绑定</span>
        </div>
        <div className="list-cell static-cell">
          <span className="cell-copy"><strong>积分规则</strong><small>个人积分与共同积分</small></span>
        </div>
        <div className="list-cell static-cell">
          <span className="cell-copy"><strong>关于原型</strong><small>当前为可交互本地版本</small></span>
        </div>
      </div>
      <button className="button button-soft" onClick={() => {
        setState((current) => ({ ...current, unbindRequested: true }))
        showToast('解绑申请已发送')
        navigate('unbind-pending')
      }}>申请解除绑定</button>
      <TextButton onClick={() => navigate('home')}>返回首页</TextButton>
    </section>
  )
}

function UnbindPendingScreen({ navigate, setState, showToast }: SharedProps) {
  return (
    <section className="screen">
      <PageHeader title="等待对方确认" subtitle="双方都同意后才会解除绑定" />
      <div className="notice-card notice-warning">
        <h2>解绑申请已发送</h2>
        <p>在林悦确认前，情侣空间和所有数据都保持不变。</p>
      </div>
      <div className="confirmation-list">
        <div className="inline-status"><span><strong>我的确认</strong><small>你已经同意解除</small></span><b>已同意</b></div>
        <div className="inline-status"><span><strong>林悦的确认</strong><small>等待对方处理</small></span><b>待确认</b></div>
      </div>
      <PrimaryButton onClick={() => navigate('unbind-confirm')}>切换到对方确认视角</PrimaryButton>
      <TextButton danger onClick={() => {
        setState((current) => ({ ...current, unbindRequested: false }))
        showToast('解绑申请已撤销，数据保持不变')
        navigate('settings')
      }}>撤销申请</TextButton>
    </section>
  )
}

function UnbindConfirmScreen({ navigate, setState, showToast, resetPrototype }: SharedProps & { resetPrototype: () => void }) {
  return (
    <section className="screen">
      <PageHeader title="确认解除绑定" subtitle="对方申请解除你们的情侣关系" />
      <div className="notice-card notice-danger">
        <h2>此操作不可恢复</h2>
        <p>双方确认后，将立即清空任务、个人与共同积分、奖励、文档和积分流水。</p>
      </div>
      <PrimaryButton onClick={() => {
        resetPrototype()
        showToast('已解除绑定，本地情侣空间数据已清空')
      }}>同意解除并清空</PrimaryButton>
      <TextButton danger onClick={() => {
        setState((current) => ({ ...current, unbindRequested: false }))
        showToast('已拒绝解除绑定，关系与数据保持不变')
        navigate('settings')
      }}>拒绝解除</TextButton>
    </section>
  )
}

function CreateRewardModal({ close, create }: {
  close: () => void
  create: (reward: Reward) => void
}) {
  const [name, setName] = useState('一起看日落')
  const [description, setDescription] = useState('找一个天气好的傍晚散步')
  const [cost, setCost] = useState('150')
  const [pointsType, setPointsType] = useState<'shared' | 'personal'>('shared')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsedCost = Number(cost)
    if (!name.trim() || !Number.isFinite(parsedCost) || parsedCost <= 0) return
    create({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || '你们共同创建的奖励',
      cost: parsedCost,
      pointsType,
      expiry: '创建后 365 天内',
      condition: '由双方共同商量使用时间',
      approvalRequired: false,
    })
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) close()
    }}>
      <form className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="create-reward-title" onSubmit={submit}>
        <div className="modal-heading">
          <div><span className="modal-kicker">自定义奖励</span><h2 id="create-reward-title">新增一个小期待</h2></div>
          <button type="button" className="modal-close" aria-label="关闭" onClick={close}>×</button>
        </div>
        <label><span>奖励名称</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>简短说明</span><input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label><span>所需积分</span><input inputMode="numeric" value={cost} onChange={(event) => setCost(event.target.value.replace(/\D/g, ''))} /></label>
        <fieldset>
          <legend>积分类型</legend>
          <button type="button" className={pointsType === 'shared' ? 'choice is-active' : 'choice'} onClick={() => setPointsType('shared')}>共同积分</button>
          <button type="button" className={pointsType === 'personal' ? 'choice is-active' : 'choice'} onClick={() => setPointsType('personal')}>个人积分</button>
        </fieldset>
        <button className="button button-primary modal-submit" type="submit">创建奖励</button>
      </form>
    </div>
  )
}

export default App
