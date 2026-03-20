// ============================================================
// UTD Cookie Sync — Background Service Worker
// ============================================================

const ALARM_NAME = 'utd-cookie-sync';
const SYNC_INTERVAL_MINUTES = 30;

// Chuẩn hóa giá trị sameSite cho chrome.cookies API (chỉ chấp nhận chữ thường)
function normalizeSameSite(val) {
    if (!val) return 'lax';
    const lower = val.toLowerCase();
    if (lower === 'none') return 'no_restriction';
    if (lower === 'strict') return 'strict';
    return 'lax'; // mặc định
}

// Các URL đích cần bơm cookie vào - bao gồm cả dispatcher (cần cho OAuth callback)
const TARGET_URLS = [
    'https://utd.libook.xyz',
    'https://dispatcher.libook.xyz',
];

// Đồng bộ cookie từ server
async function syncCookies() {
    try {
        // Lấy config từ storage
        const config = await chrome.storage.local.get(['serverUrl', 'apiKey']);
        if (!config.serverUrl || !config.apiKey) {
            console.log('[UTD Sync] No config found, skipping sync');
            await updateStatus('not_configured', 'Chưa cấu hình server');
            return { success: false, error: 'Not configured' };
        }

        const url = `${config.serverUrl.replace(/\/$/, '')}/cookie?key=${config.apiKey}`;
        console.log('[UTD Sync] Fetching cookies from server...');

        const res = await fetch(url);
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();

        if (!data.cookies || data.cookies.length === 0) {
            throw new Error('No cookies received');
        }

        console.log(`[UTD Sync] Received ${data.cookies.length} cookies from server`);

        // ═══════════════════════════════════════════
        // BƯỚC 1: Xóa sạch cookies cũ của libook.xyz trước khi bơm mới
        // (Tránh xung đột Domain Cookie vs Host-Only Cookie)
        // ═══════════════════════════════════════════
        for (const targetUrl of TARGET_URLS) {
            const existing = await chrome.cookies.getAll({ url: targetUrl });
            for (const old of existing) {
                await chrome.cookies.remove({ url: targetUrl, name: old.name });
            }
        }
        // Xoá cả cookies .libook.xyz gốc
        const rootCookies = await chrome.cookies.getAll({ domain: '.libook.xyz' });
        for (const old of rootCookies) {
            await chrome.cookies.remove({
                url: 'https://libook.xyz' + old.path,
                name: old.name,
            });
        }
        console.log('[UTD Sync] 🧹 Cleared old libook.xyz cookies');

        // ═══════════════════════════════════════════
        // BƯỚC 2: Bơm toàn bộ cookies mới
        // ═══════════════════════════════════════════
        let setCookieCount = 0;
        const failedCookies = [];

        for (const cookie of data.cookies) {
            try {
                // Xác định URL gốc dựa vào domain
                let primaryUrl = 'https://utd.libook.xyz';
                if (cookie.domain) {
                    primaryUrl = 'https://' + cookie.domain.replace(/^\./, '');
                }

                const cookieDetails = {
                    url: primaryUrl,
                    name: cookie.name,
                    value: cookie.value,
                    path: cookie.path || '/',
                    secure: cookie.secure !== false,
                    httpOnly: cookie.httpOnly || false,
                    sameSite: normalizeSameSite(cookie.sameSite),
                };

                // __Host- cookies: KHÔNG ĐƯỢC có thuộc tính domain
                // Domain cookies (dấu chấm đầu): giữ nguyên domain
                // Host-only cookies: BỎ QUA domain, để Chrome tự gán
                if (!cookie.name.startsWith('__Host-')) {
                    if (cookie.domain && cookie.domain.startsWith('.')) {
                        cookieDetails.domain = cookie.domain;
                    }
                }

                const result = await chrome.cookies.set(cookieDetails);
                if (result) {
                    setCookieCount++;
                    console.log(`[UTD Sync] ✓ Set: ${cookie.name} → ${primaryUrl} (domain=${result.domain}, hostOnly=${result.hostOnly})`);
                } else {
                    failedCookies.push(cookie.name);
                    console.warn(`[UTD Sync] ✗ chrome.cookies.set returned null for: ${cookie.name}`);
                }
            } catch (cookieErr) {
                failedCookies.push(cookie.name + ': ' + cookieErr.message);
                console.warn(`[UTD Sync] ✗ Exception setting ${cookie.name}:`, cookieErr.message);
            }
        }

        // ═══════════════════════════════════════════
        // BƯỚC 3: Xác minh ngược — đọc lại cookies từ Chrome để đảm bảo chúng tồn tại
        // ═══════════════════════════════════════════
        const verify = await chrome.cookies.getAll({ url: 'https://utd.libook.xyz' });
        const verifiedNames = verify.map(c => c.name);
        console.log(`[UTD Sync] 🔍 Verified ${verify.length} cookies on utd.libook.xyz:`, verifiedNames);

        const hasSession = verifiedNames.includes('next-auth.session-token');
        if (!hasSession) {
            console.error('[UTD Sync] ❌ CRITICAL: next-auth.session-token NOT found after injection!');
        }

        const now = new Date().toISOString();
        const diagMsg = failedCookies.length > 0
            ? `Set ${setCookieCount}/${data.cookies.length}, FAILED: ${failedCookies.join(', ')}`
            : `Đồng bộ ${setCookieCount} cookies ✓ Verified: ${verify.length}`;

        await chrome.storage.local.set({
            lastSync: now,
            syncCount: setCookieCount,
            syncDiag: diagMsg,
            syncVerified: verify.length,
        });
        await updateStatus(hasSession ? 'synced' : 'error', diagMsg);

        console.log(`[UTD Sync] ✅ Done: ${diagMsg}`);
        return {
            success: hasSession,
            count: setCookieCount,
            verified: verify.length,
            failed: failedCookies,
            time: now,
        };
    } catch (err) {
        console.error('[UTD Sync] ❌ Sync failed:', err.message);
        await updateStatus('error', err.message);
        return { success: false, error: err.message };
    }
}

