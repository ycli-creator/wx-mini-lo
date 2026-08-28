# CloudBase 云函数

小程序客户端通过 `miniprogram/services/client.ts` 使用统一的 `api` 云函数入口，服务端实现位于 `cloudfunctions/api`。

当前服务端已实现：

- OpenID 身份、情侣空间成员校验与数据隔离。
- 个人资料、邀请、任务、积分、奖励、退款、文档锁、情侣社区、生活日历和双向解绑 Action。
- 每日、每周、长期计划的周期生成与结算；任务审批、兑换和退款事务，以及不可变积分流水。
- 兑换幂等键和重复审批状态保护。
- 双用户内存数据库集成测试。
- 社区帖子双方确认、跨情侣公开读取、生活记录隐私隔离与解绑清理测试。
- 云函数超时设置为 20 秒，给首次冷启动和双方确认后的分批解绑清理留出余量。

部署前仍需：

1. 使用 `database-schema.json` 创建集合和复合索引，并将集合权限设为禁止客户端直读直写。
2. 部署 `api` 云函数。
3. 将 CloudBase 环境 ID 填入 `miniprogram/config/env.ts`。
4. 使用两台微信真机完成一次完整验收。

根目录执行 `npm run plan:cloudbase` 可把 `database-schema.json` 转成微信开发者工具结构接口使用的 `CreateIndexes` 计划；环境 ID 必须来自实际环境查询，不允许猜测。集合创建后仍需在控制台把权限模式统一设为“仅管理端可读写”。

本地验证：

```bash
cd cloudfunctions/api
npm install
npm run verify
```

依赖审计的已知限制与风险缓解见 `docs/SECURITY_NOTES.md`。
