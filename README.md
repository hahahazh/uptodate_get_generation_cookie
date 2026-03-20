# Hướng Dẫn Cài Đặt và Chia Sẻ UTD Cookie Sync

Hệ thống cho phép nhiều người dùng chung 1 tài khoản UpToDate (thông qua webproxy thư viện) mà không bị dính lỗi "Maximum session limit".

Hệ thống gồm 2 thành phần chính:
1. **Cookie Server:** Chỉ chạy trên 1 máy tính duy nhất (Máy chủ)
2. **Chrome Extension:** Cài trên tất cả các máy tính của người dùng (Máy con/Máy cá nhân)

---

## PHẦN 1: DÀNH CHO NGƯỜI QUẢN TRỊ (CHẠY SERVER)

Máy chủ là nơi sẽ tự động đăng nhập ngầm vào UpToDate mỗi 45 phút và chia sẻ cookie cho các máy con.

### Bước 1: Khởi chạy Server
1. Mở terminal tại thư mục `F:\IT\Uptodate`
2. Đảm bảo đã chạy lệnh `npm install` để tải thư viện.
3. Chạy lệnh: `npm start`
4. Server sẽ hiển thị: `🚀 Server ready at http://localhost:3456`

### Bước 2: Đưa Server ra Public (Để các máy khác truy cập được)
Vì `localhost` chỉ chạy trong máy của bạn, máy tính khác (ở nhà/bệnh viện khác) sẽ không thấy được. Có 2 cách phổ biến:

* **Cách 1: Sử dụng Ngrok (Miễn phí, Dễ nhất nhưng URL bị đổi mỗi khi tắt bật)**
  1. Tải [ngrok](https://ngrok.com/download)
  2. Bật terminal chạy lệnh: `ngrok http 3456`
  3. Ngrok sẽ cấp cho bạn 1 đường dẫn public, ví dụ: `https://abcd-123.ngrok-free.app`. Hãy lưu đường dẫn này lại.

* **Cách 2: Đưa lên VPS (Mạng riêng ảo - Chuyên nghiệp)**
  - Thuê 1 VPS rẻ (như DigitalOcean, Vultr, hay dùng VPS công ty).
  - Copy toàn bộ thư mục web lên VPS, chạy lệnh `npm start` trên đó bằng PM2 (`npm install -g pm2` sau đó `pm2 start server.js`).
  - Khi đó IP của bạn sẽ là dạng `http://192.168.x.x:3456` (IP tĩnh).

---

## PHẦN 2: DÀNH CHO NGƯỜI DÙNG CUỐI (CÀI EXTENSION)

Đây là quy trình để bạn bè, đồng nghiệp của bạn có thể sử dụng.

### Bước 1: Gửi file cho người dùng
1. Bạn nén toàn bộ thư mục `extension` (có chứa file `manifest.json`, icon...) thành một file ZIP (ví dụ: `utd-extension.zip`).
2. Gửi file `utd-extension.zip` này cho tất cả mọi người kèm theo **URL Server** và **API Key**.

### Bước 2: Hướng dẫn người dùng cài đặt (Gửi đoạn này cho đồng nghiệp)
1. Tải file `utd-extension.zip` về máy và giải nén ra một thư mục.
2. Mở trình duyệt Chrome hoặc Cốc Cốc, Copy dán địa chỉ sau vào thanh tìm kiếm: `chrome://extensions`
3. Ở góc trên bên phải, bật chế độ **"Developer mode"** (Chế độ dành cho nhà phát triển).
4. Sẽ có 3 nút mới hiện ra ở góc trên bên trái, bấm nút **"Load unpacked"** (Tải tiện ích đã giải nén).
5. Chọn vào thư mục mà bạn vừa giải nén ở bước 1. Extension "UTD Cookie Sync" với hình chữ U sẽ xuất hiện.

### Bước 3: Hướng dẫn người dùng cấu hình
1. Click vào biểu tượng mảnh ghép (Extensions) ở góc phải Chrome, chọn "Ghim" (Pin) biểu tượng chữ U ra ngoài.
2. Bấm vào biểu tượng chữ U để mở Popup.
3. Điền thông tin do Admin cung cấp:
   - **Server URL:** `[Điền link Ngrok hoặc IP của Server ở Phần 1]`
   - **API Key:** `utd-shared-2026`
4. Bấm **Lưu cấu hình & Sync**. Đợi 2-3 giây nếu thấy báo "✅ Đã sync cookie thành công!" là xong!
5. Bấm nút **🌐 Mở UpToDate**. Trình duyệt sẽ đưa bạn thẳng vào trang web đọc thư viện y khoa miễn phí mà không cần đăng nhập lại.

> **💡 Lưu ý cho người dùng:** Chỉ cần làm 1 lần duy nhất! Sau đó Extension sẽ tự chạy ngầm, bạn cứ vào UpToDate bình thường.

---

## PHẦN 3: ĐƯA LÊN FIREBASE FUNCTIONS (SERVERLESS)

Nếu bạn không có VPS và muốn dùng Cloud Functions miễn phí của Google Firebase:

**Yêu cầu:** Tài khoản Firebase phải được liên kết thẻ tín dụng (Gói Blaze) thì mới cho phép Functions gọi API ra ngoài mạng Internet (Firebase tính phí theo mức dùng, nhưng ứng dụng này dùng SIÊU ÍT nên sẽ ở mức $0.00).

1. Bạn cần cài đặt [Node.js](https://nodejs.org/) và cài Firebase Tools trên máy: 
   `npm install -g firebase-tools`
2. Tạo một thư mục ảo trống, mở Terminal và chạy lệnh đăng nhập: 
   `firebase login`
3. Khởi tạo dự án Firebase Functions: 
   `firebase init functions` 
   *(Chọn Use an existing project -> Chọn dự án của bạn -> Chọn JavaScript)*
4. Vào thư mục `functions` vừa tạo ra, cài đặt thư viện chuyên biệt (Puppeteer-core và Sparticuz Chromium giúp chạy trình duyệt ảo trên Cloud):
   `npm install firebase-admin firebase-functions puppeteer-core @sparticuz/chromium`
5. Copy toàn bộ nội dung file `firebase-function-example.js` (có sẵn trong dự án này) dán đè vào file `functions/index.js` của Firebase. Nhớ điền lại `UTD_USERNAME` và `UTD_PASSWORD` vào code.
6. Mở Terminal ở thư mục `functions`, gõ lệnh để đẩy code lên máy chủ:
   `firebase deploy --only functions`
   
**Kết quả:** Bạn sẽ nhận được 1 đường link API từ Firebase (ví dụ: `https://us-central1-abcd.cloudfunctions.net/getCookie`). Hãy copy link này cung cấp cho người dùng ở Phần 2 thay vì URL Của Ngrok hay VPS!
