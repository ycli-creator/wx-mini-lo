# 西柚 2.2.5 日历与当天记录：逆向分析报告

分析日期：2026-10-24。范围以 [XIYOU_CALENDAR_SCOPE.md](XIYOU_CALENDAR_SCOPE.md) 为准。

本次已完成该范围的 **APK 静态逆向**：从主页入口追到日历面板、具体记录选项、修改与保存路径、周期参数及预测计算。结论可用于实现小程序；尚未完成原版 Android 运行验收，不能将反编译结果等同于真机操作结果。本次只新增分析产物和更新文档，没有修改小程序业务代码。

## 1. 目标与证据

|项目|值|
|---|---|
|包名|`com.menstrual.menstrualcycle`|
|包内版本|`2.2.5 / versionCode 36`|
|目标文件|`analysis/xiyou/xiyou-source.apk`，49,024,308 字节|
|APK SHA-256|`eda0a7467313caaa53e895585d6db20de546ca82661ed39b3bbf555723d3fb5d`|
|分析工具|REA 6.7.0；现有 jadx-headless-mcp 0.7.1；便携 JDK 21|
|JADX JAR SHA-256|`6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`|
|执行边界|读取本地 APK；没有安装、启动 APK 或调用其线上服务|

证据分两类：`rea-*.json` 是完整 REA Evidence；`com.*.java`、解码 XML 和提取的 assets 是同一 JAR 的定点辅助分析。辅助 API 自报版本为 `dev`，不冒充 REA Evidence，也不将 Java 伪代码当作原始源码。类名可能由反编译器去混淆，原始类选择器和 DEX 方法描述以 REA JSON 为准。

完整索引：[evidence-index.json](../analysis/xiyou/evidence-index.json)。其中记录目标与工具身份、各文件 SHA-256、REA ID、方法文本是否完整及限制。索引检查通过；旧的空文件 `rea-HabitView-class.json` 明确排除，新的习惯证据另存。原 APK、工具和反编译文本继续保存在 Git 排除的分析目录。

## 2. 页面入口与实际开放的记录项

已经连通的默认调用链：

```text
HomeFragment.initViewPager
  → CalendarFragment
  → initCalendarPanelView / initPanelHelper
  → panel.H
  → J.c().q（panel.json 的 110 配置）
  → panel_item.json 映射 type → className
  → 创建记录行，绑定所选日期的 CalendarModel，fillData 回显
```

关键区别：`H.a(ViewGroup,List,CalendarModel)` 实际遍历 `k()` 返回的 `q`，没有使用传入的其他模式列表。不能把资源包里全部孕育、体温、睡眠等组件都当作这个日历的功能。

|默认顺序|面板 ID|实际类|显示条件|
|---|---:|---|---|
|1|1|`YimaView`|经期开始／结束|
|2|24|`FlowView`|记录区判断为经期时显示|
|3|23|`TongjingView`|记录区判断为经期时显示|
|4|2|`LoveView`|还受用户配置、年龄与既有记录控制|
|5|5|`MoodView`|五项心情|
|6|9|`HabitView`|普通模式五项习惯|

`J.f()` 优先读设备保存的 `panel_order`，为空才使用包内 `assets/panel.json`。上表是包内默认配置；未读取用户手机上的覆盖值。

点击日期由 `CalendarView` 回调 `activity.M.b(...)` 到 `CalendarFragment.handleClickItem(...)`，更新 `calendarClicked`，将所选日模型传给 `H.a(CalendarModel)`。每行重新绑定 record 并回显，证实记录主体常驻月历下方。月份切换使用 ViewPager，返回今天走 `switchToToday()`。

**未来日期**：父面板用日期差判断 `selected > today`，将记录 ScrollView 隐藏，显示预测说明区。因此未来日可以查看预测，普通记录行不能直接编辑。这是 UI 限制，不是已验证的服务器写入限制。

来源：E01、E02、E03；辅助 `mood-habits/H.java、J.java、I.java、panel.json、panel_item.json`，`calendar/CalendarFragment.java、util.g.java`，`prediction/activity.M.java`（实际文件名含完整包名）。

## 3. 经期起止、补记与修正

### 3.1 数据与状态

原版把经期区间和每日记录分开。`MenstrualModel` 保存开始、结束日期；`db.b` 的表字段为 `calendar_start / calendar_end`。每日流量和痛经属于 `CalendarRecordModel`。

