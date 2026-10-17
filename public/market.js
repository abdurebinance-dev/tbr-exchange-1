// --- 🚀 GLOBAL EVENT DELEGATION (CSP FIX) 🚀 ---
document.addEventListener('click', function(e) {
    // 1. Handle all data-action buttons
    const btn = e.target.closest('button[data-action], div[data-action], span[data-action], a[data-action]');
    if (btn) {
        const action = btn.dataset.action;
        
        if (action === 'switch-buy') switchTradeType('buy');
        if (action === 'switch-sell') switchTradeType('sell');
        if (action === 'toggle-online') toggleOnlineFilter();
        if (action === 'open-amount') openAmountModal();
        if (action === 'close-amount') closeAmountModal();
        if (action === 'reset-amount') resetAmountFilter();
        if (action === 'confirm-amount') confirmAmountFilter();
        if (action === 'open-payment') openPaymentModal();
        if (action === 'close-payment') closePaymentModal();
        if (action === 'reset-payment') resetPaymentFilter();
        if (action === 'confirm-payment') confirmPaymentFilter();
        if (action === 'close-order') closeOrderModal();
        if (action === 'confirm-trade') confirmTrade();
        if (action === 'fill-max') fillMaxModalOrder();
        if (action === 'go-settings') window.location.href = 'settings.html?tab=payments';
        if (action === 'go-dashboard') window.location.href = 'dashboard.html';
        if (action === 'close-alert') document.getElementById('customAlertModal').style.display = 'none';
        if (action === 'close-profile') document.getElementById('userProfileModal').style.display = 'none';
        
        if (action === 'open-order-modal') {
            const idx = btn.dataset.index;
            if (idx) openOrderModalByIndex(idx);
        }
        if (action === 'open-profile') {
            const uname = btn.dataset.username;
            if (uname) openUserProfileStats(uname);
        }
        return;
    }

    // 2. Handle dynamically rendered pills & options
    const amountPill = e.target.closest('.amount-pill');
    if (amountPill) {
        selectAmountPill(amountPill.dataset.val);
        return;
    }

    const payOption = e.target.closest('.pay-method-option');
    if (payOption) {
        selectPaymentOption(payOption.dataset.method);
        return;
    }

    const modalPayPill = e.target.closest('.tm-method-pill');
    if (modalPayPill) {
        selectModalPaymentMethod(modalPayPill.dataset.method);
        return;
    }

    // 3. Handle clicking on the overlay background to close
    const overlay = e.target.closest('.modal-overlay, .sheet-overlay');
    if (overlay && e.target === overlay) {
        const modalId = overlay.dataset.modal;
        if (modalId === 'amount-sheet') closeAmountModal();
        if (modalId === 'payment-sheet') closePaymentModal();
        if (modalId === 'order-modal') closeOrderModal();
        if (modalId === 'user-profile') overlay.style.display = 'none';
    }
});

// 🚀 EVENT DELEGATION FOR ALL INPUTS (CSP COMPLIANT) 🚀
document.addEventListener('input', (e) => {
    if (e.target.id === 'amountFilterInput') syncAmountPills(e.target.value);
    if (e.target.id === 'paymentSearchInput') filterPaymentMethodButtons(e.target.value);
    if (e.target.id === 'tmEtbInput') onModalEtbInput(e.target.value);
    if (e.target.id === 'tmUsdtInput') onModalUsdtInput(e.target.value);
});


// Handle image fallback for CSP (replaces inline onerror)
document.addEventListener('error', function(e) {
    if (e.target && e.target.tagName === 'IMG' && e.target.hasAttribute('data-fallback')) {
        e.target.outerHTML = e.target.getAttribute('data-fallback');
    }
}, true);


// --- 🚀 ORIGINAL USER CODE START 🚀 ---

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://tbr-exchange-backend.onrender.com';

// ⚡ ቀላል (2KB) የማርኬት ካሽ ቁልፍ (QuotaExceededError ፈጽሞ እንዳይፈጠርና በ 0.00s እንዲከፍት!) ⚡
const LIGHT_ADS_CACHE_KEY = 'tbr_market_light_ads_v5';
const AVATAR_THUMB_CACHE_KEY = 'tbr_market_avatars_v5';
let currentType = 'buy';

let systemSettings = {
    buyRate: 195,
    sellRate: 192,
    platformFee: 0.5
};

let allServerAds = [];
let avatarThumbMemory = {};
let currentRenderedAds = [];
let hasLoadedAdsOnce = false;
let isFetchingAds = false;

let currentUserBalance = 0;
let currentUserFullName = '';
let currentUserSavedPayments = [];

let activeModalAd = null;
let activeModalSelectedMethod = '';

let filterOnlineOnly = false;
let filterAmountETB = null;
let filterPaymentMethod = 'All Methods';
let tempSelectedPayment = 'All Methods';

function getAuthToken() {
    return localStorage.getItem('token') || localStorage.getItem('jwtToken') || localStorage.getItem('authToken') || '';
}

// ⚡ ትላልቅ የፕሮፋይል ፎቶዎችን ወደ 2KB ትንሽ Thumbnail ቀይሮ በካሽ የሚያስቀምጥ (ገጹ በ 0.00s እንዲከፍት) ⚡
function cacheSmallAvatarThumb(traderKey, rawDataUrl) {
    if (!traderKey || !rawDataUrl) return;
    if (avatarThumbMemory[traderKey]) return;

    if (rawDataUrl.length < 15000) {
        avatarThumbMemory[traderKey] = rawDataUrl;
        try {
            sessionStorage.setItem(AVATAR_THUMB_CACHE_KEY, JSON.stringify(avatarThumbMemory));
        } catch (e) {}
        return;
    }

    const img = new Image();
    img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 64, 64);
            const smallB64 = canvas.toDataURL('image/jpeg', 0.7);
            avatarThumbMemory[traderKey] = smallB64;
            sessionStorage.setItem(AVATAR_THUMB_CACHE_KEY, JSON.stringify(avatarThumbMemory));
            localStorage.setItem(AVATAR_THUMB_CACHE_KEY, JSON.stringify(avatarThumbMemory));
        } catch (e) {}
    };
    img.src = rawDataUrl;
}

