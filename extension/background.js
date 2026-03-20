// ============================================================
// UTD Cookie Sync — Background Service Worker
// ============================================================

const ALARM_NAME = 'utd-cookie-sync';
const SYNC_INTERVAL_MINUTES = 30;

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

        // Inject cookies vào browser
        let setCookieCount = 0;
        for (const cookie of data.cookies) {
            try {
                // Xác định URL của trang chủ yếu dựa vào domain của cookie
                let cookieUrl = 'https://utd.libook.xyz';
                if (cookie.domain) {
                    cookieUrl = 'https://' + cookie.domain.replace(/^\./, '');
                }

                const cookieDetails = {
                    url: cookieUrl,
                    name: cookie.name,
                    value: cookie.value,
                    path: cookie.path || '/',
                    secure: cookie.secure !== false,
                    httpOnly: cookie.httpOnly || false,
                    sameSite: cookie.sameSite || 'lax',
                };

                // BẢO MẬT COOKIE QUAN TRỌNG:
                // Nếu cookie trả về có dấu chấm ở đầu (Ví dụ: .libook.xyz), nó là cookie toàn cục (Domain Cookie).
                // Nếu không có dấu chấm (Ví dụ: utd.libook.xyz), nó là HostOnly cookie.
                // Nếu ta cố tình set domain='utd.libook.xyz', Chrome sẽ tự động ghép thêm dấu chấm thành '.utd.libook.xyz', 
                // làm thay đổi hoàn toàn tính chất cookie khiến NextAuth từ chối nhận diện.
                // Do đó, ta CHỈ thêm thuộc tính domain nếu nó bắt đầu bằng dấu chấm!

                if (!cookie.name.startsWith('__Host-')) {
                    if (cookie.domain && cookie.domain.startsWith('.')) {
                        cookieDetails.domain = cookie.domain;
                    }
                    // Nếu là HostOnly cookie, ta BỎ QUA thuộc tính domain. 
                    // Chrome sẽ tự động gán nó thành HostOnly cho cái url ở trên.
                }

                await chrome.cookies.set(cookieDetails);
                setCookieCount++;
                console.log(`[UTD Sync] ✓ Set cookie: ${cookie.name} on ${cookieUrl}`);
            } catch (cookieErr) {
                console.warn(`[UTD Sync] ✗ Failed to set cookie ${cookie.name}:`, cookieErr.message);
            }
        }

        const now = new Date().toISOString();
        await chrome.storage.local.set({ lastSync: now, syncCount: setCookieCount });
        await updateStatus('synced', `Đồng bộ ${setCookieCount} cookies`);

        console.log(`[UTD Sync] ✅ Synced ${setCookieCount} cookies at ${now}`);
        return { success: true, count: setCookieCount, time: now };
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
