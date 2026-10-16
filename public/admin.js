// 🚀 የድሮ ዩዘሮችን በሙሉ ጠራርጎ የሚያስወጣ እና የሚያጸዳ ኮድ (Force Logout All Users) 🚀
const CURRENT_APP_VERSION = "2.1";
if (localStorage.getItem("tbr_app_version") !== CURRENT_APP_VERSION) {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("tbr_app_version", CURRENT_APP_VERSION);
    window.location.reload(true);
}

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://tbr-exchange-backend.onrender.com';

const getToken = () => sessionStorage.getItem('adminToken') || '';

const ESCROW_CACHE_KEY = 'tbr_admin_escrow_v2';
const USERS_CACHE_KEY = 'tbr_admin_users_v2';

let activeKycStatus = 'pending';
let currentKycList = [];
const kycCache = { pending: null, approved: null, rejected: null };
let currentDisputesList = [];
let currentUsersList = []; 

function resolveImgUrl(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    if (!s) return '';
    if (s.startsWith('data:image') || s.startsWith('http://') || s.startsWith('https://')) return s;
    if (s.startsWith('/')) return `${API_BASE}${s}`;
    return s;
}

// 🚀 1. Event Listeners for Login & Navigation 🚀
document.addEventListener('DOMContentLoaded', async () => {
    const overlay = document.getElementById('loginOverlay');
    const dash = document.getElementById('mainDashboard');
    const currentToken = getToken();

    if (currentToken) {
        try {
            const checkAdmin = await fetch(`${API_BASE}/api/admin/stats`, {
                headers: { 'Authorization': 'Bearer ' + currentToken }
            });
            
            if (checkAdmin.ok) {
                if(overlay) overlay.style.display = 'none';
                if(dash) dash.style.display = 'block';
                initAdminDataFast();
            } else {
                if(overlay) overlay.style.display = 'flex'; 
                if(dash) dash.style.display = 'none';
            }
        } catch (e) {
            if(overlay) overlay.style.display = 'flex'; 
            if(dash) dash.style.display = 'none';
        }
    } else {
        if(overlay) overlay.style.display = 'flex'; 
        if(dash) dash.style.display = 'none';
    }

    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            adminLogin();
        });
    }

    const loginPassInput = document.getElementById('loginPassword');
    if (loginPassInput) {
        loginPassInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                adminLogin();
            }
        });
    }

    document.getElementById('searchInput')?.addEventListener('keyup', filterTableData);
    const userSearch = document.getElementById('userSearchInput');
    if (userSearch) {
        userSearch.addEventListener('focus', function() { this.removeAttribute('readonly'); });
        userSearch.addEventListener('keyup', filterUsersTable);
    }

    // 🛑 ዋናው የተስተካከለው እዚህ ጋር ነው! (Event Listener) 🛑
    document.body.addEventListener('click', async (e) => {
        const target = e.target;
        
        if (target.closest('#devicesBtn')) openDevicesModal();

        if (target.closest('#logoutBtn')) logoutAdmin();
        if (target.closest('#saveRatesBtn')) saveRates();
        
        const navTab = target.closest('.nav-tab');
        if (navTab) switchTab(navTab.dataset.target, navTab);

        const kycBtn = target.closest('.kyc-tab-btn');
        if (kycBtn) loadKycData(kycBtn.dataset.targetStatus);

        if (target.closest('#livePostsCard')) openLivePostsModal();
        if (target.closest('#completedTradesCard')) openCompletedTradesModal();

        const closeBtn = target.closest('.close-modal-btn');
        if (closeBtn) {
            const modal = closeBtn.closest('.modal-overlay');
            if (modal) modal.style.display = 'none';
        }

        if (target.classList.contains('zoom-img')) {
            window.open(target.src);
        }

        const viewDocBtn = target.closest('[data-action="view-doc"]');
        if (viewDocBtn) openKycModalByIndex(viewDocBtn.dataset.index);

        const approveKycBtn = target.closest('[data-action="approve-kyc"]');
        if (approveKycBtn) performKycAction(approveKycBtn.dataset.id, 'approved');

        const rejectKycBtn = target.closest('[data-action="reject-kyc"]');
        if (rejectKycBtn) performKycAction(rejectKycBtn.dataset.id, 'rejected');

        const viewChatBtn = target.closest('[data-action="view-chat"]');
        if (viewChatBtn) openDisputeEvidenceModal(viewChatBtn.dataset.index);

        const releaseBtn = target.closest('[data-action="release-escrow"]');
        if (releaseBtn) resolveEscrow(releaseBtn.dataset.id, 'release', releaseBtn.dataset.index);

        const refundBtn = target.closest('[data-action="refund-escrow"]');
        if (refundBtn) resolveEscrow(refundBtn.dataset.id, 'refund', refundBtn.dataset.index);

        const viewUserBtn = target.closest('[data-action="view-user"]');
        if (viewUserBtn) openUserDetailsModal(viewUserBtn.dataset.id);

        const banBtn = target.closest('[data-action="toggle-ban"]');
        if (banBtn) toggleUserBan(banBtn.dataset.id, banBtn.dataset.banned === 'true');

        const warnBtn = target.closest('[data-action="warn-user"]');
        if (warnBtn) sendUserWarning(warnBtn.dataset.id, warnBtn.dataset.warned === 'true');

        const editBalBtn = target.closest('[data-action="edit-balance"]');
        if (editBalBtn) editAdminUserBalance(editBalBtn.dataset.id, editBalBtn.dataset.balance);

        const appWithBtn = target.closest('[data-action="approve-with"]');
        if (appWithBtn) approveWithdrawal(appWithBtn.dataset.id, appWithBtn.dataset.amount);

        const rejWithBtn = target.closest('[data-action="reject-with"]');
        if (rejWithBtn) rejectWithdrawal(rejWithBtn.dataset.id, rejWithBtn.dataset.amount);

        const delAdBtn = target.closest('[data-action="delete-ad"]');
        if (delAdBtn) adminDeleteAd(delAdBtn.dataset.id);
    });
});

function initAdminDataFast() {
    const searchBox = document.getElementById('userSearchInput');
    if (searchBox) {
        searchBox.value = '';
        setTimeout(() => {
            searchBox.value = '';
            searchBox.removeAttribute('readonly'); 
            filterUsersTable();
        }, 500);
    }

    try {
        const cachedStats = sessionStorage.getItem('tbr_admin_stats');
        if (cachedStats) applyStatsToDOM(JSON.parse(cachedStats));

        ['pending', 'approved', 'rejected'].forEach(st => {
            const saved = sessionStorage.getItem('tbr_kyc_' + st);
            if (saved) kycCache[st] = JSON.parse(saved);
        });
        if (kycCache.pending) {
            currentKycList = kycCache.pending;
            renderKycs(document.getElementById('kycTableBody'), currentKycList);
        }

        const cachedDisputes = sessionStorage.getItem(ESCROW_CACHE_KEY);
        if (cachedDisputes) {
            currentDisputesList = JSON.parse(cachedDisputes);
            renderEscrowDisputesTable(currentDisputesList);
        }

        const cachedUsers = sessionStorage.getItem(USERS_CACHE_KEY);
        if (cachedUsers) {
            currentUsersList = JSON.parse(cachedUsers);
            renderUsersTable(currentUsersList);
        }
    } catch (e) {}

    fetchStats();
    loadCurrentRates();
    fetchEscrowDisputes();
    fetchUsersList();

    loadKycData('pending', true);
    prefetchKycStatus('approved');
    prefetchKycStatus('rejected');

    setInterval(fetchStats, 8000);
    setInterval(fetchEscrowDisputes, 3500);
}

