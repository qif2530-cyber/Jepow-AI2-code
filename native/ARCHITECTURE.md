# Jepow 自研本地 3D 架构（参考 Blender，不依赖 Blender）

## 产品原则

| 模块 | 运行位置 |
|------|----------|
| 登录 / 个人资料 / 能量 / 充值 | 云端 API（jepow.com） |
| AI 大模型生成（图/视频/脚本） | 云端 API |
| **无限画布工程** | **本机** `*.AI` 目录包（`manifest.json` + `canvas.json` + `assets/`） |
| **3D 模型 / 场景文件** | 工程内 `assets/models/`（无工程时回退 `userData/assets/{userId}/`） |
| **生成图片** | `assets/images/` |
| **生成视频** | `assets/videos/` |
| **3D 贴图** | `assets/textures/` |
| **3D 视口渲染** | **本机** `jepow-engine`（Rust + wgpu + Rayon） |
| 画布 UI | Electron 壳 + React |

桌面端 **不上传** FBX/GLB 到服务器做预览；节点内引用 `jepow-asset://models/…`（工程内）或 `jepow-local://`（临时绝对路径，保存时归入 `.AI`）。

## 分层（照 Blender 思路拆，但是自己的代码）

```
┌─────────────────────────────────────────┐
│  Electron + React（壳 / 节点 / 连线）      │
├─────────────────────────────────────────┤
│  viewport-engine（TS 抽象）               │
├─────────────────────────────────────────┤
│  native-engine-bridge（子进程 IPC）        │
├─────────────────────────────────────────┤
│  jepow-engine（Rust）                    │
│    jobs/     CPU 线程池（Rayon）          │
│    gpu/      GPU 适配器（wgpu）           │
│    scene/    场景图 / 加载器              │
│    render/   视口 / 离屏渲染              │
└─────────────────────────────────────────┘
```

## 编译自研内核

```bash
npm run native:build
```

## 路线图（抄 BL 的“分工”，不是抄它的程序）

1. **v0.1** — GPU 通路 + glTF 统计 + 本地资产库 ✅  
2. **v0.2** — glTF/FBX 网格进 GPU 绘制、相机、灯光  
3. **v0.3** — 大场景 LOD、实例化、`.jepow-scene` 工程格式  
4. **v0.4** — 常驻引擎进程 + `viewport_frame`（GPU 会话，白膜默认可 TRS）✅ 进行中  
5. **v0.5** — 材质节点、离线渲染通道  
6. **Cycles（路线 A）** — `native/jepow-cycles/`（GPL），libcycles 仅离线渲，视口仍 MIT；见 `native/COMPLIANCE.md`、`native/RENDERERS.md`

## 许可证边界

| 组件 | 许可 | 默认构建 |
|------|------|----------|
| `jepow-engine` | MIT | ✅ |
| `jepow-cycles` | GPL-2.0-or-later | ❌ 可选 |
| `blender.exe` 调试 | GPL | ❌ 禁止产品默认 |

## FBX / C4D 导入（抄 Blender 规则，不是调 Blender 程序）

对照 Blender `io_scene_fbx` 的默认行为，在 `mesh_loader.rs` 里用 **ufbx** 实现同等步骤：

| Blender 导入 | jepow-engine |
|--------------|--------------|
| `axis_up=Y`, `axis_forward=-Z` | `target_axes = right_handed_y_up()` |
| 对象层级矩阵 | 每个含 mesh 的 node × `geometry_to_world` |
| 三角化 | `ufbx::triangulate_face`（失败的面跳过，不做错误扇形剖分） |
| 法线 | `generate_missing_normals` |

**不**在运行时 `exec blender` 做视口/Cycles 成片。

| 用途 | 是否调用 `blender.exe` |
|------|------------------------|
| 实时白膜视口 | ❌ → `jepow-engine` (wgpu) |
| Cycles 点击渲染 | ❌ → `jepow-cycles` (libcycles) |
| 导入 `.blend` 解析材质/灯光/导出 GLB | ✅ 一次性 headless（`assets:importBlendProject`） |
| `JEPOW_USE_BLENDER_VIEWPORT=1` | ✅ 仅开发对照 |

「参考 Blender 架构」= 抄 **分工与算法思路**（场景图、FBX 规则、Principled、Cycles），不是把 Blender 当运行时。

## 明确不做

- 不把 `blender.exe` 当作产品默认运行时  
- 不把 Three.js 当作桌面端最终内核（仅 Web 回退 / 过渡）
