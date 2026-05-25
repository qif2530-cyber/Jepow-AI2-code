/** In-app open-source license summaries (desktop distribution compliance). */

export type OssEntry = {
  id: string;
  name: string;
  license: string;
  role: string;
  url?: string;
  gpl?: boolean;
};

export const JEPOW_OSS_ENTRIES: OssEntry[] = [
  {
    id: 'jepow-engine',
    name: 'jepow-engine',
    license: 'MIT',
    role: '默认 3D 视口（wgpu）、FBX 导入、常驻 daemon',
    url: 'https://github.com/jepow/Jepow-AI2-code/tree/main/native/jepow-engine',
  },
  {
    id: 'jepow-cycles',
    name: 'jepow-cycles + Blender Cycles',
    license: 'GPL-2.0-or-later',
    role: '可选离线高质量渲染（路线 A，不启动 blender.exe）',
    gpl: true,
    url: 'https://www.blender.org/about/license/',
  },
  {
    id: 'electron',
    name: 'Electron',
    license: 'MIT',
    role: '桌面壳',
    url: 'https://www.electronjs.org/',
  },
  {
    id: 'react',
    name: 'React / Vite',
    license: 'MIT',
    role: '画布 UI',
  },
  {
    id: 'three',
    name: 'Three.js',
    license: 'MIT',
    role: 'Web 回退预览',
    url: 'https://threejs.org/',
  },
];

export const GPL_SOURCE_OFFER_TEXT =
  '若安装包内含 jepow-cycles（Cycles 离线渲染），您有权在三年内索取对应完整源码。' +
  '详见安装目录 legal/SOURCE_CODE_OFFER.md，或联系产品方公布的 GPL 源码邮箱。';

export const GPL_TRADEMARK_NOTE =
  '「Blender」为 Blender Foundation 商标。Jepow 使用 Cycles 引擎（GPL）不构成官方背书。';
