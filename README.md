# Love Points

兼顾个人记录与情侣协作的微信小程序：每个人拥有独立个人空间，绑定后再创建隔离的情侣空间，通过任务、积分、奖励、社区、生活日历和文档形成完整互动闭环。

## 工程内容

- `miniprogram/`：微信原生 TypeScript 小程序，共 32 个页面和 5 项自定义 Tab。
- `cloudfunctions/api/`：统一 CloudBase 云函数，负责身份、情侣空间隔离、事务与幂等。
- `cloudfunctions/database-schema.json`：28 个集合及复合索引定义；包括周期计划、情侣热力、聊天消息、社区举报、好友、成就和关系许可。
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

当前流程测试额外覆盖：个人/情侣空间隔离、记录优先 onboarding、帖子默认情侣可见与公开审批、单次/重复/大任务、图片完成条件、大任务分段结算、奖励空间与受益人分类，以及一键不展示。

## 本机体验与真实双人模式

`miniprogram/config/env.ts` 中的 `CLOUD_ENV_ID` 为空时，小程序使用本机数据，适合先看页面和流程。填入已部署的 CloudBase 环境 ID 后，同一套页面会切换到真实双人同步。

开始部署前执行：

```bash
npm run verify:deployment-config
```

该检查会确认小程序 AppID 和 CloudBase 环境 ID 已替换默认占位值。

## 当前外部配置

代码、自动化测试、个人小程序 AppID、微信开发者工具和免费 CloudBase 环境均已完成。线上数据库当前仍为上一版 27 个集合、49 个自定义索引；本地社区治理版已扩展为 28 个集合、52 个自定义索引，尚未部署。已上线云函数状态为 Active、超时 20 秒，上一版真实 `home.summary`、`community.list`、`records.list` 和 `task.list` 调用均已通过。

当前体验版为 `0.3.0`，包含双方每日待办、操作留痕、任务与步骤照片、帖子编辑及界面间距优化。本地版本已补齐社区纯文字安全发布、协议确认、举报、共同撤回、作者删除、双方隐私联动和解绑撤回；这些治理改动尚未部署。本项目未提交审核，也未正式发布，恢复社区图片/视频前仍需接通媒体内容审核。

社区举报上线后的人工处理步骤见 `docs/COMMUNITY_MODERATION_RUNBOOK.md`。