setInterval(() => {
    if (document.getElementById('tab-kyc')?.classList.contains('active')) {
        fetch(`${API_BASE}/api/admin/kyc-requests?status=${activeKycStatus}&limit=50&t=${Date.now()}`, { 
            headers: { 'Authorization': 'Bearer ' + getToken() },
            cache: 'no-store'
        }).then(res => res.json()).then(json => {
            let rawList = Array.isArray(json) ? json : (Array.isArray(json.data) ? json.data : json.requests);
            kycCache[activeKycStatus] = rawList;
            currentKycList = rawList;
            renderKycs(document.getElementById('kycTableBody'), rawList);
            
            if (activeKycStatus === 'pending') {
                document.getElementById('statKycCount').innerText = rawList.length;
            }
        }).catch(err => console.log(err));
    }
}, 8000);

async function adminLogin() {
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');
    const errEl = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');

    if (!emailInput || !passwordInput) return;

    const email = emailInput.value;
    const password = passwordInput.value;

    if (!email || !password) {
        if(errEl) errEl.innerText = 'Email and password are required.';
        return;
    }

    if(loginBtn) {
        loginBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';
        loginBtn.disabled = true;
    }

    // 🛑 አዲሱ Device የመለያ ኮድ 🛑
    const ua = navigator.userAgent;
    let deviceName = "Unknown Device";
    if (ua.includes("Windows")) deviceName = "Windows PC";
    else if (ua.includes("Mac")) deviceName = "Mac OS";
    else if (ua.includes("Android")) deviceName = "Android Phone";
    else if (ua.includes("iPhone") || ua.includes("iPad")) deviceName = "iOS Device";

    let browserName = "Web Browser";
    if (ua.includes("Chrome")) browserName = "Chrome";
    if (ua.includes("Firefox")) browserName = "Firefox";
    if (ua.includes("Safari") && !ua.includes("Chrome")) browserName = "Safari";
    if (ua.includes("Edge")) browserName = "Edge";

    const deviceInfo = { device: deviceName, browser: browserName };

    try {
        const res = await fetch(`${API_BASE}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, deviceInfo }) // መረጃው አብሮ ይላካል
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
            sessionStorage.setItem('adminToken', data.token);
            
            const overlay = document.getElementById('loginOverlay');
            const dash = document.getElementById('mainDashboard');
            if(overlay) overlay.style.display = 'none';
            if(dash) dash.style.display = 'block';
            if(errEl) errEl.innerText = '';
            initAdminDataFast();
        } else {
            if(errEl) errEl.innerText = data.message || 'Login failed.';
            if(loginBtn) {
                loginBtn.innerHTML = 'Login to Dashboard';
                loginBtn.disabled = false;
            }
        }
    } catch (err) {
        if(errEl) errEl.innerText = 'Network error during login.';
        if(loginBtn) {
            loginBtn.innerHTML = 'Login to Dashboard';
            loginBtn.disabled = false;
        }
    }
}

function logoutAdmin() {
    sessionStorage.removeItem('adminToken');
    sessionStorage.clear();
    location.reload();
}

function switchTab(tabId, tabElement) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
    
    const targetContent = document.getElementById('tab-' + tabId);
    if(targetContent) targetContent.classList.add('active');
    
    if (tabElement) tabElement.classList.add('active');

    if (tabId === 'escrow') fetchEscrowDisputes();
    else if (tabId === 'users') fetchUsersList();
    else if (tabId === 'overview') fetchStats();
    else if (tabId === 'withdrawals') fetchAdminWithdrawals();
    else if (tabId === 'deposits') loadDeposits();
}

function formatUsdtOnly(val) {
    if (!val) return '0 USDT';
    return String(val).split('/')[0].trim();
}

function applyStatsToDOM(data) {
    if (!data) return;
    document.getElementById('statUserCount').innerText = data.totalUsers ?? 0;
    document.getElementById('statKycCount').innerText = data.kycPending ?? 0;
    document.getElementById('statOnMarket').innerText = formatUsdtOnly(data.onMarket);
    document.getElementById('statLivePosts').innerText = data.livePosts ?? 0;
    document.getElementById('livePostsCount').innerText = data.livePosts ?? 0;
    document.getElementById('statTotalTrades').innerText = data.totalTrades ?? 0;
    document.getElementById('statEscrow').innerText = formatUsdtOnly(data.activeEscrow);
    document.getElementById('statTotalVolume').innerText = formatUsdtOnly(data.totalVolume);
    document.getElementById('statVolume').innerText = formatUsdtOnly(data.todayVolume);

    if (document.getElementById('statTotalFee')) {
        document.getElementById('statTotalFee').innerText = formatUsdtOnly(data.totalFeeEarned || '0 USDT');
    }
    if (document.getElementById('statTodayFee')) {
        document.getElementById('statTodayFee').innerText = formatUsdtOnly(data.todayFeeEarned || '0 USDT');
    }
}

async function fetchStats() {
    try {
        const statsRes = await fetch(`${API_BASE}/api/admin/stats?t=${Date.now()}`, {
            headers: { 'Authorization': 'Bearer ' + getToken() },
            cache: 'no-store'
        });
        const json = await statsRes.json();
        if (statsRes.ok && json.success && json.data) {
            applyStatsToDOM(json.data);
            try { sessionStorage.setItem('tbr_admin_stats', JSON.stringify(json.data)); } catch (e) {}
        }
    } catch (err) {}
}

async function prefetchKycStatus(status) {
    try {
        const res = await fetch(`${API_BASE}/api/admin/kyc-requests?status=${status}&limit=50`, {
            headers: { 'Authorization': 'Bearer ' + getToken() },
            cache: 'no-store'
        });
        const json = await res.json();
        let rawList = [];
        if (Array.isArray(json)) rawList = json;
        else if (Array.isArray(json.data)) rawList = json.data;
        else if (Array.isArray(json.requests)) rawList = json.requests;

        kycCache[status] = rawList;
        try {
            sessionStorage.setItem('tbr_kyc_' + status, JSON.stringify(rawList));
        } catch (e) {}
    } catch (e) {}
}

async function loadKycData(targetStatus = 'pending') {
    activeKycStatus = targetStatus;

    document.querySelectorAll('#tab-kyc button.kyc-tab-btn').forEach(b => {
        b.style.opacity = '0.5';
    });
    const activeBtn = document.querySelector(`[data-target-status="${targetStatus}"]`);
    if (activeBtn) activeBtn.style.opacity = '1';

    const tbody = document.getElementById('kycTableBody');
    if (!tbody) return;

    if (Array.isArray(kycCache[targetStatus])) {
        currentKycList = kycCache[targetStatus];
        renderKycs(tbody, currentKycList);
    } else {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#f3ba2f; padding: 20px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading ${targetStatus.toUpperCase()} KYC...</td></tr>`;
    }

    try {
        const res = await fetch(`${API_BASE}/api/admin/kyc-requests?status=${targetStatus}&limit=50&t=${Date.now()}`, { 
            headers: { 'Authorization': 'Bearer ' + getToken() },
            cache: 'no-store'
        });
        const json = await res.json();
        
        let rawList = [];
        if (Array.isArray(json)) rawList = json;
        else if (Array.isArray(json.data)) rawList = json.data;
        else if (Array.isArray(json.requests)) rawList = json.requests;

        kycCache[targetStatus] = rawList;
        try { sessionStorage.setItem('tbr_kyc_' + targetStatus, JSON.stringify(rawList)); } catch (e) {}

        if (activeKycStatus === targetStatus) {
            currentKycList = rawList;
            renderKycs(tbody, rawList);
            if (targetStatus === 'pending') {
                document.getElementById('statKycCount').innerText = rawList.length;
            }
        }
    } catch (err) { 
        if (!Array.isArray(kycCache[targetStatus])) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--red);">Error loading data. Check connection.</td></tr>`;
        }
    }
}

