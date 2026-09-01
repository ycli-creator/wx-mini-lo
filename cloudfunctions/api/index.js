const { cloud, ensureUser, projectState } = require('./lib/shared')
const { ApiError } = require('./lib/errors')
const invite = require('./actions/invite')
const task = require('./actions/task')
const reward = require('./actions/reward')
const documents = require('./actions/documents')
const unbind = require('./actions/unbind')
const profile = require('./actions/profile')
const community = require('./actions/community')
const records = require('./actions/records')
const heat = require('./actions/heat')
const chat = require('./actions/chat')
const share = require('./actions/share')
const notifications = require('./actions/notifications')
const social = require('./actions/social')
const relationship = require('./actions/relationship')
const achievements = require('./actions/achievements')

const routes = {
  'auth.login': async ({ openid }) => projectState(openid),
  'home.summary': async ({ openid }) => projectState(openid),
  'points.summary': async ({ openid }) => projectState(openid),
  'points.ledger': async ({ openid }) => projectState(openid),
  'profile.update': profile.update,
  'profile.privacy.update': profile.updatePrivacy,
  'profile.preferences.update': profile.updatePreferences,
  'space.switch': profile.switchSpace,

  'community.list': community.list,
  'community.create': community.create,
  'community.review': community.review,

  'records.list': records.list,
  'records.save': records.save,
  'records.delete': records.remove,
  'heat.summary': heat.summary,
  'heat.checkin': heat.checkin,
  'chat.list': chat.list,
  'chat.unread': chat.unread,
  'chat.send': chat.send,
  'chat.cue': chat.cue,
  'chat.open': chat.open,
  'share.create': share.create,
  'share.resolve': share.resolve,
  'notifications.list': notifications.list,
  'notifications.read': notifications.read,
  'friends.search': social.search,
  'friends.request': social.request,
  'friends.list': social.list,
  'friends.review': social.review,
  'relationship.list': relationship.list,
  'relationship.request': relationship.request,
  'relationship.review': relationship.review,
  'relationship.public.revoke': relationship.revokePublic,
  'achievements.list': achievements.list,

  'invite.create': invite.create,
  'invite.apply': invite.apply,
  'invite.review': invite.review,
  'invite.pending': invite.pending,
  'invite.status': invite.status,

  'task.list': task.list,
  'task.create': task.create,
  'task.update': task.update,
  'task.media.add': task.addMedia,
  'task.submit': task.submit,
  'task.review': task.review,
  'task.project.step.complete': task.completeProjectStep,
  'task.project.complete': task.completeProject,

  'reward.list': reward.list,
  'reward.create': reward.create,
  'reward.redeem': reward.redeem,
  'reward.redeem.review': reward.reviewRedemption,
  'reward.refund.request': reward.requestRefund,
  'reward.refund.review': reward.reviewRefund,

  'documents.list': documents.list,
  'documents.detail': documents.detail,
  'documents.groups': documents.list,
  'documents.groups.create': documents.createGroup,
  'documents.lock': documents.lock,
  'documents.unlock': documents.unlock,
  'documents.save': documents.save,

  'unbind.request': unbind.request,
  'unbind.cancel': unbind.cancel,
  'unbind.review': unbind.review,
}

exports.main = async (event) => {
  const action = String(event?.action || '')
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {}
  const { OPENID: openid } = cloud.getWXContext()
  try {
    await ensureUser(openid)
    const handler = routes[action]
    if (!handler) throw new ApiError('ACTION_NOT_FOUND', `不支持的操作：${action || '空'}`)
    const data = await handler({ openid, payload })
    return { ok: true, data }
  } catch (error) {
    const isKnown = error instanceof ApiError
    if (!isKnown) {
      console.error('Love Points API error', {
        action,
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
    return {
      ok: false,
      data: null,
      code: isKnown ? error.code : 'INTERNAL_ERROR',
      message: isKnown ? error.message : '服务暂时不可用，请稍后重试',
    }
  }
}
