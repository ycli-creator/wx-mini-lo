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
  const privacy = { searchableByCode: source.searchableByCode !== false, showPartner: Boolean(source.showPartner), showRelationshipDays: Boolean(source.showRelationshipDays), showHeat: Boolean(source.showHeat), showDocumentCount: Boolean(source.showDocumentCount) }
  await db.collection(collections.users).doc(openid).update({ data: { privacy, updatedAt: db.serverDate() } })
  await writeOperationLog({ openid, action: 'profile.privacy.update', targetId: openid })
  return projectState(openid)
}

module.exports = { update, updatePrivacy }