function filterTableData() {
    const query = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const tbody = document.getElementById('kycTableBody');
    if (!tbody) return;

    if (!query) {
        renderKycs(tbody, currentKycList);
        return;
    }

    const searchFiltered = currentKycList.filter(item => {
        const userId = String(item.userId || '').toLowerCase();
        const email = String(item.email || item.userEmail || '').toLowerCase();
        const fullName = String(item.fullName || item.name || '').toLowerCase();
        return userId.includes(query) || email.includes(query) || fullName.includes(query);
    });

    renderKycs(tbody, searchFiltered);
}

function renderKycs(tbody, list) {
    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding: 20px;">No ${activeKycStatus} KYC submissions found.</td></tr>`;
        return;
    }

    let html = '';
    list.forEach((item, idx) => {
        const kycId = item._id || item.id || '';
        const userEmail = item.email || item.userEmail || item.userId || kycId || 'N/A';
        const userName = item.fullName || item.name || '';
        const currentStatus = String(item.status || item.kycStatus || 'pending').toLowerCase();
        const isResolved = currentStatus === 'approved' || currentStatus === 'verified' || currentStatus === 'rejected';
        
        let badgeClass = 'badge-pending';
        if (currentStatus === 'approved' || currentStatus === 'verified') badgeClass = 'badge-approved';
        else if (currentStatus === 'rejected') badgeClass = 'badge-rejected';

        html += `<tr>
            <td>
                <strong>${userEmail}</strong>
                ${userName ? `<br><small style="color: var(--text-muted); font-size: 11px;">${userName}</small>` : ''}
            </td>
            <td>
                <button data-action="view-doc" data-index="${idx}" class="btn btn-sm" style="color: #f3ba2f; background: #181a20; border: 1px solid #f3ba2f; padding: 5px 12px; border-radius: 4px; cursor: pointer;">
                    <i class="fas fa-eye"></i> View Docs
                </button>
            </td>
            <td><span class="${badgeClass}">${currentStatus.toUpperCase()}</span></td>
            <td>
                ${isResolved 
                    ? `<span style="color: var(--text-muted); font-weight: 600; font-size: 12px;">Completed</span>` 
                    : `<button class="btn btn-approve" data-action="approve-kyc" data-id="${kycId}">Approve</button>
                       <button class="btn btn-reject" data-action="reject-kyc" data-id="${kycId}">Reject</button>`
                }
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

async function openKycModalByIndex(idx) {
    const kycItem = currentKycList[idx];
    if (!kycItem) return;
    await openKycModal(kycItem);
}

async function openKycModal(kycItem) {
    let modal = document.getElementById('kycModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'kycModal';
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div style="background: #1e2329; padding: 20px; border-radius: 12px; max-width: 720px; width: 95%; color: #fff; text-align: center; position: relative; border: 1px solid #30363d; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
                <span class="close-modal-btn" style="position: absolute; top: 12px; right: 18px; font-size: 26px; color: #848e9c; cursor: pointer; font-weight: bold; line-height: 1;">&times;</span>
                <h3 id="modalUserEmail" style="margin-bottom: 15px; margin-right: 25px; color: #f3ba2f; font-size: 15px; word-break: break-all; text-align: left;"></h3>
                <div id="modalImagesContainer" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 18px;">
                    <div>
                        <p style="margin-bottom: 4px; font-size: 12px; color: #848e9c; font-weight: bold;">Front ID</p>
                        <img id="modalFrontImg" src="" class="zoom-img" style="width: 210px; height: 135px; object-fit: contain; background: #0b0e11; border-radius: 6px; border: 1px solid #474d57; cursor: pointer;" title="Click to zoom">
                    </div>
                    <div>
                        <p style="margin-bottom: 4px; font-size: 12px; color: #848e9c; font-weight: bold;">Back ID</p>
                        <img id="modalBackImg" src="" class="zoom-img" style="width: 210px; height: 135px; object-fit: contain; background: #0b0e11; border-radius: 6px; border: 1px solid #474d57; cursor: pointer;" title="Click to zoom">
                    </div>
                    <div>
                        <p style="margin-bottom: 4px; font-size: 12px; color: #f3ba2f; font-weight: bold;">Selfie / User Photo</p>
                        <img id="modalSelfieImg" src="" class="zoom-img" style="width: 210px; height: 135px; object-fit: contain; background: #0b0e11; border-radius: 6px; border: 2px solid #f3ba2f; cursor: pointer;" title="Click to zoom">
                    </div>
                </div>
                <button class="close-modal-btn" style="background: #f3ba2f; color: #000; border: none; padding: 8px 24px; font-weight: bold; border-radius: 6px; cursor: pointer; font-size: 13px;">Close Panel</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const kycId = kycItem._id || kycItem.id;
    document.getElementById('modalUserEmail').innerText = `KYC: ${kycItem.email || kycItem.userEmail || kycItem.userId || 'N/A'}`;
    modal.style.display = 'flex';

    const ts = Date.now();
    const front = resolveImgUrl(kycItem.frontImage || `/api/admin/kyc-image/${kycId}/frontImage?t=${ts}`);
    const back = resolveImgUrl(kycItem.backImage || `/api/admin/kyc-image/${kycId}/backImage?t=${ts}`);
    const selfie = resolveImgUrl(kycItem.selfieImage || `/api/admin/kyc-image/${kycId}/selfieImage?t=${ts}`);

    document.getElementById('modalFrontImg').src = front;
    document.getElementById('modalBackImg').src = back;
    document.getElementById('modalSelfieImg').src = selfie;
}

async function performKycAction(kycId, status) {
    let rejectionReason = status === 'rejected' ? prompt('Reason for rejection:', 'Invalid documents') : '';
    if (status === 'rejected' && !rejectionReason) return;

    currentKycList = currentKycList.filter(item => (item._id || item.id) !== kycId);
    kycCache[activeKycStatus] = currentKycList;
    renderKycs(document.getElementById('kycTableBody'), currentKycList);
    if (activeKycStatus === 'pending') {
        document.getElementById('statKycCount').innerText = currentKycList.length;
    }

    const res = await fetch(`${API_BASE}/api/admin/kyc-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify({ kycId, status, rejectionReason })
    });
    const json = await res.json();
    if (res.ok && json.success) { 
        prefetchKycStatus('pending');
        prefetchKycStatus('approved');
        prefetchKycStatus('rejected');
        fetchStats();
    } else {
        alert(json.message || 'Action failed.');
        loadKycData(activeKycStatus, true);
    }
}

