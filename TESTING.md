# Kế hoạch kiểm thử

## Tự động

Chạy `npm run typecheck`, `npm test`, `npm run build`. Test kiểm tra cấu hình confidence gate và phép cosine. Migration cần được chạy trên một Supabase staging rồi dùng hai tài khoản A/B để xác nhận RLS.

## Ma trận CV thủ công

Với mỗi ảnh: ghi top-1, top-2, margin, good matches, inliers, inlier ratio và thời gian. Chạy tối thiểu 20 lượt cho: ảnh gốc; bản in; nghiêng 15°/30°/45°; 0,3/0,7/1,5 m; thiếu/dư sáng; phản chiếu; blur; crop; che 5/10/15%; xước nhẹ; ảnh sự kiện tương tự; ảnh không liên quan. Chỉ hiệu chỉnh `computer-vision/thresholds.json` trên tập calibration, rồi đo tập test độc lập. Mục tiêu ưu tiên false acceptance = 0; báo cáo top-1 accuracy, FAR, FRR, p50/p95 thời gian nhận diện, tải model và nhận diện→AR.

## Thiết bị/trình duyệt

- Chrome Android và Safari iOS thật: camera sau, xoay màn hình, từ chối quyền, camera bận, mạng chậm, autoplay muted, bật tiếng, fullscreen.
- Chrome desktop với webcam; WebGL tắt; model/OpenCV/target/video lỗi tải.
- Mất target rồi tìm lại; đóng AR phải tắt đèn camera; fallback video không giữ stream.
- QR mở đúng slug; event inactive/không tồn tại không xem được.
- Khách không vào CRUD; A không đọc/sửa/xóa event của B; admin hệ thống có quyền theo chính sách.

Chưa có thiết bị di động gắn với môi trường này nên các mục phần cứng/WebAR phải được xác nhận thủ công trước trình diễn.
