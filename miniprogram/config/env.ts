export const CLOUD_ENV_ID = 'cloud1-d8grmd06k6e68e512'

export const API_FUNCTION_NAME = 'api'

export const APP_VERSION = '0.2.0'

type LovePointsTestRuntime = typeof globalThis & {
  __LOVE_POINTS_FORCE_LOCAL__?: boolean
}

export const isCloudEnabled = () =>
  Boolean(CLOUD_ENV_ID.trim()) && !(globalThis as LovePointsTestRuntime).__LOVE_POINTS_FORCE_LOCAL__