创建经期时，`YimaView.i()` 先写入 `[所选日, 所选日 + 经期天数 − 1]`，所以“已有结束日期”不代表用户手动确认结束。`is_end_set` 另行记录最近经期是否确认结束。开始规范到 00:00、结束到 23:59；模型初始化没有统一清掉所有秒和毫秒。

`MenstrualManager.a(CalendarModel)` 在经期状态内区分开始日 `-1`、结束日 `1`、中间日 `0`，同日开始结束为 `-100`。

|所选日期|普通分支的行文案与开关|操作后果|
|---|---|---|
|已记录开始日|“大姨妈开始”，开|关闭进入起点删除路径，连同该区间关联修正逻辑执行|
|已记录经期内部|“大姨妈结束”，关|开启把所选日写为结束日，并触发刷新／同步调度|
|已确认结束日|“大姨妈结束”，开|关闭进入取消结束逻辑；主要支持最近一段，历史结束日可能仅给操作提示|
|已有区间之后且距结束不超过 5 天|通常显示“结束”，关|可延后上一段的结束；仍受周期长度等条件限制|
|远离已有区间|“开始”，关|新建一段，按经期天数生成暂定终点|
|下一段之前或两段之间|根据间距选择分支|新建、提前下一段开始、延长上一段结束，或提示记录过密／经期过长|

状态转换入口为 `ua.onSwitchButtonCheck → YimaView.t()/s()`；不是一个简单的全局布尔开关。首次无真实列表的特殊分支有“首次月经记录不能删除”提示，不能推导为所有首条实际记录都禁止删除。

### 3.2 临近区间的规则

关键阈值 `YimaView.f28065c = 5`。令 `x` 为补记日，前一段为 `[Pstart,Pend]`，后一段为 `[Nstart,Nend]`，`C` 为有效周期长度，`D` 为经期天数：

- 只有前一段：若 `x−Pend ≤ 5` 且 `x−Pstart < C`，延长前一段结束；距前一段结束超过 5 天，进入新建。
- 只有后一段：先判断新建的间隔条件 `(Nend−x)−D−(Nend−Nstart) ≥ 5`；否则若 `Nend−x ≤ C−1`，提前后一段开始；再否则提示过长。
- 两段都有：先判断是否足够远以新建；提前下一段开始的部分分支有明确的确认对话框；若 `x−Pend ≤ 5` 且 `Nstart−x ≤ 5`，提示“记录过于频繁，请修改临近经期后再标记”。分支先后顺序见保留的 `YimaView.a(MenstrualModel,MenstrualModel)`。
- 取消最近结束会重新构造暂定终点：尚在默认天数内时按 `start + D−1`；已经超过默认天数时可延至今天。它不是始终将结束日期置空。

原版已有清理受影响日明细的调用，但 `RecordManager.b(Calendar,Calendar)` 还判断旧症状字段和流量／痛经值；不能宣称每次改起止都会完整清掉区间外数据。`-100` 同日起止状态也未在本次所读开关显示／点击分支中被显式处理。这两点作为实现时需独立设计和测试的边界，不复制潜在缺陷。

来源：E04；`calendar/YimaView.java、ua.java、Ca.java、Ba.java、Ea.java、na.java、la.java、ra.java、ta.java、va.java、mananger.j.java、mananger.s.java、MenstrualModel.java、db.b.java`；`prediction/panel.sa.java`。

## 4. 流量与痛经：确认为五档

|档位|流量文案|内部 mMenstrual|上传 menstrual_volume|痛经文案|内部／上传 dysmenorrhea_level|
|---:|---|---:|---:|---|---:|
|1|月经量很少|0|1|基本无痛感|1|
|2|月经量较少|1|2|轻微间歇痛|2|
|3|月经量适中|2|3|中度间歇痛|3|
|4|月经量较多|3|4|重度持续痛|4|
|5|月经量很多|4|5|剧烈痛|5|

这两行以连续点亮 1～N 个图标表达一个等级，不是五个独立选项。再次点击当前最高档取消：流量回到内部 `-1`／上传 `0`；痛经点击取消写 `0`。痛经模型初始或 clear 还有 `-2`，历史兼容还有其他哨兵值，不能将所有非正值强行解释为“无痛”。“基本无痛感”是明确记录的第 1 档。

显示门槛为 `status == 2 && !isAfterLatestMenstrual`；选择预测经期不能直接写流量和痛经。

来源：`calendar/FlowView.java、TongjingView.java`，`mood-habits/BasePanelView.java、CalendarRecordModel.java、res_values_strings.xml`，`prediction/DysmenorrheaModel.java`。

