# Dấu Ấn Kết Nối

Web mobile-first để quản trị ảnh–video sự kiện, nhận diện thẻ bằng camera, xác minh hình học và mở video/QR dự phòng. Giao diện được dựng từ ba tài liệu gốc; các tệp gốc ở thư mục gốc không bị sửa.

## Cấu trúc thư mục

```
src/                  Frontend React + TypeScript
  pages/              Các trang (Home, Scan, EventPage, admin CRUD...)
  components/         Component dùng chung
  lib/                 config, api client, xử lý CV, dữ liệu demo
  styles/              Toàn bộ CSS (import tập trung ở src/main.tsx)
server/               Backend Express (API + serve dist/ khi đã build)
  index.js             App chính: auth, CRUD event, vector match
  migrate.js           Chạy server/schema.sql lên Postgres
public/               Asset tĩnh được Vite copy nguyên vẹn vào dist/
  data/                Video/ảnh demo CNEP đã nén cho web (được app dùng)
  cv/                  OpenCV.js
computer-vision/       Ngưỡng nhận diện (thresholds.json)
print/                 Mẫu thẻ in QR (SVG/PDF/PNG)
supabase/              Schema + migration cho phương án thay thế bằng Supabase
Data/                  Asset nguồn gốc/nặng (chỉ local, không commit, xem .gitignore)
```

`Data/` chứa file gốc dùng để dựng lại `public/data` khi cần (video chưa nén, ảnh gốc, tài liệu thuyết minh); thư mục này chỉ tồn tại trên máy local và không được đẩy lên Git vì nặng và có thông tin cá nhân — chỉ `public/data` mới được app thực sự sử dụng.

## Đầu vào và demo

- Tài liệu thuyết minh gốc: thông điệp, đối tượng, quy cách 100 × 150 mm (chỉ lưu local vì có thông tin cá nhân).
- Bản concept và vector gốc: tham chiếu bố cục, màu sắc và thương hiệu (chỉ lưu local).
- Ba bộ dữ liệu CNEP: `CNEP-UEL`, `CNEP-USSH` và `CNEP-yeah`, mỗi bộ gồm cover 1280 × 720 và video H.264/AAC tương thích trình duyệt.

Khi API ngoại tuyến, app vẫn có thể minh họa ba bộ CNEP cục bộ. Đăng ký, đăng nhập, giới hạn quét và ghi dữ liệu yêu cầu backend thật.

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

Toàn bộ cấu hình nằm trong một file `.env` ở thư mục gốc (đã git-ignore). Vite chỉ đưa các biến có tiền tố `VITE_` vào frontend; database, JWT và API secret chỉ được backend đọc. Chạy `npm run db:migrate`, `npm run dev:server` để mở API cổng 4100, rồi `npm run dev` cho frontend.

Đăng nhập quản trị tiếp tục dùng `ADMIN_EMAIL` và `ADMIN_PASSWORD`; tài khoản thường có thể đăng ký bằng email/mật khẩu. Để bật Google, khai báo origin frontend (ví dụ `http://localhost:5173`) trong Authorized JavaScript origins và đặt `GOOGLE_CLIENT_ID` trong `.env`. Google account được tạo tự động ở lần đăng nhập đầu.

## Thiết lập Supabase thay thế

1. Tạo project free, mở SQL Editor và chạy `supabase/migrations/001_initial.sql`.
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

Client đã đăng nhập gửi **vector**, không gửi frame, tới `/api/events/match`; API tìm trên toàn bộ event `active` của mọi chủ sở hữu và trả top-1. Vì vậy tài khoản B có thể quét ảnh do A đăng ký, nhưng CRUD kho lưu trữ vẫn giới hạn theo `owner_id`. Endpoint giới hạn mặc định 40 lần/phút cho từng tài khoản; có thể đổi bằng `SCAN_RATE_LIMIT`. Ứng dụng mở event khi cosine similarity đạt ít nhất `0,85`. QR bỏ qua embedding và mở trực tiếp event theo slug.

## QR, thẻ in và đổi domain

Trang event `/e/{slug}`, fallback `/e/{slug}/watch`. Nút “Tải QR” sinh PNG cao phân giải theo `location.origin`. Bộ mẫu nằm trong `print/`: SVG chỉnh sửa được, PDF in thử, PNG preview, QR SVG/PNG. Mẫu có canvas 106 × 156 mm gồm bleed 3 mm; trim 100 × 150 mm; safe area thêm 3 mm. Đầu ra là **RGB**, nhà in phải chuyển profile CMYK và kiểm proof. QR mẫu dùng `domain.example`; tạo lại từ dashboard sau khi có domain thật.

