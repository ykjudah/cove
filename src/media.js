export const PREFIX='[[tungchat-media:v1]]';
export function mediaId(body){const m=typeof body==='string'&&body.match(/^\[\[tungchat-media:v1\]\]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);return m?.[1]||null;}
export async function prepareMedia(file,kind){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a JPG, PNG, or WebP image smaller than 10 MB.');
 const image=await createImageBitmap(file);try{
 if(!image.width||!image.height||image.width>12000||image.height>12000)throw Error('Image dimensions are too large.');
 const max=kind==='emoji'?128:1600,scale=Math.min(1,max/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));if(!blob||blob.size>(kind==='emoji'?65536:2097152))throw Error('Image is too large after resizing. Choose a simpler or smaller image.');return blob;
 }finally{image.close();}
}