// ⚡ ማስታወቂያዎቹን ያለ ክብደት (2KB ብቻ) በ localStorage እና sessionStorage ውስጥ ማስቀመጥ ⚡
function saveLightweightAdsCache(adsArray) {
    try {
        const lightAds = adsArray.map(ad => {
            const tKey = String(ad.userId || ad.name || ad._id || '');
            const rawAv = ad.avatar || ad.profilePic || '';
            if (rawAv && tKey) {
                cacheSmallAvatarThumb(tKey, rawAv);
            }
            return {
                _id: ad._id,
                userId: ad.userId,
                name: ad.name,
                traderUsername: ad.traderUsername,
                tbrId: ad.tbrId,
                tradeType: ad.tradeType,
                price: ad.price,
                totalAmount: ad.totalAmount,
                minLimit: ad.minLimit,
                maxLimit: ad.maxLimit,
                paymentMethods: ad.paymentMethods,
                status: ad.status || 'active',
                isOnline: ad.isOnline,
                ordersCount: ad.ordersCount || 1,
                completionRate: ad.completionRate || '100%',
                createdAt: ad.createdAt
            };
        });
        const payload = JSON.stringify(lightAds);
        sessionStorage.setItem(LIGHT_ADS_CACHE_KEY, payload);
        localStorage.setItem(LIGHT_ADS_CACHE_KEY, payload);
    } catch (e) {}
}

function sendHeartbeat() {
    const token = getAuthToken();
    if (!token) return;
    fetch(`${API_BASE}/api/user/heartbeat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    }).catch(() => {});
}

async function fetchAdminSettings() {
    try {
        const res = await fetch(`${API_BASE}/api/settings`);
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
                const parseNum = (v, fallback) => {
                    const n = parseFloat(String(v).replace(',', '.'));
                    return !isNaN(n) ? n : fallback;
                };
                systemSettings.buyRate = parseNum(json.data.buyRate, 195);
                systemSettings.sellRate = parseNum(json.data.sellRate, 192);
                systemSettings.platformFee = parseNum(json.data.platformFee, 0.5);

                if (document.getElementById('orderModal').style.display === 'flex') {
                    updateFeeSummaryDisplay();
                }
            }
        }
    } catch (e) {}
}

async function fetchCurrentUserWalletAndPayments() {
    const token = getAuthToken();
    if (!token) return;
    try {
        const [profRes, payRes] = await Promise.all([
            fetch(`${API_BASE}/api/user/profile`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_BASE}/api/user/payments`, { headers: { 'Authorization': `Bearer ${token}` } })
        ]);
        if (profRes.ok) {
            const profJson = await profRes.json();
            if (profJson.success && profJson.user) {
                currentUserBalance = Number(profJson.user.balance || 0);
                currentUserFullName = profJson.user.fullName || '';
            }
        }
        if (payRes.ok) {
            const payJson = await payRes.json();
            if (payJson.success && Array.isArray(payJson.payments)) {
                currentUserSavedPayments = payJson.payments;
            }
        }
    } catch (e) {}
}

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const activeTab = urlParams.get('tab');
    const initialType = urlParams.get('type');

    if (activeTab === 'sell' || initialType === 'sell') {
        currentType = 'sell';
        document.getElementById('sellTabBtn').className = 'toggle-btn active sell-active';
        document.getElementById('buyTabBtn').className = 'toggle-btn';
    }

    // ⚡ 1. ገጹ ሲከፈት፣ Refresh ሲደረግ ወይም ከዳሽቦርድ ስትመለስ በ 0.00 ሰከንድ ወዲያውኑ ከ2KB ካሽ ማሳየት! ⚡
    try {
        const savedAvatars = sessionStorage.getItem(AVATAR_THUMB_CACHE_KEY) || localStorage.getItem(AVATAR_THUMB_CACHE_KEY);
        if (savedAvatars) avatarThumbMemory = JSON.parse(savedAvatars) || {};

        const cached = sessionStorage.getItem(LIGHT_ADS_CACHE_KEY) || localStorage.getItem(LIGHT_ADS_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
                allServerAds = parsed.filter(ad =>
                    (!ad.status || ad.status === 'active') &&
                    Number(ad.totalAmount || 0) > 0.0001
                );
                hasLoadedAdsOnce = true;
                renderOrderBook();
            }
        }
    } catch (e) {}

    // 2. ከበስተጀርባ (Background) ያለ ምንም Loading ስክሪን ትኩስ መረጃ ማምጣት
    fetchLiveAdsFromServer();
    fetchAdminSettings();
    fetchCurrentUserWalletAndPayments();

    // 3. Auto-sync
    sendHeartbeat();
    setInterval(sendHeartbeat, 30000);
    setInterval(fetchLiveAdsFromServer, 2500);
    setInterval(fetchAdminSettings, 15000);

    window.addEventListener('focus', fetchLiveAdsFromServer);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) fetchLiveAdsFromServer();
    });
});

function switchTradeType(type) {
    if (currentType === type && hasLoadedAdsOnce) return;
    currentType = type;
    const buyBtn = document.getElementById('buyTabBtn');
    const sellBtn = document.getElementById('sellTabBtn');

    if (type === 'buy') {
        buyBtn.className = 'toggle-btn active buy-active';
        sellBtn.className = 'toggle-btn';
    } else {
        sellBtn.className = 'toggle-btn active sell-active';
        buyBtn.className = 'toggle-btn';
    }

    renderOrderBook();
    fetchLiveAdsFromServer();
}

async function fetchLiveAdsFromServer() {
    if (isFetchingAds) return;
    isFetchingAds = true;
    try {
        const res = await fetch(`${API_BASE}/api/ads?t=${Date.now()}`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });
        const json = await res.json();
        if (json && json.success && Array.isArray(json.ads)) {
            allServerAds = json.ads.filter(ad =>
                (!ad.status || ad.status === 'active') &&
                Number(ad.totalAmount || 0) > 0.0001
            );

            hasLoadedAdsOnce = true;
            saveLightweightAdsCache(allServerAds);
            renderOrderBook();
        } else if (!hasLoadedAdsOnce) {
            hasLoadedAdsOnce = true;
            renderOrderBook();
        }
    } catch (err) {
        if (!hasLoadedAdsOnce) {
            hasLoadedAdsOnce = true;
            renderOrderBook();
        }
    } finally {
        isFetchingAds = false;
    }
}

