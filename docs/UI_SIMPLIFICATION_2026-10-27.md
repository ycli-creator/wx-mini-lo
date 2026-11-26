# UI 走查与去卡片化优化

日期：2026-10-27。范围：微信小程序的视觉容器与层级。

## 技能安装与执行

- 已安装 `find-skills`：`vercel-labs/skills/skills/find-skills`。
- 使用 find-skills 的目录检查和 `npx skills find "ui audit"` 检索流程。
- 已安装并读取、执行 `web-design-guidelines`：Vercel 官方 `vercel-labs/agent-skills/skills/web-design-guidelines`。检索时约 78.9 万次安装；官方仓库约 3.3 万 stars。运行时获取了最新规范。
- 已有 `impeccable`，本次执行其 `distill` 流程，重点检查冗余背景、嵌套卡片、重复边框、阴影与布局层级。
- 其他检索候选：`interface-design`、`ui-ux-pro-max`；当前两项走查/简化技能已覆盖本次范围，未重复安装这些候选。
- 新安装的技能会从下一轮开始进入技能目录；本轮已直接读取安装文件并执行其流程。

来源：[find-skills](https://github.com/vercel-labs/skills/tree/main/skills/find-skills)、[web-design-guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines)、[最新界面规范](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)。

## 走查发现与修复

| 原位置 | 问题 | 调整 |
| --- | --- | --- |
| `miniprogram/app.wxss` | 通用卡片圆角达 48rpx，列表每行独立成卡；表单内部再包容器 | 通用独立表面收敛为 20rpx；列表、流水和确认行用分隔线；创建区和步骤编辑区去掉外层背景与圆角 |
| `pages/home/index.wxss` | 横幅、积分小框、功能卡、图标块叠加，入口层级近似 | 保留主横幅；积分融入横幅；功能入口用留白和分隔线，图标直接呈现；增强横幅上部遮罩以保持数字可读 |
| `pages/task/index.wxss` | 分组卡内再放独立圆角任务行；创建区嵌套模板与步骤卡 | 分组标题与任务行直接排版，分组间用留白；去掉创建区和步骤的外框；保留模板选中边框与触摸区域 |
| `components/business/lp-task-card/index.wxss` | 48rpx 卡片中又有圆角图标块和胶囊状态 | 去掉大卡外框、阴影、图标底框；保留状态、进度与点击反馈 |
| `pages/task/detail.wxss` | 详情主体、编辑区、完成记录、日历各自成卡 | 改为页面分区和分隔线；保留照片、进度、日期选中轮廓 |
| `pages/profile/index.wxss` | 空间切换入口再嵌套图标底框；伴侣信息和数据重复装框 | 改为平面信息行，保留空间切换入口和状态信息 |
| `pages/chat/index.wxss`、`pages/heat/index.wxss` | 多个列表和说明块重复圆角装框 | 改为列表分隔；保留未读色、头像和升温汇总的区别 |
| `pages/community/index.wxss` | 内容卡同时有边框、阴影和大圆角 | 保留独立媒体卡，统一为 20rpx，移除边框与阴影 |
| `components/base/lp-page-state/index.wxss` | 加载/错误状态也被装进虚线圆角卡 | 改为留白状态区，保留重试入口 |

主要规则：独立内容表面可以使用小圆角；布局分组优先使用留白、标题、对齐和分隔线；头像、进度条、主操作按钮保留其必要形状。没有删去功能、字段、状态或入口。日记及生活日历的专有页面样式未修改。

## 验证

- `npm --prefix miniprogram run verify` 通过：38 个页面、5 个主 Tab、55 个业务 Action 的结构检查、TypeScript 检查、核心流程和日记/生活日历现有测试。
- 使用 PostCSS 成功解析全部 11 个修改后的 WXSS 文件，样式语法检查通过。
- Impeccable 机械检测执行一次，结果为 `[]`。该工具对 WXSS 的覆盖有限，不等于完整视觉验收。
- 已尝试在关闭云端连接的隔离预览项目中截图。开发者工具自动化连接在读取基础库版本时失败：`Cannot read properties of undefined (reading 'split')`，尚未获得有效页面截图。
- 因此仍需在开发者工具中重新编译，检查首页“今天/常用功能”、待办展开/创建、任务详情和个人页的实际布局，尤其是长任务名称、多人进度、空状态和底部安全区。未声称完成模拟器视觉验收或真机验收。

隔离预览目录：`analysis/ui-review-20261027/preview`；其中的数据模式与本机缓存键独立于正式项目，仅用于本次视觉检查。

## 第二轮：按手机截图修正

- 先执行 Impeccable 的两项独立走查：设计审查与源码/检测证据审查。WXML 检测为 0 项，但手机截图明确显示了图标空白，因此未将检测结果视为视觉通过。
- 图标从本地 SVG CSS 遮罩改为原生 image 的 Base64 SVG，保留显式着色；生成了 53 个 PNG 回退资源，处理图片加载失败，并补齐 chat-filled 别名。
- 底部导航改为首页、待办、日常、我的。消息作为普通页面，从首页通知按钮进入。红点只表示未读，合并聊天与系统通知，返回首页重新读取；不再用红点标示选中的底部标签。
- 同步更新个人页选中索引、消息页返回、热力任务、通知卡片和分享入口的路由，避免继续把消息当作 Tab 页面。
- 首页直接展示今天与常用入口，移除额外的二级切换；压缩横幅与入口高度，移除占位留白和辅助口号。
- 清理页面说明性小字、通用副标题、开发实现说明和重复隐私提示。字段名称、真实内容、数据状态、错误恢复及必要操作后果继续保留。没有改写用户的日记正文。
- 经期助手恢复图标并补充心情/习惯名称，扩大点击区域；预测限制移至周期设置中。
- 项目根目录新增 `AGENTS.md`，持久化“避免不必要的次级标签和说明，让布局解释功能”的规则。

验证：`npm --prefix miniprogram run verify` 通过，含新增的四项导航、消息跳转、聊天与系统通知红点、已读刷新、未绑定、计数失败保留、SVG 着色和 PNG 回退测试；全部 34 个 WXSS 通过样式解析、46 个 WXML 通过标签结构检查。

视觉限制：本机开发者工具中的隔离预览仍为空白，无法据此验收手机效果。本轮采用用户提供的三张手机截图作为基线，完成源码与行为验证；尚未完成新版的手机视觉验收。