function getDisputeResolutionState(trade) {
    const rawStatus = String(trade.status || '').toLowerCase().trim();
    const msgs = Array.isArray(trade.messages) ? trade.messages : [];

    const hasRefundMsg = msgs.some(m =>
        (m.isSystem || m.senderId === 'admin' || m.senderId === 'system') &&
        (String(m.text).includes('refunded to the Seller') || String(m.text).includes('refunded to Seller') || String(m.text).includes('Winner: Seller'))
    );
    const hasReleaseMsg = msgs.some(m =>
        (m.isSystem || m.senderId === 'admin' || m.senderId === 'system') &&
        (String(m.text).includes('released to the Buyer') || String(m.text).includes('Released') || String(m.text).includes('Winner: Buyer'))
    );

    const isRefunded = rawStatus === 'refunded' || rawStatus === 'cancelled' || hasRefundMsg;
    const isResolved = !isRefunded && (rawStatus === 'resolved' || rawStatus === 'completed' || hasReleaseMsg);

    return { isResolved, isRefunded };
}

function renderEscrowDisputesTable(disputesArray) {
    const tbody = document.getElementById('escrowTableBody');
    if (!tbody) return;

    if (!Array.isArray(disputesArray) || disputesArray.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted); padding:20px;">No active disputes or escrow trades found.</td></tr>`;
        return;
    }

    let html = '';
    disputesArray.forEach((trade, idx) => {
        const tNum = String(trade.tradeNumber || '00001').padStart(5, '0');
        const { isResolved, isRefunded } = getDisputeResolutionState(trade);

        let statusBadgeHtml = '';
        let actionsHtml = '';

        if (isRefunded) {
            statusBadgeHtml = `<span class="badge-rejected">REFUNDED</span>`;
            actionsHtml = `<button type="button" class="btn-locked-refunded" disabled><i class="fa-solid fa-rotate-left"></i> Refunded</button>`;
        } else if (isResolved) {
            statusBadgeHtml = `<span class="badge-approved">RESOLVED</span>`;
            actionsHtml = `<button type="button" class="btn-locked-resolved" disabled><i class="fa-solid fa-circle-check"></i> Resolved</button>`;
        } else {
            const stLabel = String(trade.status || 'DISPUTED').toUpperCase();
            const badgeCls = trade.status === 'disputed' ? 'badge-rejected' : 'badge-pending';
            statusBadgeHtml = `<span class="${badgeCls}">${stLabel}</span>`;
            actionsHtml = `
                <button class="btn btn-approve" data-action="release-escrow" data-id="${trade._id}" data-index="${idx}">Release to Buyer</button>
                <button class="btn btn-reject" data-action="refund-escrow" data-id="${trade._id}" data-index="${idx}">Refund Seller</button>
            `;
        }

        html += `<tr>
            <td><strong>Trade #${tNum}</strong><br><small style="color:var(--text-muted);">${trade.paymentMethod || ''} (${Number(trade.etbAmount || 0).toLocaleString('en-US')} ETB)</small></td>
            <td>
                <span style="color:var(--green); font-weight:700;">B:</span> ${trade.buyerName || trade.buyerEmail || 'Buyer'}<br>
                <span style="color:var(--yellow); font-weight:700;">S:</span> ${trade.sellerName || trade.sellerEmail || 'Seller'}
            </td>
            <td><strong>${Number(trade.usdtAmount || 0).toFixed(4)} USDT</strong></td>
            <td>
                ${statusBadgeHtml}<br>
                <button class="btn" data-action="view-chat" data-index="${idx}" style="margin-top:6px; background:#18202a; color:#f0b90b; border:1px solid #f0b90b;">
                    <i class="fa-solid fa-comments"></i> View Chat & Receipt
                </button>
            </td>
            <td>${actionsHtml}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

async function fetchEscrowDisputes() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/escrow-disputes?t=${Date.now()}`, {
            headers: { 'Authorization': 'Bearer ' + getToken() },
            cache: 'no-store'
        });
        const json = await res.json();
        if (res.ok && json.success && Array.isArray(json.data)) {
            currentDisputesList = json.data;
            renderEscrowDisputesTable(currentDisputesList);
            try {
                sessionStorage.setItem(ESCROW_CACHE_KEY, JSON.stringify(currentDisputesList));
            } catch (e) {}
        } else if (currentDisputesList.length === 0) {
            renderEscrowDisputesTable([]);
        }
    } catch (err) {
        if (currentDisputesList.length === 0) {
            renderEscrowDisputesTable([]);
        }
    }
}

