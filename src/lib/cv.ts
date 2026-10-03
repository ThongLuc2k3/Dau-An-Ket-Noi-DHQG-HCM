import{CV_CONFIG}from'./config';import type{QualityResult}from'../types';
export async function loadEmbeddingModel(progress?: (p:number)=>void){progress?.(100);return true}
export async function embed(source:string|HTMLCanvasElement){let c:HTMLCanvasElement;if(typeof source==='string'){const img=new Image();img.crossOrigin='anonymous';img.src=source;await img.decode();c=document.createElement('canvas');c.width=CV_CONFIG.inputSize;c.height=CV_CONFIG.inputSize;c.getContext('2d')!.drawImage(img,0,0,c.width,c.height)}else{c=document.createElement('canvas');c.width=CV_CONFIG.inputSize;c.height=CV_CONFIG.inputSize;c.getContext('2d')!.drawImage(source,0,0,c.width,c.height)}const x=c.getContext('2d',{willReadFrequently:true})!,d=x.getImageData(0,0,c.width,c.height).data,v:number[]=[];for(let gy=0;gy<8;gy++)for(let gx=0;gx<8;gx++){let r=0,g=0,b=0,dx=0,dy=0,n=0;for(let y=gy*28;y<(gy+1)*28;y+=4)for(let xx=gx*28;xx<(gx+1)*28;xx+=4){const i=(y*224+xx)*4,j=(y*224+Math.min(223,xx+1))*4,k=(Math.min(223,y+1)*224+xx)*4;r+=d[i];g+=d[i+1];b+=d[i+2];dx+=Math.abs(d[i]-d[j]);dy+=Math.abs(d[i]-d[k]);n++}v.push(r/n/255,g/n/255,b/n/255,dx/n/255,dy/n/255,(Math.max(r,g,b)-Math.min(r,g,b))/n/255)}const norm=Math.hypot(...v)||1;return v.map(z=>z/norm)}
export function cosine(a:number[],b:number[]){let d=0,aa=0,bb=0;for(let i=0;i<Math.min(a.length,b.length);i++){d+=a[i]*b[i];aa+=a[i]**2;bb+=b[i]**2}return d/(Math.sqrt(aa*bb)||1)}
export async function quality(file:File):Promise<QualityResult>{const img=await createImageBitmap(file,{imageOrientation:'from-image'});const c=document.createElement('canvas');c.width=Math.min(img.width,640);c.height=Math.round(img.height*c.width/img.width);const x=c.getContext('2d',{willReadFrequently:true})!;x.drawImage(img,0,0,c.width,c.height);const d=x.getImageData(0,0,c.width,c.height).data;let sum=0,sum2=0,edges=0,prev=0;for(let i=0;i<d.length;i+=4){const y=.299*d[i]+.587*d[i+1]+.114*d[i+2];sum+=y;sum2+=y*y;if(i>4&&Math.abs(y-prev)>28)edges++;prev=y}const n=d.length/4,b=sum/n,contrast=Math.sqrt(sum2/n-b*b),sharpness=Math.min(100,edges/n*550),keypoints=Math.round(edges/7);return{brightness:Math.round(b),contrast:Math.round(contrast),sharpness:Math.round(sharpness),keypoints,verdict:(b<35||b>230||contrast<18||keypoints<80)?'warning':'pass'}}
type VerifyResult={goodMatches:number;inliers:number;inlierRatio:number;homographyValid:boolean};
const FAST_COMPARE_SIZE=64;
const fastRefCache=new Map<string,Promise<Uint8ClampedArray>>();
function pixels(source:CanvasImageSource){const c=document.createElement('canvas');c.width=FAST_COMPARE_SIZE;c.height=FAST_COMPARE_SIZE;const x=c.getContext('2d',{willReadFrequently:true})!;x.drawImage(source,0,0,c.width,c.height);return x.getImageData(0,0,c.width,c.height).data}
function referencePixels(referenceUrl:string){
 let cached=fastRefCache.get(referenceUrl);
 if(!cached){cached=(async()=>{const img=new Image();img.crossOrigin='anonymous';img.src=referenceUrl;await img.decode();return pixels(img)})().catch(e=>{fastRefCache.delete(referenceUrl);throw e});fastRefCache.set(referenceUrl,cached)}
 return cached
}
/* Ảnh upload thường chính là file cover (hoặc bản JPEG nén lại). So raster 64x64 giúp xác nhận
   trường hợp gần-trùng trong vài ms; ngưỡng rất cao nên ảnh chụp/crop/phối cảnh vẫn rơi xuống ORB. */
