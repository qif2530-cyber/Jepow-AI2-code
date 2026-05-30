/** 画幅框铺满（object-cover）时的线性映射 */
export function clientToRenderPixelsFill(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  renderW: number,
  renderH: number,
): { cursorX: number; cursorY: number } | null {
  const rw = Math.max(1, renderW);
  const rh = Math.max(1, renderH);
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  if (
    localX < 0 ||
    localY < 0 ||
    localX > rect.width ||
    localY > rect.height
  ) {
    return null;
  }
  return {
    cursorX: (localX / Math.max(1, rect.width)) * rw,
    cursorY: (localY / Math.max(1, rect.height)) * rh,
  };
}

/** 将屏幕点击映射到原生帧像素（与 object-contain 预览一致） */
export function clientToRenderPixels(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  renderW: number,
  renderH: number,
): { cursorX: number; cursorY: number } | null {
  const rw = Math.max(1, renderW);
  const rh = Math.max(1, renderH);
  const displayW = Math.max(1, rect.width);
  const displayH = Math.max(1, rect.height);
  const renderAspect = rw / rh;
  const displayAspect = displayW / displayH;

  let contentW: number;
  let contentH: number;
  let offsetX: number;
  let offsetY: number;

  if (displayAspect > renderAspect) {
    contentH = displayH;
    contentW = displayH * renderAspect;
    offsetX = (displayW - contentW) * 0.5;
    offsetY = 0;
  } else {
    contentW = displayW;
    contentH = displayW / renderAspect;
    offsetX = 0;
    offsetY = (displayH - contentH) * 0.5;
  }

  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;
  if (localX < 0 || localY < 0 || localX > contentW || localY > contentH) {
    return null;
  }

  return {
    cursorX: (localX / contentW) * rw,
    cursorY: (localY / contentH) * rh,
  };
}