function openDisputeEvidenceModal(idx) {
    const trade = currentDisputesList[idx];
    if (!trade) return;

    let modal = document.getElementById('disputeEvidenceModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'disputeEvidenceModal';
        modal.className = "modal-overlay";
        document.body.appendChild(modal);
    }

    const mainReceiptUrl = resolveImgUrl(trade.receiptImage || `/api/admin/trade-receipt/${trade._id}`);
    const msgs = Array.isArray(trade.messages) ? trade.messages : [];

    const chatHtml = msgs.map((m, mIdx) => {
        const rawText = String(m.text || '');
        let extractedImgFromText = '';
        const imgMatch = rawText.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
        if (imgMatch && imgMatch[1]) {
            extractedImgFromText = imgMatch[1];
        }

        const cleanText = rawText
            .replace(/<br\s*\/?>\s*<img[^>]*>/gi, '')
            .replace(/<img[^>]*>/gi, '')
            .trim();

        const isInitialReceiptAutoMsg = cleanText.startsWith('Payment receipt uploaded (');
        const rawImgSource = m.image || extractedImgFromText || '';
        const finalChatImgUrl = (!isInitialReceiptAutoMsg && rawImgSource)
            ? resolveImgUrl(rawImgSource)
            : '';

        return `
            <div style="padding:10px 12px; margin-bottom:8px; border-radius:8px; background:${m.isSystem ? 'rgba(240,185,11,0.1)' : '#151a21'}; border:1px solid ${m.isSystem ? 'rgba(240,185,11,0.3)' : '#232d3f'}; font-size:12.5px; line-height:1.45;">
                <strong style="color:#f0b90b;">${m.senderName || (m.isSystem ? 'System' : 'User')}:</strong>
                ${cleanText ? `<span> ${cleanText}</span>` : ''}
                ${finalChatImgUrl ? `<img src="${finalChatImgUrl}" class="dispute-chat-msg-img zoom-img" title="Click to view full image">` : ''}
            </div>
        `;
    }).join('') || '<p style="color:#848e9c;">No chat messages.</p>';

    modal.innerHTML = `
        <div style="background:#151a21; border:1px solid #232d3f; border-radius:12px; max-width:720px; width:100%; max-height:88vh; display:flex; flex-direction:column; padding:20px; color:#fff; box-shadow: 0 20px 50px rgba(0,0,0,0.8);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #232d3f; padding-bottom:12px; margin-bottom:14px;">
                <h3 style="margin:0; color:#f0b90b; font-size:17px;">Dispute Evidence — Trade #${String(trade.tradeNumber || '00001').padStart(5, '0')}</h3>
                <button class="close-modal-btn" style="background:none; border:none; color:#fff; font-size:22px; cursor:pointer; line-height:1;">&times;</button>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; overflow-y:auto; flex:1;">
                <div>
                    <h4 style="margin:0 0 8px 0; font-size:13px; color:#0ecb81;">Uploaded Payment Receipt</h4>
                    <div style="background:#0b0e11; border:1px solid #f0b90b; border-radius:8px; padding:8px; text-align:center;">
                        <img src="${mainReceiptUrl}" class="zoom-img" style="width:100%; max-height:320px; object-fit:contain; border-radius:6px; cursor:pointer;" onerror="this.outerHTML='<p style=\\'color:#848e9c; font-size:12px; padding:20px;\\'>No receipt image uploaded.</p>'">
                    </div>
                    <p style="font-size:12px; color:#848e9c; margin-top:10px;"><strong>Dispute Reason:</strong> ${trade.disputeReason || 'Dispute submitted by trader'}</p>
                </div>
                <div style="overflow-y:auto; max-height:400px; padding-right:4px;">
                    <h4 style="margin:0 0 8px 0; font-size:13px; color:#f0b90b;">Full Chat History</h4>
                    <div style="padding-bottom:10px;">${chatHtml}</div>
                </div>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

async function resolveEscrow(tradeId, action, idx) {
    const label = action === 'release' ? 'Release USDT to Buyer' : 'Refund USDT to Seller';
    if (!confirm(`Are you sure you want to ${label}? This action is final and cannot be undone.`)) return;

    if (idx !== undefined && currentDisputesList[idx]) {
        currentDisputesList[idx].status = action === 'release' ? 'resolved' : 'refunded';
        renderEscrowDisputesTable(currentDisputesList);
    }

    try {
        const res = await fetch(`${API_BASE}/api/admin/escrow-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
            body: JSON.stringify({ tradeId, action })
        });
        const json = await res.json();
        if (res.ok && json.success) {
            fetchEscrowDisputes();
            fetchStats();
        } else {
            alert(json.message || 'Failed to resolve escrow.');
            fetchEscrowDisputes();
        }
    } catch (err) {
        alert('Network error while resolving escrow.');
        fetchEscrowDisputes();
    }
}

function filterUsersTable() {
    const query = (document.getElementById('userSearchInput')?.value || '').toLowerCase().trim();
    if (!query) return renderUsersTable(currentUsersList);

    const filtered = currentUsersList.filter(u => {
        const e = String(u.email || '').toLowerCase();
        const t = String(u.userId || '').toLowerCase();
        const un = String(u.traderUsername || '').toLowerCase();
        return e.includes(query) || t.includes(query) || un.includes(query);
    });
    renderUsersTable(filtered);
}