async function nearDuplicateSimilarity(query:HTMLCanvasElement,referenceUrl:string){
 const a=pixels(query),b=await referencePixels(referenceUrl);let difference=0;
 for(let i=0;i<a.length;i+=4)difference+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
 return 1-difference/((a.length/4)*3*255)
}
/* ORB/RANSAC là tính toán đồng bộ, nặng cho luồng JS chính — nếu chạy trực tiếp, mỗi lần xác minh
   có thể đơ TOÀN BỘ giao diện (không nút nào bấm được) trong lúc tính, và vì nó chặn luồng chính,
   một timeout kiểu setTimeout() cũng không cứu được (timer không chạy được khi luồng chính đang bận).
   Nên chạy trong Web Worker — giao diện luôn phản hồi được dù xác minh chậm cỡ nào. Nếu Worker không
   khởi tạo được (trình duyệt quá cũ), rơi xuống chạy trên luồng chính như cũ (chấp nhận có thể đơ). */
let worker:Worker|undefined,workerFailed=false,seq=0;
const pending=new Map<number,{resolve:(v:VerifyResult)=>void;reject:(e:any)=>void}>();
function getWorker(){
 if(workerFailed)return null;
 if(worker)return worker;
 try{
  worker=new Worker('/cv/verify-worker.js');
  worker.onmessage=(e:MessageEvent)=>{const{id,result,error}=e.data,p=pending.get(id);if(!p)return;pending.delete(id);error?p.reject(new Error(error)):p.resolve(result)};
  worker.onerror=()=>{workerFailed=true;pending.forEach(p=>p.reject(new Error('Worker xác minh hình học bị lỗi.')));pending.clear();worker=undefined};
  return worker
 }catch{workerFailed=true;return null}
}
export function preloadVerifier(){getWorker()}
function verifyInWorker(w:Worker,query:HTMLCanvasElement,referenceUrl:string):Promise<VerifyResult>{
 const ctx=query.getContext('2d')!,imageData=ctx.getImageData(0,0,query.width,query.height),id=++seq;
 return new Promise((resolve,reject)=>{
  pending.set(id,{resolve,reject});
  w.postMessage({id,referenceUrl,minInliers:CV_CONFIG.minInliers,minInlierRatio:CV_CONFIG.minInlierRatio,image:{data:imageData.data.buffer,width:imageData.width,height:imageData.height}},[imageData.data.buffer])
 })
}
export async function verifyHomography(query:HTMLCanvasElement,referenceUrl:string):Promise<VerifyResult>{
 try{if(await nearDuplicateSimilarity(query,referenceUrl)>=CV_CONFIG.nearDuplicateThreshold)return{goodMatches:0,inliers:0,inlierRatio:1,homographyValid:true}}catch{/* CORS/network lỗi thì vẫn dùng bộ xác minh hình học bên dưới. */}
 const w=getWorker();
 return w?verifyInWorker(w,query,referenceUrl):verifyHomographyMainThread(query,referenceUrl)
}

/* ---- Dự phòng chạy trên luồng chính, dùng khi trình duyệt không hỗ trợ Web Worker ---- */
let cvReady:Promise<any>|null=null;function loadOpenCV(){const existing=(window as any).cv;if(existing?.Mat)return Promise.resolve(existing);if(cvReady)return cvReady;cvReady=new Promise((resolve,reject)=>{let done=false;const finish=(cv:any)=>{if(done||!cv?.Mat)return;done=true;clearTimeout(timeout);resolve(cv)};const fail=()=>{if(done)return;done=true;cvReady=null;clearTimeout(timeout);reject(new Error('Không khởi tạo được bộ xác minh hình học. Hãy tải lại trang rồi thử lại.'))};const timeout=window.setTimeout(fail,30000);const s=document.createElement('script');s.src='/cv/opencv.js';s.async=true;s.onload=async()=>{try{let cv=(window as any).cv;if(cv&&typeof cv.then==='function')cv=await cv;if(cv?.Mat)return finish(cv);if(cv)cv.onRuntimeInitialized=()=>finish(cv);const poll=window.setInterval(()=>{const ready=(window as any).cv;if(ready?.Mat){clearInterval(poll);finish(ready)}if(done)clearInterval(poll)},100)}catch{fail()}};s.onerror=fail;document.head.appendChild(s)});return cvReady}
const REF_MAX_EDGE=640,ORB_FEATURES=800;
const refCache=new Map<string,Promise<{keypoints:any;descriptors:any}>>();
/* Ảnh tham chiếu không đổi giữa các lần xác minh, nên chỉ tải + trích đặc trưng ORB MỘT LẦN mỗi
   URL rồi cache lại — nếu không, mỗi lần thử (đặc biệt khi quét nền cứ lặp lại) sẽ tải ảnh gốc
   full-size và chạy ORB(1500) lại từ đầu, đủ để làm treo máy trên điện thoại. */
