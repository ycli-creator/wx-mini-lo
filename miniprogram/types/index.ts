export type TaskStatus = 'todo' | 'pending' | 'done' | 'rejected' | 'missed'
export type TaskPlanType = 'daily' | 'weekly' | 'long_term'
export type RefundStatus = 'none' | 'requested' | 'approved'
export type PointsType = 'personal' | 'shared'
export type ProfileGender = 'female' | 'male' | 'other' | 'private'
export type CommunityPostStatus = 'pending' | 'published' | 'rejected'
export type DailyRecordType = 'mood' | 'event' | 'period'

export interface UserProfile {
  nickname: string
  avatarUrl: string
  gender: ProfileGender
  region: string
  hobbies: string[]
  completed: boolean
}

export interface PartnerProfile {
  nickname: string
  avatarUrl: string
}

export interface CommunityMedia {
  type: 'image' | 'video'
  fileId: string
  posterFileId?: string
  width?: number
  height?: number
  duration?: number
}

export interface CommunityPost {
  id: string
  content: string
  media: CommunityMedia[]
  status: CommunityPostStatus
  authorName: string
  authorAvatarUrl: string
  pairLabel: string
  authorIsSelf: boolean
  canReview: boolean
  createdAt: string
  publishedAt: string
  rejectionReason: string
}

export interface DailyRecord {
  id: string
  date: string
  type: DailyRecordType
  title: string
  note: string
  mood: string
  periodFlow: 'light' | 'medium' | 'heavy' | ''
  visibility: 'self' | 'couple'
  ownerIsSelf: boolean
  ownerName: string
  createdAt: string
}

export interface TaskItem {
  id: string
  templateId: string
  title: string
  description: string
  taskType: 'personal' | 'shared'
  pointsType: PointsType
  points: number
  status: TaskStatus
  assigneeIsSelf: boolean
  reviewerIsSelf: boolean
  latestNote: string
  rejectionReason: string
  planType: TaskPlanType
  cycleKey: string
  cycleLabel: string
  periodStart: string
  periodEnd: string
  isCurrentCycle: boolean
}

export interface Reward {
  id: string
  name: string
  description: string
  cost: number
  pointsType: PointsType
  expiry: string
  condition: string
  approvalRequired: boolean
}

export interface RewardRedemption {
  rewardId: string
  status: 'pending' | 'active' | 'refunded'
  canReview: boolean
  refundStatus: RefundStatus
  refundCanReview: boolean
  requesterIsSelf: boolean
}

export interface LedgerEntry {
  id: string
  title: string
  detail: string
  amount: number
  balance: number
  type: PointsType
}

export interface DocumentGroup {
  id: string
  name: string
  order: number
}

export interface SharedDocument {
  id: string
  groupId: string
  title: string
  body: string
  lockedByOther: boolean
}

export interface LovePointsState {
  profile: UserProfile
  partnerProfile: PartnerProfile
  profileComplete: boolean
  bound: boolean
  inviteCode: string
  joinCode: string
  taskStatus: TaskStatus
  taskCanReview: boolean
  taskNote: string
  selectedTaskId: string
  tasks: TaskItem[]
  personalPoints: number
  sharedPoints: number
  selectedRewardId: string
  redeemedRewardId: string | null
  redemptionStatus: 'none' | 'pending' | 'active' | 'refunded'
  redemptionCanReview: boolean
  refundStatus: RefundStatus
  refundCanReview: boolean
  documentTitle: string
  documentBody: string
  selectedDocumentId: string
  documentGroups: DocumentGroup[]
  documents: SharedDocument[]
  unbindRequested: boolean
  unbindCanReview: boolean
  rewards: Reward[]
  redemptions: RewardRedemption[]
  ledger: LedgerEntry[]
  communityPosts: CommunityPost[]
  dailyRecords: DailyRecord[]
}

export interface ApiResult<T> {
  ok: boolean
  data: T
  message?: string
}