## Deploy lên Render (một service duy nhất)

Server Express phục vụ cả API lẫn `dist/` (SPA fallback cho mọi route không phải `/api/*`), nên một Web Service Render chạy được toàn bộ app.

1. **New Web Service** → connect repo GitHub, branch `main`.
2. Cấu hình:
   - **Root Directory**: để trống (repo root).
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node server/index.js`
   - **Health Check Path**: `/api/dau-an-ket-noi/health`
3. **Environment** → khai báo tối thiểu:
   - `DATABASE_URL`, `JWT_SECRET` (bắt buộc, server sẽ crash khi thiếu)
   - `JWT_EXPIRES_IN` (mặc định `7d`), `SERVER_ENV=production`
   - `ADMIN_EMAIL`, `ADMIN_PASSWORD` (hoặc `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`)
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `GOOGLE_CLIENT_ID` (tùy chọn, để bật đăng nhập Google)
   - `WEB_ORIGIN` chỉ cần đặt nếu frontend chạy ở domain khác; khi dùng một service duy nhất có thể bỏ trống.
   - Không cần `PORT` — Render tự inject và `server/index.js` đọc `process.env.PORT`.
   - Không cần `VITE_API_BASE_URL`/`VITE_PUBLIC_APP_URL` cho cách deploy gộp này: frontend build sẽ tự gọi API cùng origin (`/api`) khi không khai báo hai biến trên.
   - **Không thêm `NODE_ENV=production`** trừ khi cần thiết cho việc khác: nhiều nền tảng Node (gồm npm) sẽ bỏ qua `devDependencies` khi biến này được set, và một số bản build trước đây của repo để `vite`/`typescript` ở `devDependencies` khiến `npm run build` fail rất nhanh (\~10s, đúng lỗi từng gặp trên service `Dau-An-Ket-Noi-DHQG-HCM`). Repo hiện đã chuyển `vite`/`typescript` sang `dependencies` nên vẫn build được dù có `NODE_ENV=production`, nhưng biến này không được code dùng tới (chỉ `SERVER_ENV` được đọc) — có thể xoá cho gọn.
   - Các biến sẵn có trên dashboard nhưng không được code dùng tới (`AI_PROVIDER`, `GEMINI_*`, `GROQ_*`, `PAYMENT_MODE`, `UPLOAD_DIR`, `DATABASE_SCHEMA`) là còn sót lại từ project khác dùng chung Environment Group — có thể xoá an toàn.
4. Trước lần deploy đầu, chạy migration một lần: mở **Shell** của service (hoặc chạy job riêng) và gọi `node server/migrate.js` với `DATABASE_URL` đã cấu hình, để tạo schema `dau_an_ket_noi`.
5. Sau khi service chạy, thêm origin thật (`https://<service>.onrender.com`) vào Authorized JavaScript origins của Google OAuth nếu dùng đăng nhập Google.

Free tier Render sleep sau khi không có traffic; request đầu sau khi sleep sẽ chậm (cold start) — cân nhắc điều này khi demo trực tiếp.

## Deploy tách frontend/backend (phương án khác)

Có thể build riêng `dist/` (`npm run build`) rồi deploy lên Vercel, Netlify hoặc Cloudflare Pages, trong khi backend (`server/`) chạy trên Render/Railway ở domain khác. Khi đó bắt buộc khai báo `VITE_API_BASE_URL` (trỏ về domain backend) trước khi build, cấu hình SPA rewrite mọi route về `/index.html`, đặt `WEB_ORIGIN` ở backend bằng đúng domain frontend, và nếu dùng Supabase Auth thì thêm domain vào allow-list.

## Free tier và riêng tư

Quota Supabase/hosting thay đổi theo thời điểm: kiểm tra dashboard hiện tại trước sự kiện. Video là phần tốn dung lượng/băng thông nhất; project free có thể pause khi ít dùng. Chuẩn bị MP4 offline hoặc bản tải sẵn cho buổi trình diễn. Không log embedding cùng thông tin cá nhân; không lưu camera frame; dừng mọi track khi đóng/quay sang video thường.

Xem [TESTING.md](TESTING.md) cho ma trận CV, trình duyệt, lỗi và RLS. Các nội dung chưa có thiết bị/backend thật được ghi rõ, không được coi là đã nghiệm thu.
