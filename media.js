/* =====================================================================
   Client-side media processing (no build step, no libraries)
   - Full images/videos are uploaded ORIGINAL — zero quality loss.
   - makeImageThumb / makeVideoPoster generate a 1200px grid thumbnail
     (sharp on mobile retina) used for cards only.
   ===================================================================== */

const PM_THUMB_MAX = 1200;    // max long side of the grid thumbnail
const PM_THUMB_QUALITY = 0.85;

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

function pmThumbMime(sourceType) {
  // WebP keeps transparency for PNG/WebP sources; JPEG elsewhere
  return (sourceType === 'image/png' || sourceType === 'image/webp') ? 'image/webp' : 'image/jpeg';
}

// grid thumbnail from an image File/Blob — null if it fails
async function makeImageThumb(file) {
  try {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bitmap = await createImageBitmap(file); // older browsers: no EXIF option
    }
    const mime = pmThumbMime(file.type);
    const thumb = await pmDrawScaled(bitmap, bitmap.width, bitmap.height, PM_THUMB_MAX, mime, PM_THUMB_QUALITY);
    bitmap.close && bitmap.close();
    return thumb;
  } catch (err) {
    console.warn('thumbnail failed:', err);
    return null;
  }
}

// capture a frame (~0.5s) from a video File/Blob as a poster thumbnail
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
      pmDrawScaled(v, v.videoWidth || 640, v.videoHeight || 360, PM_THUMB_MAX, 'image/jpeg', PM_THUMB_QUALITY)
        .then((b) => finish(b));
    };
    v.onerror = () => finish(null);
    v.src = url;
  });
}
