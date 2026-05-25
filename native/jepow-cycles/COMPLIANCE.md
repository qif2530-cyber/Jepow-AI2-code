# jepow-cycles — GPL 合规细则

## SPDX

`GPL-2.0-or-later`

## 本组件包含什么

| 部分 | 许可 | 说明 |
|------|------|------|
| `src/jepow_cycles_bridge.cpp` 等 | GPL-2.0-or-later | Jepow 对 Cycles 的桥接与 IPC |
| Blender **Cycles**（libcycles） | GPL-2.0-or-later | 自 `third_party/blender` 按官方方式编译 |
| 传递依赖（OIIO、OSL 等） | 各自许可证 | 须在 `THIRD_PARTY_NOTICES.md` 与 GPL 源码包 `MANIFEST.txt` 中列出 |

## 允许 / 禁止

| ✅ 允许 | ❌ 禁止 |
|--------|--------|
| 动态链接 libcycles 到 `jepow-cycles` 可执行文件 | 在 `jepow-engine` 中 `#include` Cycles 头文件或 `dlopen` libcycles |
| 通过 JSON IPC 从 Electron 调用 | 默认启动 `blender.exe` 或显示 Blender 窗口 |
| 修改 Cycles 并分发修改后的对应源码 | 将 GPL 对象文件静态链入 MIT 的 `jepow-engine` |
| 在「关于 → 开源许可」中声明 Blender/Cycles | 移除 `COPYING` 或隐瞒 GPL 来源 |

## 文件头要求

所有 `native/jepow-cycles/` 下 **新增** 的 `.c` / `.cpp` / `.h` 文件必须以如下块开头：

```
/*
 * jepow-cycles — part of Jepow AI (GPL-2.0-or-later)
 * Copyright (C) 2025 Jepow
 * See COPYING in this directory.
 */
```

## 与 Blender Foundation 的关系

- 使用 Cycles 须遵守 Blender 的 GPL 与商标政策。
- 不得声称本软件为「Blender 官方发行版」。
- 推荐表述：「离线渲染由 Blender Cycles 提供（GPL，源码见 …）」。

## 审计命令

```bash
npm run compliance:verify
```
