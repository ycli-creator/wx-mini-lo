export const CLOUD_ENV_ID = ''

export const API_FUNCTION_NAME = 'api'

export const APP_VERSION = '0.4.1'

// Enable only after the diary/private/ storage rules have been verified with two users.
export const DIARY_PRIVATE_MEDIA_ENABLED = false

export const COMMUNITY_POLICY_VERSION = '2026-09-02'

type LovePointsTestRuntime = typeof globalThis & {
  __LOVE_POINTS_FORCE_LOCAL__?: boolean
}

export const isCloudEnabled = () =>
  Boolean(CLOUD_ENV_ID.trim()) && !(globalThis as LovePointsTestRuntime).__LOVE_POINTS_FORCE_LOCAL__
