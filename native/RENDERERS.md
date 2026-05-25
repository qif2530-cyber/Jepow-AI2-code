# Jepow 渲染器架构与路线选择

## 产品分工（对标 Blender，自研实现）

| 场景 | 引擎 | 运行时 |
|------|------|--------|
| 画布预览 / 3D 编辑器 orbit | **jepow-engine** (wgpu) | `jepow-engine daemon` |
| 素材节点慢转、连线后进视口 | 同上 | 同上 |
| 高质量静帧 / 导出（未来） | **jepow-cycles** (libcycles) | `jepow-cycles` 子进程，**无** Blender GUI |
| `.blend` 工具链（可选） | 外部 Blender | 非默认，不随产品启动 |

## 路线对比（已选 A）

| 路线 | 描述 | Blender 窗口 | 许可 |
|------|------|--------------|------|
| **A ✅** | Cycles C++ API / libcycles 编入 `jepow-cycles` | 否 | GPL-2.0+ |
| B | `cycles` standalone 可执行文件子进程 | 否 | GPL-2.0+ |
| C | `blender --background` | 无窗口但仍为 BL 运行时 | GPL-2.0+，**产品不推荐** |

## 路线 A 接口（合规隔离）

Electron 仅通过 `electron/jepow-cycles-bridge.cjs` 与 GPL 二进制通信：

```json
{ "cmd": "render_frame", "scenePath": "...", "width": 1920, "height": 1080, "samples": 128 }
→ { "ok": true, "outputPath": "..." }
```

- **视口 IPC** 继续只走 `native-engine-bridge.cjs` → `jepow-engine`。
- **渲染节点**（如 `ThreeDRenderNode`）在 `previewQuality: 'final'` 且 Cycles 可用时调用 cycles bridge。

## 构建

```bash
# 默认 — MIT 视口
npm run native:build

# 可选 — GPL Cycles（需先按 native/jepow-cycles/README.md 准备 Blender 源码树）
npm run native:cycles:build
```

## `shading=render` 说明

当前 `jepow-engine` 的 `render` 着色仅为增强型方向光，**不是** Cycles PBR。UI 文案应避免「Cycles 实时视口」误导；真 Cycles 仅走离线通道。

## EEVEE

EEVEE 依赖完整 Blender 主机，**不适合**库级嵌入；不纳入路线图。
