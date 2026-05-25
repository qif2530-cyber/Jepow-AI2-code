# GPL 源码提供说明（Jepow Cycles 组件）

当您在二进制安装包中**包含**已编译的 `jepow-cycles`（或任何链接 Blender Cycles / libcycles 的本机模块）时，根据 **GPL-2.0-or-later**，您必须向最终用户提供对应源码或书面获取承诺。

## 默认产品构建（当前）

- **交互视口**：`jepow-engine`（MIT），不触发 Cycles GPL 义务。
- **Cycles**：位于 `native/jepow-cycles/`，**默认不参与** `npm run native:build`；未编译时不随安装包分发。

## 启用 Cycles 后的义务

1. **对应源码（Corresponding Source）** 须包含：
   - 本仓库中 `native/jepow-cycles/` 的全部源文件（含您对 `jepow_cycles_bridge` 的修改）；
   - 构建说明（`native/jepow-cycles/README.md`、`CMakeLists.txt`）；
   - 您实际链接的 **Blender Cycles** 源码版本（`third_party/blender` 子模块或等价 tarball，与构建时 commit 一致）；
   - 用于生成安装包的构建脚本与依赖版本记录（`scripts/compliance/package-gpl-source.sh` 输出清单）。

2. **提供方式**（任选其一，须持续至少三年）：
   - 随安装介质附带源码归档（推荐：`jepow-gpl-source-<version>.tar.xz`）；
   - 在安装程序 / 关于 → 开源许可 中写明下载 URL；
   - 书面承诺：向 `gpl-source@jepow.com`（请替换为贵司实际邮箱）索取，邮费/介质成本由索取方承担。

3. **许可与声明**：
   - 安装目录须包含 `COPYING.GPL` 与 `THIRD_PARTY_NOTICES.md`（electron-builder `extraResources` 已配置）；
   - 应用内「开源许可」须标明 Cycles / Blender 为 GPL，并链到上述源码获取方式。

## 打包 GPL 源码归档

```bash
./scripts/compliance/package-gpl-source.sh
```

输出目录：`dist/compliance/gpl-source/`（含 `MANIFEST.txt` 与待归档文件列表）。

## 与 MIT 部分的边界

- **不**将 GPL 代码静态链接进 `jepow-engine`（保持 MIT 视口内核可独立分发）。
- Cycles 仅通过 **`jepow-cycles` 独立可执行文件 / 动态库** + JSON IPC 与 Electron 通信（见 `native/RENDERERS.md`）。
- **禁止**将 `blender.exe` 作为产品默认运行时；调试开关 `JEPOW_USE_BLENDER_VIEWPORT=1` 不得出现在正式发行配置中。

## 商标

「Blender」为 Blender Foundation 的商标。本集成说明 Cycles 引擎来源，不暗示官方背书。
