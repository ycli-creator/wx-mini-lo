# 社区举报处理手册

## 上线边界

- 当前社区只允许纯文字帖子。客户端入口和服务端接口都会拒绝图片、视频。
- 帖子必须通过文字安全检查、发布人主动选择公开、当前版社区规范确认和伴侣指定版本确认后，才可公开。
- 微信公众平台隐私保护指引未配置完成前，不提交正式审核。

## 每日处理

1. 在 CloudBase 数据库查看 `community_reports`，按 `status = pending`、`createdAt` 升序处理。
2. 对照 `postId` 查看 `community_posts` 当前内容，并参考举报时保存的 `postSnapshot`，避免帖子修改导致证据丢失。
3. 明显涉及违法、色情、暴力威胁、隐私泄露或诈骗的内容应先下架，再复核；其他争议内容先人工判断。
4. 建议普通举报 24 小时内处理，高风险举报尽快处理。

## 处理字段

处理后更新对应 `community_reports`：

- `status`: `resolved`（举报成立）或 `dismissed`（举报不成立）
- `resolution`: 简短处理说明
- `handledAt`: 处理时间
- `handler`: 处理人员标识，不填写姓名、手机号等敏感信息

举报成立时，将对应 `community_posts` 更新为：

- `deleted: true`
- `status: moderated`
- `visibility: couple`
- `publishedAt: null`
- `moderatedAt`: 处理时间
- `moderationReason`: 不超过 200 字的内部原因

同时在 `operation_logs` 留下 `community.moderate.remove` 记录。恢复误下架内容时只恢复为 `couple_only`，不得自动重新公开，必须重新经过双方确认。

## 数据与权限

- `community_reports`、`community_posts` 和 `operation_logs` 均保持仅管理端可读写。
- 不向举报人展示作者 OpenID、情侣空间 ID 或内部处理备注。
- 举报记录按运营和合规所需期限保存；到期删除前先确认不存在未完成的申诉、投诉或法定义务。
- 严禁从 CloudBase 导出与当前举报无关的用户数据。

## 恢复媒体发布前

必须先完成图片、视频封面、视频画面和音频内容审核，并验证审核失败、超时、回调乱序及重复回调都不会让媒体帖子进入公开 Feed。完成前不得移除当前的服务端媒体拒绝逻辑。
