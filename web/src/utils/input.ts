// ============ EDIT POSITION MODAL ============
// ============ UPLOAD IMAGE MODAL ============
// Compresses uploaded image to ~400px max dimension and stores it as data URL on account
export const compressImage=(file:File,maxDim=400,quality=0.82)=>new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();
  reader.addEventListener('error',()=>reject(new Error('Could not read file')),{once:true});
  reader.addEventListener('load',()=>{
    if(typeof reader.result!=='string'){reject(new Error('Could not read image'));return;}
    const img=new Image();
    img.addEventListener('error',()=>reject(new Error('Could not load image')),{once:true});
    img.addEventListener('load',()=>{
      try{
        const ratio=Math.min(maxDim/img.width,maxDim/img.height,1);
        const canvas=document.createElement('canvas');
        canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);
        const context=canvas.getContext('2d');
        if(!context)throw new Error('Canvas is unavailable');
        context.drawImage(img,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',quality));
      }catch(error){reject(error);}
    },{once:true});
    img.src=reader.result;
  },{once:true});
  reader.readAsDataURL(file);
});

export const numericRowValue=(row:object,key:string):number=>{const value=Reflect.get(row,key);return typeof value==='number'?value:0;};


export async function fetchImageFile(source: string): Promise<File> {
  const url = new URL(source);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Enter an HTTP image URL.');
  const response = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20_000) });
  if (!response.ok || !response.body) throw new Error('Image could not be imported.');
  const maximum = 20 * 1024 * 1024;
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get('content-length')) > maximum) throw new Error('Image must be under 20 MB.');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new Error('Image must be under 20 MB.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return new File(chunks, 'cover', { type: response.headers.get('content-type') ?? '' });
}
