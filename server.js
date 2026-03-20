require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3456;
const API_KEY = process.env.API_KEY || 'utd-shared-2026';

// ============================================================
// Session Manager - Sử dụng Puppeteer headless browser
// ============================================================
class SessionManager {
    constructor(username, password) {
        this.username = username;
        this.password = password;
        this.sessionToken = null;
        this.allCookies = [];
        this.lastLogin = null;
        this.loginError = null;
        this.isLoggingIn = false;
        this.refreshInterval = null;
    }

    async login() {
        if (this.isLoggingIn) {
            console.log('[Session] Login already in progress');
            return;
        }

        this.isLoggingIn = true;
        this.loginError = null;

        let browser;
        try {
            console.log('[Session] 🚀 Starting Puppeteer for login...');
            browser = await puppeteer.launch({
                headless: 'new',
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            });

            const page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 800 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

            // ─── Step 1: Đi tới trang đăng nhập UTD ───
            console.log('[Session] Navigating to UTD signin page...');
            // Start at the main URL, if not logged in it will show sign in
            await page.goto('https://utd.libook.xyz/', { waitUntil: 'networkidle2' });

            // Check if we need to click Sign In, or directly go to auth URL
            await page.goto('https://utd.libook.xyz/api/auth/signin?callbackUrl=https%3A%2F%2Futd.libook.xyz%2F', { waitUntil: 'networkidle2' });

            // Click "Sign in with libook" if it shows the NextAuth page
            const providersHandle = await page.$('button[type="submit"]');
            if (providersHandle) {
                console.log('[Session] Clicking NextAuth provider button...');
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle0' }),
                    providersHandle.click()
                ]);
            }

            // ─── Step 2: Cần phải ở trang dispatcher.libook.xyz/login ───
            const currentUrl = page.url();
            console.log('[Session] Current URL:', currentUrl);

            if (currentUrl.includes('dispatcher.libook.xyz/login')) {
                console.log('[Session] Filling login form on dispatcher...');

                // Nhập user/pass
                await page.waitForSelector('input[name="username"]', { timeout: 10000 });
                await page.type('input[name="username"]', this.username);
                await page.type('input[name="password"]', this.password);

                console.log('[Session] Submitting form...');
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
                    page.click('button[type="submit"], input[type="submit"]')
                ]);

                // Wait an extra second for redirects to settle
                await new Promise(r => setTimeout(r, 2000));
                console.log('[Session] POST login done. Landed on:', page.url());
            } else {
                console.log('[Session] ⚠️ Not on dispatcher login page. Maybe already logged in?');
            }

            // ─── Step 3: Lấy cookies ───
            console.log('[Session] Extracting cookies...');
            const cookies = await page.cookies('https://utd.libook.xyz', 'https://libook.xyz');
            this.allCookies = cookies;

            const sessionCookie = cookies.find(c => c.name === 'next-auth.session-token');

            if (sessionCookie) {
                this.sessionToken = sessionCookie.value;
                this.lastLogin = new Date();
                console.log('[Session] ✅ Login successful via Puppeteer!');
                console.log('[Session] Token preview:', this.sessionToken.substring(0, 30) + '...');
            } else {
                this.loginError = 'No session token found after Puppeteer login';
                console.error('[Session] ❌ Failed to get session token');
                console.log('[Session] Cookies found:', cookies.map(c => c.name));
            }

        } catch (err) {
            this.loginError = err.message;
            console.error('[Session] ❌ Puppeteer login error:', err.message);
        } finally {
            if (browser) {
                await browser.close();
                console.log('[Session] Browser closed');
            }
            this.isLoggingIn = false;
        }
    }

    startAutoRefresh(intervalMinutes = 45) {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        this.refreshInterval = setInterval(async () => {
            console.log('[Session] 🔄 Auto-refreshing session via Puppeteer...');
            await this.login();
        }, intervalMinutes * 60 * 1000);
        console.log(`[Session] Auto-refresh schedule: every ${intervalMinutes} minutes`);
    }

    getStatus() {
        return {
            isLoggedIn: !!this.sessionToken,
            lastLogin: this.lastLogin?.toISOString() || null,
            error: this.loginError,
            isLoggingIn: this.isLoggingIn,
            tokenPreview: this.sessionToken
                ? this.sessionToken.substring(0, 20) + '...'
                : null,
        };
    }
}

// ============================================================
// Khởi tạo & API
// ============================================================
const session = new SessionManager(
    process.env.UTD_USERNAME,
    process.env.UTD_PASSWORD
);

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

function requireKey(req, res, next) {
    const key = req.query.key || req.headers['x-api-key'];
    if (key !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });
    next();
}

app.get('/cookie', requireKey, (req, res) => {
    if (!session.sessionToken) {
        return res.status(503).json({ error: 'No active session', status: session.getStatus() });
    }

    // Trả về toàn bộ cookies
    res.json({
        cookies: session.allCookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            secure: c.secure,
            httpOnly: c.httpOnly,
            sameSite: c.sameSite
        })),
        lastLogin: session.lastLogin?.toISOString()
    });
});

// Root Endpoint
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 50px;">
                <h1>✅ UTD Cookie Sync Server is Running!</h1>
                <p>Status API: <a href="/status">/status</a></p>
                <p><i>Powered by Render.com</i></p>
            </body>
        </html>
    `);
});

app.get('/status', (req, res) => {
    res.json({
        server: 'UTD Cookie Sync Server',
        version: '1.0.0',
        mode: 'Puppeteer',
        ...session.getStatus(),
        uptime: Math.floor(process.uptime()),
    });
});

app.post('/refresh', requireKey, async (req, res) => {
    await session.login();
    res.json(session.getStatus());
});

// ============================================================
// Start
// ============================================================
async function start() {
    console.log('╔════════════════════════════════════╗');
    console.log('║   UTD Cookie Sync Server v1.0.0    ║');
    console.log('╚════════════════════════════════════╝');
    console.log(`User: ${process.env.UTD_USERNAME}`);
    console.log(`Port: ${PORT}`);
    console.log('');

    // Initial login
    await session.login();
    session.startAutoRefresh(45);

    app.listen(PORT, () => {
        console.log('');
        console.log(`🚀 Server ready at http://localhost:${PORT}`);
        console.log(`📋 Cookie API: http://localhost:${PORT}/cookie?key=${API_KEY}`);
        console.log(`📊 Status API: http://localhost:${PORT}/status`);
        console.log('');
    });
}

start().catch(console.error);
