# Love Points 工程导航（Codex / 开发者快速上手）

> 更新日期：2026-08-30
> 用途：帮助后续开发快速定位代码、判断改动范围，并沿用项目已有的业务与安全约束。产品规则以 `DEVELOPMENT_PLAN.md` 和对应功能规格为准。

## 1. 一句话架构

这是一个微信原生 TypeScript 小程序。页面只通过统一服务层读写业务；服务层根据配置切换“本机演示数据”或 CloudBase 单入口云函数；云函数再按领域路由到数据库操作。

```text
小程序页面（pages）
  -> lovePointsService（统一业务接口 + 本机实现）
    -> runAction（云端 / 本机模式切换）
      -> CloudBase api 云函数（统一 action 路由）
        -> actions/*（领域逻辑）
          -> 17 个文档数据库集合
```

仓库还包含 `web-prototype/` React/Vite 交互原型。它是视觉和流程参考，不是小程序运行时的一部分；正式功能必须落到 `miniprogram/`，涉及真实双人数据时还必须同步修改 `cloudfunctions/api/`。

## 2. 顶层目录

| 路径 | 职责 |
|---|---|
| `miniprogram/` | 微信原生小程序：29 个页面、5 个项目内组件、TDesign 依赖、本机体验数据与客户端服务层 |
| `cloudfunctions/api/` | 单入口 CloudBase 云函数，按邀请、任务、奖励、文档、解绑、资料、社区、生活记录 8 个领域拆分 |
| `cloudfunctions/database-schema.json` | 27 个集合和索引的声明式定义；包含周期任务、热力、聊天、好友、成就和关系许可集合 |
| `web-prototype/` | React/Vite 原型，用于设计和交互对照 |
| `scripts/` | 部署配置校验、数据库结构校验、部署计划和索引部署脚本 |
| `docs/` | 产品规则、增量规格、部署清单和安全说明 |

微信开发者工具应打开仓库根目录；`project.config.json` 已把小程序根目录设为 `miniprogram/`、云函数根目录设为 `cloudfunctions/`。

## 3. 客户端代码地图

### 3.1 启动与配置

- `miniprogram/app.ts`：只在启用云端模式时初始化 `wx.cloud`。
- `miniprogram/config/env.ts`：CloudBase 环境 ID、云函数名和应用版本；当前环境 ID 非空，因此默认走真实云端。
- `miniprogram/app.json`：注册 23 个页面、全局组件和 5 项自定义 Tab：首页、任务、社区、文档、我的。
- `miniprogram/styles/tokens.wxss`：设计令牌；全局样式在 `app.wxss`。

### 3.2 页面分区

| 领域 | 页面 |
|---|---|
| 进入与绑定 | `start`、`invite/create`、`invite/join`、`invite/confirm` |
| 首页与积分 | `home`、`points` |
| 任务与周期计划 | `task/index`、`task/submit`、`task/review` |
| 奖励与退款 | `reward/list`、`reward/detail`、`reward/redemption` |
| 社区 | `community/index`、`community/create` |
| 生活记录 | `records/index`、`records/edit` |
| 共享文档 | `documents/index`、`documents/edit` |
| 个人与关系 | `profile/index`、`profile/edit`、`settings`、`unbind/pending`、`unbind/confirm` |

### 3.3 组件与状态

- `components/base/lp-header`：自定义页头与二级页返回兜底。
- `components/base/lp-button`：统一按钮。
- `components/base/lp-page-state`：加载、空状态和错误状态。
- `components/business/lp-task-card`：任务卡片。
- `components/business/lp-cue-button`：向当前伴侣发送统一业务卡片。
- `custom-tab-bar/`：五项底部导航。
- `types/index.ts`：客户端共享类型，是新增字段时首先要检查的位置。
- `store/state.ts`：本机体验模式的初始数据、缓存、迁移和周期滚动逻辑。

### 3.4 服务边界

- `services/love-points.ts` 是页面唯一推荐调用的业务入口。它同时包含云端 action 参数和等价的本机实现。
- `services/client.ts` 负责调用 `api` 云函数、加载提示、只读请求重试和统一错误解析。
- 不要让页面直接写数据库，也不要在页面里复制本机/云端分支。
- 新增功能时必须保持本机与云端返回的数据形状一致，否则页面可能只在一种模式下可用。

## 4. 云端代码地图