function toggleOnlineFilter() {
    filterOnlineOnly = !filterOnlineOnly;
    const btn = document.getElementById('onlineFilterBtn');
    if (filterOnlineOnly) {
        btn.classList.add('active-filter');
    } else {
        btn.classList.remove('active-filter');
    }
    renderOrderBook();
}

function openAmountModal() {
    const titleEl = document.getElementById('amountSheetTitle');
    titleEl.innerText = currentType === 'buy' ? 'I Want to Buy' : 'I Want to Sell';
    const input = document.getElementById('amountFilterInput');
    input.value = filterAmountETB ? filterAmountETB : '';
    syncAmountPills(input.value);
    document.getElementById('amountSheetModal').style.display = 'flex';
}

function closeAmountModal() {
    document.getElementById('amountSheetModal').style.display = 'none';
}

function selectAmountPill(val) {
    const input = document.getElementById('amountFilterInput');
    input.value = val;
    syncAmountPills(val);
}

function syncAmountPills(val) {
    const numVal = Number(val);
    document.querySelectorAll('.amount-pill').forEach(btn => {
        if (Number(btn.getAttribute('data-val')) === numVal) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

function resetAmountFilter() {
    filterAmountETB = null;
    document.getElementById('amountFilterInput').value = '';
    syncAmountPills('');
    updateFilterButtonLabels();
    closeAmountModal();
    renderOrderBook();
}

function confirmAmountFilter() {
    const rawVal = parseFloat(document.getElementById('amountFilterInput').value);
    if (!isNaN(rawVal) && rawVal > 0) {
        filterAmountETB = rawVal;
    } else {
        filterAmountETB = null;
    }
    updateFilterButtonLabels();
    closeAmountModal();
    renderOrderBook();
}

function openPaymentModal() {
    tempSelectedPayment = filterPaymentMethod || 'All Methods';
    document.getElementById('paymentSearchInput').value = '';
    filterPaymentMethodButtons('');
    highlightSelectedPaymentOption(tempSelectedPayment);
    document.getElementById('paymentSheetModal').style.display = 'flex';
}

function closePaymentModal() {
    document.getElementById('paymentSheetModal').style.display = 'none';
}

function selectPaymentOption(method) {
    tempSelectedPayment = method;
    highlightSelectedPaymentOption(method);
}

function highlightSelectedPaymentOption(method) {
    document.querySelectorAll('.pay-method-option').forEach(btn => {
        if (btn.getAttribute('data-method').toLowerCase() === method.toLowerCase()) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

function filterPaymentMethodButtons(query) {
    const q = (query || '').trim().toLowerCase();
    document.querySelectorAll('.pay-method-option').forEach(btn => {
        const name = btn.getAttribute('data-method').toLowerCase();
        if (!q || name.includes(q)) {
            btn.style.display = 'block';
        } else {
            btn.style.display = 'none';
        }
    });
}

function resetPaymentFilter() {
    filterPaymentMethod = 'All Methods';
    tempSelectedPayment = 'All Methods';
    highlightSelectedPaymentOption('All Methods');
    updateFilterButtonLabels();
    closePaymentModal();
    renderOrderBook();
}

function confirmPaymentFilter() {
    filterPaymentMethod = tempSelectedPayment || 'All Methods';
    updateFilterButtonLabels();
    closePaymentModal();
    renderOrderBook();
}

function updateFilterButtonLabels() {
    const amountBtn = document.getElementById('amountFilterBtn');
    const amountLabel = document.getElementById('amountFilterLabel');
    if (filterAmountETB && filterAmountETB > 0) {
        amountLabel.innerText = `${Number(filterAmountETB).toLocaleString('en-US')} ETB`;
        amountBtn.classList.add('active-filter');
    } else {
        amountLabel.innerText = 'Amount';
        amountBtn.classList.remove('active-filter');
    }

    const payBtn = document.getElementById('paymentFilterBtn');
    const payLabel = document.getElementById('paymentFilterLabel');
    if (filterPaymentMethod && filterPaymentMethod !== 'All Methods') {
        payLabel.innerText = filterPaymentMethod;
        payBtn.classList.add('active-filter');
    } else {
        payLabel.innerText = 'Payment Method';
        payBtn.classList.remove('active-filter');
    }
}

function resolveTraderDisplay(ad, localUser) {
    const isCurrentUser = Boolean(localUser && (
        (ad.email && localUser.email && ad.email.toLowerCase() === localUser.email.toLowerCase()) ||
        (ad.userId && (ad.userId === localUser._id || ad.userId === localUser.id))
    ));

    const tKey = String(ad.userId || ad.name || ad._id || '');
    let avatarUrl = ad.profilePic || ad.avatar || avatarThumbMemory[tKey] || (ad.user && (ad.user.profilePic || ad.user.avatar)) || '';
    if (!avatarUrl && isCurrentUser) {
        avatarUrl = localUser.profilePic || localUser.avatar ||
                    localStorage.getItem('userAvatar') || localStorage.getItem('profilePic') || '';
    }

    let rawUsername = ad.traderUsername || ad.username || ad.name || (ad.user && (ad.user.traderUsername || ad.user.username)) || '';
    let cleanUsername = String(rawUsername || '').trim().replace(/^@+/, '').trim();
    const invalidNames = ['', 'not added', 'not set', 'none', 'null', 'undefined'];

    const isOnline = isCurrentUser ? true : Boolean(ad.isOnline);

    if (!invalidNames.includes(cleanUsername.toLowerCase())) {
        return { displayName: cleanUsername, avatarUrl, isOnline };
    }

    let rawId = ad.tbrId || ad.customId || ad.traderId || '';
    let idDigits = String(rawId || '').replace(/\D/g, '');
    if (!idDigits) idDigits = '000015';
    else if (idDigits.length < 6) idDigits = idDigits.padStart(6, '0');

    return {
        displayName: ad.name || `trader${idDigits}`,
        avatarUrl,
        isOnline
    };
}

function getAdCreatedTimestamp(ad) {
    if (ad.createdAt) {
        const t = new Date(ad.createdAt).getTime();
        if (!isNaN(t)) return t;
    }
    if (ad._id && typeof ad._id === 'string' && ad._id.length >= 8) {
        const sec = parseInt(ad._id.substring(0, 8), 16);
        if (!isNaN(sec)) return sec * 1000;
    }
    return 0;
}

function renderOrderBook() {
    const tbody = document.getElementById('p2pOrdersBody');
    if (!hasLoadedAdsOnce && allServerAds.length === 0) {
        return;
    }

    const isBuy = currentType === 'buy';
    const actionLabel = isBuy ? 'Buy' : 'Sell';
    const btnClass = isBuy ? 'order-btn' : 'order-btn sell';
    const mobileBtnClass = isBuy ? 'm-order-btn buy' : 'm-order-btn sell';

    let localUser = null;
    try {
        const storedUser = localStorage.getItem('user') || localStorage.getItem('currentUser') || localStorage.getItem('tbr_user');
        if (storedUser) localUser = JSON.parse(storedUser);
    } catch (e) {}

    const filteredAds = allServerAds.filter(ad => {
        if (ad.status && ad.status !== 'active') return false;
        if (Number(ad.totalAmount || 0) <= 0.0001) return false;
        if (isBuy) return ad.tradeType === 'sell';
        else return ad.tradeType === 'buy';
    }).map(ad => {
        let payMethods = ad.paymentMethods || ['Telebirr'];
        if (typeof payMethods === 'string') {
            try { payMethods = JSON.parse(payMethods); } catch(e) { payMethods = [payMethods]; }
        }
        if (!Array.isArray(payMethods)) payMethods = [payMethods];

        const traderInfo = resolveTraderDisplay(ad, localUser);
        const numericPrice = typeof ad.price === 'number' ? ad.price : parseFloat(ad.price || 0);
        const numericAvail = Number(ad.totalAmount || 0);

        const maxPossibleEtb = Number((numericAvail * numericPrice).toFixed(2));
        const rawMax = Number(ad.maxLimit || maxPossibleEtb);
        const numericMax = rawMax > 0 ? Math.min(rawMax, maxPossibleEtb) : maxPossibleEtb;
        const numericMin = Math.min(Number(ad.minLimit || 0), numericMax);

        const createdTime = getAdCreatedTimestamp(ad);

        // ⚡ ትክክለኛው የትሬድ ብዛትና ፐርሰንት እንዲያነብ ተደርጓል ⚡
        return {
            adId: ad._id || '',
            name: traderInfo.displayName,
            avatarUrl: traderInfo.avatarUrl,
            isOnline: traderInfo.isOnline,
            verified: true,
            orders: ad.totalTrades ?? ad.tradesCount ?? ad.ordersCount ?? 0,
            comp: ad.completionRate || '100%',
            numericPrice,
            numericAvail,
            numericMin,
            numericMax,
            createdTime,
            customPrice: numericPrice.toFixed(2),
            avail: Number(numericAvail.toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            min: numericMin.toLocaleString('en-US', { maximumFractionDigits: 2 }),
            max: numericMax.toLocaleString('en-US', { maximumFractionDigits: 2 }),
            pay: payMethods
        };
    }).filter(t => {
        if (filterOnlineOnly && !t.isOnline) return false;
        if (filterAmountETB && filterAmountETB > 0) {
            const maxPossibleETB = t.numericAvail * t.numericPrice;
            const effectiveMaxETB = t.numericMax > 0 ? Math.min(t.numericMax, maxPossibleETB || t.numericMax) : maxPossibleETB;
            if (filterAmountETB < t.numericMin || filterAmountETB > effectiveMaxETB) return false;
        }
        if (filterPaymentMethod && filterPaymentMethod !== 'All Methods') {
            const targetMethod = filterPaymentMethod.toLowerCase().trim();
            const hasMethod = t.pay.some(p => String(p).toLowerCase().trim() === targetMethod);
            if (!hasMethod) return false;
        }
        return true;
    }).sort((a, b) => {
        const priceDiff = isBuy ? (a.numericPrice - b.numericPrice) : (b.numericPrice - a.numericPrice);
        if (Math.abs(priceDiff) > 0.00001) return priceDiff;
        return a.createdTime - b.createdTime;
    });

    currentRenderedAds = filteredAds;

    let html = '';
    filteredAds.forEach((t, index) => {
        const effectivePrice = t.customPrice;
        const payTagsHTML = t.pay.map(p => `<span class="pay-tag">${p}</span>`).join('');
        const mobileTagsRendered = t.pay.map(p => `<span class="m-pay-tag">${p}</span>`).join('');
        const firstLetter = (t.name || 'T').replace(/^@/, '').charAt(0).toUpperCase();

        const avatarContent = t.avatarUrl
            ? `<img src="${t.avatarUrl}" alt="${t.name}" loading="lazy" data-fallback="${firstLetter}">`
            : firstLetter;

        const statusClass = t.isOnline ? 'online' : 'offline';
        const statusTitle = t.isOnline ? 'Online' : 'Offline';

        // ⚡ ስሙን ሲጫኑ ሞዳሉ በትክክል እንዲከፈት ተስተካክሏል ⚡
        const safeName = String(t.name).replace(/'/g, "\\'");

        html += `
        <tr class="pc-table-row">
            <td>
                <div class="advertiser-cell">
                    <div class="avatar-wrap" title="${statusTitle}">
                        <div class="avatar-box">${avatarContent}</div>
                        <span class="status-dot ${statusClass}"></span>
                    </div>
                    <div>
                        <div class="adv-name" data-action="open-profile" data-username="${safeName}">${t.name} ${t.verified ? '<i class="fa-solid fa-circle-check"></i>' : ''}</div>
                        <div class="adv-stats">${t.orders} trades &bull; ${t.comp}</div>
                    </div>
                </div>
            </td>
            <td>
                <div class="price-cell" style="color: ${isBuy ? 'var(--green)' : 'var(--red)'};">${effectivePrice} <span style="font-size:10px; color:var(--text-muted); font-weight:normal;">ETB</span></div>
            </td>
            <td>
                <div class="limit-cell">
                    <div class="available">${t.avail} USDT</div>
                    <div class="range">Limit: ${t.min} - ${t.max} ETB</div>
                </div>
            </td>
            <td>
                <div class="payment-tags">
                    ${payTagsHTML}
                </div>
            </td>
            <td class="action-cell">
                <button class="${btnClass} action-order-btn" data-action="open-order-modal" data-index="${index}">${actionLabel}</button>
            </td>
        </tr>

        <tr class="mobile-card-row">
            <td>
                <div class="m-card">
                    <div class="m-top-row">
                        <div class="m-user-info">
                            <div class="m-avatar-wrap" title="${statusTitle}">
                                <div class="m-avatar">${avatarContent}</div>
                                <span class="status-dot ${statusClass}"></span>
                            </div>
                            <div>
                                <div class="m-name" data-action="open-profile" data-username="${safeName}">${t.name} ${t.verified ? '<i class="fa-solid fa-circle-check" style="font-size:11px; color:var(--accent-gold);"></i>' : ''}</div>
                                <div class="m-stats">${t.orders} trades &bull; ${t.comp}</div>
                            </div>
                        </div>
                        <div class="m-right-side">
                            <div class="m-price" style="color: ${isBuy ? 'var(--green)' : 'var(--red)'};">${effectivePrice}</div>
                            <div class="m-currency">ETB / USDT</div>
                        </div>
                    </div>

                    <div class="m-middle-row">
                        <div>Limit: ${t.min} - ${t.max} ETB</div>
                        <div class="avail">Avail: ${t.avail} USDT</div>
                    </div>

                    <div class="m-bottom-row">
                        <div class="m-payment-tags">
                            ${mobileTagsRendered}
                        </div>
                        <button class="${mobileBtnClass} action-order-btn" data-action="open-order-modal" data-index="${index}">${actionLabel}</button>
                    </div>
                </div>
            </td>
        </tr>`;
    });

    if (filteredAds.length === 0) {
        html = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 30px 0; font-size: 13px;">No matching ads found for the selected filters.</td></tr>`;
    }

    tbody.innerHTML = html;
}

function formatMoney2(num) {
    return Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function openOrderModalByIndex(index) {
    // ⚡ የክፍያ መንገድ ከሌለው ቀጥታ ይህ ማስጠንቀቂያ ይወጣል ⚡
    if (!currentUserSavedPayments || currentUserSavedPayments.length === 0) {
        const alertModal = document.getElementById('customAlertModal');
        if (alertModal) {
            alertModal.style.display = 'flex';
        } else {
            window.location.href = 'settings.html?tab=payments';
        }
        return;
    }

    const isBuy = currentType === 'buy';
    const ad = currentRenderedAds[index];
    if (!ad) return;
    activeModalAd = ad;

    const priceDisplay = Number(ad.numericPrice) % 1 === 0 ? Number(ad.numericPrice).toString() : ad.numericPrice.toFixed(2);
    const minFormatted = formatMoney2(ad.numericMin);
    const maxFormatted = formatMoney2(ad.numericMax);

    document.getElementById('tmHeaderTitle').innerText = isBuy ? 'Buy USDT' : 'Sell USDT';
    const priceEl = document.getElementById('tmUnitPrice');
    priceEl.innerText = priceDisplay;
    priceEl.className = isBuy ? 'tm-price-big buy-color' : 'tm-price-big sell-color';

    const subLimitsEl = document.getElementById('tmSubLimits');
    if (isBuy) {
        subLimitsEl.innerHTML = `
            <span>Available <strong id="tmAvailUsdt">${ad.avail} USDT</strong></span>
            <span>&middot;</span>
            <span>Limit <strong id="tmLimitRange">${minFormatted}–${maxFormatted} ETB</strong></span>
        `;
    } else {
        const sellMaxEtb = currentUserBalance > 0
            ? Math.min(ad.numericMax, currentUserBalance * ad.numericPrice)
            : ad.numericMax;
        subLimitsEl.innerHTML = `
            <span>Your available <strong>${formatMoney2(currentUserBalance)} USDT</strong></span>
            <span>&middot;</span>
            <span>Limit <strong>${minFormatted}–${formatMoney2(sellMaxEtb)} ETB</strong></span>
        `;
    }

    const firstLetter = (ad.name || 'T').replace(/^@/, '').charAt(0).toUpperCase();
    document.getElementById('tmTraderAvatar').innerHTML = ad.avatarUrl
        ? `<img src="${ad.avatarUrl}" alt="${ad.name}" data-fallback="${firstLetter}">`
        : firstLetter;
    document.getElementById('tmTraderStatusDot').className = `status-dot ${ad.isOnline ? 'online' : 'offline'}`;
    document.getElementById('tmTraderName').innerText = ad.name;
    document.getElementById('tmTraderComp').innerText = ad.comp || '100%';
    document.getElementById('tmTraderOrders').innerText = ad.orders || 1;

    document.getElementById('tmMethodSectionLabel').innerText = isBuy
        ? 'Payment method — select one'
        : 'Your receive account — buyer will send ETB here';

    const methods = Array.isArray(ad.pay) && ad.pay.length > 0 ? ad.pay : ['Telebirr'];
    activeModalSelectedMethod = methods[0];
    renderModalPaymentPills();

    const etbBox = document.getElementById('tmEtbInputBox');
    const usdtBox = document.getElementById('tmUsdtInputBox');
    const usdtFieldGroup = document.getElementById('tmUsdtFieldGroup');

    etbBox.className = isBuy ? 'tm-input-box buy-focus' : 'tm-input-box sell-focus';
    usdtBox.className = isBuy ? 'tm-input-box buy-focus' : 'tm-input-box sell-focus';

    if (isBuy) {
        usdtFieldGroup.style.display = 'none';
        document.getElementById('tmEtbFieldLabel').innerText = 'You pay (ETB)';
        document.getElementById('tmEtbRightHint').innerText = `Limit ${minFormatted} - ${maxFormatted} ETB`;
        document.getElementById('tmEtbInput').placeholder = `${minFormatted} – ${maxFormatted}`;
    } else {
        usdtFieldGroup.style.display = 'block';
        const effectiveMaxEtb = currentUserBalance > 0
            ? Math.min(ad.numericMax, currentUserBalance * ad.numericPrice)
            : ad.numericMax;
        document.getElementById('tmEtbFieldLabel').innerText = 'You receive (ETB)';
        document.getElementById('tmEtbRightHint').innerText = `Limit ${minFormatted} - ${formatMoney2(effectiveMaxEtb)} ETB`;
        document.getElementById('tmEtbInput').placeholder = `${minFormatted} – ${formatMoney2(effectiveMaxEtb)}`;

        document.getElementById('tmUsdtFieldLabel').innerText = 'You send (USDT)';
        document.getElementById('tmUsdtRightHint').innerText = `Balance ${formatMoney2(currentUserBalance)} USDT`;
        document.getElementById('tmUsdtInput').placeholder = `Up to ${formatMoney2(currentUserBalance)}`;
    }

    document.getElementById('tmEtbInput').value = '';
    document.getElementById('tmUsdtInput').value = '';
    document.getElementById('tmOrderErrorMsg').style.display = 'none';
    document.getElementById('tmFeeSummaryBox').style.display = 'none';

    const confirmBtn = document.getElementById('tmConfirmOrderBtn');
    confirmBtn.innerText = isBuy ? 'Confirm Buy' : 'Confirm Sell';
    confirmBtn.className = isBuy ? 'tm-submit-btn buy-btn' : 'tm-submit-btn sell-btn';
    confirmBtn.disabled = true;

    document.getElementById('orderModal').style.display = 'flex';

    fetchAdminSettings();
    fetchCurrentUserWalletAndPayments().then(() => {
        if (!isBuy && document.getElementById('orderModal').style.display === 'flex') {
            updateSellerAccountPreviewBox();
            validateModalOrderInputs();
        }
    });
}

function renderModalPaymentPills() {
    if (!activeModalAd) return;
    const isBuy = currentType === 'buy';
    const methods = Array.isArray(activeModalAd.pay) && activeModalAd.pay.length > 0 ? activeModalAd.pay : ['Telebirr'];
    const container = document.getElementById('tmMethodPillsContainer');

    container.innerHTML = methods.map(m => {
        const isSelected = m === activeModalSelectedMethod;
        const selClass = isSelected ? (isBuy ? 'selected-buy' : 'selected-sell') : '';
        const safeMethod = String(m).replace(/'/g, "\\'");
        return `
            <button type="button" class="tm-method-pill ${selClass}" data-method="${safeMethod}">
                <span class="pill-dot"></span>
                <span>${m}</span>
            </button>
        `;
    }).join('');

    updateSellerAccountPreviewBox();
}

function selectModalPaymentMethod(methodName) {
    activeModalSelectedMethod = methodName;
    renderModalPaymentPills();
}

function updateSellerAccountPreviewBox() {
    const box = document.getElementById('tmSellerAccountBox');
    if (currentType === 'buy') {
        box.style.display = 'none';
        return;
    }

    box.style.display = 'block';
    const target = (activeModalSelectedMethod || '').toLowerCase().trim();

    const matched = currentUserSavedPayments.find(pm => 
        String(pm.type || '').toLowerCase().trim() === target
    ) || currentUserSavedPayments[0];

    if (matched) {
        document.getElementById('tmAccountHolderName').innerText = matched.name || currentUserFullName || 'Account Holder';
        document.getElementById('tmAccountNumber').innerText = matched.account || '-';
        document.getElementById('tmAccountBankName').innerText = matched.type || activeModalSelectedMethod;
    } else {
        let localUser = null;
        try {
            localUser = JSON.parse(localStorage.getItem('user') || localStorage.getItem('currentUser') || '{}');
        } catch (e) {}
        document.getElementById('tmAccountHolderName').innerText = currentUserFullName || (localUser && localUser.fullName) || 'No linked account for ' + activeModalSelectedMethod;
        document.getElementById('tmAccountNumber').innerText = 'Add this payment method in Account Settings';
        document.getElementById('tmAccountBankName').innerText = activeModalSelectedMethod;
    }
}

function updateFeeSummaryDisplay() {
    const summaryBox = document.getElementById('tmFeeSummaryBox');
    const etbNum = parseFloat(document.getElementById('tmEtbInput').value);
    const usdtNum = parseFloat(document.getElementById('tmUsdtInput').value);

    if (!activeModalAd || isNaN(etbNum) || etbNum <= 0 || isNaN(usdtNum) || usdtNum <= 0) {
        summaryBox.style.display = 'none';
        return;
    }

    const isBuy = currentType === 'buy';
    const feePercent = Number(systemSettings.platformFee || 0.5);
    const feeDecimal = feePercent / 100;

    const feeUsdt = usdtNum * feeDecimal;
    const netUsdt = Math.max(0, usdtNum - feeUsdt);

    document.getElementById('tmFeeLeftCaption').innerText = isBuy ? 'You pay' : 'You receive';
    document.getElementById('tmFeeRightCaption').innerText = isBuy ? 'You get' : 'Buyer gets';
    document.getElementById('tmFeeEtbVal').innerText = formatMoney2(etbNum);
    document.getElementById('tmFeeNetUsdtVal').innerText = netUsdt.toFixed(6);
    document.getElementById('tmFeeSubtext').innerText = `${feePercent.toFixed(2)}% fee — ${feeUsdt.toFixed(6)} USDT`;

    summaryBox.style.display = 'flex';
}

function validateModalOrderInputs() {
    const confirmBtn = document.getElementById('tmConfirmOrderBtn');
    const errEl = document.getElementById('tmOrderErrorMsg');
    const etbBox = document.getElementById('tmEtbInputBox');
    const usdtBox = document.getElementById('tmUsdtInputBox');

    updateFeeSummaryDisplay();

    if (!activeModalAd) {
        confirmBtn.disabled = true;
        return false;
    }

    const etbRaw = document.getElementById('tmEtbInput').value.trim();
    const usdtRaw = document.getElementById('tmUsdtInput').value.trim();

    if (etbRaw === '' && usdtRaw === '') {
        errEl.style.display = 'none';
        etbBox.classList.remove('input-error');
        usdtBox.classList.remove('input-error');
        confirmBtn.disabled = true;
        return false;
    }

    const etbAmount = parseFloat(etbRaw);
    const usdtAmount = parseFloat(usdtRaw);
    const isBuy = currentType === 'buy';

    let errorMessage = '';

    if (isNaN(etbAmount) || etbAmount <= 0 || isNaN(usdtAmount) || usdtAmount <= 0) {
        errorMessage = 'Please enter a valid amount greater than 0.';
    } else if (etbAmount + 0.001 < activeModalAd.numericMin) {
        errorMessage = `Minimum order limit is ${formatMoney2(activeModalAd.numericMin)} ETB.`;
    } else if (etbAmount - 0.001 > activeModalAd.numericMax) {
        errorMessage = `Maximum order limit is ${formatMoney2(activeModalAd.numericMax)} ETB.`;
    } else if (usdtAmount - 0.0001 > activeModalAd.numericAvail) {
        const maxAvailEtb = activeModalAd.numericAvail * activeModalAd.numericPrice;
        errorMessage = `Exceeds available USDT (${formatMoney2(activeModalAd.numericAvail)} USDT / ${formatMoney2(maxAvailEtb)} ETB).`;
    } else if (!isBuy && usdtAmount - 0.0001 > currentUserBalance) {
        errorMessage = `Insufficient balance. Your available balance is ${formatMoney2(currentUserBalance)} USDT.`;
    }

    if (errorMessage) {
        errEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span>${errorMessage}</span>`;
        errEl.style.display = 'flex';
        etbBox.classList.add('input-error');
        usdtBox.classList.add('input-error');
        confirmBtn.disabled = true;
        return false;
    }

    errEl.style.display = 'none';
    etbBox.classList.remove('input-error');
    usdtBox.classList.remove('input-error');
    confirmBtn.disabled = false;
    return true;
}

function onModalEtbInput(val) {
    if (!activeModalAd) return;
    const etbNum = parseFloat(val);
    const usdtInput = document.getElementById('tmUsdtInput');
    if (isNaN(etbNum) || etbNum <= 0) {
        usdtInput.value = '';
    } else {
        const usdtVal = etbNum / activeModalAd.numericPrice;
        usdtInput.value = usdtVal.toFixed(4);
    }
    validateModalOrderInputs();
}

function onModalUsdtInput(val) {
    if (!activeModalAd) return;
    const usdtNum = parseFloat(val);
    const etbInput = document.getElementById('tmEtbInput');
    if (isNaN(usdtNum) || usdtNum <= 0) {
        etbInput.value = '';
    } else {
        const etbVal = usdtNum * activeModalAd.numericPrice;
        etbInput.value = etbVal.toFixed(2);
    }
    validateModalOrderInputs();
}

function fillMaxModalOrder() {
    if (!activeModalAd) return;
    const isBuy = currentType === 'buy';
    const adMaxEtb = Math.min(activeModalAd.numericMax, activeModalAd.numericAvail * activeModalAd.numericPrice);

    let maxEtb = adMaxEtb;
    if (!isBuy && currentUserBalance > 0) {
        maxEtb = Math.min(adMaxEtb, currentUserBalance * activeModalAd.numericPrice);
    }

    const etbInput = document.getElementById('tmEtbInput');
    etbInput.value = maxEtb.toFixed(2);
    onModalEtbInput(etbInput.value);
}

function closeOrderModal() {
    document.getElementById('orderModal').style.display = 'none';
}

async function confirmTrade() {
    if (!validateModalOrderInputs()) {
        return;
    }

    const token = getAuthToken();
    let email = localStorage.getItem('userEmail') || localStorage.getItem('email') || '';
    let userId = localStorage.getItem('userId') || '';
    try {
        const u = JSON.parse(localStorage.getItem('user') || localStorage.getItem('currentUser') || localStorage.getItem('tbr_user') || '{}');
        if (!email && u.email) email = u.email;
        if (!userId && (u._id || u.id || u.userId)) userId = u._id || u.id || u.userId;
    } catch (e) {}

    if (!token && !email && !userId) {
        alert('Please log in first to start a P2P trade.');
        window.location.href = 'signin.html';
        return;
    }

    const isBuy = currentType === 'buy';
    const etbAmount = parseFloat(document.getElementById('tmEtbInput').value);
    const usdtAmount = parseFloat(document.getElementById('tmUsdtInput').value);

    const confirmBtn = document.getElementById('tmConfirmOrderBtn');
    const errEl = document.getElementById('tmOrderErrorMsg');
    errEl.style.display = 'none';

    confirmBtn.disabled = true;
    confirmBtn.innerText = 'Checking Trader Status...';

    try {
        const res = await fetch(`${API_BASE}/api/trades`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                adId: activeModalAd.adId,
                actionType: isBuy ? 'buy' : 'sell',
                etbAmount,
                usdtAmount,
                paymentMethod: activeModalSelectedMethod,
                email,
                userId
            })
        });
        const json = await res.json();
        if (res.ok && json.success && json.trade) {
            localStorage.setItem('tbr_active_p2p_order', JSON.stringify(json.trade));
            closeOrderModal();
            window.location.href = `trades.html?tradeId=${json.trade._id}`;
            return;
        } else {
            const msg = (json && json.message) ? json.message : 'Unable to start trade right now.';
            errEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span>${msg}</span>`;
            errEl.style.display = 'flex';
            confirmBtn.disabled = false;
            confirmBtn.innerText = isBuy ? 'Confirm Buy' : 'Confirm Sell';
            return;
        }
    } catch (e) {
        errEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span>Network error. Please try again.</span>`;
        errEl.style.display = 'flex';
        confirmBtn.disabled = false;
        confirmBtn.innerText = isBuy ? 'Confirm Buy' : 'Confirm Sell';
    }
}

async function openUserProfileStats(username) {
    const cleanName = String(username || '').trim().replace(/^@+/, '');
    const modal = document.getElementById('userProfileModal');
    modal.style.display = 'flex';
    
    document.getElementById('modalProfileUsername').innerHTML = `${cleanName} <i class="fa-solid fa-circle-check" style="color: var(--accent-gold); font-size:14px;"></i>`;
    document.getElementById('modalProfileTotalTrades').innerText = '...';
    document.getElementById('modalProfile30dTrades').innerText = '...';
    document.getElementById('modalProfileCompRate').innerText = '...';
    document.getElementById('modalProfileFollowers').innerText = '...';
    document.getElementById('modalProfileReleaseTime').innerText = '...';

    try {
        const res = await fetch(`${API_BASE}/api/user/profile/${encodeURIComponent(cleanName)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.success) {
                document.getElementById('modalProfileTotalTrades').innerText = data.totalTrades;
                document.getElementById('modalProfile30dTrades').innerText = data.thirtyDayCompleted;
                document.getElementById('modalProfileCompRate').innerText = data.completionRate;
                document.getElementById('modalProfileFollowers').innerText = data.followers;
                document.getElementById('modalProfileReleaseTime').innerText = data.avgReleaseTime;
            }
        }
    } catch (e) {
        console.error("Error fetching profile stats", e);
    }
}

(function syncRealMarketTraderStats() {
    let traderStatsMap = {};

    function applyRealStatsToMarketDOM() {
        if (Object.keys(traderStatsMap).length === 0) return;

        document.querySelectorAll('tr, .ad-card, .market-card, .offer-row, .mobile-card-row').forEach(row => {
            const textElements = row.querySelectorAll('div, span, small, p, strong, b');
            let traderName = '';

            textElements.forEach(el => {
                if (el.classList && (el.classList.contains('adv-name') || el.classList.contains('m-name'))) {
                    const t = (el.innerText || '').trim().toLowerCase();
                    if (traderStatsMap[t]) {
                        traderName = t;
                    }
                }
            });

            if (!traderName) {
                textElements.forEach(el => {
                    const t = (el.innerText || '').trim().toLowerCase();
                    if (traderStatsMap[t]) {
                        traderName = t;
                    }
                });
            }

            if (traderName && traderStatsMap[traderName]) {
                const st = traderStatsMap[traderName];
                textElements.forEach(el => {
                    if (el.children.length === 0) {
                        const txt = (el.innerText || '').trim();
                        // የ 0 trades 100% ጽሁፍን በትክክለኛው ዳታ ይተካዋል
                        if (/^\d+\s*(trades|orders)\s*[·•|-]\s*\d+(\.\d+)?%$/i.test(txt)) {
                            const targetText = `${st.totalTrades} trades · ${st.completionRate}`;
                            if (el.innerText !== targetText) {
                                el.innerText = targetText;
                            }
                        }
                    }
                });
            }
        });
    }

    async function loadRealAdsStats() {
        try {
            const res = await fetch(`${API_BASE}/api/ads?t=${Date.now()}`, { cache: 'no-store' });
            if (!res.ok) return;
            const json = await res.json();
            const ads = (json && json.ads) || [];
            ads.forEach(ad => {
                const key = String(ad.name || ad.traderUsername || '').toLowerCase().trim();
                if (key) {
                    traderStatsMap[key] = {
                        totalTrades: ad.totalTrades ?? ad.tradesCount ?? ad.ordersCount ?? 0,
                        completionRate: ad.completionRate || '100%'
                    };
                }
            });
            applyRealStatsToMarketDOM();
        } catch (e) {}
    }

    const observer = new MutationObserver(() => applyRealStatsToMarketDOM());
    document.addEventListener('DOMContentLoaded', () => {
        loadRealAdsStats();
        setInterval(loadRealAdsStats, 4000);
        observer.observe(document.body, { childList: true, subtree: true });
    });
    loadRealAdsStats();
})();

// ⚡ PROFESSIONAL SELL MODAL PAYMENT METHOD & LIMIT FIX ⚡
(function fixMarketSellModalAccounts() {
    let mySavedPayments = [];

    // የገባውን ዩዘር የባንክ አካውንቶች ከሰርቨር ማምጣት
    async function loadMyPaymentMethods() {
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('authToken');
            if (!token) return;
            const res = await fetch('/api/user/payments', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                mySavedPayments = data.payments || [];
            }
        } catch (e) {}
    }

    loadMyPaymentMethods();

    // ፎርሙ (Modal) ሲከፈት ወዲያውኑ ማስተካከል
    const observer = new MutationObserver(() => {
        const sellModal = document.querySelector('.modal, #sellModal, [id*="sell"], .trade-modal');
        if (!sellModal || sellModal.style.display === 'none') return;

        const modalTitle = sellModal.querySelector('h2, h3, .modal-title, .title');
        const isSellModal = modalTitle && modalTitle.innerText.toLowerCase().includes('sell');
        if (!isSellModal) return;

        // 1. Min / Max limit የተገለበጠውን ማስተካከል (ለምሳሌ 500 - 131.56 ወደ 131.56 - 500)
        const limitTexts = sellModal.querySelectorAll('span, p, div, small');
        limitTexts.forEach(el => {
            const txt = el.innerText || '';
            const m = txt.match(/Limit\s*([\d,.]+)\s*[-–]\s*([\d,.]+)\s*ETB/i);
            if (m) {
                const val1 = parseFloat(m[1].replace(/,/g, ''));
                const val2 = parseFloat(m[2].replace(/,/g, ''));
                if (val1 > val2) {
                    el.innerText = `Limit ${val2.toFixed(2)} – ${val1.toFixed(2)} ETB`;
                }
            }
        });

        // 2. Sell ፎርም ላይ የሌላ ሰውን አካውንት አጥፍቶ የራስህን (የሻጩን) ማስገባት
        if (mySavedPayments.length > 0) {
            const activeMethodBtn = sellModal.querySelector('.method-btn.active, .payment-btn.active, button.active');
            const selectedMethodType = activeMethodBtn ? activeMethodBtn.innerText.trim().toLowerCase() : '';

            const matchedAcc = mySavedPayments.find(p => 
                p.type && p.type.toLowerCase().includes(selectedMethodType)
            ) || mySavedPayments[0];

            if (matchedAcc) {
                const myName = localStorage.getItem('fullName') || localStorage.getItem('userName') || matchedAcc.name;
                
                // Screenshot ላይ ያለውን 'Buyer will send to' ቦክስ በራስህ አካውንት መተካት
                const detailLines = sellModal.querySelectorAll('p, div, span');
                detailLines.forEach(line => {
                    if (line.innerText.includes('rahmet ali') || line.innerText.includes('1000397691652')) {
                        line.innerHTML = `<strong style="color:#fff; font-size:14px;">${myName}</strong><br>` +
                                         `<span style="color:#d1d5db; font-family:monospace; font-size:13px;">${matchedAcc.account}</span><br>` +
                                         `<small style="color:#848e9c;">${matchedAcc.type || matchedAcc.name}</small>`;
                    }
                });
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();