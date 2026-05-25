import { useEffect, useState } from 'react';
import {
  resolveNativeScenePath,
  scenePathToNodePatch,
  type ScenePathHints,
} from '../lib/desktop-scene-path';
import { isDesktopApp } from '../lib/runtime';

export function useDesktopScenePath(userId: string, hints: ScenePathHints) {
  const [scenePath, setScenePath] = useState('');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) {
      setScenePath('');
      setError(null);
      return;
    }

    let cancelled = false;
    setResolving(true);
    setError(null);

    resolveNativeScenePath(userId, hints)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.scenePath) {
          setScenePath(res.scenePath);
          setError(null);
        } else {
          setScenePath('');
          setError(res.error || '找不到本地模型文件');
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setScenePath('');
        setError(e instanceof Error ? e.message : '路径解析失败');
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    userId,
    hints.nativeScenePath,
    hints.localAssetPath,
    hints.glbUrl,
    hints.modelName,
  ]);

  return { scenePath, resolving, error, patch: scenePathToNodePatch };
}