function renderUsersTable(usersList) {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    if (!Array.isArray(usersList) || usersList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No users found.</td></tr>`;
        return;
    }
    let html = '';
    usersList.forEach(user => {
        let isBanned = user.isBanned || false;
        let isWarned = user.hasBeenWarned || false;

        let warnBtnStyle = isWarned 
            ? `background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid #fff;` 
            : `background: rgba(240, 185, 11, 0.15); color: var(--yellow); border: 1px solid var(--yellow);`;
        let warnBtnText = isWarned ? 'Warned' : 'Warning';

        html += `<tr>
            <td>
                ${user.email}
                <i class="fa-solid fa-eye" data-action="view-user" data-id="${user._id}" style="color:var(--blue); cursor:pointer; margin-left:10px; font-size:14px;" title="View User Details"></i>
            </td>
            <td>${user.isAdmin ? '<span class="badge-approved">Admin</span>' : 'Standard'}</td>
            <td><span class="badge-${user.kycStatus === 'verified' || user.kycStatus === 'approved' ? 'approved' : 'pending'}">${user.kycStatus || 'pending'}</span></td>
            <td>${isBanned ? '<span class="badge-rejected">Banned</span>' : '<span class="badge-approved">Active</span>'}</td>
            <td>
                <button class="btn ${isBanned ? 'btn-approve' : 'btn-ban'}" data-action="toggle-ban" data-id="${user._id}" data-banned="${isBanned}">
                    ${isBanned ? 'Unban User' : 'Ban User'}
                </button>
                <button class="btn" style="${warnBtnStyle} margin-left: 6px;" data-action="warn-user" data-id="${user._id}" data-warned="${isWarned}">
                    <i class="fa-solid fa-triangle-exclamation"></i> ${warnBtnText}
                </button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

async function openUserDetailsModal(userId) {
    let modal = document.getElementById('userDetailsModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'userDetailsModal';
        modal.className = "modal-overlay";
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div style="background:#151a21; border:1px solid #232d3f; border-radius:12px; width:100%; max-width:400px; padding:30px; color:#fff; text-align:center;">
            <h3 style="margin:0; color:#3b82f6;"><i class="fa-solid fa-circle-notch fa-spin"></i> Fetching details...</h3>
        </div>
    `;
    modal.style.display = 'flex';

    try {
        const res = await fetch(`${API_BASE}/api/admin/user-details/${userId}`, {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        const json = await res.json();
        
        if (res.ok && json.success) {
            const u = json.user;
            const s = json.stats;
            
            const isVerified = ['verified', 'approved'].includes(String(u.kycStatus).toLowerCase());
            const displayName = isVerified ? `<span style="color:#0ecb81;"><i class="fa-solid fa-circle-check"></i> ${u.fullName}</span>` : `<span style="color:#848e9c;">(Unverified)</span> ${u.fullName || 'User'}`;
            
            let cleanUsername = '<span style="color:#848e9c;">None</span>';
            if (u.traderUsername) {
                cleanUsername = '@' + String(u.traderUsername).replace(/^@+/, '');
            }
            
            modal.innerHTML = `
                <div style="background:#151a21; border:1px solid #232d3f; border-radius:12px; width:100%; max-width:400px; padding:0; color:#fff; box-shadow: 0 20px 50px rgba(0,0,0,0.8); overflow:hidden;">
                    <div style="background:#18202a; padding:15px 20px; border-bottom:1px solid #232d3f; display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0; color:#3b82f6; font-size:16px;"><i class="fa-solid fa-address-card"></i> User Details</h3>
                        <button class="close-modal-btn" style="background:none; border:none; color:#848e9c; font-size:24px; cursor:pointer; line-height:1;">&times;</button>
                    </div>
                    <div style="padding:20px; text-align:left; font-size:14px; line-height:1.8;">
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #232d3f; padding-bottom:10px; margin-bottom:10px;">
                            <span style="color:#848e9c;">Email:</span> <strong>${u.email}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #232d3f; padding-bottom:10px; margin-bottom:10px;">
                            <span style="color:#848e9c;">TBR ID:</span> <strong style="color:#f0b90b;">${u.userId || 'N/A'}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #232d3f; padding-bottom:10px; margin-bottom:10px;">
                            <span style="color:#848e9c;">Full Name:</span> <strong>${displayName}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #232d3f; padding-bottom:10px; margin-bottom:10px;">
                            <span style="color:#848e9c;">Username:</span> <strong>${cleanUsername}</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #232d3f; padding-bottom:10px; margin-bottom:10px;">
                            <span style="color:#848e9c;">Total Trades:</span> <strong style="color:#0ecb81;">${s.totalTrades} Orders</strong>
                        </div>
                        <div style="display:flex; justify-content:space-between; border-bottom:1px solid #232d3f; padding-bottom:10px; margin-bottom:10px;">
                            <span style="color:#848e9c;">Total Volume:</span> <strong style="color:#00d4ff;">${s.volumeUsdt} USDT</strong>
                        </div>
                        
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:#848e9c;">Account Balance:</span>
                            <span style="color:#0ecb81; font-weight:bold; display:flex; align-items:center; gap:8px;">
                                <span id="modalUserBalance">${u.balance || 0} USDT</span>
                                <button data-action="edit-balance" data-id="${u._id}" data-balance="${u.balance || 0}" style="background:transparent; border:none; color:#f0b90b; cursor:pointer; padding:0; font-size:16px;" title="Edit Balance">✏️</button>
                            </span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            modal.innerHTML = `<div style="background:#151a21; padding:25px; border-radius:12px; color:#f6465d;">Failed to load user details.</div>`;
            setTimeout(() => modal.style.display = 'none', 2000);
        }
    } catch (err) {
        modal.innerHTML = `<div style="background:#151a21; padding:25px; border-radius:12px; color:#f6465d;">Network Error.</div>`;
        setTimeout(() => modal.style.display = 'none', 2000);
    }
}

async function sendUserWarning(userId, isWarned) {
    if (isWarned) {
        if (!confirm("This user has already been Warned. Do you want to send another warning message?")) return;
    }
    const message = prompt('Enter the warning message to send to this user:', '⚠️ Warning: Please follow the platform rules. Continued violations may result in a ban.');
    if (!message || !message.trim()) return;

    try {
        const res = await fetch(`${API_BASE}/api/admin/warn-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
            body: JSON.stringify({ userId, message: message.trim() })
        });
        const json = await res.json();
        if (res.ok && json.success) {
            alert('Warning sent successfully! The user will see this notification.');
            fetchUsersList();
        } else {
            alert(json.message || 'Failed to send warning.');
        }
    } catch(e) {
        alert('Network error while sending warning.');
    }
}

async function fetchUsersList() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/users?t=${Date.now()}`, {
            headers: { 'Authorization': 'Bearer ' + getToken() },
            cache: 'no-store'
        });
        const json = await res.json();
        if (res.ok && json.success && Array.isArray(json.data)) {
            currentUsersList = json.data;
            renderUsersTable(currentUsersList);
            try { sessionStorage.setItem(USERS_CACHE_KEY, JSON.stringify(json.data)); } catch (e) {}
        }
    } catch (err) {}
}

async function toggleUserBan(userId, currentStatus) {
    const action = currentStatus ? 'unban' : 'ban';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;
    const res = await fetch(`${API_BASE}/api/admin/user-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify({ userId, action })
    });
    const json = await res.json();
    if (res.ok && json.success) { 
        fetchUsersList(); 
    }
}

