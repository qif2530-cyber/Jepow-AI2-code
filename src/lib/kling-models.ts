export type KlingModelId = 
  | 'veo-3.1-lite-generate-preview'
  | 'sora-2'
  | 'kling-video-o1'
  | 'kling-v3-omni'
  | 'kling-v3'
  | 'doubao-seedance-2.0'
  | 'doubao-seedance-2.0-fast';

export type KlingMode = 'std' | 'pro' | 'none';
export type KlingDuration = '5s' | '10s' | '15s' | 'other';
export type KlingResolution = '720p' | '1080p' | '4k';
export type KlingAspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';

export interface KlingFeatureSupport {
  t2v: boolean;
  i2v: boolean;
  firstLastFrame: boolean;
  onlyLastFrame: boolean;
  cameraControl: boolean;
  motionBrush: boolean;
  subjectControl: boolean;
  videoReference: boolean;
  actionControl: boolean;
  soundControl: boolean;
  videoExtension: boolean;
  specialEffects: boolean;
  multiReference: boolean;
  multiModalEditing: boolean;
  videoEdit: boolean;
}

const defaultSupport: KlingFeatureSupport = {
  t2v: false, i2v: false, firstLastFrame: false, onlyLastFrame: false,
  cameraControl: false, motionBrush: false, subjectControl: false,
  videoReference: false, actionControl: false, soundControl: false,
  videoExtension: false, specialEffects: false, multiReference: false,
  multiModalEditing: false, videoEdit: false
};

export const KLING_MODELS: Record<KlingModelId, {
  name: string;
  modes: KlingMode[];
  durations: KlingDuration[];
  resolutions: KlingResolution[];
  aspectRatios: KlingAspectRatio[];
  getSupport: (mode: KlingMode, duration: KlingDuration) => KlingFeatureSupport;
}> = {
  'veo-3.1-lite-generate-preview': {
    name: 'Veo 3.1',
    modes: ['none'],
    durations: ['5s'],
    resolutions: ['1080p'],
    aspectRatios: ['16:9'],
    getSupport: (mode, duration) => ({
      ...defaultSupport,
      t2v: true,
      i2v: true,
      cameraControl: true,
    })
  },
  'sora-2': {
    name: 'Sora 2 / Pro',
    modes: ['none'],
    durations: ['other'],
    resolutions: ['1080p', '720p'],
    aspectRatios: ['16:9'],
    getSupport: (mode, duration) => ({
      ...defaultSupport,
      t2v: true,
      i2v: true,
      subjectControl: true,
    })
  },
  'kling-video-o1': {
    name: '可灵 O1',
    modes: ['std', 'pro'],
    durations: ['5s', '10s'],
    resolutions: ['1080p', '720p'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    getSupport: (mode, duration) => ({
      ...defaultSupport,
      t2v: true,
      i2v: true,
      firstLastFrame: true,
      subjectControl: true,
    })
  },
  'kling-v3-omni': {
    name: '可灵 v3 Omni',
    modes: ['std', 'pro'],
    durations: ['5s', '10s'],
    resolutions: ['1080p', '720p'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    getSupport: (mode, duration) => ({
      ...defaultSupport,
      t2v: true,
      i2v: true,
      firstLastFrame: true,
      subjectControl: true,
    })
  },
  'kling-v3': {
    name: '可灵 v3',
    modes: ['std', 'pro'],
    durations: ['5s', '10s'],
    resolutions: ['1080p', '720p'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    getSupport: (mode, duration) => ({
      ...defaultSupport,
      t2v: true,
      i2v: true,
      firstLastFrame: true,
      subjectControl: true,
      videoEdit: true,
    })
  },
  'doubao-seedance-2.0': {
    name: 'Seedance 2.0',
    modes: ['none'],
    durations: ['5s', '10s', '15s'],
    resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    getSupport: (mode, duration) => ({
      ...defaultSupport,
      t2v: true,
      i2v: true,
      cameraControl: true,
    })
  },
  'doubao-seedance-2.0-fast': {
    name: 'Seedance 2.0 Fast',
    modes: ['none'],
    durations: ['5s', '10s', '15s'],
    resolutions: ['720p'],
    aspectRatios: ['16:9', '9:16', '1:1'],
    getSupport: (mode, duration) => ({
      ...defaultSupport,
      t2v: true,
      i2v: true,
      cameraControl: true,
    })
  }
};