## 5. 亲密记录

### 字段、次数与入口

点加号 → `LoveView.a(-1)` → `LoveAddDialog`。同一天最多 **20 条**；已有 20 条时仍可编辑已有项。每次保存一条，没有独立“次数”输入框。

|字段|界面／值|证据|
|---|---|---|
|时间|小时 00–23、分钟 00–59，保存 `HH:mm`|LoveAddDialog.c、dialog.U.onClick|
|措施|单选：无措施 `1`、避孕套 `2`、避孕药 `4`、其他措施 `8`|LoveModel、LoveAddDialog.onClick|
|新建默认|无措施；通常当前时间减 30 分钟，00:00–00:30 保留当前时间|LoveAddDialog 构造与 a()|
|未选择措施|确认按钮禁用|LoveAddDialog.b()|
|日归属|外层 record 的选中日期|LoveView.recordModel → CalendarRecordModel|

“其他措施”不能因旧常量 `SEX_VITRO` 或上传字段名而擅自改成“体外”。UI 和模型明确给出上述四项。

### 编辑、删除和保存

- 点击标题或记录图标区打开当天列表；无记录时给添加提示。列表按时间比较器排序，同分钟比较器没有稳定的相等处理，不能承诺同分钟的固定顺序。
- 点列表项 → `dialog.da` → `LoveView.a(index)` 编辑。确认后移除旧对象、加入新对象。
- 列表删除按钮 → `dialog.ja` 移除该项，发送事件 `1000`；关闭列表也发送该事件。LoveView 收到后更新列表、保存并刷新。
- 在列表外新增直接保存；列表内新增／编辑在列表关闭等事件中提交。列表关闭按钮不是“放弃全部修改”。
- 代码还存在亲密开关清空整日列表的路径；本次截图要求的是加号主入口，是否展示该开关须以实际布局／运行状态为准。

本地 `multi_love` 保存 LoveModel 列表 JSON；上传 `multiple_times_love` 使用 LoveUploadModel，字段包括 `time` 及四个布尔措施字段。**`is_safety_measure=true` 在这个包里对应“无措施”**，命名具有误导性。旧的 `love_times` 不等于当前列表条数，重建时应直接以结构化记录条数计算。

`dialog.U` 新建对象的 Calendar 取操作当天，而外层 record 取所选日；上传项只带时间，由外层 `date` 提供日期。补记时不能直接把内层 Calendar 当作真实发生日期。新实现应使用明确的“选中日＋时间”。

`LoveView.b()` 的可见性还受配置 `LOVE_KEY`、年龄和既有记录影响，不能说所有用户默认都显示此行。

来源：E05；`intimacy/LoveView.java、LoveModel.java、LoveAddDialog.java、dialog.U.java、dialog.ka.java、dialog.da.java、dialog.ja.java、dialog.ea.java、panel.D.java、period.base.d.y.java`；`prediction/LoveUploadModel.java、db.h.java`。

## 6. 心情与好习惯

### 心情

顺序为 **超开心、开心、还行、不开心、伤心**，对应数组索引 0～4。五项各自累计，同日可共存；**每项最多 99 次**。再次点击继续加一，不是取消或替换。

保存字段 `moods` 是长度 5 的数组，每项为 `{ "HH:mm": 次数 }`。分钟来自操作时刻；日期来自外层所选日。回显对各 Map 求和。`mHappy/mKiss/mNormal/mAngry/mCry` 是派生汇总，不能当作同名上传字段。

长按回调传 `false` 执行减一：优先减当前分钟桶，否则取 Map 迭代末项。Map 不是按时间有序，不能称为“撤销最近一次”。同时 `onLongClick` 返回 false，手势抬起后是否再触发 click 需真机验证。小程序应实现能明确净减一的撤销操作。

### 好习惯

|顺序|普通日历选项|habit 位值|行为|
|---:|---|---:|---|
|1|吃早饭|1|点选／再次点取消|
|2|吃水果|2|同上|
|3|多喝水|4|同上|
|4|运动|8|同上|
|5|排便|16|同上|

它们是五个独立布尔打卡，**不累计杯数或次数**。全选位图为 31。共用模型还有钙片、散步；不纳入本次普通日历范围。怀孕分支会以散步替换运动，这不证明普通界面有第六项。

来源：E06～E09。完整子报告：[心情与好习惯](../analysis/xiyou/mood-habits/findings.md)。

## 7. 周期设置、月历预测与顶部文案

