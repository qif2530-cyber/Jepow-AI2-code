import React, { createContext, useContext } from 'react';
import { Shot } from './types';

interface ShotContextType {
  globalImageModel: string;
  isCollapsed: boolean;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  handleGenerateImage: (shotId: string) => void;
  handleGenerateVideo: (shotId: string) => void;
  handleShotImageUpload: (shotId: string, field: 'productImages' | 'characterImages' | 'sceneImages' | 'videoReferenceImage' | 'videoLastFrameImage', e: React.ChangeEvent<HTMLInputElement>) => void;
  setFullscreenImage: (url: string | null) => void;
  setFullscreenVideo: (url: string | null) => void;
  setZoomLevel: (level: number) => void;
  handleDownloadImage: (url: string, shotNumber: number) => void;
  handleDownloadVideo: (url: string, shotNumber: number) => void;
  regeneratePrompt: (shotId: string) => void;
}

export const ShotContext = createContext<ShotContextType | null>(null);

export const useShotContext = () => {
  const context = useContext(ShotContext);
  if (!context) {
    throw new Error('useShotContext must be used within a ShotProvider');
  }
  return context;
};
