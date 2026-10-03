importScripts('/cv/opencv.js');
var ORB_FEATURES=800,REF_MAX_EDGE=640;
var cvReady=null;
function ensureCV(){
 if(cvReady)return cvReady;
 cvReady=new Promise(function(resolve,reject){
  var done=false;
  var timeout=setTimeout(function(){if(done)return;done=true;cvReady=null;reject(new Error('Không khởi tạo được bộ xác minh hình học.'))},30000);
  var finish=function(cv){if(done||!cv||!cv.Mat)return;done=true;clearTimeout(timeout);resolve(cv)};
  var cv=self.cv;
  if(cv&&cv.Mat)return finish(cv);
  if(cv&&typeof cv.then==='function'){cv.then(function(ready){self.cv=ready;finish(ready)});return}
  if(cv)cv.onRuntimeInitialized=function(){finish(self.cv)};
  else{done=true;clearTimeout(timeout);reject(new Error('Không tải được OpenCV.js trong worker.'))}
 });
 return cvReady
}
var refCache=new Map();
function referenceFeatures(cv,referenceUrl){
 var cached=refCache.get(referenceUrl);
 if(!cached){
  cached=(async function(){
   var res=await fetch(referenceUrl);
   if(!res.ok)throw new Error('Không tải được ảnh tham chiếu.');
   var bitmap=await createImageBitmap(await res.blob());
   var scale=Math.min(1,REF_MAX_EDGE/Math.max(bitmap.width,bitmap.height));
   var w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
   var oc=new OffscreenCanvas(w,h),octx=oc.getContext('2d');
   octx.drawImage(bitmap,0,0,w,h);
   var imgData=octx.getImageData(0,0,w,h);
   var mat=cv.matFromImageData(imgData),gray=new cv.Mat();
   cv.cvtColor(mat,gray,cv.COLOR_RGBA2GRAY);mat.delete();
   var orb=new cv.ORB(ORB_FEATURES),keypoints=new cv.KeyPointVector(),descriptors=new cv.Mat(),noMask=new cv.Mat();
   orb.detectAndCompute(gray,noMask,keypoints,descriptors);orb.delete();gray.delete();noMask.delete();
   return{keypoints:keypoints,descriptors:descriptors}
  })().catch(function(e){refCache.delete(referenceUrl);throw e});
  refCache.set(referenceUrl,cached)
 }
 return cached
}
function verify(cv,imageData,ref,minInliers,minInlierRatio){
 var owned=[],own=function(m){owned.push(m);return m};
 try{
  var qmat=cv.matFromImageData(imageData),ga=own(new cv.Mat());
  cv.cvtColor(qmat,ga,cv.COLOR_RGBA2GRAY);qmat.delete();
  var orb=own(new cv.ORB(ORB_FEATURES)),ka=own(new cv.KeyPointVector()),da=own(new cv.Mat()),noMask=own(new cv.Mat());
  orb.detectAndCompute(ga,noMask,ka,da);
  var matcher=own(new cv.BFMatcher(cv.NORM_HAMMING,false)),pairs=own(new cv.DMatchVectorVector());
  matcher.knnMatch(da,ref.descriptors,pairs,2);
  var good=[];
  for(var i=0;i<pairs.size();i++){var p=pairs.get(i);if(p.size()>=2&&p.get(0).distance<0.75*p.get(1).distance)good.push(p.get(0))}
  var inliers=0,valid=false;
  if(good.length>=4){
   var src=[],dst=[];
   for(var j=0;j<good.length;j++){var m=good[j],pt=ka.get(m.queryIdx).pt,qt=ref.keypoints.get(m.trainIdx).pt;src.push(pt.x,pt.y);dst.push(qt.x,qt.y)}
   var sm=own(cv.matFromArray(good.length,1,cv.CV_32FC2,src)),dm=own(cv.matFromArray(good.length,1,cv.CV_32FC2,dst)),mask=own(new cv.Mat());
   var H=own(cv.findHomography(sm,dm,cv.RANSAC,4,mask));
   for(var k=0;k<mask.rows;k++)inliers+=mask.data[k]?1:0;
   valid=!H.empty()&&inliers>=minInliers&&inliers/good.length>=minInlierRatio
  }
  return{goodMatches:good.length,inliers:inliers,inlierRatio:good.length?inliers/good.length:0,homographyValid:valid}
 }finally{owned.forEach(function(v){v.delete&&v.delete()})}
}
self.onmessage=async function(e){
 var d=e.data,id=d.id;
 try{
  var cv=await ensureCV();
  var ref=await referenceFeatures(cv,d.referenceUrl);
  var imageData=new ImageData(new Uint8ClampedArray(d.image.data),d.image.width,d.image.height);
  var result=verify(cv,imageData,ref,d.minInliers,d.minInlierRatio);
  self.postMessage({id:id,result:result})
 }catch(err){
  self.postMessage({id:id,error:(err&&err.message)||String(err)})
 }
}
