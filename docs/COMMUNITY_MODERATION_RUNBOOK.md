# 情侣帖子运营说明

> 2026-09-15 更新：已取消全部对外公开能力，帖子只属于情侣双方。原「公开同步 / 伴侣确认 / 举报审核」流程已下线，本文件替换原《社区举报处理手册》。

## 当前边界

- 帖子只写入发帖人所属的情侣空间，服务端查询恒按 `coupleId` 过滤，非本情侣成员无法读取。
- 不再存在 `pending_approval` / `published` / `rejected` / `moderated` 状态，所有帖子恒为 `couple_only`。
- 保留 `community.list / create / update / delete`；`community.review / withdraw / report` 已从路由移除，调用返回 `ACTION_NOT_FOUND`。
- 微信分享白名单已移除 `community_post`，`share.resolve` 不再对该类型豁免 `coupleId` 校验，帖子无法生成对外链接。
- 帖子仍必须通过 `security.msgSecCheck` 文字安全检查；图片与视频在内容审核能力接通前继续拒绝。

## 历史数据

- 改造前已处于 `published` 的帖子不会再出现在任何列表中（列表只查 `couple_only`）。
- 如需保留这些记录，可在 CloudBase 控制台将 `status` 批量改为 `couple_only`、`visibility` 改为 `couple`；不处理则等同于自动收回。
- `community_reports` 集合不再有新写入，历史举报记录按原保存期限处理。

## 数据与权限

- `community_posts`、`operation_logs` 保持仅管理端可读写，小程序客户端直写会被拒绝。
- 严禁从 CloudBase 导出与当前排查无关的用户数据。

## 恢复媒体发布前

必须先完成图片、视频封面、视频画面和音频内容审核，并验证审核失败、超时、回调乱序及重复回调都不会让媒体帖子进入列表。完成前不得移除当前的服务端媒体拒绝逻辑。
