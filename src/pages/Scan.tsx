import{ChangeEvent,useEffect,useRef,useState}from'react';
import{Link,useNavigate}from'react-router-dom';
import{CV_CONFIG}from'../lib/config';
import{demoEvents,publicEvent,assetUrl,videoUrl}from'../lib/events';
import{cosine,embed,loadEmbeddingModel}from'../lib/cv';
import{request}from'../lib/api';
import type{EventRecord}from'../types';

type Stage='loading'|'scanning'|'checking'|'found'|'not-found'|'error';
type QRDetector={detect:(source:CanvasImageSource)=>Promise<Array<{rawValue:string}>>};

export default function Scan(){
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),timer=useRef<number>(),busy=useRef(false),references=useRef<Array<{slug:string;embedding:number[];referenceUrl:string}>>(),qrDetector=useRef<QRDetector>(),revealVideo=useRef<HTMLVideoElement>(null),revealTimer=useRef<number>(),revealStarted=useRef(false),liveStreak=useRef({slug:'',count:0}),attempt=useRef(0);
 const[stage,setStage]=useState<Stage>('loading'),[message,setMessage]=useState('Đang mở camera…'),[progress,setProgress]=useState(0),[preview,setPreview]=useState(''),[revealEvent,setRevealEvent]=useState<EventRecord|null>(null),[revealPlay,setRevealPlay]=useState(false);const nav=useNavigate(),cameraAvailable=Boolean(navigator.mediaDevices?.getUserMedia);
 /* attempt.current invalidates any in-flight checkCanvas/runMatch/revealMatch call — mỗi lần dừng
    camera (đóng, chụp lại, tải ảnh khác, hoặc mở lại) đều phải huỷ tác vụ nhận diện đang chạy dở,
    nếu không nó có thể hoàn tất trễ và gọi stop()/nav() đè lên phiên quét mới đang diễn ra. */
 const stop=()=>{attempt.current++;clearInterval(timer.current);clearTimeout(revealTimer.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null};
 useEffect(()=>{startCamera();return stop},[]);
 async function revealMatch(slug:string,my:number){
  let event:EventRecord|null;try{event=await publicEvent(slug)}catch{event=null}
  if(my!==attempt.current)return;
  if(!event?.video_path){nav(`/e/${slug}/watch`);return}
  clearTimeout(revealTimer.current);revealStarted.current=false;setRevealPlay(false);
  setMessage('Đã khớp ảnh · đang tải video…');setRevealEvent(event)
 }

 function revealWhenReady(){
  const v=revealVideo.current;if(!v||revealStarted.current)return;
  revealStarted.current=true;
  clearTimeout(revealTimer.current);
  /* Đợi lớp video được vẽ ở opacity 0 rồi mới bật transition để ảnh và video hòa vào nhau. */
  revealTimer.current=window.setTimeout(()=>{v.muted=true;setRevealPlay(true);void v.play().catch(()=>{})},80)
 }

 function replayVideo(){const v=revealVideo.current;if(!v)return;v.currentTime=0;v.play().catch(()=>{})}
 function openQR(text:string){try{const url=new URL(text,location.origin),match=url.pathname.match(/^\/e\/([a-z0-9-]+)(?:\/watch)?$/);if(!match)return false;stop();setStage('found');setMessage('Đã đọc mã QR');setTimeout(()=>nav(`/e/${match[1]}/watch`),200);return true}catch{return false}}
 async function prepare(){setStage('loading');setMessage('Đang chuẩn bị nhận diện…');await loadEmbeddingModel(setProgress);const Detector=(window as any).BarcodeDetector;if(Detector&&!qrDetector.current)try{qrDetector.current=new Detector({formats:['qr_code']})}catch{/* Trình duyệt không hỗ trợ QR native */}}
 async function checkCanvas(c:HTMLCanvasElement,finalAttempt=false){if(busy.current)return;busy.current=true;const my=++attempt.current;try{await Promise.race([runMatch(c,finalAttempt,my),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Quá thời gian xử lý. Vui lòng thử lại.')),CV_CONFIG.matchTimeoutMs))])}catch(e:any){if(my!==attempt.current)return;setStage('error');setMessage(e.message||'Không thể xử lý ảnh.')}finally{busy.current=false}}
 /* my=attempt.current tại lúc khởi động lệnh quét này — nếu attempt.current đã đổi khi một bước
    await bên dưới xong (do stop() chạy vì người dùng đóng/chụp lại/mở lại camera, hoặc do vòng lặp
    Promise.race ở checkCanvas đã hết giờ), nghĩa là lượt quét này đã lỗi thời: phải dừng ngay, không
    được set state/nav nữa — nếu không, một runMatch bị bỏ rơi hoàn tất trễ có thể stop()/điều hướng
    đè lên phiên quét mới đang chạy. */
 async function runMatch(c:HTMLCanvasElement,finalAttempt:boolean,my:number){
  const stale=()=>my!==attempt.current;
  const giveUp=()=>{liveStreak.current={slug:'',count:0};if(finalAttempt){stop();setStage('not-found');setMessage('Không tìm thấy video khớp với ảnh này.')}else{setStage('scanning');setMessage('Đưa ảnh hoặc mã QR vào trong khung')}};
  const codes=await qrDetector.current?.detect(c);if(stale())return;if(codes?.[0]&&openQR(codes[0].rawValue))return;
  setStage('checking');setMessage('Đang tạo embedding ảnh…');
  const vector=await embed(c);if(stale())return;
  setMessage('Đang so khớp với kho dấu ấn…');
  let ranked:{slug:string;score:number;target_url?:string;reference_image_url?:string}[]|undefined;
  try{ranked=await request('/events/match',{method:'POST',body:JSON.stringify({embedding:vector,topK:CV_CONFIG.topK})})}catch(e){if(!(e instanceof TypeError))throw e}
  if(stale())return;
  /* Luôn gộp ứng viên API với dataset demo để event trong DB không che mất ảnh local. */
  references.current??=await Promise.all(demoEvents.map(async event=>({slug:event.slug,embedding:await embed(event.reference_image_path),referenceUrl:event.reference_image_path})));
  if(stale())return;
  const localRanked=references.current.map(item=>({slug:item.slug,score:cosine(vector,item.embedding),reference_image_url:item.referenceUrl}));
  ranked=Array.from(new Map([...localRanked,...(ranked||[])].map(item=>[item.slug,item])).values()).sort((a,b)=>b.score-a.score);
  const[match]=ranked;
  /* Quy tắc sản phẩm: sắp xếp giảm dần, lấy top 1 và chấp nhận khi điểm đạt ít nhất 70%. */
  if(match.score<CV_CONFIG.embeddingThreshold){giveUp();return}
  if(!finalAttempt){
   /* Quét trực tiếp: bắt buộc 2 khung liên tiếp ra cùng ứng viên để tránh bắt nhầm thoáng qua. */
   liveStreak.current=liveStreak.current.slug===match.slug?{slug:match.slug,count:liveStreak.current.count+1}:{slug:match.slug,count:1};
   if(liveStreak.current.count<2){setStage('scanning');return}
  }
  liveStreak.current={slug:'',count:0};
  const scoreLabel=`Đã khớp ${Math.round(match.score*100)}%`;
  if(finalAttempt){setStage('found');setMessage(scoreLabel);await revealMatch(match.slug,my);return}
  stop();setStage('found');setMessage(scoreLabel);setTimeout(()=>nav(`/e/${match.slug}/watch`),250)
 }
 async function startCamera(){try{stop();setPreview('');liveStreak.current={slug:'',count:0};if(!navigator.mediaDevices?.getUserMedia){setStage('error');setMessage('Camera chỉ hoạt động trên HTTPS hoặc localhost. Bạn vẫn có thể tải ảnh từ máy.');return}await prepare();try{stream.current=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false})}catch(e:any){if(e.name!=='NotFoundError'&&e.name!=='OverconstrainedError'&&e.name!=='DevicesNotFoundError')throw e;stream.current=await navigator.mediaDevices.getUserMedia({video:true,audio:false})}if(!video.current)return;video.current.srcObject=stream.current;await video.current.play();setStage('scanning');setMessage('Đưa ảnh hoặc mã QR vào trong khung');timer.current=window.setInterval(()=>{if(!video.current?.videoWidth||busy.current)return;const c=captureFrame();if(c)checkCanvas(c)},CV_CONFIG.scanIntervalMs)}catch(e:any){stop();setStage('error');setMessage(e.name==='NotAllowedError'?'Bạn chưa cấp quyền camera. Hãy tải ảnh từ máy hoặc cấp lại quyền.':e.name==='NotFoundError'||e.name==='DevicesNotFoundError'?'Thiết bị không có camera. Bạn vẫn có thể tải ảnh từ máy.':e.message||'Không thể mở camera.')}}
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
 /* Lớp bảo vệ thứ 2: nếu vì lý do gì đó checkCanvas() không tự giải phóng busy (không nên xảy ra
    vì đã có timeout riêng ở đó), vẫn có giới hạn thời gian chờ ở đây để không kẹt vô hạn, khiến
    "Chụp ảnh"/"Tải ảnh từ máy" không bao giờ phản hồi được nữa. */
 async function waitForIdle(){const deadline=Date.now()+CV_CONFIG.matchTimeoutMs+2000;while(busy.current&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,40));busy.current=false}
 async function takePhoto(){const c=captureFrame();if(!c)return;stop();revealStarted.current=false;setRevealEvent(null);setRevealPlay(false);setPreview(c.toDataURL('image/jpeg',.9));await waitForIdle();await checkCanvas(c,true)}
 async function uploadImage(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;stop();
  /* Hiện ngay ảnh vừa chọn + báo trạng thái, thay vì im lặng trong lúc createImageBitmap giải mã
     ảnh gốc (có thể mất cả giây với ảnh chụp từ điện thoại) — người dùng cần thấy ngay là đã nhận
     ảnh và đang xử lý, không phải chờ tới khi ảnh được resize/crop xong mới có phản hồi gì. */
  const objectUrl=URL.createObjectURL(file);
  revealStarted.current=false;setRevealEvent(null);setRevealPlay(false);setPreview(objectUrl);setStage('checking');setMessage('Đã nhận ảnh, đang so khớp…');
  try{await prepare();const image=await createImageBitmap(file,{imageOrientation:'from-image'}),c=document.createElement('canvas'),scale=Math.min(1,CV_CONFIG.maxFrameEdge/image.width);c.width=image.width*scale;c.height=image.height*scale;c.getContext('2d')!.drawImage(image,0,0,c.width,c.height);URL.revokeObjectURL(objectUrl);setPreview(c.toDataURL('image/jpeg',.9));await waitForIdle();await checkCanvas(c,true)}catch{URL.revokeObjectURL(objectUrl);setStage('error');setMessage('Không thể xử lý ảnh này. Vui lòng chọn ảnh khác.')}finally{e.target.value=''}}

 return <main className="scanner scanner-minimal"><video ref={video} muted playsInline/>{preview&&<img className="captured-preview" src={preview} alt="Ảnh đang được nhận diện"/>}{revealEvent&&<video ref={revealVideo} className={`captured-preview reveal-video${revealPlay?' is-visible':''}`} src={videoUrl(revealEvent.video_path)} poster={assetUrl(revealEvent.thumbnail_path)} muted controls playsInline preload="auto" onCanPlay={revealWhenReady} onError={()=>{setStage('error');setMessage('Không phát được video. Vui lòng thử lại.')}}/>}<div className="scan-shade"/><Link to="/" onClick={stop} className="icon-btn close-button" aria-label="Đóng trình quét">✕</Link><div className="scan-frame"><i/><i/><i/><i/></div>{preview&&!revealPlay&&stage!=='error'&&stage!=='not-found'&&<div className="scan-status"><span className="spinner"/><span>{message}</span></div>}{revealEvent&&revealPlay&&<div className="reveal-actions"><button type="button" className="reveal-btn" onClick={replayVideo}>↺ Xem lại</button><a className="reveal-btn" href={assetUrl(revealEvent.video_path)} download>⬇ Tải video</a></div>}{(stage==='error'||stage==='not-found')&&<div className={`scan-error${stage==='not-found'?' is-no-match':''}`}><span>{message}</span>{cameraAvailable&&<button onClick={startCamera}>Thử lại</button>}</div>}<div className="capture-actions"><button className="capture-button" onClick={takePhoto} disabled={!stream.current}>Chụp ảnh</button><label className="upload-only">Tải ảnh từ máy<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadImage} disabled={!!preview&&!revealPlay&&stage!=='error'&&stage!=='not-found'}/></label></div></main>
}