// Cập nhật trạng thái
async function updateStatus(status, message) {
    await chrome.storage.local.set({
        syncStatus: status,
        syncMessage: message,
        lastStatusUpdate: new Date().toISOString(),
    });

    // Update badge
    const colors = {
        synced: '#22c55e',
        error: '#ef4444',
        syncing: '#3b82f6',
        not_configured: '#f59e0b',
    };
    const texts = {
        synced: '✓',
        error: '!',
        syncing: '...',
        not_configured: '?',
    };

    try {
        await chrome.action.setBadgeBackgroundColor({ color: colors[status] || '#6b7280' });
        await chrome.action.setBadgeText({ text: texts[status] || '' });
    } catch {
        // Badge API may not be available in all contexts
    }
}

// ============================================================
// Alarm cho auto-sync
// ============================================================
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === ALARM_NAME) {
        console.log('[UTD Sync] ⏰ Alarm triggered, syncing...');
        await syncCookies();
    }
});

// Thiết lập alarm khi extension được cài đặt
chrome.runtime.onInstalled.addListener(async () => {
    console.log('[UTD Sync] Extension installed');

    // Tạo alarm sync định kỳ
    chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: SYNC_INTERVAL_MINUTES,
    });

    await updateStatus('not_configured', 'Vui lòng cấu hình server');
});

// Cũng thiết lập alarm khi service worker khởi động lại
chrome.runtime.onStartup.addListener(async () => {
    console.log('[UTD Sync] Extension started');

    chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: SYNC_INTERVAL_MINUTES,
    });

    // Auto sync nếu đã cấu hình
    const config = await chrome.storage.local.get(['serverUrl', 'apiKey']);
    if (config.serverUrl && config.apiKey) {
        await syncCookies();
    }
});

// ============================================================
// Xử lý message từ popup
// ============================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'sync_now') {
        syncCookies().then(sendResponse);
        return true; // async response
    }

    if (msg.action === 'save_config') {
        chrome.storage.local.set({
            serverUrl: msg.serverUrl,
            apiKey: msg.apiKey,
        }).then(() => {
            // Sync ngay sau khi cấu hình
            syncCookies().then(sendResponse);
        });
        return true;
    }

    if (msg.action === 'get_status') {
        chrome.storage.local.get([
            'serverUrl', 'apiKey', 'lastSync', 'syncCount',
            'syncStatus', 'syncMessage', 'lastStatusUpdate',
        ]).then(sendResponse);
        return true;
    }
});
