export interface UserData {
  id: string;
  username: string; // Display Name
  accountName: string; // Fixed Login Name
  email?: string;
  phone?: string;
  credits: number;
  role: 'admin' | 'user' | 'super_admin';
  status?: 'active' | 'banned';
  createdAt?: string;
  bio?: string;
  avatar?: string;
  industry?: string;
  followersCount?: number;
  followingCount?: number;
  following?: string[];
  postsCount?: number;
  projectsCount?: number;
  likesCount?: number;
  certifications?: any[];
  glowColor?: string;
  permissions?: string[];
  transactions?: any[];
}

export interface CloudProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
  thumbnails?: string[];
  isPurchased?: boolean;
}

export interface Shot {
  id: string;
  shotNumber: number;
  description: string;
  imagePrompt: string;
  videoPrompt?: string;
  characterDescription?: string;
  sceneDescription?: string;
  status: 'pending' | 'generating_prompt' | 'generating_image' | 'image_done' | 'generating_video' | 'video_done' | 'error';
  imageUrl?: string;
  referenceImage?: string;
  videoUrl?: string;
  taskId?: string;
  error?: string;
  productImages?: string[];
  characterImages?: string[];
  sceneImages?: string[];
  imageCategories?: Record<string, 'productImages' | 'characterImages' | 'sceneImages'>;
  referenceImages?: string[];
  uploadedReferenceImages?: string[];
  videoReferenceImage?: string;
  videoReferenceImages?: string[];
  videoLastFrameImage?: string;
  videoReferenceVideo?: string;
  videoReferenceVideos?: string[];
  aspectRatio?: string;
  resolution?: string;
  numberOfImages?: number;
  numberOfVideos?: number;
  imageUrls?: string[];
  videoUrls?: string[];
  progress?: number;
  initialPosition?: { x: number, y: number };
  type?: 'image' | 'video' | 'both';
  imageModel?: string;
  imageStyle?: 'vivid' | 'natural' | 'cinematic' | 'studio' | 'photorealistic' | 'creative' | 'raw' | 'default';
  parameters?: Record<string, any>;
  klingModel?: string;
  klingMode?: string;
  klingDuration?: string;
  videoInputMode?: 't2v' | 'i2v' | 'firstLastFrame' | 'subjectControl' | 'actionControl' | 'videoEdit';
  cameraControl?: string;
  negativePrompt?: string;
}

export interface HistoryItem {
  id: string;
  type: 'image' | 'video';
  url: string;
  prompt: string;
  timestamp: number;
  source?: 'generated' | 'uploaded';
}

export interface VideoClip {
  id: string;
  trackId: string;
  clipType: 'image' | 'sequence' | 'api_video' | 'local' | 'video' | 'text' | 'audio';
  sourceUrl?: string;
  sourceNodeId?: string;
  startTime: number;
  endTime: number;
  trimIn: number;
  trimOut: number;
  speed: number;
  opacity: number;
  blendMode: string;
  
  // Transform properties
  scale?: number; // 1 = 100%
  x?: number;     // position x relative to center
  y?: number;     // position y relative to center
  rotation?: number; // in degrees

  filters?: {
    brightness: number;
    contrast: number;
    saturation: number;
    blur: number;
  };
  transitionIn?: 'none' | 'fade';
  transitionOut?: 'none' | 'fade';

  // Text properties
  textContent?: string;
  fontSize?: number;
  textColor?: string;
  fontFamily?: string;

  // Audio properties
  volume?: number;
}

export interface VideoTrack {
  id: string;
  trackType: 'video' | 'pip' | 'audio' | 'text';
  trackIndex: number; // For z-index ordering
  mute: boolean;
  lock: boolean;
  hide: boolean;
  clips: VideoClip[];
}

export interface VideoProject {
  id: string;
  projectId: string;
  title: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  tracks: VideoTrack[];
}
