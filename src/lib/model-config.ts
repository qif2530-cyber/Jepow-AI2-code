export interface ModelCapability {
  id: string;
  name: string;
  shortName: string;
  ratios: { label: string, value: string }[];
  resolutions: { label: string, value: string }[];
  maxCount: number;
  styles: { label: string, value: string }[];
  description: string;
  supportsReferenceImage?: boolean;
  parameters?: {
    name: string;
    label: string;
    type: 'slider' | 'select';
    min?: number;
    max?: number;
    options?: { label: string, value: string }[];
    default: any;
  }[];
}

export const IMAGE_MODELS: Record<string, ModelCapability> = {
  'gemini-3.1-flash-image-preview': {
    id: 'gemini-3.1-flash-image-preview',
    name: 'jepow 2 (Gemini 3.1 Flash)',
    shortName: 'jepow 2',
    ratios: [
      { label: '1:1 正方形', value: '1:1' },
      { label: '16:9 电影片', value: '16:9' },
      { label: '9:16 竖屏', value: '9:16' }
    ],
    resolutions: [
      { label: '1K 标准', value: '1K' },
      { label: '2K 高清', value: '2K' },
      { label: '4K 超清', value: '4K' }
    ],
    maxCount: 4,
    styles: [],
    description: '极致速度的生成体验',
    supportsReferenceImage: true,
    parameters: []
  },
  'gemini-3-pro-image-preview': {
    id: 'gemini-3-pro-image-preview',
    name: 'jepow pro (Gemini 3.0 Pro)',
    shortName: 'jepow pro',
    ratios: [
      { label: '1:1 正方形', value: '1:1' },
      { label: '16:9 电影片', value: '16:9' },
      { label: '9:16 竖屏', value: '9:16' }
    ],
    resolutions: [
      { label: '1K 标准画质', value: '1K' },
      { label: '2K 高清画质', value: '2K' },
      { label: '4K 超清画质', value: '4K' }
    ],
    maxCount: 4,
    styles: [],
    description: '多模态推理能力最强的核心',
    supportsReferenceImage: true,
    parameters: []
  },
  'imagen-4.0-fast-generate-001': {
    id: 'imagen-4.0-fast-generate-001',
    name: 'jepow 4 (Imagen Fast 4.0)',
    shortName: 'jepow 4',
    ratios: [
      { label: '1:1 正方形', value: '1:1' },
      { label: '16:9 电影片', value: '16:9' },
      { label: '9:16 竖屏', value: '9:16' }
    ],
    resolutions: [
      { label: '1K 标准', value: '1K' },
      { label: '2K 高清', value: '2K' },
      { label: '4K 超清', value: '4K' }
    ],
    maxCount: 4,
    styles: [],
    description: 'Google Imagen 全新 4.0 高画质模型',
    supportsReferenceImage: true,
    parameters: []
  },
  'dall-e-3': {
    id: 'dall-e-3',
    name: 'jepow E3 (DALL-E 3)',
    shortName: 'jepow E3',
    ratios: [
      { label: '1:1 正方形', value: '1:1' },
      { label: '16:9 宽屏', value: '16:9' },
      { label: '9:16 竖屏', value: '9:16' }
    ],
    resolutions: [
      { label: '1024x1024 标准', value: '1024x1024' },
      { label: '高画质 HD', value: 'hd' }
    ],
    maxCount: 1,
    styles: [
      { label: '生动 (Vivid)', value: 'vivid' },
      { label: '自然 (Natural)', value: 'natural' }
    ],
    description: '强大的图文理解与渲染引擎',
    supportsReferenceImage: true,
    parameters: []
  },
  'doubao-seedream-5.0-lite': {
    id: 'doubao-seedream-5.0-lite',
    name: 'Seedream 5.0 Lite',
    shortName: 'Seedream 5.0',
    ratios: [
      { label: '1:1 正方形', value: '1:1' },
      { label: '16:9 电影片', value: '16:9' },
      { label: '9:16 竖屏', value: '9:16' }
    ],
    resolutions: [
      { label: '1K 标准', value: '1K' },
      { label: '2K 高清', value: '2K' },
      { label: '4K 超清', value: '4K' }
    ],
    maxCount: 4,
    styles: [],
    description: '火山引擎 Seedream 5.0 Lite 极速生图大模型',
    supportsReferenceImage: true,
    parameters: []
  },
  'doubao-seedream-4.5': {
    id: 'doubao-seedream-4.5',
    name: 'Seedream 4.5',
    shortName: 'Seedream 4.5',
    ratios: [
      { label: '1:1 正方形', value: '1:1' },
      { label: '16:9 电影片', value: '16:9' },
      { label: '9:16 竖屏', value: '9:16' }
    ],
    resolutions: [
      { label: '1K 标准', value: '1K' },
      { label: '2K 高清', value: '2K' },
      { label: '4K 超清', value: '4K' }
    ],
    maxCount: 4,
    styles: [],
    description: '火山引擎 Seedream 4.5 高质量生图大模型',
    supportsReferenceImage: true,
    parameters: []
  }
};
