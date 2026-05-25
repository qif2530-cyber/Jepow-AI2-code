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
4. **v0.4** — 常驻引擎进程 + 嵌入视口（60fps 交互）  
5. **v0.5** — 材质节点、离线渲染通道  

## 明确不做

- 不把 `blender.exe` 当作运行时  
- 不把 Three.js 当作桌面端最终内核（仅 Web 回退 / 过渡）
