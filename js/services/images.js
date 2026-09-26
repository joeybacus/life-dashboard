/* Shrink a chosen photo to a small square JPEG (for the profile picture).
   It must stay under ~40,000 characters so it fits in one Google Sheets cell
   when synced (the limit there is 50,000). */
const MAX_CHARS = 40000;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image format could not be read.'));
    img.src = src;
  });
}

/** Draw the centre square of an image at `size` px and encode it, lowering quality until it fits. */
function encodeSquare(img, size) {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error('This image appears to be empty.');
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  let url = '';
  for (const quality of [0.85, 0.75, 0.62, 0.5, 0.4]) {
    url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_CHARS) return url;
  }
  return size > 128 ? null : url;
}

export async function imageFileToAvatar(file) {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Please choose an image.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return encodeSquare(img, 256) ?? encodeSquare(img, 128);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Make an existing photo small enough to sync (older versions saved larger ones). */
export async function fitPhotoForSync(dataUrl) {
  if (!dataUrl || dataUrl.length <= MAX_CHARS) return dataUrl;
  const img = await loadImage(dataUrl);
  return encodeSquare(img, 256) ?? encodeSquare(img, 128);
}
