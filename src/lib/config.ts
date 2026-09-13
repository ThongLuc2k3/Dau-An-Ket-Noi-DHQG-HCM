export const CV_CONFIG={model:'DAKN-grid-gradient',modelVersion:'1.0.0',dimension:384,inputSize:224,scanIntervalMs:900,topK:1,embeddingThreshold:0.75,marginThreshold:0,minGoodMatches:0,minInliers:0,minInlierRatio:0,maxFrameEdge:512,scanFrameAspect:3/2} as const;
export const STORAGE={imageMax:12*1024*1024,videoMax:150*1024*1024,imageTypes:['image/jpeg','image/png','image/webp'],videoTypes:['video/mp4']} as const;
export const APP_URL=import.meta.env.VITE_PUBLIC_APP_URL||(typeof location!=='undefined'?location.origin:'http://localhost:5173');