以下描述的是程序规则，不是对预测准确性的验证。

### 参数来源

- 原版手动设置：周期长度选择 **15～100 天**，经期长度选择 **2～14 天**。存储键为 `period_circle / period_duration`，缺省分别 **30／5**；值 ≤1 时回退缺省。
- 月历的有效周期 `C` 来自 `MenstrualManager.s → listener.a.getMenstrualCircle → CalendarRouterMainImpl.getMenstrualCicleImpl(true)`。启用智能分支时，优先正的临时周期，其次平均周期，最后才回到手动设置。经期天数 `D` 从 duration 取得。
- `js.g.m()` 的智能开关默认关闭，但服务器配置可改变开关并下载替换脚本。没有读取运行设备的配置、缓存或远端版本，所以不能把默认参数当作每个用户的实际参数。
- 包内 `assets/avgPeroid_android.html` 已取出：它从足够的交替起止记录取 10 个开始日、算 9 个间隔，比较近 4 个均值、中位值及去两端后的 7 个均值与手动周期；三者偏差都 >5 时返回中位值，否则返回 0，由上层回退。这里保留了 JS 默认 sort、日期构造和记录数量边界的原始实现，未执行该脚本，也未验证异常输入。不能将其改写成“简单取历史平均”。

### 月历分类

`util.g.b(Context,Calendar)` 在本地计算每个日期的状态：空白格 `-1`，没有经期资料 `-2`，普通日 `0`，易孕期 `1`，经期 `2`，排卵日 `3`。预测经期和实际经期共享状态 2，还需结合真实区间、日期与 `futureStatus` 区分。

普通、有效数据且未进入过期修正分支时，设周期起点 `S`、有效周期 `C`、经期天数 `D`：

```text
预测下次开始 N = S + C
预测经期范围 = N … N + D - 1
预计排卵日 O = N - 14
预计易孕窗口 = O - 5 … O + 4（两端包含，O 单独标为排卵日）
```

已有历史区间优先按实际范围标经期；历史空档中的排卵窗口会参照之后一段真实开始日。未来日使用日差对 C 取余。若最近起点距今天已经超过 C，月历会将计算锚点改为“今天 − C”；因此长期漏记时不是永远从旧起点机械平移。孕育相关修正分支保留为范围外逻辑。

实际／预测背景的反编译绘制分支出现重复代码警告，故本报告确认分类数据与预测边界，不承诺最终颜色叠加、像素和触摸效果完全还原。

### 顶部状态

绘制所选日 → `CalendarView.CallBack` → `activity.M.a(model,latestPeriod)` → `util.w.b/a`。已找到截图“预计 N 天后经期开始”的实际生成位置。

- 选中今天且为普通日：由最近区间起点与周期长度计算“预计 N 天后经期开始”。
- 今天处于已记录经期：显示“经期第 N 天”；预测起止边界有“预测今天经期开始／结束”分支。
- 延迟时副标题可显示“推迟了 N 天”。
- 选中其他日期：通常显示今天／昨天／明天、星期或年月；没有经期资料时回退日期文字，不是一定弹设置。

**顶部与网格参数不完全同源**：`util.w.d/e` 直接读手动 30／5 缺省设置；网格可用智能有效周期。原版可能出现两处口径差异。小程序建议共用一个预测结果，避免机械复制这种差异。

来源：E10；`prediction/CalendarRouterMainImpl.java、listener.a.java、PeriodSettingFragment.java、dialog.k.java、account.d.a.java、mananger.js.g/h/d/e.java、avgPeroid_android.html、activity.M.java、util.w.java、CalendarView.java`；`calendar/util.g.java、mananger.j.java`。

## 8. 保存、回显与实现字段表

普通记录链：`BasePanelView.updateRecord → panel.f.onExcute → CalendarController.j() → RecordManager.a(record)`。按日期查找记录，有内容则插入或更新；整日没有任何记录时删除。随后标记日期待同步。数据库字段写入和读取已追踪到 `db.h`，但没有据此宣称线上同步成功。

