const { cloud, db, collections, projectState, writeOperationLog } = require('../lib/shared')
const { assert } = require('../lib/errors')

const cleanText = (value, maxLength) => String(value || '').trim().slice(0, maxLength)

const checkProfileSafety = async (openid, content) => {
  if (!content) return
  assert(cloud.openapi?.security?.msgSecCheck, 'PROFILE_SECURITY_UNAVAILABLE', '资料安全服务暂时不可用，请稍后再试')
  try {
    const result = await cloud.openapi.security.msgSecCheck({ openid, scene: 1, version: 2, content })
    const suggest = result?.result?.suggest || result?.result?.label
    const safe = result?.errCode === 0 && (!suggest || suggest === 'pass' || suggest === 100)
    assert(safe, 'PROFILE_CONTENT_RISK', '个人资料中有不适合展示的内容，请修改后再试')
  } catch (error) {
    if (error?.code === 'PROFILE_CONTENT_RISK' || error?.code === 'PROFILE_SECURITY_UNAVAILABLE') throw error
    if (error?.errCode === 87014) assert(false, 'PROFILE_CONTENT_RISK', '个人资料中有不适合展示的内容，请修改后再试')
    assert(false, 'PROFILE_SECURITY_UNAVAILABLE', '资料安全服务暂时不可用，请稍后再试')
  }
}

const update = async ({ openid, payload }) => {
  const nickname = cleanText(payload.nickname, 24)
  assert(nickname, 'PROFILE_NAME_REQUIRED', '请填写你的用户名')

  const allowedGenders = new Set(['female', 'male', 'other', 'private'])
  const gender = allowedGenders.has(payload.gender) ? payload.gender : 'private'
  const hobbies = Array.isArray(payload.hobbies)
    ? [...new Set(payload.hobbies.map((item) => cleanText(item, 20)).filter(Boolean))].slice(0, 12)
    : []
  const region = cleanText(payload.region, 60)
  await checkProfileSafety(openid, [nickname, region, ...hobbies].join(' '))

  await db.collection(collections.users).doc(openid).update({ data: {
    nickname,
    avatarUrl: cleanText(payload.avatarUrl, 500),
    backgroundUrl: cleanText(payload.backgroundUrl, 500),
    gender,
    region,
    hobbies,
    profileCompleted: true,
    updatedAt: db.serverDate(),
  } })
  await writeOperationLog({ openid, action: 'profile.update', targetId: openid })
  return projectState(openid)
}

const updatePrivacy = async ({ openid, payload }) => {
  const source = payload && typeof payload === 'object' ? payload : {}
  const privateMode = Boolean(source.privateMode)
  const privacy = {
    searchableByCode: privateMode ? false : source.searchableByCode === true,
    showPartner: privateMode ? false : Boolean(source.showPartner),
    showRelationshipDays: privateMode ? false : Boolean(source.showRelationshipDays),
    showHeat: privateMode ? false : Boolean(source.showHeat),
    showDocumentCount: privateMode ? false : Boolean(source.showDocumentCount),
    privateMode,
  }
  const current = await db.collection(collections.users).doc(openid).get()
  const coupleId = current.data?.coupleId || ''
  await db.collection(collections.users).doc(openid).update({ data: { privacy, updatedAt: db.serverDate() } })
  if (coupleId && (!privacy.showPartner || privateMode)) {
    await db.collection(collections.communityPosts).where({ coupleId, status: db.command.in(['published', 'pending_approval']) }).update({
      data: { coupleSnapshot: { pairLabel: '两个人的日常' }, pairIdentityApproved: false, updatedAt: db.serverDate() },
    })
  }
  if (privateMode) {
    const scope = coupleId ? { coupleId, status: db.command.in(['published', 'pending_approval']) } : { authorOpenId: openid, status: db.command.in(['published', 'pending_approval']) }
    await db.collection(collections.communityPosts).where(scope).update({
      data: { status: 'couple_only', visibility: 'couple', partnerApproved: false, publishedAt: null, updatedAt: db.serverDate() },
    })
  }
  await writeOperationLog({ openid, action: 'profile.privacy.update', targetId: openid })
  return projectState(openid)
}

const updatePreferences = async ({ openid, payload }) => {
  const usageMode = payload.usageMode === 'social' ? 'social' : 'record'
  const current = await db.collection(collections.users).doc(openid).get()
  const existing = current.data || {}
  const preferences = {
    onboardingCompleted: true,
    usageMode,
    communityGuideSeen: Boolean(payload.communityGuideSeen ?? existing.preferences?.communityGuideSeen),
    taskGuideSeen: Boolean(payload.taskGuideSeen ?? existing.preferences?.taskGuideSeen),
    communityPolicyVersion: String(existing.preferences?.communityPolicyVersion || ''),
    communityPolicyAcceptedAt: existing.preferences?.communityPolicyAcceptedAt || null,
  }
  const privacy = usageMode === 'record'
    ? { searchableByCode: false, showPartner: false, showRelationshipDays: false, showHeat: false, showDocumentCount: false, privateMode: Boolean(existing.privacy?.privateMode) }
    : { ...existing.privacy, searchableByCode: true, privateMode: false }
  await db.collection(collections.users).doc(openid).update({ data: { preferences, privacy, updatedAt: db.serverDate() } })
  if (usageMode === 'record' && existing.coupleId) {
    await db.collection(collections.communityPosts).where({ coupleId: existing.coupleId, status: db.command.in(['published', 'pending_approval']) }).update({
      data: { coupleSnapshot: { pairLabel: '两个人的日常' }, pairIdentityApproved: false, updatedAt: db.serverDate() },
    })
  }
  if (usageMode === 'record' && payload.hideExistingPublic === true) {
    const scope = existing.coupleId ? { coupleId: existing.coupleId, status: 'published' } : { authorOpenId: openid, status: 'published' }
    await db.collection(collections.communityPosts).where(scope).update({
      data: { status: 'couple_only', visibility: 'couple', updatedAt: db.serverDate() },
    })
  }
  await writeOperationLog({ openid, action: 'profile.preferences.update', targetId: openid })
  return projectState(openid)
}

const switchSpace = async ({ openid, payload }) => {
  const spaceType = payload.spaceType === 'couple' ? 'couple' : 'personal'
  const current = await db.collection(collections.users).doc(openid).get()
  assert(spaceType !== 'couple' || current.data?.coupleId, 'COUPLE_REQUIRED', '请先绑定 TA，再进入情侣空间')
  await db.collection(collections.users).doc(openid).update({ data: { activeSpaceType: spaceType, updatedAt: db.serverDate() } })
  await writeOperationLog({ openid, action: 'space.switch', targetId: spaceType })
  return projectState(openid)
}

module.exports = { update, updatePrivacy, updatePreferences, switchSpace }
