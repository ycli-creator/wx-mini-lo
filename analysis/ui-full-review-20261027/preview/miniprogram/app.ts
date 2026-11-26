import { CLOUD_ENV_ID, WECHAT_APP_ID, isCloudEnabled } from './config/env'

App({
  onLaunch() {
    if (isCloudEnabled() && wx.cloud) {
      // Native Mini Programs use env; the multi-platform runtime also needs
      // the owning Mini Program's appid and its envid parameter.
      const cloudConfig = {
        appid: WECHAT_APP_ID,
        envid: CLOUD_ENV_ID,
        env: CLOUD_ENV_ID,
        traceUser: true,
      }
      wx.cloud.init(cloudConfig)
    }
  },
})
