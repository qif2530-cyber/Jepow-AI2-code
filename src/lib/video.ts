export const checkIsVideoUrl = (url: string | undefined | null): boolean => {
  if (!url) return false;
  
  // Basic extension check
  if (url.match(/\.(mp4|webm|ogg|mov)$/i)) return true;
  
  // Check encoded API media routes
  if (url.includes('/api/media/')) {
    const parts = url.split('/');
    let encoded = parts[parts.length - 1];
    
    // Remove query params or hashes if any
    encoded = encoded.split('?')[0].split('#')[0];
    
    try {
      let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const decoded = atob(b64);
      if (decoded.match(/\.(mp4|webm|ogg|mov)$/i)) return true;
    } catch(e) {}
  }
  
  // Last resort check if string 'video' is literally in URL (rare, but was in some original code)
  if (url.toLowerCase().includes('video')) return true;

  return false;
};
