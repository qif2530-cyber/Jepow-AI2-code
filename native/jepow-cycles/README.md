# jepow-cycles — Blender Cycles (GPL) 离线渲染组件

**许可证：GPL-2.0-or-later** — 见 `COPYING` 与 `COMPLIANCE.md`。

本目录是路线 **A** 的唯一合法链接点：Cycles C++ API / libcycles。**不要**在 `jepow-engine` 中链接本模块。

## 当前状态

- C API 头文件与桥接桩：`include/jepow_cycles.h`、`src/jepow_cycles_bridge.cpp`
- 完整 libcycles 构建：需自行准备 Blender 源码树（见 `third_party/README.md`）
- 未构建时，Electron bridge 返回 `available: false`，产品仅使用 MIT 视口

## 准备 Blender / Cycles 源码

```bash
# 仓库根目录
npm run native:cycles:download

# 可指定固定版本，便于 GPL 源码归档复现
BLENDER_REF=v4.3.2 npm run native:cycles:download
```

将 **实际使用的 commit** 记入 `third_party/VERSION`（构建后由 `package-gpl-source.sh` 收集）。

## 构建

```bash
# 仓库根目录
npm run native:cycles:build

# 检查 Blender Cycles standalone 配置是否具备依赖
npm run native:cycles:probe

# 构建 Cycles standalone 核心库目标
npm run native:cycles:build:libcycles
```

成功产物（平台相关）：

- `native/jepow-cycles/build/jepow-cycles`（或 `jepow-cycles.exe`）

## 运行方式

独立进程，JSON 行协议（与 `jepow-engine daemon` 类似）：

```bash
./build/jepow-cycles --stdio
{"cmd":"ping"}
```

正式集成由 `electron/jepow-cycles-bridge.cjs` 启动，**不**调用 `blender.exe`。

## 集成状态

`native:cycles:download` 只下载 Blender/Cycles 源码并记录版本；完整 `libcycles`
链接需要本机安装 CMake、Ninja/Make、Python 以及 Blender 官方构建依赖。
如果没有这些工具，Electron 会继续显示 `jepow-cycles` 未就绪，并回退到 MIT
实时视口 `jepow-engine`。

Apple Silicon 上还需要 `third_party/blender/lib/macos_arm64` 官方预编译依赖。
可用本地 `git-lfs` 后只初始化该平台依赖，避免下载其它平台库。

当前 `native:cycles:build:libcycles` 会先确认 Blender Cycles standalone 配置，
再构建官方 `cycles` 目标。完成后还需要把 `jepow_cycles_bridge.cpp`
链接到这些 Cycles 静态库/动态库，并实现 JSON 场景到 Cycles `Session`
的转换。

## 合规

分发本二进制时，必须同时满足 `SOURCE_CODE_OFFER.md` 与 `native/COMPLIANCE.md` 检查清单。

## Cycles 原生数据链路

离线渲染走 **Cycles Standalone XML**（非自定义着色器格式）：

- 官方文档：[Cycles Standalone](https://developer.blender.org/docs/features/cycles/standalone/)
- Principled 字段名与 `intern/cycles/scene/shader_nodes.cpp` 中 `PrincipledBsdfNode` 的 SOCKET 一致（`snake_case`）
- 应用内契约：`src/lib/cycles-native-schema.ts`（`getCyclesNativeCompliance()`）
- XML 生成：`electron/cycles-xml-export.cjs`；网格导出：`jepow-engine` 命令 `mesh_for_cycles`（`electron/cycles-mesh-xml.cjs`）

| 层级 | 实现 |
|------|------|
| 画布 Cycles 节点 | 封装 UI，不进入 AI `createNodeViaAi` |
| 连线 / 解析 | `src/lib/native-3d-pipeline.ts`、`cycles-shader-graph.ts` |
| 交互视口 | MIT `jepow-engine` PBR 预览（与 GPL Cycles 隔离） |
| 离线成片 | GPL `jepow-cycles` / standalone `cycles` 子进程 |

**Shader graph：** 画布节点导出为官方 XML 节点链（`image_texture` → `gamma` / `brightness_contrast` / `rgb_curves` / `rgb_ramp` / `mix_color` / `map_range` / `rgb_to_bw` → `principled_bsdf`，以及 `normal_map`、`displacement`）。IR 构建见 `src/lib/cycles-shader-graph-ir.ts`。
