import { CLOUD_ENV_ID, isCloudEnabled } from './config/env'

App({
  onLaunch() {
    if (isCloudEnabled() && wx.cloud) {
      wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
    }
  },
})
