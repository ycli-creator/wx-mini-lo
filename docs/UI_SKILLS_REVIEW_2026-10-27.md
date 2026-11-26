# UI skill 安装与页面调整

## 安装来源

根据用户图片中的名称及仓库星数线索核对。星数随时间变化，属于仓库而非单个 skill，不作为质量保证。

| 图片名称 | 来源 | 本机状态 |
| --- | --- | --- |
| frontend-design-direction | https://github.com/affaan-m/ecc/tree/main/skills/frontend-design-direction | 本轮安装 |
| frontend-design | https://github.com/anthropics/skills/tree/main/skills/frontend-design | 本轮安装 |
| UI/UX Pro Max | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/main/.claude/skills/ui-ux-pro-max | 本轮安装，搜索脚本可运行 |
| design-review | https://github.com/garrytan/gstack/tree/main/design-review | 本轮安装 skill 文件；完整自动流程仍依赖 gstack 运行环境 |
| shadcn | https://github.com/shadcn-ui/ui/tree/main/skills/shadcn | 本轮安装；适用 Web 组件，不用于本项目 WXML 改造 |
| frontend-ui-engineering | https://github.com/addyosmani/agent-skills/tree/main/skills/frontend-ui-engineering | 本轮安装 |
| reference-design-contract | https://github.com/nexu-io/open-design/tree/main/skills/reference-design-contract | 本轮安装 |
| Taste Skill | https://github.com/Leonxlnx/taste-skill/tree/main/skills/taste-skill | 本轮安装为 taste-skill-original，保留已有不同发行版 |
| Impeccable | https://github.com/pbakaus/impeccable | 原有 impeccable 4.0.4，继续使用 |
| emil-design-eng | https://github.com/emilkowalski/skills/tree/main/skills/emil-design-eng | 本轮安装 |

安装目录：`C:/Users/yy/.codex/skills/`。新增 skill 从下一轮对话起可被自动发现。本轮直接读取了相关文件。

本轮主要应用 Impeccable 的 polish 工作流、小程序开发规范，并参考 frontend-ui-engineering 的状态与导航原则、UI/UX Pro Max 的正文可读性指导。未调用需要额外运行环境的 gstack 工作流。未向外部服务发送项目内容。

## 本轮范围与决策

保留现有暖色、图片封面、图标和四项主导航，修改微信原生小程序。保留进入本轮前已经存在的未提交修改；未发布、未上传体验版。

- 首页：缩短封面，去掉重复的封面积分展示，工具集中为一组。入口“写日记”改为与实际打开的日记列表一致的“日记”。
- 首页行动：优先待我确认，其次今天需要自己完成的任务，再到其他需要自己处理的任务。排除过期周期、已完成任务和已完成自己部分的双方任务；项目全部环节完成后保留最终结算入口。标题随实际任务变为“待我确认”“今天待办”或“接下来”。热力放在任务之后。
- 首页空状态：改为“暂无待处理事项 / 查看待办”，避免已有其他状态任务时误报没有待办，或将列表入口误标成直接添加。
- 心愿：修正待办内商店只显示个人余额的问题，按当前空间展示个人或情侣积分。
- 日常：双列标题封面改为单列时间流。标题只显示一次，正文完整显示并保留换行；保留图片预览、视频、编辑和删除。取消每条重复的可见性徽标。保留当前情侣归属过滤。
- 未绑定：日常入口可直接进入邀请流程，避免只有“我知道了”的无后续弹窗。
- 我的：新增顶栏设置按钮，删除“当前工作空间”重复标签，合并统计容器；动态空状态可发布或绑定。修复使用 navigateTo 打开主 Tab 日常导致跳转失败的问题。

## 验证

- `npm --prefix miniprogram run verify` 通过：38 个页面结构、TypeScript 和全部现有流程测试。
- 新增 `miniprogram/tests/ui-display.test.cjs` 并纳入 verify，覆盖首页排序、过期周期、双方任务、项目结算、日常归属过滤与时间顺序、加载失败、主 Tab 跳转及绑定入口。
- 微信开发者工具 Nightly 中实际查看首页、待办、日常和我的；日常正文、设置图标、首页密度正常。调试器显示 0 个错误，存在开发工具的性能及热重载提示。
- 原自动化连接未能返回页面状态，改用 Computer Use 检查真实模拟器窗口；没有把预览二维码误作页面截图。
- 未覆盖双人真机或上传后的体验版验收。
