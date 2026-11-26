# 日记 APK 静态逆向记录

日期：2026-10-25。目标：本次用户提供的 APK，对应 `com.chenupt.day` 1.96.62；与此前西柚 APK 分开取证。

## 证据与边界

- 分析副本：`analysis/diary/source.apk`，SHA-256 `88e98f67654f7b7ef0911dadd267d67a689d58997ae1aadc4ce5d398cbd21d7e`。
- REA 6.7.0 / JADX headless 0.7.1；复用 `analysis/xiyou/run-rea.ps1` 工具入口。未执行 APK、未登录或访问其服务。
- 完整原始 Evidence 位于 `analysis/diary/*.json`；`analysis/diary/evidence-index.json` 包含文件、完整 Evidence ID、参数、摘要、限制及源文本完整性。分析目录被忽略，APK 与反编译证据不进入产品包。
- 下文是静态观察；没有声称观察到 Android 实际运行。混淆代码、反射、动态加载和未跟进方法仍可能影响行为。REA 输出有 JADX 类型推断警告时保留在原始证据中。

## 数据模型（已回答）

`Diary` 字段实际包含：title/content/contentType、createTime/updateTime/recordTime、year/monthOfYear/dayOfMonth、weather/temperature、category/type/tag、address/city/latitude/longitude、images/localImages、audio/localAudio、draw/localDraw、color/bt、top、deleted/isHidden/isSynced、uuid/id/historyTime 等。`m` 为整数；心情的整数展示映射见下文。`top` 是 long，不能据字段名把它直接解释为收藏。

证据：`class-data.local.Diary.json`，`ev_c4f6969516aa5593a41ce9175b2cc358523af500a6c292fd6eceb8b0860bf7ae`。

`Draft` 独立实体含 uuid、content、lastContent、createTime、updateTime、shown、id。证据：`class-data.local.Draft.json`，`ev_3b3f4d982a559b50af01c38d7620ced92b0bf94d28836e70ed2169ec0d762b49`。

## 心情与天气（部分回答）

`o4.h.p(int)` 返回精确心情名：1 开心、2 生气、3 伤心、4 着急、5 得意、6 鄙视、7 暖心、8 调皮、9 惊讶、10 尴尬、11 愤怒、12 疼痛、13 劳累、14 紧张、15 闹心、16 郁闷、17 平静、18 忙碌、19 烦躁。默认返回空串。`MoodView.a` 对 -1 显示“不选择”，其余整数调用 `h.o` 图标及 `h.p` 文案。

证据：`method-o4.h-p.json`，`ev_a03c18ab9463265a0498b2cf72f33893e3cd1bb6ccce78cf321466a6a5bd67ca`；`method-record.MoodView-a.json`，`ev_5693678738babdcdcbef392565f6883c27d205fa0c110109ffffca3355dba7aa`。辅助类签名与调用相吻合；本次没有再取调用点的 DEX 引用来独立验证导入关系。

`WeatherView.a` 直接显示传入字符串，null 显示“未知”。`o4.h0.b` 的图标分支识别晴、阴，含云/雷/雨/雪/风/霾/雾/沙的字符串，以及日出、日落、冰雹、深夜，默认太阳图标。这里是图标分支覆盖范围，不等同于天气选择器完整选项集。

证据：`method-record.WeatherView-a.json`，`ev_64fc092115ef5258b33bfd11c91054d54abf3f2ad7380f760c0597c399977f5e`；`method-o4.h0-b.json`，`ev_9caa23a1d489acb3cf2b69b70bc89c7d202ac6e08a5d87b9d48bb6f826a53727`。

## 保存、编辑、草稿（已回答核心路径）

`RecordActivity.c3` 防重复保存，读取标题及正文；编辑分支设置 isSynced=false、updateTime=当前时间。写入 tag，缺失 uuid 时生成 UUID。图片按网络 URL / 本地文件路径分流，分别以 `|` 连接存入 images / localImages。正文格式由按钮选择写为 contentType 0 或 1，记录光标位置 ind。随后调用数据层 k0(Diary)，处理草稿，并写入含 uuid/content/createTime 的 History，再发布新增或编辑刷新事件。末尾还有条件同步与备份分支，本次没有执行。

证据：`method-record.RecordActivity-c3.json`，`ev_febb327a667eb2ff33fa041b38e5b2942999ba3e6e8052a180aef0ef2489fa00`。JADX 有类型推断警告；数据库调用内部、事务与磁盘错误处理未追踪。

`onBackPressed` 先判断 E2；auto_save 默认 true。关闭自动保存时有放弃/保存/取消对话框，开启时进入 c3 或 x4 保存分支。E2 同时考虑正文、图片、本地音频等，不能简化为“只允许非空正文”。x4 为媒体保存进度入口，后续 O2 尚未跟进。

`onPause` 在非完成状态、正文已变化且非空时，长度大于 2 会填充草稿 content、shown=false、uuid（原 uuid 或 new）；仅此方法不能证明立刻落盘。J3 明确弹“是否恢复当前草稿？”并提供恢复/取消。

对应 Evidence 文件：`method-record.RecordActivity-onBackPressed.json`、`-E2.json`、`-x4.json`、`-onPause.json`、`-J3.json`，完整 ID 见索引。

## 分类、标签、详情、搜索与删除（部分回答）

- 编辑器菜单有分类、历史、隐藏/锁定、Markdown、标题开关、模板等入口。分类数量到 20 时走 CategoryActivity，否则底部分类弹层。Markdown 分支存在付费能力判断；不把该判断复制为小程序业务授权。
- `ListActivity.onCreate` 读取 CATEGORY 参数、设置分类标题并载入列表 Fragment，说明存在分类列表路径。
- `DetailActivity.init` 使用 UUID 集合及 POSITION；detail_scroll 默认 true 时允许在集合内翻页，关闭时仅保留当前记录。
- `SearchActivity.onCreate` 已确认 activity_search 页面，但真正搜索谓词、分词、范围未追入。
- Diary.deleted、Recover/RecoverDao 类存在，支持“删除/恢复候选功能”的静态线索；本次未追入实际删除、恢复和彻底删除调用链，不能据此声称完全还原。
- 未确认原版“收藏”定义；产品新增收藏属于本项目适配决策，不能标为该 APK 的精确语义。

证据：`method-record.RecordActivity-onOptionsItemSelected.json`、`method-list.ListActivity-onCreate.json`、`method-detail.DetailActivity-init.json`、`method-search.SearchActivity-onCreate.json`、`classes.json`，完整 ID 见索引。

## 复刻落地建议与剩余范围

已足够支撑小程序中独立日记入口、标题正文、日期、心情、天气、分类标签、图片附件、编辑/保存/草稿恢复的核心实现。小程序采用本项目的数据存储、权限和界面，不接原应用后端。用户界面的自选图标、天气精简选项、搜索规则、收藏/回收站流程须标作适配设计。

尚未完成原版全功能还原：语音/绘图、富文本及 Markdown 全工具链、模板、历史回滚、隐藏锁定、同步/WebDAV、导出备份、搜索与删除底层规则、精确布局和运行时行为。不能将类清单或核心实现称为整个 APK 全功能复刻。