async function saveRates() {
    const cleanNum = (v) => parseFloat(String(v).replace(',', '.').trim());
    const buyRate = cleanNum(document.getElementById('buyRateInput').value);
    const sellRate = cleanNum(document.getElementById('sellRateInput').value);
    const platformFee = cleanNum(document.getElementById('feeInput').value);

    try {
        const res = await fetch(`${API_BASE}/api/admin/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
            body: JSON.stringify({ buyRate, sellRate, platformFee })
        });
        const json = await res.json();
        if (res.ok && json.success) {
            alert('Rate & Fee settings saved successfully!');
            loadCurrentRates();
        } else {
            alert(json.message || 'Failed to save settings.');
        }
    } catch (err) {
        alert('Network error while saving settings.');
    }
}

async function loadCurrentRates() {
    try {
        const res = await fetch(`${API_BASE}/api/settings`);
        const json = await res.json();
        if (res.ok && json.success && json.data) {
            document.getElementById('buyRateInput').value = json.data.buyRate;
            document.getElementById('sellRateInput').value = json.data.sellRate;
            document.getElementById('feeInput').value = json.data.platformFee;
        }
    } catch (err) {}
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return "about " + Math.floor(interval) + " hour" + (Math.floor(interval) > 1 ? "s" : "") + " ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " minutes ago";
    return "just now";
}

async function openCompletedTradesModal() {
    let modal = document.getElementById('completedTradesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'completedTradesModal';
        modal.className = "modal-overlay";
        
        modal.innerHTML = `
            <div style="background:#151a21; border:1px solid #232d3f; border-radius:12px; max-width:800px; width:100%; max-height:85vh; display:flex; flex-direction:column; padding:0; color:#fff; box-shadow: 0 20px 50px rgba(0,0,0,0.8); overflow: hidden;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #232d3f; padding:20px;">
                    <h3 style="margin:0; color:#a855f7; font-size:18px;"><i class="fa-solid fa-handshake"></i> Completed Trades History</h3>
                    <button class="close-modal-btn" style="background:none; border:none; color:#848e9c; font-size:24px; cursor:pointer; line-height:1;">&times;</button>
                </div>
                <div style="overflow-y:auto; flex:1; padding: 0;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                        <thead style="background: #18202a; position: sticky; top: 0;">
                            <tr>
                                <th style="padding: 12px 20px; color: #848e9c; font-weight: 600;">USDT</th>
                                <th style="padding: 12px 20px; color: #848e9c; font-weight: 600;">ETB</th>
                                <th style="padding: 12px 20px; color: #848e9c; font-weight: 600;">CHAIN</th>
                                <th style="padding: 12px 20px; color: #848e9c; font-weight: 600;">STATUS</th>
                                <th style="padding: 12px 20px; color: #848e9c; font-weight: 600;">AGE</th>
                            </tr>
                        </thead>
                        <tbody id="completedTradesTableBody">
                            <tr><td colspan="5" style="text-align:center; padding: 40px; color:#f0b90b;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading trades...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    document.getElementById('completedTradesTableBody').innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 40px; color:#f0b90b;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading trades...</td></tr>`;
    
    try {
        const res = await fetch(`${API_BASE}/api/admin/completed-trades?t=${Date.now()}`, {
            headers: { 'Authorization': 'Bearer ' + getToken() },
            cache: 'no-store'
        });
        const json = await res.json();
        const tbody = document.getElementById('completedTradesTableBody');
        
        if (res.ok && json.success && json.trades && json.trades.length > 0) {
            let html = '';
            json.trades.forEach(tr => {
                const usdt = Number(tr.usdtAmount || 0).toFixed(2);
                const etb = Number(tr.etbAmount || 0).toLocaleString('en-US');
                const statusBadge = `<span style="background: rgba(14, 203, 129, 0.12); color: #0ecb81; border: 1px solid rgba(14, 203, 129, 0.25); padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold;">completed</span>`;
                const ageStr = timeAgo(new Date(tr.createdAt));
                
                html += `<tr style="border-bottom: 1px solid #232d3f;">
                    <td style="padding: 14px 20px; font-weight: bold; color: #fff;">${usdt}</td>
                    <td style="padding: 14px 20px; color: #848e9c;">${etb}</td>
                    <td style="padding: 14px 20px;"><span style="border: 1px solid #474d57; padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #848e9c;">BNB</span></td>
                    <td style="padding: 14px 20px;">${statusBadge}</td>
                    <td style="padding: 14px 20px; color: #848e9c; font-size: 12px;">${ageStr}</td>
                </tr>`;
            });
            tbody.innerHTML = html;
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 40px; color:#848e9c;">No completed trades found.</td></tr>`;
        }
    } catch (err) {
        document.getElementById('completedTradesTableBody').innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 40px; color:#f6465d;">Error loading trades. Please check connection.</td></tr>`;
    }
}

function openLivePostsModal() {
    document.getElementById('adminLivePostsModal').style.display = 'flex';
    fetchLivePostsForAdmin();
}

async function fetchLivePostsForAdmin() {
    const tbody = document.getElementById('adminLivePostsTableBody');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #f0b90b;">Loading active posts...</td></tr>';
    
    try {
        const token = getToken();
        const response = await fetch(`${API_BASE}/api/ads`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && data.ads.length > 0) {
            tbody.innerHTML = '';
            data.ads.forEach(ad => {
                const typeColor = ad.tradeType === 'buy' ? '#0ecb81' : '#f6465d';
                const typeText = ad.tradeType.toUpperCase();
                
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #232d3f';
                tr.innerHTML = `
                    <td style="padding: 15px 10px; font-weight: bold;">${ad.name || ad.email}</td>
                    <td style="padding: 15px 10px; color: ${typeColor}; font-weight: bold;">${typeText}</td>
                    <td style="padding: 15px 10px; color: #f0b90b;">${ad.totalAmount} USDT</td>
                    <td style="padding: 15px 10px;">${ad.price} ETB</td>
                    <td style="padding: 15px 10px;">
                        <button data-action="delete-ad" data-id="${ad._id}" style="background: rgba(246, 70, 93, 0.2); color: #f6465d; border: 1px solid #f6465d; padding: 6px 15px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold; transition: 0.3s;">
                            Delete Post
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #b0b0b0;">No active posts found on the market right now.</td></tr>';
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: #f6465d;">Error loading posts. Please try again.</td></tr>';
    }
}

async function adminDeleteAd(adId) {
    if (!confirm('Are you sure you want to delete this post?\n\nThe post will be removed from the market, and if it is a SELL ad, the locked USDT will be safely refunded to the trader\'s wallet.')) {
        return;
    }
    
    try {
        const token = getToken();
        const response = await fetch(`${API_BASE}/api/ads/${adId}/cancel`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        
        if (data.success) {
            alert('✅ Post successfully deleted from the market!');
            fetchLivePostsForAdmin(); 
            fetchStats();
        } else {
            alert('Error: ' + data.message);
        }
    } catch (error) {
        alert('Failed to delete the post. Check your connection.');
    }
}

async function editAdminUserBalance(userId, currentBalance) {
    const newBalInput = prompt(`Enter new balance in USDT for this user.\n\nCurrent Balance: ${currentBalance} USDT`, currentBalance);
    if (newBalInput === null || newBalInput.trim() === "") return;
    
    const numericBal = Number(newBalInput);
    if (isNaN(numericBal) || numericBal < 0) {
        alert("❌ Error: Please enter a valid positive number.");
        return;
    }

    if (!confirm(`Are you sure you want to CHANGE this user's balance to ${numericBal} USDT?`)) return;

    try {
        const token = getToken();
        const response = await fetch(`${API_BASE}/api/admin/update-user-balance`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: userId, newBalance: numericBal })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('✅ Success! User balance has been updated.');
            const balanceElement = document.getElementById('modalUserBalance');
            if(balanceElement) balanceElement.innerText = `${data.newBalance} USDT`;
            fetchStats();
        } else {
            alert('❌ Error: ' + data.message);
        }
    } catch (error) {
        alert('❌ Failed to update balance. Check your connection.');
    }
}

async function fetchAdminWithdrawals() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/withdrawals?t=${Date.now()}`, { headers: { 'Authorization': 'Bearer ' + getToken() }});
        const json = await res.json();
        if (res.ok && json.success) {
            renderWithdrawalsTable(json.data);
        }
    } catch(e) {}
}

function renderWithdrawalsTable(list) {
    const tbody = document.getElementById('withdrawalsTableBody');
    if(!tbody) return;
    if(!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#848e9c;">No withdrawals found.</td></tr>';
        return;
    }
    let html = '';
    list.forEach(w => {
        const dateStr = new Date(w.createdAt).toLocaleString();
        let statusBadge = '';
        let actions = '';
        
        if(w.status === 'pending') {
            statusBadge = '<span class="badge-pending">PENDING</span>';
            actions = `
                <button class="btn btn-approve" data-action="approve-with" data-id="${w._id}" data-amount="${w.amount}" style="margin-right:5px; font-size:11px;">Approve & Send</button>
                <button class="btn btn-reject" data-action="reject-with" data-id="${w._id}" data-amount="${w.amount}" style="font-size:11px;">Reject & Refund</button>
            `;
        } else if (w.status === 'completed') {
            statusBadge = '<span class="badge-approved">COMPLETED</span>';
            actions = `<span style="color:#0ecb81; font-size:12px; font-weight:bold;">Sent ✅</span>`;
        } else {
            statusBadge = '<span class="badge-rejected">REJECTED</span>';
            actions = `<span style="color:#f6465d; font-size:12px; font-weight:bold;">Refunded 🔄</span>`;
        }

        html += `<tr style="border-bottom: 1px solid #232d3f;">
            <td style="font-size:12px; color:#848e9c;">${dateStr}</td>
            <td><strong>${w.email}</strong></td>
            <td style="color:#00d4ff; font-weight:bold;">${w.amount} USDT</td>
            <td style="font-size:11px; color:#848e9c; word-break:break-all;">${w.destinationAddress}</td>
            <td>${statusBadge}</td>
            <td>${actions}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

async function approveWithdrawal(txId, amount) {
    if(!confirm(`⚠️ WARNING ⚠️\n\nThis will instantly send ${amount} USDT from your Master Wallet to the user's address via the blockchain.\n\nAre you sure you want to APPROVE this withdrawal?`)) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/withdrawals/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
            body: JSON.stringify({ txId })
        });
        const json = await res.json();
        if(json.success) {
            alert('✅ Withdrawal Approved & Sent!');
            fetchAdminWithdrawals();
        } else {
            alert('❌ Error: ' + json.message);
        }
    } catch(e) { alert('Network error'); }
}

async function rejectWithdrawal(txId, amount) {
    if(!confirm(`Are you sure you want to REJECT this request?\n\nThe amount of ${amount} USDT (plus 1 USDT fee) will be safely refunded back to the user's platform balance.`)) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/withdrawals/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
            body: JSON.stringify({ txId })
        });
        const json = await res.json();
        if(json.success) {
            alert('✅ Withdrawal Rejected & Refunded!');
            fetchAdminWithdrawals();
        } else {
            alert('❌ Error: ' + json.message);
        }
    } catch(e) { alert('Network error'); }
}

