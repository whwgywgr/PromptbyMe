/* =====================================================================
   Client-side media processing (no build step, no libraries)
   - compressImageUpload(file): resize full image to <=1920px and
     re-encode (WebP for transparency, JPEG otherwise), plus a 400px
     grid thumbnail. GIFs are skipped (animation is kept).
   - makeVideoPoster(file): capture a frame (~0.5s) as a JPEG thumbnail.
   ===================================================================== */

const PM_MAX_FULL = 1920;  // max dimension of the stored full image
const PM_MAX_THUMB = 400;  // max dimension of the grid thumbnail

function pmDrawScaled(source, sourceW, sourceH, maxDim, mime, quality) {
  const scale = Math.min(1, maxDim / Math.max(sourceW, sourceH));
  const w = Math.max(1, Math.round(sourceW * scale));
  const h = Math.max(1, Math.round(sourceH * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (mime === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(source, 0, 0, w, h);
  return new Promise((resolve) => c.toBlob((b) => resolve(b), mime, quality));
}

function pmExtForMime(mime) {
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/jpeg') return '.jpg';
  return '';
}

// returns { full: Blob, thumb: Blob|null, wasReencoded: boolean }
async function compressImageUpload(file) {
  const isGif = file.type === 'image/gif';
  try {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bitmap = await createImageBitmap(file); // older browsers: no EXIF option
    }
    if (isGif) {
      const thumb = await pmDrawScaled(bitmap, bitmap.width, bitmap.height, PM_MAX_THUMB, 'image/jpeg', 0.72);
      bitmap.close && bitmap.close();
      return { full: file, thumb, wasReencoded: false }; // keep GIF animation
    }
    const keepTransparency = file.type === 'image/png' || file.type === 'image/webp';
    const fullMime = keepTransparency ? 'image/webp' : 'image/jpeg';
    const full = await pmDrawScaled(bitmap, bitmap.width, bitmap.height, PM_MAX_FULL, fullMime, 0.82);
    const thumb = await pmDrawScaled(bitmap, bitmap.width, bitmap.height, PM_MAX_THUMB, 'image/jpeg', 0.72);
    bitmap.close && bitmap.close();
    return { full: full || file, thumb, wasReencoded: !!full };
  } catch (err) {
    console.warn('Image compress fallback — storing original:', err);
    return { full: file, thumb: null, wasReencoded: false };
  }
}

// returns Blob (image/jpeg) or null if the frame cannot be captured
function makeVideoPoster(file) {
  return new Promise((resolve) => {
    let done = false;
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    const url = URL.createObjectURL(file);
    const finish = (b) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(b);
    };
    const timer = setTimeout(() => finish(null), 8000);
    v.onloadeddata = () => {
      try {
        const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : 2;
        v.currentTime = Math.min(0.5, dur / 2);
      } catch (e) { finish(null); }
    };
    v.onseeked = () => {
      pmDrawScaled(v, v.videoWidth || 640, v.videoHeight || 360, PM_MAX_THUMB, 'image/jpeg', 0.72)
        .then((b) => finish(b));
    };
    v.onerror = () => finish(null);
    v.src = url;
  });
}
