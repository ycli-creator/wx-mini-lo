# Love Points

供情侣使用的微信小程序：通过任务、双方审批、个人/共同积分、奖励商店、情侣社区、生活日历和共享文档形成完整互动闭环。

## 工程内容

- `miniprogram/`：微信原生 TypeScript 小程序，共 23 个页面和 5 项自定义 Tab。
- `cloudfunctions/api/`：统一 CloudBase 云函数，负责身份、情侣空间隔离、事务与幂等。
- `cloudfunctions/database-schema.json`：17 个集合及复合索引定义；周期计划使用独立的 `task_cycles` 集合。
- `web-prototype/`：与设计稿对应的 React/Vite 可交互原型。
- `docs/DEVELOPMENT_PLAN.md`：产品规则、技术方案和实施状态。
- `docs/DEPLOYMENT_CHECKLIST.md`：微信开发者工具、云环境与双人真机验收步骤。
- `docs/SECURITY_NOTES.md`：权限、事务、依赖审计和部署安全说明。

## 本地验证

各子工程已安装依赖时，在仓库根目录执行：

```bash
npm run verify
```

它会依次构建 Web 原型，检查小程序结构和 TypeScript，执行本机流程测试，再执行云函数的双用户集成测试。

## 本机体验与真实双人模式

`miniprogram/config/env.ts` 中的 `CLOUD_ENV_ID` 为空时，小程序使用本机数据，适合先看页面和流程。填入已部署的 CloudBase 环境 ID 后，同一套页面会切换到真实双人同步。

开始部署前执行：

```bash
npm run verify:deployment-config
```

该检查会确认小程序 AppID 和 CloudBase 环境 ID 已替换默认占位值。

## 当前外部配置

代码、自动化测试、个人小程序 AppID、微信开发者工具预览和免费 CloudBase 环境均已完成。线上 V2 的 16 个集合、32 个自定义索引与 `api` 云函数已部署，云函数状态为 Active、超时 20 秒。真实 `home.summary`、`community.list` 和 `records.list` 调用均已通过。V2 新增的 `community_posts` 与 `daily_records` 已改为 `ADMINONLY`；权限回读成功，小程序客户端直写均以 `DATABASE_PERMISSION_DENIED` 被拒绝。当前代码中的周期计划会把本地结构扩展为 17 个集合、35 个自定义索引，发布前需部署新增的 `task_cycles` 集合、索引和新版云函数。

当前线上体验版为 `0.2.0`，新增首次个人资料、个人页、任务页内奖励商店、公开情侣社区、伴侣共同确认发布、图片/视频/纯文字帖子，以及带隐私选项的情绪、事件和经期日历。本次仅上传体验版，未提交审核，也未正式发布。
