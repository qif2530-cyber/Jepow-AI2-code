# jepow-cycles — Blender Cycles (GPL) 离线渲染组件

**许可证：GPL-2.0-or-later** — 见 `COPYING` 与 `COMPLIANCE.md`。

本目录是路线 **A** 的唯一合法链接点：Cycles C++ API / libcycles。**不要**在 `jepow-engine` 中链接本模块。

## 当前状态

- C API 头文件与桥接桩：`include/jepow_cycles.h`、`src/jepow_cycles_bridge.cpp`
- 完整 libcycles 构建：需自行准备 Blender 源码树（见 `third_party/README.md`）
- 未构建时，Electron bridge 返回 `available: false`，产品仅使用 MIT 视口

## 准备 Blender / Cycles 源码

```bash
# 示例：在 third_party/ 下放置与官方文档一致的 blender 树
git submodule add https://projects.blender.org/blender/blender.git third_party/blender
cd third_party/blender && git checkout <pinned-tag>
```

将 **实际使用的 commit** 记入 `third_party/VERSION`（构建后由 `package-gpl-source.sh` 收集）。

## 构建（占位）

```bash
# 仓库根目录
npm run native:cycles:build
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

## 合规

分发本二进制时，必须同时满足 `SOURCE_CODE_OFFER.md` 与 `native/COMPLIANCE.md` 检查清单。
