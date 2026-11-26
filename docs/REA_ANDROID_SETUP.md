# 西柚 APK 分析工具使用说明

配置日期：2026-10-22。验证状态更新：2026-10-24。

## 当前状态

已完成项目内便携配置，可以直接通过 REA CLI 分析 APK：

- REA CLI：6.7.0。
- JDK：Eclipse Temurin 21.0.12.1+1，包含 Java 编译器。
- 安卓分析引擎：jadx-headless-mcp 0.7.1。
- 专用启动脚本：`D:\00mini-lo\wx-mini-lo\analysis\xiyou\run-rea.ps1`。
- 目标安装包：`D:\00mini-lo\wx-mini-lo\analysis\xiyou\xiyou-source.apk`。

JDK/JADX 放在 `analysis/xiyou/tools`，脚本在当前进程内设置环境变量，调用结束恢复。REA 优先使用先前下载的缓存启动器；缓存被清理后会通过 npx 获取固定的 6.7.0 版本，此时需要联网。

## 已通过的验证

1. 两个下载文件 SHA-256 与官方发布元数据一致。
2. `java -version`、`javac -version` 成功，均报告 21.0.12.1。
3. 使用专用脚本调用 `inspect-android-package` 成功，返回包名 `com.menstrual.menstrualcycle`、版本 2.2.5、versionCode 36，提供完整解码 Manifest。
4. 实际分析引擎为 `JADX headless 0.7.1`，REA Evidence ID：`ev_bdd6ab21ae885b654022c133dd941304b8f508ae49ba11902bc00f91661159e1`。

5. 已进一步完成日历、经期、亲密、心情、习惯和周期参数的方法追踪；归档 20 份 REA JSON，其中 13 份方法记录标为完整。
6. 重新核对 APK 摘要、REA 目标摘要，并为定点导出的 Java、资源和 assets 建立 SHA-256 清单。

包身份结果：`analysis/xiyou/rea-android-package.json`；完整 [证据索引](../analysis/xiyou/evidence-index.json)；范围内结论见 [逆向报告](XIYOU_CALENDAR_REVERSE_ENGINEERING.md)。已验证静态方法分析，尚未运行 APK 或验证线上同步。

## 你需要怎么操作

继续在本聊天说明要分析或实现的功能即可，代理会使用已配置脚本。日常无需自行打开 JADX、双击 JAR 或配置环境变量。

如希望手动检查，打开 PowerShell，执行：

```powershell
& 'D:\00mini-lo\wx-mini-lo\analysis\xiyou\run-rea.ps1' --version
```

重新读取 APK，并把结果存到文件：

```powershell
& 'D:\00mini-lo\wx-mini-lo\analysis\xiyou\run-rea.ps1' inspect-android-package 'D:\00mini-lo\wx-mini-lo\analysis\xiyou\xiyou-source.apk' --format json > 'D:\00mini-lo\wx-mini-lo\analysis\xiyou\rea-android-package.json'
```

REA 在 Codex 受限沙箱中曾遇到路径解析/Windows 原生进程控制权限错误，本次通过工具审批在沙箱外完成验证。若后续再次遇到相同错误，应由代理使用适当的执行权限，不需要重装 Java。个人 PowerShell 的脚本执行策略若阻止启动，应先查看具体错误，不要直接修改整台电脑的执行策略。

## 下载来源与校验

- [Eclipse Adoptium JDK 21 Windows x64](https://adoptium.net/temurin/releases/?version=21&os=windows&arch=x64&package=jdk)：使用官方 API 返回的 ZIP，`OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip`。
- JDK ZIP SHA-256：`f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e`。
- [jadx-headless-mcp v0.7.1 官方发布](https://github.com/1013503897/jadx-headless-mcp/releases/tag/v0.7.1)：`jadx-headless-mcp-0.7.1-all.jar`。
- JAR SHA-256：`6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`。

本次继续使用项目 CLI。当前聊天中的 REA MCP 已可连接，但其 Android provider 未取得 JAR 环境配置；这与项目脚本已成功分析 APK 是不同的启动环境，不需要为继续静态分析重装工具或重启聊天。分析目录已排除 Git 跟踪；迁移电脑或清理目录后需另行保留 APK、证据及便携工具。