function referenceFeatures(cv:any,referenceUrl:string){
 let cached=refCache.get(referenceUrl);
 if(!cached){cached=(async()=>{
  const img=new Image();img.crossOrigin='anonymous';img.src=referenceUrl;await img.decode();
  const scale=Math.min(1,REF_MAX_EDGE/Math.max(img.naturalWidth,img.naturalHeight)),rc=document.createElement('canvas');
  rc.width=Math.round(img.naturalWidth*scale);rc.height=Math.round(img.naturalHeight*scale);
  rc.getContext('2d')!.drawImage(img,0,0,rc.width,rc.height);
  const b=cv.imread(rc),gray=new cv.Mat();cv.cvtColor(b,gray,cv.COLOR_RGBA2GRAY);b.delete();
  const orb=new cv.ORB(ORB_FEATURES),keypoints=new cv.KeyPointVector(),descriptors=new cv.Mat(),noMask=new cv.Mat();
  orb.detectAndCompute(gray,noMask,keypoints,descriptors);orb.delete();gray.delete();noMask.delete();
  return{keypoints,descriptors}
 })().catch(e=>{refCache.delete(referenceUrl);throw e});refCache.set(referenceUrl,cached)}
 return cached
}
async function verifyHomographyMainThread(query:HTMLCanvasElement,referenceUrl:string):Promise<VerifyResult>{
 const cv=await loadOpenCV(),ref=await referenceFeatures(cv,referenceUrl);
 /* Mat/vector của OpenCV.js là bộ nhớ WASM quản lý thủ công (không tự động dọn như JS thường) —
    hàm này chạy lặp lại liên tục khi quét trực tiếp, nên phải dọn hết bằng try/finally, kể cả khi
    có lỗi giữa chừng, nếu không sẽ rò rỉ bộ nhớ dần và có thể sập trên máy cấu hình thấp. */
 const owned:{delete?:()=>void}[]=[],own=<T extends{delete?:()=>void}>(m:T)=>{owned.push(m);return m};
 try{
  const a=cv.imread(query),ga=own(new cv.Mat());cv.cvtColor(a,ga,cv.COLOR_RGBA2GRAY);a.delete();
  const orb=own(new cv.ORB(ORB_FEATURES)),ka=own(new cv.KeyPointVector()),da=own(new cv.Mat()),noMask=own(new cv.Mat());
  orb.detectAndCompute(ga,noMask,ka,da);
  const matcher=own(new cv.BFMatcher(cv.NORM_HAMMING,false)),pairs=own(new cv.DMatchVectorVector());
  matcher.knnMatch(da,ref.descriptors,pairs,2);
  const good:any[]=[];for(let i=0;i<pairs.size();i++){const p=pairs.get(i);if(p.size()>=2&&p.get(0).distance<.75*p.get(1).distance)good.push(p.get(0))}
  let inliers=0,valid=false;
  if(good.length>=4){
   const src=[],dst=[];for(const m of good){const p=ka.get(m.queryIdx).pt,q=ref.keypoints.get(m.trainIdx).pt;src.push(p.x,p.y);dst.push(q.x,q.y)}
   const sm=own(cv.matFromArray(good.length,1,cv.CV_32FC2,src)),dm=own(cv.matFromArray(good.length,1,cv.CV_32FC2,dst)),mask=own(new cv.Mat());
   const H=own(cv.findHomography(sm,dm,cv.RANSAC,4,mask));
   for(let i=0;i<mask.rows;i++)inliers+=mask.data[i]?1:0;
   valid=!H.empty()&&inliers>=CV_CONFIG.minInliers&&inliers/good.length>=CV_CONFIG.minInlierRatio
  }
  return{goodMatches:good.length,inliers,inlierRatio:good.length?inliers/good.length:0,homographyValid:valid}
 }finally{owned.forEach(v=>v.delete?.())}
}
