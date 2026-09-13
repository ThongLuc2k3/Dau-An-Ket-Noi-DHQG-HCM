import{ChangeEvent,useEffect,useRef,useState}from'react';
import{Link,useNavigate}from'react-router-dom';
import{CV_CONFIG}from'../lib/config';
import{demoEvents}from'../lib/events';
import{cosine,embed,loadEmbeddingModel}from'../lib/cv';
import{request}from'../lib/api';

type Stage='loading'|'scanning'|'checking'|'found'|'error';
type QRDetector={detect:(source:CanvasImageSource)=>Promise<Array<{rawValue:string}>>};

export default function Scan(){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),timer=useRef<number>(),busy=useRef(false),references=useRef<Array<{slug:string;embedding:number[]}>>(),qrDetector=useRef<QRDetector>();
 const[stage,setStage]=useState<Stage>('loading'),[message,setMessage]=useState('Đang mở camera…'),[progress,setProgress]=useState(0),[preview,setPreview]=useState('');const nav=useNavigate();
 const stop=()=>{clearInterval(timer.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null};
 useEffect(()=>{startCamera();return stop},[]);

 function openQR(text:string){try{const url=new URL(text,location.origin),match=url.pathname.match(/^\/e\/([a-z0-9-]+)(?:\/watch)?$/);if(!match)return false;stop();setStage('found');setMessage('Đã đọc mã QR');setTimeout(()=>nav(`/e/${match[1]}/watch`),200);return true}catch{return false}}
 async function prepare(){setStage('loading');setMessage('Đang chuẩn bị nhận diện…');await loadEmbeddingModel(setProgress);const Detector=(window as any).BarcodeDetector;if(Detector&&!qrDetector.current)try{qrDetector.current=new Detector({formats:['qr_code']})}catch{/* Trình duyệt không hỗ trợ QR native */}}
 async function checkCanvas(c:HTMLCanvasElement,finalAttempt=false){if(busy.current)return;busy.current=true;try{const codes=await qrDetector.current?.detect(c);if(codes?.[0]&&openQR(codes[0].rawValue))return;setStage('checking');setMessage('Đang tìm dấu ấn gần nhất…');const vector=await embed(c);let match:{slug:string;score:number}|undefined;try{match=(await request<{slug:string;score:number}[]>('/events/match',{method:'POST',body:JSON.stringify({embedding:vector,topK:1})}))[0]}catch(e){if(!(e instanceof TypeError))throw e}
  /* Không có match từ API (offline HOẶC API sống nhưng chưa có event active nào trong DB) -> thử tiếp với 3 ảnh demo cục bộ, chỉ tải khi thật sự cần */
  if(!match){references.current??=await Promise.all(demoEvents.map(async event=>({slug:event.slug,embedding:await embed(event.reference_image_path)})));match=references.current.map(item=>({slug:item.slug,score:cosine(vector,item.embedding)})).sort((a,b)=>b.score-a.score)[0]}
  if(match.score<CV_CONFIG.embeddingThreshold){if(finalAttempt){stop();nav('/e/khong-tim-thay?reason=no-match');return}setStage('scanning');setMessage('Đưa ảnh hoặc mã QR vào trong khung');return}stop();setStage('found');setMessage(`Đã khớp ${Math.round(match.score*100)}%`);setTimeout(()=>nav(`/e/${match.slug}/watch`),250)}catch(e:any){if(finalAttempt)nav('/e/khong-tim-thay?reason=processing-error');else{setStage('error');setMessage(e.message||'Không thể xử lý ảnh.')}}finally{busy.current=false}}
 async function startCamera(){try{stop();setPreview('');await prepare();try{stream.current=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false})}catch(e:any){if(e.name!=='NotFoundError'&&e.name!=='OverconstrainedError'&&e.name!=='DevicesNotFoundError')throw e;stream.current=await navigator.mediaDevices.getUserMedia({video:true,audio:false})}if(!video.current)return;video.current.srcObject=stream.current;await video.current.play();setStage('scanning');setMessage('Đưa ảnh hoặc mã QR vào trong khung');timer.current=window.setInterval(()=>{if(!video.current?.videoWidth||busy.current)return;const c=captureFrame();if(c)checkCanvas(c)},CV_CONFIG.scanIntervalMs)}catch(e:any){stop();setStage('error');setMessage(e.name==='NotAllowedError'?'Bạn chưa cấp quyền camera. Hãy tải ảnh từ máy hoặc cấp lại quyền.':e.name==='NotFoundError'||e.name==='DevicesNotFoundError'?'Thiết bị không có camera. Bạn vẫn có thể tải ảnh từ máy.':e.message||'Không thể mở camera.')}}
 function captureFrame(){
  const v=video.current;if(!v?.videoWidth)return null;
  // Khung hiển thị (.scan-frame/video trong scan-minimal.css) luôn tỉ lệ 3:2 và video dùng object-fit:cover,
  // nên phải crop native frame về đúng tỉ lệ đó trước khi mã hóa — nếu không, ảnh đưa vào embed rộng hơn
  // nhiều so với vùng người dùng canh thẻ trên màn hình, làm vector lệch khỏi ảnh đại diện.
  const targetAR=CV_CONFIG.scanFrameAspect,vw=v.videoWidth,vh=v.videoHeight,nativeAR=vw/vh;
  let sx=0,sy=0,cropW=vw,cropH=vh;
  if(nativeAR>targetAR){cropW=vh*targetAR;sx=(vw-cropW)/2}else{cropH=vw/targetAR;sy=(vh-cropH)/2}
  const scale=Math.min(1,CV_CONFIG.maxFrameEdge/cropW),c=document.createElement('canvas');
  c.width=cropW*scale;c.height=cropH*scale;
  c.getContext('2d')!.drawImage(v,sx,sy,cropW,cropH,0,0,c.width,c.height);
  return c
 }
 async function waitForIdle(){while(busy.current)await new Promise(resolve=>setTimeout(resolve,40))}
 async function takePhoto(){const c=captureFrame();if(!c)return;stop();setPreview(c.toDataURL('image/jpeg',.9));await waitForIdle();await checkCanvas(c,true)}
 async function uploadImage(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;try{stop();await prepare();const image=await createImageBitmap(file,{imageOrientation:'from-image'}),c=document.createElement('canvas'),scale=Math.min(1,CV_CONFIG.maxFrameEdge/image.width);c.width=image.width*scale;c.height=image.height*scale;c.getContext('2d')!.drawImage(image,0,0,c.width,c.height);setPreview(c.toDataURL('image/jpeg',.9));await waitForIdle();await checkCanvas(c,true)}catch{nav('/e/khong-tim-thay?reason=processing-error')}finally{e.target.value=''}}

 return <main className="scanner scanner-minimal"><video ref={video} muted playsInline/>{preview&&<img className="captured-preview" src={preview} alt="Ảnh đang được nhận diện"/>}<div className="scan-shade"/><Link to="/" onClick={stop} className="icon-btn close-button" aria-label="Đóng trình quét">✕</Link><div className="scan-frame"><i/><i/><i/><i/></div>{stage==='error'&&<div className="scan-error"><span>{message}</span><button onClick={startCamera}>Thử lại</button></div>}<div className="capture-actions"><button className="capture-button" onClick={takePhoto} disabled={!stream.current}>Chụp ảnh</button><label className="upload-only">Tải ảnh từ máy<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage}/></label></div></main>
}
