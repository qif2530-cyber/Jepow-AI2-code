# Native 模块合规总览（路线 A：libcycles + GPL）

## 目标

- **产品视口**：`jepow-engine`（MIT），常驻 wgpu，**不**启动 `blender.exe`。
- **高质量离线渲染**：`jepow-cycles`（GPL-2.0-or-later），通过 **Cycles C++ API / libcycles** 嵌入，**不**用 Blender 窗口作视口。
- **法律边界清晰**：MIT 与 GPL 在**进程/二进制**层面隔离，避免无意将整包 MIT 代码「传染」为 GPL。

## 模块与许可证

```
┌─────────────────────────────────────────────────────────────┐
│  Electron + React (MIT)                                      │
│    IPC JSON ─────────────────────────────┐                   │
├──────────────────────────────────────────│───────────────────┤
│  jepow-engine (MIT)  视口 / FBX / daemon │                   │
│    禁止 #[link] / 静态链接 jepow-cycles   │                   │
├──────────────────────────────────────────│───────────────────┤
│  jepow-cycles (GPL)  仅「渲染/导出」节点  ◄┘                   │
│    动态链接 libcycles；独立可执行文件或 .so/.dylib/.dll         │
└─────────────────────────────────────────────────────────────┘
```

| 路径 | 许可证 | 是否默认构建 | 是否可链接 Cycles |
|------|--------|--------------|-------------------|
| `native/jepow-engine/` | MIT | ✅ `npm run native:build` | ❌ 禁止 |
| `native/jepow-cycles/` | GPL-2.0-or-later | ❌ `npm run native:cycles:build` | ✅ 仅本目录 |
| `native/blender/scripts/` | GPL（调试） | ❌ | ❌ 非产品 |

## GPL 义务触发条件

仅在以下情况触发对 **jepow-cycles + Cycles** 的 GPL 分发义务：

1. 向用户提供已编译的 `jepow-cycles` 二进制；或  
2. 将 libcycles **静态或动态链接**进随产品分发的本机模块（除 jepow-cycles 外不应出现）。

**不触发**（当前默认）：仅分发 `jepow-engine`，UI 中 Cycles 选项显示为「未安装」。

## 发行检查清单

- [ ] `COPYING.GPL`、`THIRD_PARTY_NOTICES.md` 进入安装包（`package.json` → `build.extraResources`）
- [ ] 关于 / 帮助 → **开源许可** 可打开（`OpenSourceLicensesModal`）
- [ ] 若捆绑 `jepow-cycles`：已运行 `npm run compliance:package-gpl-source` 并提供 `SOURCE_CODE_OFFER.md` 中的获取方式
- [ ] 正式构建 **未** 设置 `JEPOW_USE_BLENDER_VIEWPORT=1`
- [ ] `npm run compliance:verify` 通过

## 开发纪律

1. **禁止**在 `jepow-engine` 的 `Cargo.toml` 中添加对 Cycles / Blender 的依赖或 `build.rs` 链接。
2. 所有 Cycles 头文件与 CMake 仅存在于 `native/jepow-cycles/`。
3. PR 审查：任何 `third_party/blender` 子模块升级须更新 `THIRD_PARTY_NOTICES.md` 与 GPL 源码清单版本号。
4. 商标：对外文案写「基于 Blender Cycles（GPL）」，避免「官方 Blender 插件」表述。

## 相关文档

- `native/RENDERERS.md` — 技术路线 A/B/C 与接口
- `SOURCE_CODE_OFFER.md` — 源码提供义务
- `native/jepow-cycles/COMPLIANCE.md` — Cycles 组件细则
