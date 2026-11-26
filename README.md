# Love Points

兼顾个人记录与情侣协作的微信小程序：每个人拥有独立个人空间，绑定后再创建隔离的情侣空间，通过任务、积分、奖励、共同记录、生活日历和文档形成完整互动闭环。帖子只属于情侣双方，不对外公开。

## 工程内容

- `miniprogram/`：微信原生 TypeScript 小程序，共 38 个页面和 4 项自定义 Tab。
- `cloudfunctions/api/`：统一 CloudBase 云函数，负责身份、情侣空间隔离、事务与幂等。
- `cloudfunctions/database-schema.json`：31 个集合和 54 个自定义索引，包含日记及健康记录的私有集合。
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

当前流程测试额外覆盖：个人/情侣空间隔离、记录优先 onboarding、帖子恒为情侣可见、单次/重复/大任务、图片完成条件、大任务分段结算、奖励空间与受益人分类，以及一键不展示。

## 本机体验与真实双人模式

`miniprogram/config/env.ts` 中的 `CLOUD_ENV_ID` 为空时，小程序使用本机数据，适合先看页面和流程。填入已部署的 CloudBase 环境 ID 后，同一套页面会切换到真实双人同步。

开始部署前执行：

```bash
npm run verify:deployment-config
```

该检查会确认小程序 AppID 和 CloudBase 环境 ID 已替换默认占位值。

## 当前外部配置

- 本地版本为 `0.4.1`，包含日记编辑器、健康统计和日记与健康日历的心情联动。`npm run verify` 已通过。
- 2026-10-25 已部署日记和健康日历的基础接口，并创建三个私有集合和两个唯一索引。2026-11-23 已更新线上 `api`，回读确认 `diary.scope`、`diary.history` 和 `health.statistics` 已部署，日记保存、健康统计和双人隔离待真机验收。
- 有明确上传记录的体验版为 `0.4.0`。10 月 27 日有开发预览记录，最新体验版与正式发布状态待平台回读。日记云附件上传保持关闭，帖子保持纯文字。

帖子运营与历史数据处理说明见 `docs/COMMUNITY_MODERATION_RUNBOOK.md`。
