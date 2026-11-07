export function validAvatar(value) {
  return typeof value === 'string' && value.length <= 32768 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
export async function prepareAvatar(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height || bitmap.width > 8192 || bitmap.height > 8192) throw new Error('Use an image no larger than 8192 pixels on either side.');
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#181c23'; ctx.fillRect(0,0,128,128);
    const size = Math.min(bitmap.width,bitmap.height);
    ctx.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,128,128);
    const result = canvas.toDataURL('image/jpeg',0.8);
    if (!validAvatar(result)) throw new Error('This image could not be resized. Try another picture.');
    return result;
  } finally { bitmap?.close(); }
}
