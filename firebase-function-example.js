const functions = require("firebase-functions");
const admin = require("firebase-admin");
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

admin.initializeApp();
const db = admin.firestore();

// Thay bằng thông tin thật hoặc dùng Google Cloud Secret Manager
const UTD_USERNAME = "KhoaNhi-FamilyHospital";
const UTD_PASSWORD = "YOUR_PASSWORD_HERE"; 
const API_KEY = "utd-shared-2026";

/**
 * 1. Cron Job (Scheduled Function): Chạy mỗi 45 phút để lấy Cookie mới và lưu vào Firestore
 */
exports.syncUptodateCookie = functions
  .runWith({
    timeoutSeconds: 300,
    memory: "1GB", // Rất quan trọng: Phải cấp ít nhất 1GB RAM cho Puppeteer
  })
  .pubsub.schedule("every 45 minutes")
  .onRun(async (context) => {
    let browser = null;
    try {
      console.log("Starting Serverless Puppeteer...");
      
      // Khởi tạo Chromium phiên bản dành riêng cho Serverless (Firebase/AWS Lambda)
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });

      const page = await browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
      );

      // Đi tới trang đăng nhập
      await page.goto("https://utd.libook.xyz/api/auth/signin?callbackUrl=https%3A%2F%2Futd.libook.xyz%2F", { waitUntil: "networkidle2" });
      
      const providersHandle = await page.$('button[type="submit"]');
      if (providersHandle) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle0" }),
          providersHandle.click()
        ]);
      }

      // Đăng nhập trên trang dispatcher
      if (page.url().includes("dispatcher.libook.xyz/login")) {
        await page.waitForSelector('input[name="username"]');
        await page.type('input[name="username"]', UTD_USERNAME);
        await page.type('input[name="password"]', UTD_PASSWORD);
        
        await Promise.all([
          page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }),
          page.click('button[type="submit"]')
        ]);
        
        await new Promise(r => setTimeout(r, 2000));
      }

      // Lấy cookie
      const cookies = await page.cookies("https://utd.libook.xyz", "https://libook.xyz");
      const sessionCookie = cookies.find((c) => c.name === "next-auth.session-token");

      if (sessionCookie) {
        console.log("✅ Lấy Token thành công!");
        
        // LƯU VÀO FIRESTORE DATABASE THAY VÌ LƯU VÀO RAM
        await db.collection("config").doc("utd_session").set({
          token: sessionCookie.value,
          allCookies: cookies,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log("✅ Đã lưu Cookie vào Firestore!");
      } else {
        console.error("❌ Không lấy được Session Token.");
      }
    } catch (error) {
      console.error("Lỗi:", error.message);
    } finally {
      if (browser) await browser.close();
    }
    return null;
  });

/**
 * 2. HTTP API: Extension sẽ gọi hàm này để lấy Cookie từ Firestore
 */
exports.getCookie = functions.https.onRequest(async (req, res) => {
  // Cấu hình CORS
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'X-API-Key');
    res.status(204).send('');
    return;
  }

  // Cấu hình xác thực API KEY
  const key = req.query.key || req.headers["x-api-key"];
  if (key !== API_KEY) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  try {
    // ĐỌC COOKIE TỪ FIRESTORE
    const doc = await db.collection("config").doc("utd_session").get();
    
    if (!doc.exists) {
      res.status(404).json({ error: "Chưa có session cookie nào trong database. Hãy đợi Cron Job chạy lần đầu." });
      return;
    }

    const data = doc.data();
    res.json({
      cookies: data.allCookies,
      lastLogin: data.updatedAt && data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : null
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
