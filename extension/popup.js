// ============================================================
// UTD Cookie Sync — Popup Script
// ============================================================

const $ = (sel) => document.querySelector(sel);

// Elements
const statusBadge = $('#statusBadge');
const statusText = $('#statusText');
const lastSyncText = $('#lastSyncText');
const syncCountText = $('#syncCountText');
const serverUrlInput = $('#serverUrl');
const apiKeyInput = $('#apiKey');
const saveConfigBtn = $('#saveConfigBtn');
const syncNowBtn = $('#syncNowBtn');
const openUtdBtn = $('#openUtdBtn');

// ============================================================
// Load trạng thái hiện tại
// ============================================================
async function loadStatus() {
    chrome.runtime.sendMessage({ action: 'get_status' }, (data) => {
        if (!data) return;

        // Config
        if (data.serverUrl) serverUrlInput.value = data.serverUrl;
        if (data.apiKey) apiKeyInput.value = data.apiKey;

        // Status badge
        updateBadge(data.syncStatus || 'not_configured');

        // Status text
        statusText.textContent = data.syncMessage || 'Chưa kết nối';

        // Last sync
        if (data.lastSync) {
            const ago = getTimeAgo(new Date(data.lastSync));
            lastSyncText.textContent = ago;
        } else {
            lastSyncText.textContent = 'Chưa sync';
        }

        // Cookie count
        syncCountText.textContent = data.syncCount !== undefined ? data.syncCount : '--';
    });
}

function updateBadge(status) {
    statusBadge.className = 'badge';
    const labels = {
        synced: 'Đã sync',
        error: 'Lỗi',
        syncing: 'Đang sync...',
        not_configured: 'Chưa cấu hình',
    };
    statusBadge.classList.add(`badge-${status}`);
    statusBadge.textContent = labels[status] || status;
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Vừa xong';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
    return `${Math.floor(seconds / 86400)} ngày trước`;
}

// ============================================================
// Event Handlers
// ============================================================

// Lưu cấu hình
saveConfigBtn.addEventListener('click', () => {
    const serverUrl = serverUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!serverUrl) {
        showToast('Vui lòng nhập Server URL', 'error');
        return;
    }
    if (!apiKey) {
        showToast('Vui lòng nhập API Key', 'error');
        return;
    }

    saveConfigBtn.disabled = true;
    saveConfigBtn.textContent = '⏳ Đang lưu...';
    updateBadge('syncing');

    chrome.runtime.sendMessage(
        { action: 'save_config', serverUrl, apiKey },
        (result) => {
            saveConfigBtn.disabled = false;
            saveConfigBtn.textContent = '💾 Lưu cấu hình';

            if (result?.success) {
                showToast(`✅ Set ${result.count}, Verified ${result.verified} cookies!`, 'success');
                updateBadge('synced');
            } else {
                const failInfo = result?.failed?.length ? ` | Failed: ${result.failed.join(', ')}` : '';
                showToast(`❌ ${result?.error || 'Lỗi'}${failInfo}`, 'error');
                updateBadge('error');
            }

            // Reload status
            setTimeout(loadStatus, 500);
        }
    );
});

// Sync ngay
syncNowBtn.addEventListener('click', () => {
    syncNowBtn.disabled = true;
    syncNowBtn.textContent = '⏳ Đang sync...';
    updateBadge('syncing');

    chrome.runtime.sendMessage({ action: 'sync_now' }, (result) => {
        syncNowBtn.disabled = false;
        syncNowBtn.textContent = '🔄 Sync ngay';

        if (result?.success) {
            showToast(`✅ Set ${result.count}, Verified ${result.verified} cookies!`, 'success');
            updateBadge('synced');
        } else {
            const failInfo = result?.failed?.length ? ` | Failed: ${result.failed.join(', ')}` : '';
            showToast(`❌ ${result?.error || 'Lỗi'}${failInfo}`, 'error');
            updateBadge('error');
        }

        setTimeout(loadStatus, 500);
    });
});

// Mở UpToDate
openUtdBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://utd.libook.xyz/' });
});

// ============================================================
// Toast notification
// ============================================================
function showToast(message, type = 'success') {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================================
// Init
// ============================================================
loadStatus();