async function loadDeposits() {
    try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/admin/deposits`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        const tbody = document.getElementById('depositsTableBody');
        tbody.innerHTML = '';
        
        if (data.success && data.data && data.data.length > 0) {
            data.data.forEach(dep => {
                const dateObj = new Date(dep.createdAt);
                const dateStr = dateObj.toLocaleDateString() + ', ' + dateObj.toLocaleTimeString();
                const addressStr = dep.destinationAddress ? dep.destinationAddress : 'N/A';
                
                const row = `
                <tr>
                    <td style="color: var(--text-muted); font-size: 13px;">${dateStr}</td>
                    <td style="font-weight: 600; color: #fff;">${dep.email}</td>
                    <td style="color: #0ecb81; font-weight: bold;">+${parseFloat(dep.amount).toFixed(2)} USDT</td>
                    <td style="color: var(--text-muted); font-size: 13px;">${addressStr}</td>
                    <td><span style="color: #0ecb81; background: rgba(14, 203, 129, 0.1); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">COMPLETED</span></td>
                </tr>`;
                tbody.insertAdjacentHTML('beforeend', row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No deposits found.</td></tr>';
        }
    } catch (error) {
        document.getElementById('depositsTableBody').innerHTML = '<tr><td colspan="5" style="text-align:center; color:#f6465d;">Error loading deposits.</td></tr>';
    }
}

async function openDevicesModal() {
    let modal = document.getElementById('devicesModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'devicesModal';
        modal.className = "modal-overlay";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div style="background:#151a21; border:1px solid #232d3f; border-radius:12px; max-width:450px; width:100%; padding:0; color:#fff; box-shadow: 0 20px 50px rgba(0,0,0,0.8); overflow: hidden;">
            <div style="background:#18202a; padding:15px 20px; border-bottom:1px solid #232d3f; display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; color:#3b82f6; font-size:16px;"><i class="fa-solid fa-laptop"></i> Active Login Sessions</h3>
                <button class="close-modal-btn" style="background:none; border:none; color:#848e9c; font-size:24px; cursor:pointer; line-height:1;">&times;</button>
            </div>
            <div style="padding:20px; text-align:left;">
                <p style="font-size:13px; color:#848e9c; margin-top:0;">Devices currently logged into your admin account.</p>
                
                <div id="otherDevicesContainer">
                    <div style="text-align:center; color:#f0b90b; font-size:13px; padding: 20px 0;">
                        <i class="fa-solid fa-circle-notch fa-spin"></i> Loading active devices...
                    </div>
                </div>
            </div>
        </div>
    `;
    modal.style.display = 'flex';

    try {
        const res = await fetch(`${API_BASE}/api/admin/sessions`, {
            headers: { 'Authorization': 'Bearer ' + getToken() }
        });
        const data = await res.json();
        const container = document.getElementById('otherDevicesContainer');
        
        if (data.success && data.sessions && data.sessions.length > 0) {
            let html = '<p style="font-size: 11px; color: #848e9c; font-weight: bold; border-bottom: 1px solid #232d3f; padding-bottom: 6px; margin-bottom: 10px;">CONNECTED DEVICES & IP</p>';
            
            data.sessions.reverse().forEach((sess, idx) => {
                const dateStr = new Date(sess.loginAt).toLocaleString();
                const icon = (sess.device.includes('Phone') || sess.device.includes('iOS')) ? 'fa-mobile-screen' : 'fa-computer';
                const isCurrent = idx === 0; // የመጀመርያው አሁን የفتحነው ነው
                
                html += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(35, 45, 63, 0.5);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <i class="fa-solid ${icon}" style="font-size: 18px; color: ${isCurrent ? '#0ecb81' : '#848e9c'}; width: 24px; text-align:center;"></i>
                            <div>
                                <strong style="color: #e2e8f0; display: block; font-size: 13px;">${sess.device} (${sess.browser})</strong>
                                <span style="color: #848e9c; font-size: 11px;">IP: ${sess.ip} • ${dateStr}</span>
                            </div>
                        </div>
                        ${isCurrent ? '<span style="color: #0ecb81; font-size: 10px; background: rgba(14,203,129,0.1); padding: 3px 8px; border-radius: 4px; font-weight: bold;">Current</span>' : ''}
                    </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p style="font-size: 13px; color: #848e9c; text-align: center; padding: 10px 0;">No active sessions found.</p>';
        }
    } catch (err) {
        document.getElementById('otherDevicesContainer').innerHTML = '<p style="font-size: 13px; color: #f6465d; text-align: center;">Error loading sessions.</p>';
    }
}