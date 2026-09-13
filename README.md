# Dấu Ấn Kết Nối

Web mobile-first để quản trị ảnh–video sự kiện, nhận diện thẻ bằng camera, xác minh hình học và mở video/QR dự phòng. Giao diện được dựng từ ba tài liệu gốc; các tệp gốc ở thư mục gốc không bị sửa.

## Đầu vào và demo

- `02_...ThuyetMinh...pdf`: thông điệp, đối tượng, quy cách 100 × 150 mm.
- `03_...ThietKe...png`: bố cục/màu/phong cách.
- `04_...FileGoc...svg`: vector tham chiếu thương hiệu.
- Ảnh seed: `1789278323015_...6afee5d.jpg` (1280 × 720).
- Video seed: `1789278322951_...5649.mp4` (H.264/AAC, 1280 × 720, 17,51 giây).

Không có biến môi trường, app chạy **demo chỉ đọc** với cặp seed tại `/e/khoanh-khac-ket-noi-2026`. Ghi dữ liệu không bị giả lập: form quản trị yêu cầu backend thật.

## Kiến trúc

React 18 + TypeScript + Vite phục vụ UI. Backend Express dùng chung PostgreSQL và Cloudinary của Healthy-Skin nhưng cô lập trong schema/folder `dau_an_ket_noi`; JWT và secret chỉ tồn tại ở server. Pipeline client tạo vector 384 chiều `DAKN-grid-gradient/1.0.0` (lưới màu + gradient, L2-normalized) để lấy ứng viên; OpenCV.js 4.10 chạy ORB, BF/Hamming, ratio test và RANSAC homography để chặn phát nhầm. Camera frame chỉ nằm trong canvas RAM và không được upload/lưu.

`src/lib/config.ts` và `computer-vision/thresholds.json` chứa mọi ngưỡng. Bản baseline nhẹ này phù hợp demo ít event; khi dữ liệu lớn, thay extractor bằng DINOv2-small qua Transformers.js, đổi cột `vector(384)` nếu cần, re-embed toàn bộ ảnh và không trộn phiên bản model.

> Lưu ý kỹ thuật: giao diện AR trong source hiện cung cấp camera + video plane/fallback, nhưng asset seed chưa có `.mind`, nên chưa thể image-track pose. Trước nghiệm thu WebAR thật phải biên dịch target bằng MindAR CLI/compiler và nối runtime như mục “Target AR” dưới đây. App cố ý không tuyên bố tracking khi target chưa tồn tại.

## Chạy local

Yêu cầu Node 20+ và HTTPS để dùng camera trên thiết bị khác (`localhost` được trình duyệt miễn trừ).

```bash
npm install
cp .env.example .env
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

## Backend Healthy-Skin dùng chung

Credential nằm trong `server/.env` (đã git-ignore). Chạy `npm run db:migrate`, `npm run dev:server` để mở API cổng 4100, rồi `npm run dev` cho frontend. Dữ liệu nằm riêng trong schema PostgreSQL `dau_an_ket_noi`; asset Cloudinary dùng prefix cùng tên. Gemini/Groq không được sử dụng.

## Thiết lập Supabase thay thế

1. Tạo project free, mở SQL Editor và chạy `database/migrations/001_initial.sql`.
2. Migration bật `vector`, tạo schema/index HNSW, trigger profile, RPC `match_active_events`, sáu bucket và RLS.
3. Authentication → Providers: bật Email. Production nên tắt public signup hoặc giới hạn domain.
4. Authentication → Users: tạo user đầu tiên. Trigger tạo profile; sau đó chạy `update profiles set role='admin' where email='...';` trong SQL Editor.
5. Điền URL và anon key vào `.env`; tuyệt đối không đưa service-role key vào client.
6. Với bucket private, production API cần tạo signed URL ngắn hạn sau khi xác nhận event active. Không đổi bucket thành public nếu yêu cầu thu hồi ngay khi inactive.

Mỗi object có đường dẫn `owner_id/event_id/file`; MIME và dung lượng bị kiểm tra ở cả UI/bucket. Video MP4 được Storage/CDN hỗ trợ byte range. Giới hạn mặc định: ảnh 12 MB, video 150 MB, target 20 MB. Khi upload lớn, nén H.264/AAC trước bằng ffmpeg/HandBrake.

## Đăng ký và xử lý

Vào `/admin/login` → “Đăng ký dấu ấn mới”, nhập metadata, ảnh và MP4. UI đọc độ sáng, tương phản, cạnh/đặc trưng; tạo embedding; upload rồi lưu record. Pipeline production cần bổ sung worker trích frame (`ffmpeg`), so embedding top frames, ORB/RANSAC và cập nhật `best_video_frame_time`, các metric cùng trạng thái job.

Chỉ chuyển `ready → active` sau khi `reference_image_path`, `video_path`, `embedding` và `target_path` tồn tại; database constraint bảo vệ quy tắc này. Cảnh báo similarity thấp có thể được admin ghi đè nhưng phải lưu dấu quyết định.

### Target AR

MindAR compiler phải dùng API đúng phiên bản được khóa, tốt nhất chạy ở trình duyệt quản trị để không phụ thuộc serverless native runtime: nạp ảnh, `compileImageTargets([image], progress)`, `exportData()`, tạo Blob `.mind`, upload vào `ar-targets/{owner}/{event}/target.mind`. Runtime chỉ tải target sau khi xác minh event, tạo video texture `playsinline muted`, pause khi `targetLost`, resume khi `targetFound`, và dispose stream/WebGL khi đóng.

## Vector search và confidence gate

Client gửi **vector**, không gửi frame, tới `/api/events/match`; API chỉ xét event active và trả top-1. Ứng dụng mở event khi cosine similarity đạt ít nhất `0,85`. Chế độ nhanh này không tải/chạy OpenCV trong luồng chính. QR bỏ qua embedding và mở trực tiếp event theo slug. Endpoint được rate-limit để tránh lạm dụng.

## QR, thẻ in và đổi domain

Trang event `/e/{slug}`, fallback `/e/{slug}/watch`. Nút “Tải QR” sinh PNG cao phân giải theo `location.origin`. Bộ mẫu nằm trong `print/`: SVG chỉnh sửa được, PDF in thử, PNG preview, QR SVG/PNG. Mẫu có canvas 106 × 156 mm gồm bleed 3 mm; trim 100 × 150 mm; safe area thêm 3 mm. Đầu ra là **RGB**, nhà in phải chuyển profile CMYK và kiểm proof. QR mẫu dùng `domain.example`; tạo lại từ dashboard sau khi có domain thật.

## Deploy HTTPS

Deploy `dist/` lên Vercel, Netlify hoặc Cloudflare Pages; build `npm run build`, output `dist`. Khai báo ba biến `VITE_*`, cấu hình SPA rewrite mọi route về `/index.html`, thêm domain vào Supabase Auth URL allow-list. Không có credential/hosting trong workspace nên repository không thể tự tạo URL triển khai.

## Free tier và riêng tư

Quota Supabase/hosting thay đổi theo thời điểm: kiểm tra dashboard hiện tại trước sự kiện. Video là phần tốn dung lượng/băng thông nhất; project free có thể pause khi ít dùng. Chuẩn bị MP4 offline hoặc bản tải sẵn cho buổi trình diễn. Không log embedding cùng thông tin cá nhân; không lưu camera frame; dừng mọi track khi đóng/quay sang video thường.

Xem [TESTING.md](TESTING.md) cho ma trận CV, trình duyệt, lỗi và RLS. Các nội dung chưa có thiết bị/backend thật được ghi rõ, không được coi là đã nghiệm thu.