- `cloudfunctions/api/index.js`：将 `action` 字符串分发到领域处理器，并统一返回 `{ ok, data, code?, message? }`。
- `cloudfunctions/api/lib/shared.js`：数据库实例、集合名、用户/情侣校验、状态投影、周期计算、种子数据和操作日志。
- `cloudfunctions/api/lib/errors.js`：可安全返回客户端的业务错误。
- `cloudfunctions/api/actions/*.js`：8 个领域处理器。

关键安全边界：

- 身份来自 `cloud.getWXContext().OPENID`，不能信任客户端传入的用户 ID。
- 情侣数据用 `coupleId` 隔离，并通过 `requireCouple` 验证成员关系。
- 积分、审批、兑换、退款和解绑必须由云函数处理；涉及多条记录时使用事务与幂等键。
- 社区帖子和生活记录不能依赖客户端直写；隐私过滤必须发生在服务端。
- 周期任务按 `Asia/Shanghai` 计算，模板存在 `tasks`，每个周期实例存在 `task_cycles`。

## 5. 新功能通常需要改哪些地方

### 只改展示

对应页面的 `.wxml` / `.wxss` / `.ts`，必要时调整公共组件或 `types/index.ts`。若原型也需要保持一致，再同步 `web-prototype/`。

### 新增完整业务能力

通常按以下链路成套修改：

1. `types/index.ts`：定义客户端数据形状。
2. `store/state.ts`：本机初始数据、兼容迁移和本机行为。
3. `services/love-points.ts`：公开方法、云端 action 和本机实现。
4. 页面或组件：交互与展示。
5. `cloudfunctions/api/index.js`：注册 action。
6. 对应 `actions/*.js` 与必要的 `lib/shared.js`：权限校验和服务端逻辑。
7. `database-schema.json`：集合或索引变化。
8. 两套自动化测试：`miniprogram/tests/flows.test.ts` 和 `cloudfunctions/api/tests/api.test.js`。
9. 对应规格、部署清单与版本说明。

### 新增页面

创建完整的 `.ts`、`.wxml`、`.wxss`（需要时）和 `.json` 文件，并在 `app.json` 注册。Tab 根页使用 `wx.switchTab`，普通页面使用 `wx.navigateTo`；二级页沿用 `lp-header` 的返回能力。

## 6. 验证与发布边界

根目录执行 `npm run verify`，会依次：

1. 构建 React/Vite 原型。
2. 检查小程序页面结构、TypeScript 和本机流程测试。
3. 检查云函数语法、数据库定义并运行双用户集成测试。

部署前另执行 `npm run verify:deployment-config`。数据库集合/索引和云函数部署属于外部状态变更，应在明确确认目标环境后执行；上传体验版、提交审核和正式发布是三个不同动作，不应互相默认授权。

## 7. 当前状态与已知注意点

- 当前版本号为 `0.2.0`，默认 CloudBase 环境已配置。
- V3 的统一返回、日历摘要/抽屉和每日/每周/长期计划已有本地代码与功能规格。
- 仓库说明显示线上仍需部署新增的 `task_cycles`、相关索引和新版云函数后，才能让云端完整支持周期计划；开发前应重新核对真实环境状态。
- `love-points.ts` 同时承担较多领域的本机实现。继续扩展时可按领域拆成多个 service 文件，但应保持对页面暴露的接口稳定。
- `project.config.json` 可能包含开发者工具自动生成或个人环境修改；修改前先检查工作区，不要覆盖用户本地配置。

## 8. 开发前的需求确认模板

收到新功能时，先确认这些问题：

1. 功能给自己、伴侣还是双方使用？谁能创建、查看、修改、审批和删除？
2. 数据默认私密、情侣共享还是公开？是否会泄露“存在过一条私密数据”这类侧信号？
3. 是否影响积分、审批、退款或解绑等不可逆流程？需要什么幂等和事务保证？
4. 本机体验模式是否也必须完整可用？旧缓存和旧云端数据如何迁移？
5. 是只做本地代码，还是还包括云端部署、体验版上传、审核或正式发布？
6. 验收以开发者工具、双账号真机还是自动化测试为准？

## 9. 权威文档顺序

发生冲突时建议按以下顺序判断：

1. 用户本次明确确认的需求。
2. 对应增量功能规格，例如 `FEATURE_SPEC_NAV_CALENDAR_PLANS.md`。
3. `DEVELOPMENT_PLAN.md` 中的当前产品规则和实施状态。
4. 本文档的工程导航。
5. `README.md` 的概览信息。