|业务|原版保存表达|小程序实现建议（设计，不是原版字段）|
|---|---|---|
|日归属|record.calendar；上传 date|固定日历日期 `YYYY-MM-DD`，统一时区口径|
|经期区间|独立起止表＋is_end_set；上传日边界布尔|独立区间，显式区分实际结束与暂定结束|
|流量|DB period，上传 menstrual_volume|可空的 1～5 档，转换原哨兵值|
|痛经|DB menalgia 等，上传 dysmenorrhea_level|可空的 1～5 档，区分未记与第 1 档|
|亲密|DB multi_love，上传 multiple_times_love|有稳定 ID 的事件数组，选中日＋HH:mm＋措施枚举|
|心情|DB moods_record，上传 moods|五项计数；若需逐次撤销，用稳定 ID 的事件而非 HashMap 末项|
|习惯|DB usr_habit，上传 habit|五个布尔值；接口可避免位图耦合|
|预测|周期设置、历史区间和客户端计算|独立派生结果，带实际／预测标识，不生成虚构实录|

实现沿用既定范围：月历下方常驻当天面板；同步更新本机模式、服务层和云函数；健康主档归本人持有、默认私密；旧单日经期记录不自动拼成完整周期；查询按日期范围分页。以上是对 Love Points 的设计约束，不冒充西柚实现。

## 9. 完成度与仍需运行验证的项目

|问题|本次结论|
|---|---|
|截图对应入口、实际面板配置|静态已回答，包含本地配置覆盖边界|
|经期开关、补记、提前／延后、删除与取消结束|静态已回答，列明同日起止及清理分支异常|
|流量／痛经具体选项与取消|静态已回答，五档与哨兵值已区分|
|亲密新增／查看／编辑／删除、时间、措施和上限|静态已回答，保存事件与日期归属已追踪|
|心情累计、习惯勾选、保存与回显|静态已回答；心情长按完整手势未验证|
|预测位于哪里、参数与主要规则|静态已回答：本地计算，参数／脚本可以被配置覆盖|
|所选手机实际覆盖配置、远端脚本版本|未取得运行设备状态，不能由 APK 推出|
|真机完整手势、最终绘制、同步往返和跨设备一致性|未执行，需在后续运行验收核对|

后续最小运行验收：①心情长按后是否净减一；②同日起止、历史取消结束与改区间后的明细；③亲密列表内编辑后关闭、补记日期及同分钟两条；④智能周期启用时顶部与网格；⑤保存重启后的回显和真实同步。它们是运行验收缺口，不应继续写成“没有 APK／没有 JADX／不知道记录选项”。

## 10. 关键 REA Evidence

完整记录与 SHA-256 见 [索引](../analysis/xiyou/evidence-index.json)。以下方法记录的 source 均标为 complete，且保留原工具限制；这不代表 Android 运行行为已验证。

|简称|方法／用途|Evidence ID|
|---|---|---|
|E01|HomeFragment.initViewPager|`ev_fc1c6f64a20efe4daceae3715249911456bae9ae7cfd5716943f3eeb9819f789`|
|E02|CalendarFragment.initPanelHelper|`ev_3953989d4ff4888fdea47aff85b95b02bb47ad58b5cd018ad5506764cd7e3ed1`|
|E03|PanelManager.e：派发配置读取|`ev_1ff36a095421cd16d3f120cbb560b7b6ff725f51af3a4b49ce8b5aedcd8cd5b8`|
|E04|YimaView.t：开关状态分支|`ev_c02c67608fd986174a9d4092cff6c7ee34c85bdeace8fc2786ae9c3a5a7cf8bc`|
|E05|LoveView.onClick|`ev_b9cb2302a7a773db6438e9f61cbd6335b052403278f00482365177177a9c2dda`|
|E06|MoodView.onClick|`ev_4e7630d10e29c22470f17214a1e0cfe2bf89ab3427beac55db9b84b369241572`|
|E07|MoodView.onLongClick|`ev_5e145ab53abc85a8b4fefffd511c72fc24384cc8a8d8c3e4207818ff183cc799`|
|E08|CalendarRecordModel.updateMoodsList|`ev_75b09470f5dbfa6dc379492ad21682cc25d977c1941d03d3e4c2627c7321f401`|
|E09|HabitView.onClick|`ev_ffa617b37d3563fc9a53f6d3e2ac70f0cb6962c4d30f3e497b385c676dc2fc9f`|
|E10|CalendarRouterMainImpl.getMenstrualCicleImpl|`ev_1396ac9248bf1b39ba38cdb883e7a3c4dde177aaec71e1736d9f08bc5a054d85`|

验证内容：重新核对 APK SHA-256；解析归档的 20 份 REA JSON；核对它们的目标摘要；检查其中 13 份方法记录的完整性；对辅助导出和资源建立散列清单。未重算 REA 的规范化 Evidence ID，未运行反编译源码或 APK。业务代码未改，本次未重跑小程序测试。
