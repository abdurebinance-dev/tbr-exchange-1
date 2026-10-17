document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    if (!token) {
        window.location.replace("signin.html");
    }
});

const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://tbr-exchange-backend.onrender.com';
const TRADES_LIST_CACHE = 'tbr_my_trades_list_v4';
let activeTrade = null;
let currentUserId = localStorage.getItem('tbr_resolved_uid') || '';
let selectedReceiptBase64 = '';
let countdownInterval = null;
let myTradesMemoryMap = {};
let isFetchingList = false;
let isFetchingRoom = false;

// 🚀 Event Delegation for Strict CSP Compliance 🚀
document.addEventListener('click', (e) => {
    const targetClosest = e.target.closest('button, .mt-m-card, tr, .tap-chat-banner-card, .tr-toggle-pill, .cpd-header, .download-receipt-card, .cm-close, i, .copy-icon-btn, .spt-copy-box, .inline-copy-btn, .modal-overlay, span, img, a');

    if (!targetClosest) return;

    // Modals overlay click
    if (targetClosest.id === 'confirmPaymentModal' && e.target === targetClosest) closeConfirmPaymentModal();
    if (targetClosest.id === 'sellerReleaseModal' && e.target === targetClosest) closeSellerReleaseModal();

    if (targetClosest.classList.contains('cm-close')) {
        if (targetClosest.closest('#confirmPaymentModal')) closeConfirmPaymentModal();
        if (targetClosest.closest('#sellerReleaseModal')) closeSellerReleaseModal();
    }

    // View Toggles
    if (targetClosest.id === 'btnToggleInfo') switchMobileTradeView('info');
    if (targetClosest.id === 'btnToggleChat' || targetClosest.classList.contains('tap-chat-banner-card')) switchMobileTradeView('chat');
    if (targetClosest.classList.contains('cpd-header')) togglePaymentDetailsDropdown();

    // Trade Actions
    if (targetClosest.id === 'uiLeftMarkPaidBtn' || targetClosest.id === 'uiRightMarkPaidBtn') openConfirmPaymentModal();
    if (targetClosest.id === 'uiLeftSellerReleaseBtn' || targetClosest.id === 'uiRightSellerReleaseBtn') openSellerReleaseModal();
    if (targetClosest.id === 'uiApplyDisputeBtn') applyForDispute();
    if (targetClosest.id === 'uiCancelTradeBtn') {
        const btnText = targetClosest.innerText;
        if (btnText.includes('Cancel Order')) {
            cancelActiveTrade();
        } else {
            requestTradeCancellation();
        }
    }
    if (targetClosest.id === 'cmConfirmSubmitBtn') submitMarkPaidWithReceipt();
    if (targetClosest.id === 'srFinalReleaseBtn') confirmAndReleaseUsdt();
    if (targetClosest.classList.contains('download-receipt-card')) window.print();

    // Rating
    if (targetClosest.parentElement && targetClosest.parentElement.id === 'uiStarRow' && targetClosest.tagName.toLowerCase() === 'i') {
        const stars = Array.from(targetClosest.parentElement.children);
        const index = stars.indexOf(targetClosest) + 1;
        selectStar(index);
    }
    if (targetClosest.classList.contains('skip-rating-btn')) {
        targetClosest.closest('.rate-card').style.display = 'none';
    }

    // Dynamic Elements
    if (targetClosest.dataset && targetClosest.dataset.tradeId) {
        openSingleTradeInstant(targetClosest.dataset.tradeId);
    }
    
    // Copy Buttons
    if (targetClosest.classList.contains('copy-raw-etb-btn')) {
        copyRawText(activeTrade ? activeTrade.etbAmount : '');
    }
    if (targetClosest.classList.contains('copy-val-btn')) {
        copyTextValue(targetClosest.dataset.target);
    }
    
    // Order info shortcut from chat header
    if (targetClosest.dataset && targetClosest.dataset.action === 'switch-info') {
        switchMobileTradeView('info');
    }

    // Chat
    if (targetClosest.classList.contains('send-msg-btn') || targetClosest.closest('.send-msg-btn')) sendChatMessage();
    if (targetClosest.tagName.toLowerCase() === 'img' && targetClosest.closest('.bubble')) {
        window.open(targetClosest.src);
    }
    
    // Top Right Dashboard shortcut
    if(targetClosest.closest('.dashboard-shortcut-btn')) {
         window.location.href = 'dashboard.html';
    }
});

document.addEventListener('change', (e) => {
    if (e.target.id === 'cmReceiptFileInput') handleModalReceiptSelect(e);
    if (e.target.id === 'chatImgInput') sendImageInChat(e);
    if (e.target.id === 'srVerifyCheckbox') {
        const btn = document.getElementById('srFinalReleaseBtn');
        if (btn) btn.disabled = !e.target.checked;
    }
});

document.addEventListener('keydown', (e) => {
    if (e.target.id === 'uiChatInput' && e.key === 'Enter') {
        sendChatMessage();
    }
});

// 🚀 100% Secure Image Fallback Handler (Replaces inline onerror) 🚀
function attachImageFallbacks() {
    document.querySelectorAll('img[data-initials]').forEach(img => {
        if (img.dataset.fallbackAttached) return;
        img.dataset.fallbackAttached = 'true';

        if (img.complete) {
            if (img.naturalHeight === 0) img.outerHTML = img.getAttribute('data-initials');
        } else {
            img.addEventListener('error', function() {
                this.outerHTML = this.getAttribute('data-initials');
            });
        }
    });
}

function switchMobileTradeView(tabName) {
    const outer = document.getElementById('singleTradeRoomView');
    const infoBtn = document.getElementById('btnToggleInfo');
    const chatBtn = document.getElementById('btnToggleChat');

    if (tabName === 'chat') {
        outer.classList.remove('mobile-tab-info');
        outer.classList.add('mobile-tab-chat');
        infoBtn.classList.remove('active');
        chatBtn.classList.add('active');
        setTimeout(() => {
            const area = document.getElementById('uiChatMessagesArea');
            if (area) area.scrollTop = area.scrollHeight;
            const inp = document.getElementById('uiChatInput');
            if (inp && window.innerWidth > 960) inp.focus();
        }, 50);
    } else {
        outer.classList.remove('mobile-tab-chat');
        outer.classList.add('mobile-tab-info');
        chatBtn.classList.remove('active');
        infoBtn.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function invalidateAllMarketAndBalanceCaches() {
    try {
        const keysToRemove = [
            'tbr_market_ads_v1',
            'tbr_market_instant_cache_v3',
            'tbr_market_light_ads_v5',
            'tbr_dash_active_banner_v2',
            TRADES_LIST_CACHE
        ];
        keysToRemove.forEach(k => {
            sessionStorage.removeItem(k);
            localStorage.removeItem(k);
        });
    } catch (e) {}
}

function resolveAvatarUrl(rawUrl) {
    if (!rawUrl) return '';
    const str = String(rawUrl).trim();
    if (!str || str === 'undefined' || str === 'null') return '';
    if (str.startsWith('data:image') || str.startsWith('http://') || str.startsWith('https://')) {
        return str;
    }
    if (str.startsWith('/')) {
        return `${API_BASE}${str}`;
    }
    return `${API_BASE}/${str}`;
}

function detectTradeResolutionState(tr) {
    if (!tr) return { effectiveStatus: 'funds_locked', isDisputeResolved: false, isDisputeRefunded: false, applicantText: '' };

    const rawStatus = String(tr.status || 'funds_locked').toLowerCase().trim();
    const msgs = Array.isArray(tr.messages) ? tr.messages : [];

    let adminReleasedMsg = null;
    let adminRefundedMsg = null;
    let disputeApplicantMsg = null;

    for (const m of msgs) {
        const txt = String(m.text || '');
        if (m.isSystem || m.senderId === 'system' || m.senderId === 'admin') {
            if (txt.includes('refunded to the Seller') || txt.includes('refunded to Seller') || txt.includes('Winner: Seller')) {
                adminRefundedMsg = txt;
            } else if ((txt.includes('Released') && txt.includes('Buyer')) || txt.includes('Winner: Buyer')) {
                adminReleasedMsg = txt;
            }
            if (txt.includes('applied for a dispute') || txt.includes('Dispute opened')) {
                disputeApplicantMsg = txt;
            }
        }
    }

    let applicantRole = '';
    if (disputeApplicantMsg) {
        if (disputeApplicantMsg.toLowerCase().includes('seller')) applicantRole = 'seller';
        else if (disputeApplicantMsg.toLowerCase().includes('buyer')) applicantRole = 'buyer';
    } else if (tr.disputeReason) {
        if (String(tr.disputeReason).toLowerCase().startsWith('seller')) applicantRole = 'seller';
        else if (String(tr.disputeReason).toLowerCase().startsWith('buyer')) applicantRole = 'buyer';
    }

    if (rawStatus === 'refunded' || adminRefundedMsg || (rawStatus === 'cancelled' && (tr.disputeReason || disputeApplicantMsg))) {
        return {
            effectiveStatus: 'cancelled',
            isDisputeResolved: false,
            isDisputeRefunded: true,
            adminSummaryText: adminRefundedMsg || '⚖️ Dispute Refunded by Admin — Escrowed USDT has been returned to the Seller.',
            applicantRole
        };
    }

    if (rawStatus === 'resolved' || adminReleasedMsg || (rawStatus === 'completed' && (tr.disputeReason || disputeApplicantMsg))) {
        return {
            effectiveStatus: 'completed',
            isDisputeResolved: true,
            isDisputeRefunded: false,
            adminSummaryText: adminReleasedMsg || '⚖️ Dispute Resolved by Admin — Escrowed USDT has been released to the Buyer.',
            applicantRole
        };
    }

    return {
        effectiveStatus: rawStatus,
        isDisputeResolved: false,
        isDisputeRefunded: false,
        adminSummaryText: '',
        applicantRole
    };
}

function compressImageFast(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const maxW = 900;
                const scale = img.width > maxW ? (maxW / img.width) : 1;
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                callback(canvas.toDataURL('image/jpeg', 0.75));
            } catch (err) {
                callback(e.target.result);
            }
        };
        img.onerror = () => callback(e.target.result);
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function getLoggedUserIdentity() {
    let token = localStorage.getItem('token') || localStorage.getItem('jwtToken') || localStorage.getItem('authToken') || localStorage.getItem('userToken') || '';
    let email = localStorage.getItem('userEmail') || localStorage.getItem('email') || '';
    let userId = localStorage.getItem('userId') || localStorage.getItem('tbr_resolved_uid') || '';

    const storages = [localStorage, sessionStorage];
    for (const store of storages) {
        for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (!key || key === TRADES_LIST_CACHE || key === 'tbr_active_p2p_order' || key.startsWith('tbr_market')) continue;
            const val = store.getItem(key) || '';

            if (!token && val.startsWith('eyJ') && val.split('.').length === 3) {
                token = val;
            }
            if (!email && val.includes('@') && !val.startsWith('{') && val.length < 80) {
                email = val.trim();
            }
            if (val.startsWith('{')) {
                try {
                    const obj = JSON.parse(val);
                    if (obj && typeof obj === 'object') {
                        if (!token && obj.token) token = obj.token;
                        if (!email && obj.email) email = obj.email;
                        if (!userId && (obj._id || obj.id || obj.userId)) userId = String(obj._id || obj.id || obj.userId);
                    }
                } catch (e) {}
            }
        }
    }

    token = String(token || '').replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();

    if (token && token.split('.').length === 3) {
        try {
            let b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            const payload = JSON.parse(atob(b64));
            if (payload) {
                if (!userId && (payload.id || payload._id || payload.userId)) {
                    userId = String(payload.id || payload._id || payload.userId);
                }
                if (!email && payload.email) {
                    email = String(payload.email);
                }
            }
        } catch (e) {}
    }

    return { token, email: String(email || '').trim(), userId: String(userId || '').trim() };
}

function formatEtb(val) {
    return Number(val || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ETB';
}

function openSingleTradeInstant(tradeId) {
    if (myTradesMemoryMap[tradeId]) {
        try {
            localStorage.setItem('tbr_active_p2p_order', JSON.stringify(myTradesMemoryMap[tradeId]));
        } catch (e) {}
    }
    window.location.href = `trades.html?tradeId=${tradeId}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tradeIdParam = urlParams.get('tradeId');

    if (tradeIdParam) {
        document.getElementById('myTradesListView').style.display = 'none';
        document.getElementById('singleTradeRoomView').style.display = 'block';

        try {
            const cachedOrder = JSON.parse(localStorage.getItem('tbr_active_p2p_order') || 'null');
            if (cachedOrder && String(cachedOrder._id) === String(tradeIdParam)) {
                activeTrade = cachedOrder;
                renderTradeRoomUI();
            } else {
                const cachedList = JSON.parse(sessionStorage.getItem(TRADES_LIST_CACHE) || localStorage.getItem(TRADES_LIST_CACHE) || '[]');
                if (Array.isArray(cachedList)) {
                    const found = cachedList.find(t => String(t._id) === String(tradeIdParam));
                    if (found) {
                        activeTrade = found;
                        renderTradeRoomUI();
                    }
                }
            }
        } catch (e) {}

        await fetchTradeFromServer(tradeIdParam);
        setInterval(() => fetchTradeFromServer(tradeIdParam), 2000);
        startCountdownTimer();
    } else {
        document.getElementById('singleTradeRoomView').style.display = 'none';
        document.getElementById('myTradesListView').style.display = 'block';

        let hasRenderedInstant = false;
        try {
            const cachedList = sessionStorage.getItem(TRADES_LIST_CACHE) || localStorage.getItem(TRADES_LIST_CACHE);
            if (cachedList) {
                const parsedList = JSON.parse(cachedList);
                if (Array.isArray(parsedList) && parsedList.length > 0) {
                    renderMyTradesTable(parsedList);
                    hasRenderedInstant = true;
                }
            }
        } catch (e) {}

        await loadMyTradesList(hasRenderedInstant);
        setInterval(() => loadMyTradesList(true), 2500);
    }
});

async function loadMyTradesList(alreadyRendered = false) {
    if (isFetchingList) return;
    isFetchingList = true;

    const { token, email, userId } = getLoggedUserIdentity();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        const params = new URLSearchParams();
        if (email) params.set('email', email);
        if (userId) params.set('userId', userId);
        params.set('t', Date.now());

        const res = await fetch(`${API_BASE}/api/trades?${params.toString()}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const json = await res.json();
            if (json && Array.isArray(json.trades)) {
                if (json.currentUserId) {
                    currentUserId = String(json.currentUserId);
                    localStorage.setItem('tbr_resolved_uid', currentUserId);
                }
                try {
                    const payload = JSON.stringify(json.trades);
                    sessionStorage.setItem(TRADES_LIST_CACHE, payload);
                    localStorage.setItem(TRADES_LIST_CACHE, payload);
                } catch (e) {}
                renderMyTradesTable(json.trades);
                isFetchingList = false;
                return;
            }
        }
    } catch (e) {
        clearTimeout(timeoutId);
    }

    isFetchingList = false;

    if (!alreadyRendered) {
        try {
            const fallbackOrder = JSON.parse(localStorage.getItem('tbr_active_p2p_order') || 'null');
            if (fallbackOrder && fallbackOrder._id) {
                renderMyTradesTable([fallbackOrder]);
                return;
            }
        } catch (e) {}
        renderMyTradesTable([]);
    }
}

function renderMyTradesTable(trades) {
    const tbody = document.getElementById('myTradesTableBody');
    const mobileCardsContainer = document.getElementById('myTradesMobileCardsList');
    document.getElementById('mtTotalCountText').innerText = `${trades ? trades.length : 0} total trades`;

    if (!trades || trades.length === 0) {
        const emptyMsg = `No trades found yet. Click "Trade" to start buying or selling USDT.`;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:35px; color:var(--text-muted);">${emptyMsg}</td></tr>`;
        if (mobileCardsContainer) {
            mobileCardsContainer.innerHTML = `<div style="text-align:center; padding:35px 18px; color:var(--text-muted); background:var(--card-bg); border:1px solid var(--border-color); border-radius:14px; font-size:13px;">${emptyMsg}</div>`;
        }
        return;
    }

    const { email, userId } = getLoggedUserIdentity();
    const myId = currentUserId || userId || '';
    let html = '';
    let mobileHtml = '';
    let activeTradesCount = 0;

    trades.forEach(tr => {
        myTradesMemoryMap[tr._id] = tr;

        let isBuyer = tr.tradeType === 'buy';
        if (myId && tr.sellerId && String(tr.sellerId) === String(myId)) {
            isBuyer = false;
        } else if (myId && tr.buyerId && String(tr.buyerId) === String(myId)) {
            isBuyer = true;
        } else if (email && tr.sellerEmail && String(tr.sellerEmail).toLowerCase() === String(email).toLowerCase()) {
            isBuyer = false;
        } else if (email && tr.buyerEmail && String(tr.buyerEmail).toLowerCase() === String(email).toLowerCase()) {
            isBuyer = true;
        }

        const roleLabel = isBuyer ? 'Buy' : 'Sell';
        const roleCls = isBuyer ? 'buy' : 'sell';
        const roleArrow = isBuyer ? '&#8600;' : '&#8599;';

        const partnerName = isBuyer ? (tr.sellerName || 'Seller') : (tr.buyerName || 'Buyer');
        const partnerAvatar = resolveAvatarUrl(isBuyer ? tr.sellerAvatar : tr.buyerAvatar);
        const initials = String(partnerName).slice(0, 2).toUpperCase();
        
        // 🚀 CSP Friendly Avatar Creation 🚀
        const avatarHtml = partnerAvatar
            ? `<img src="${partnerAvatar}" alt="${partnerName}" loading="lazy" data-initials="${initials}">`
            : initials;

        const tradeIdShort = tr.tradeNumber
            ? `#${String(tr.tradeNumber).padStart(5, '0')}`
            : String(tr._id || '00001').slice(0, 7);

        const usdtVal = Number(tr.netUsdt || tr.usdtAmount || 0).toFixed(2);
        const etbVal = Number(tr.etbAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const priceVal = Number(tr.unitPrice || 0).toFixed(2);

        const dateObj = tr.createdAt ? new Date(tr.createdAt) : new Date();
        const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' +
                        dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

        const userMsgsCount = Array.isArray(tr.messages)
            ? tr.messages.filter(m => !m.isSystem && m.senderId !== 'system' && m.senderId !== 'admin').length
            : 0;

        const resState = detectTradeResolutionState(tr);
        const st = resState.effectiveStatus;
        const targetId = tr._id;
        let statusPillHtml = '';
        let actionLinkHtml = '';
        let rateSubHtml = `<div class="mt-rate-sub">${dateStr}</div>`;
        let rowHighlight = '';
        let mobileCardActiveCls = '';

        if (resState.isDisputeRefunded) {
            statusPillHtml = `<span class="mt-status-pill cancelled" style="color:#eab308; border-color:rgba(234,179,8,0.4); background:rgba(234,179,8,0.1);"><i class="fa-solid fa-rotate-left"></i> Refunded</span>`;
            actionLinkHtml = `<span class="mt-action-link">View &rarr;</span>`;
        } else if (resState.isDisputeResolved) {
            statusPillHtml = `<span class="mt-status-pill completed"><i class="fa-solid fa-scale-balanced"></i> Resolved</span>`;
            rateSubHtml = `<div class="mt-rate-sub method-green">${tr.paymentMethod || 'Bank'}</div>`;
            actionLinkHtml = `<span class="mt-action-link"><i class="fa-solid fa-download" style="color:var(--text-muted); margin-right:4px;"></i> Receipt &rarr;</span>`;
        } else if (st === 'funds_locked' || st === 'payment_sent' || st === 'disputed') {
            activeTradesCount++;
            rowHighlight = 'active-row-highlight';
            mobileCardActiveCls = 'active-trade-border';
            if (st === 'funds_locked') {
                statusPillHtml = `<span class="mt-status-pill locked">Funds Locked</span>`;
            } else if (st === 'payment_sent') {
                statusPillHtml = `<span class="mt-status-pill payment-sent">Payment Sent</span>`;
            } else {
                statusPillHtml = `<span class="mt-status-pill disputed">Disputed</span>`;
            }

            if (userMsgsCount > 0) {
                actionLinkHtml = `<span class="mt-action-link reply-green">Reply &rarr;</span>`;
            } else {
                actionLinkHtml = `<span class="mt-action-link">View &rarr;</span>`;
            }
        } else if (st === 'cancelled') {
            statusPillHtml = `<span class="mt-status-pill cancelled">Cancelled</span>`;
            actionLinkHtml = `<span class="mt-action-link">View &rarr;</span>`;
        } else {
            statusPillHtml = `<span class="mt-status-pill completed"><i class="fa-regular fa-circle-check"></i> Completed</span>`;
            rateSubHtml = `<div class="mt-rate-sub method-green">${tr.paymentMethod || 'Bank'}</div>`;
            actionLinkHtml = `<span class="mt-action-link"><i class="fa-solid fa-download" style="color:var(--text-muted); margin-right:4px;"></i> Receipt &rarr;</span>`;
        }

        const msgBadgeHtml = (userMsgsCount > 0 && (st === 'funds_locked' || st === 'payment_sent' || st === 'disputed'))
            ? `<span class="mt-msg-badge"><i class="fa-regular fa-comment"></i> ${userMsgsCount}</span>`
            : '';

        // 1. PC Table Row
        html += `
            <tr class="${rowHighlight}" data-trade-id="${targetId}" style="cursor:pointer;">
                <td class="mt-id-col">${tradeIdShort}</td>
                <td>
                    <div class="mt-counterparty-cell">
                        <div class="mt-avatar">${avatarHtml}</div>
                        <div class="mt-cp-name">
                            <span>${partnerName}</span>
                            ${msgBadgeHtml}
                        </div>
                    </div>
                </td>
                <td>
                    <span class="mt-role-pill ${roleCls}">${roleArrow} ${roleLabel}</span>
                </td>
                <td>
                    <div class="mt-amount-usdt">${usdtVal} USDT</div>
                    <div class="mt-amount-etb">${etbVal} ETB</div>
                </td>
                <td>
                    <div class="mt-rate-top">${priceVal} ETB/USDT</div>
                    ${rateSubHtml}
                </td>
                <td>${statusPillHtml}</td>
                <td style="text-align:right;">${actionLinkHtml}</td>
            </tr>
        `;

        // 2. Mobile Card Item
        mobileHtml += `
            <div class="mt-m-card ${mobileCardActiveCls}" data-trade-id="${targetId}">
                <div class="mt-m-top">
                    <div class="mt-m-user">
                        <div class="mt-avatar">${avatarHtml}</div>
                        <div class="mt-m-name-wrap">
                            <div class="mt-m-name">
                                <span>${partnerName}</span>
                                ${msgBadgeHtml}
                            </div>
                            <div class="mt-m-id-date">${tradeIdShort} &middot; ${dateStr}</div>
                        </div>
                    </div>
                    ${statusPillHtml}
                </div>

                <div class="mt-m-mid">
                    <div>
                        <div class="mt-m-usdt">${usdtVal} USDT</div>
                        <div class="mt-m-etb">${etbVal} ETB</div>
                    </div>
                    <div class="mt-m-rate-box">
                        <div class="mt-m-rate">${priceVal} ETB/USDT</div>
                        <div class="mt-m-method">${tr.paymentMethod || 'Bank'}</div>
                    </div>
                </div>

                <div class="mt-m-foot">
                    <span class="mt-role-pill ${roleCls}">${roleArrow} ${roleLabel} USDT</span>
                    ${actionLinkHtml}
                </div>
            </div>
        `;
    });

    tbody.innerHTML = html;
    if (mobileCardsContainer) {
        mobileCardsContainer.innerHTML = mobileHtml;
    }
    
    // 🚀 Trigger Fallback Script 🚀
    attachImageFallbacks();

    const mbnBadge = document.getElementById('mbnActiveTradesBadge');
    if (mbnBadge) {
        if (activeTradesCount > 0) {
            mbnBadge.innerText = activeTradesCount;
            mbnBadge.style.display = 'inline-block';
        } else {
            mbnBadge.style.display = 'none';
        }
    }
}

async function fetchTradeFromServer(tradeIdParam) {
    if (isFetchingRoom) return;
    const { token, email, userId } = getLoggedUserIdentity();
    const urlParams = new URLSearchParams(window.location.search);
    const tradeId = tradeIdParam || urlParams.get('tradeId') || (activeTrade && activeTrade._id);
    if (!tradeId || String(tradeId).startsWith('local_')) return;

    isFetchingRoom = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        const params = new URLSearchParams();
        if (email) params.set('email', email);
        if (userId) params.set('userId', userId);
        params.set('t', Date.now());

        const res = await fetch(`${API_BASE}/api/trades/${tradeId}?${params.toString()}`, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const json = await res.json();
            if (json.success && json.trade) {
                activeTrade = json.trade;
                if (json.currentUserId) {
                    currentUserId = String(json.currentUserId);
                    localStorage.setItem('tbr_resolved_uid', currentUserId);
                }
                localStorage.setItem('tbr_active_p2p_order', JSON.stringify(activeTrade));
                renderTradeRoomUI();
            }
        }
    } catch (e) {
        clearTimeout(timeoutId);
    } finally {
        isFetchingRoom = false;
    }
}

function isCurrentUserBuyer() {
    if (!activeTrade) return true;
    const { email, userId } = getLoggedUserIdentity();
    const myId = currentUserId || userId || '';

    if (myId && activeTrade.sellerId && String(activeTrade.sellerId) === String(myId)) {
        return false;
    }
    if (myId && activeTrade.buyerId && String(activeTrade.buyerId) === String(myId)) {
        return true;
    }
    if (email && activeTrade.sellerEmail && String(activeTrade.sellerEmail).toLowerCase() === String(email).toLowerCase()) {
        return false;
    }
    if (email && activeTrade.buyerEmail && String(activeTrade.buyerEmail).toLowerCase() === String(email).toLowerCase()) {
        return true;
    }
    return (activeTrade.tradeType || activeTrade.type) === 'buy';
}

function renderTradeRoomUI() {
    if (!activeTrade) return;

    const isBuyer = isCurrentUserBuyer();
    const tradeNum = String(activeTrade.tradeNumber || '00001').padStart(5, '0');
    const etbFormatted = formatEtb(activeTrade.etbAmount);
    const netUsdtNum = Number(activeTrade.netUsdt || activeTrade.usdtAmount || 0);
    const usdtFormatted = netUsdtNum.toFixed(2) + ' USDT';
    const unitRateFormatted = Number(activeTrade.unitPrice || 0).toFixed(2);
    const payMethod = activeTrade.paymentMethod || 'Telebirr';
    const payDetails = activeTrade.paymentDetails || {};

    const resState = detectTradeResolutionState(activeTrade);
    const status = resState.effectiveStatus;

    const partnerName = isBuyer
        ? (activeTrade.sellerName || activeTrade.counterpartyName || 'Seller')
        : (activeTrade.buyerName || activeTrade.counterpartyName || 'Buyer');
    const partnerAvatar = resolveAvatarUrl(isBuyer ? activeTrade.sellerAvatar : activeTrade.buyerAvatar);
    const initials = String(partnerName).slice(0, 2).toUpperCase();
    
    // 🚀 CSP Friendly Avatar Creation 🚀
    const avatarInnerHtml = partnerAvatar
        ? `<img src="${partnerAvatar}" alt="${partnerName}" data-initials="${initials}">`
        : initials;

    document.getElementById('uiTopPartnerName').innerText = partnerName;
    document.getElementById('uiTopUsdtSummary').innerText = usdtFormatted;
    document.getElementById('uiTradeNumber').innerText = `Trade #${tradeNum}`;
    document.getElementById('uiGreenBannerChatTitle').innerText = `Chat with ${partnerName}`;

    const userMsgsCount = Array.isArray(activeTrade.messages)
        ? activeTrade.messages.filter(m => !m.isSystem && m.senderId !== 'system' && m.senderId !== 'admin').length
        : 0;
    const unreadBadge = document.getElementById('uiChatUnreadBadge');
    if (userMsgsCount > 0) {
        unreadBadge.innerText = userMsgsCount;
        unreadBadge.style.display = 'inline-block';
    } else {
        unreadBadge.style.display = 'none';
    }

    document.getElementById('uiHeroRoleIcon').innerHTML = isBuyer ? '&#8601;' : '&#8599;';
    document.getElementById('uiHeroRoleTitle').innerText = isBuyer ? 'You are the Buyer' : 'You are the Seller';
    document.getElementById('uiHeroRoleSub').innerText = isBuyer
        ? 'You pay ETB and receive USDT'
        : 'You sell USDT and receive ETB';
    document.getElementById('uiHeroReceiveCaption').innerText = isBuyer ? 'YOU RECEIVE' : 'YOU SELL';
    document.getElementById('uiHeroBigUsdt').innerHTML = `${netUsdtNum.toFixed(2)} <span>USDT</span>`;
    document.getElementById('uiHeroPayVerb').innerText = isBuyer ? 'You pay ' : 'You receive ';
    document.getElementById('uiHeroEtbVal').innerText = etbFormatted;
    document.getElementById('uiHeroRateVal').innerText = `${unitRateFormatted} / USDT`;
    document.getElementById('uiHeroMethodVal').innerText = payMethod;
    document.getElementById('uiHeroPartnerName').innerText = partnerName;
    document.getElementById('uiHeroPartnerAvatar').innerHTML = avatarInnerHtml;
    document.getElementById('uiHeroPartnerRoleTag').innerText = isBuyer ? 'Seller' : 'Buyer';

    document.getElementById('uiPartnerName').innerText = partnerName;
    document.getElementById('uiPartnerAvatar').innerHTML = avatarInnerHtml;

    const badgeEl = document.getElementById('uiStatusBadge');
    const heroBadgeEl = document.getElementById('uiHeroStatusBadge');
    let statusLabelText = 'Funds Locked';
    let statusClassStr = 'status-pill-badge';

    if (resState.isDisputeResolved) {
        statusLabelText = 'Resolved (Released)';
        statusClassStr = 'status-pill-badge completed';
    } else if (resState.isDisputeRefunded) {
        statusLabelText = 'Refunded';
        statusClassStr = 'status-pill-badge payment-sent';
    } else if (status === 'funds_locked') {
        statusLabelText = 'Funds Locked';
        statusClassStr = 'status-pill-badge';
    } else if (status === 'payment_sent') {
        statusLabelText = 'Payment Sent';
        statusClassStr = 'status-pill-badge payment-sent';
    } else if (status === 'completed') {
        statusLabelText = 'Completed';
        statusClassStr = 'status-pill-badge completed';
    } else if (status === 'cancelled') {
        statusLabelText = 'Cancelled';
        statusClassStr = 'status-pill-badge cancelled';
    } else if (status === 'disputed') {
        statusLabelText = 'Disputed';
        statusClassStr = 'status-pill-badge disputed';
    }
    badgeEl.innerText = statusLabelText;
    badgeEl.className = statusClassStr;
    heroBadgeEl.innerText = statusLabelText;
    heroBadgeEl.className = statusClassStr;

    const activeSec = document.getElementById('uiActiveTradeSection');
    const compSec = document.getElementById('uiCompletedSection');
    const cancSec = document.getElementById('uiCancelledSection');

    if (status === 'completed' || resState.isDisputeResolved) {
        activeSec.style.display = 'none';
        cancSec.style.display = 'none';
        compSec.style.display = 'flex';

        const compTagEl = compSec.querySelector('.comp-tag');
        if (compTagEl) {
            compTagEl.innerText = resState.isDisputeResolved ? '⚖️ DISPUTE RESOLVED BY ADMIN' : 'COMPLETED';
        }

        document.getElementById('uiCompBigUsdt').innerHTML = `${netUsdtNum.toFixed(2)} <span>USDT</span>`;
        if (resState.isDisputeResolved) {
            document.getElementById('uiCompSubNote').innerText = isBuyer
                ? `Admin resolved the dispute in your favor — You received ${netUsdtNum.toFixed(2)} USDT.`
                : `Admin resolved the dispute — ${netUsdtNum.toFixed(2)} USDT was released to the Buyer (${activeTrade.buyerName || 'Buyer'}).`;
        } else {
            document.getElementById('uiCompSubNote').innerText = isBuyer
                ? `You received ${netUsdtNum.toFixed(2)} USDT`
                : `You sold ${Number(activeTrade.usdtAmount || 0).toFixed(2)} USDT`;
        }

        document.getElementById('uiCompTypeWord').innerText = isBuyer ? 'Buy' : 'Sell';
        document.getElementById('uiCompBankBadge').innerText = payMethod;
        document.getElementById('uiCompFiat').innerText = `Br ${Number(activeTrade.etbAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        document.getElementById('uiCompPrice').innerText = `Br ${unitRateFormatted}`;
        document.getElementById('uiCompQty').innerText = `${netUsdtNum.toFixed(2)} USDT`;
        document.getElementById('uiRatePartnerPrompt').innerText = `How was your experience with ${partnerName}?`;

        document.getElementById('uiBuyerPayDropdown').style.display = 'none';
        document.getElementById('uiRightMarkPaidBtn').style.display = 'none';
        document.getElementById('uiRightSellerReleaseBtn').style.display = 'none';
        document.getElementById('uiPostTradeBanner').style.display = 'flex';
        document.getElementById('uiChatClosedBanner').style.display = 'none';
        document.getElementById('uiChatInputBar').style.display = 'flex';
        renderChatMessages(partnerAvatar, initials);
        attachImageFallbacks(); // 🚀 Fallback check 
        return;
    }

    if (status === 'cancelled' || resState.isDisputeRefunded) {
        activeSec.style.display = 'none';
        compSec.style.display = 'none';
        cancSec.style.display = 'flex';

        document.getElementById('uiCancRoleTitle').innerText = isBuyer ? 'You are the Buyer' : 'You are the Seller';
        document.getElementById('uiCancRoleSub').innerText = isBuyer ? 'You pay ETB and receive USDT' : 'You sell USDT and receive ETB';
        document.getElementById('uiCancUsdt').innerHTML = `${netUsdtNum.toFixed(2)} <span style="font-size:15px; color:var(--text-muted);">USDT</span>`;
        document.getElementById('uiCancEtb').innerText = etbFormatted;
        document.getElementById('uiCancRate').innerText = `${unitRateFormatted} / USDT`;
        document.getElementById('uiCancBank').innerText = payMethod;

        const cancNoticeCard = cancSec.querySelector('.canc-notice-card');
        if (cancNoticeCard) {
            if (resState.isDisputeRefunded) {
                cancNoticeCard.innerHTML = `
                    <i class="fa-solid fa-scale-balanced" style="color:#eab308; font-size:18px; margin-top:2px;"></i>
                    <div>
                        <div style="font-size:14px; font-weight:800; color:#eab308; margin-bottom:5px;">Dispute Refunded by Admin</div>
                        <div style="font-size:12.5px; color:#d1d5db; line-height:1.45;">
                            ${isBuyer
                                ? `Admin reviewed the dispute and refunded the escrowed USDT to the Seller (<strong>${activeTrade.sellerName || 'Seller'}</strong>). This order is now closed.`
                                : `Admin resolved the dispute in your favor! Your escrowed USDT (<strong>${Number(activeTrade.usdtAmount || 0).toFixed(2)} USDT</strong>) has been refunded to you.`}
                        </div>
                    </div>
                `;
            } else {
                cancNoticeCard.innerHTML = `
                    <i class="fa-solid fa-xmark" style="color:#9ca3af; font-size:16px; margin-top:2px;"></i>
                    <div>
                        <div style="font-size:13.5px; font-weight:800; color:#d1d5db; margin-bottom:5px;">Trade Cancelled</div>
                        <div style="font-size:12px; color:var(--text-muted);">This trade was cancelled. Full USDT (0 fee deducted) has been returned directly to the market ad.</div>
                    </div>
                `;
            }
        }

        document.getElementById('uiBuyerPayDropdown').style.display = 'none';
        document.getElementById('uiRightMarkPaidBtn').style.display = 'none';
        document.getElementById('uiRightSellerReleaseBtn').style.display = 'none';
        document.getElementById('uiPostTradeBanner').style.display = 'none';
        document.getElementById('uiChatClosedBanner').style.display = 'block';
        document.getElementById('uiChatClosedBanner').innerText = resState.isDisputeRefunded
            ? 'Dispute refunded by Admin — order & chat closed'
            : 'Trade cancelled — chat is closed';
        document.getElementById('uiChatInputBar').style.display = 'none';
        renderChatMessages(partnerAvatar, initials);
        attachImageFallbacks(); // 🚀 Fallback check 
        return;
    }

    activeSec.style.display = 'flex';
    compSec.style.display = 'none';
    cancSec.style.display = 'none';
    document.getElementById('uiPostTradeBanner').style.display = 'none';
    document.getElementById('uiChatClosedBanner').style.display = 'none';
    document.getElementById('uiChatInputBar').style.display = 'flex';

    const step2Item = document.getElementById('step2Item');
    const step3Item = document.getElementById('step3Item');
    const stepLine2 = document.getElementById('stepLine2');

    if (status === 'funds_locked') {
        step2Item.className = 'step-item active';
        document.getElementById('step2Circle').innerText = '2';
        stepLine2.className = 'step-line';
        step3Item.className = 'step-item';
    } else {
        step2Item.className = 'step-item done';
        document.getElementById('step2Circle').innerHTML = '<i class="fa-solid fa-check"></i>';
        stepLine2.className = 'step-line done';
        step3Item.className = 'step-item active';
    }

    const instCard = document.getElementById('uiInstructionsCard');
    const waitingCard = document.getElementById('uiWaitingStatusCard');
    const cancelBtn = document.getElementById('uiCancelTradeBtn');
    const disputeBtn = document.getElementById('uiApplyDisputeBtn');
    const appealLockCard = document.getElementById('uiAppealLockCard');
    const sendPayCard = document.getElementById('uiSendPaymentToCard');

    if (status === 'disputed') {
        appealLockCard.style.display = 'none';
        disputeBtn.style.display = 'flex';
        disputeBtn.disabled = true;
        disputeBtn.style.opacity = '0.75';
        disputeBtn.style.cursor = 'not-allowed';

        const whoApplied = resState.applicantRole;
        const iApplied = (isBuyer && whoApplied === 'buyer') || (!isBuyer && whoApplied === 'seller');

        if (iApplied) {
            disputeBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> You have applied for dispute successfully (${isBuyer ? 'Buyer' : 'Seller'} Applied)`;
        } else if (whoApplied === 'buyer') {
            disputeBtn.innerHTML = `<i class="fa-solid fa-scale-balanced"></i> Buyer (${activeTrade.buyerName || 'Buyer'}) is applying for dispute — Under Admin Review`;
        } else if (whoApplied === 'seller') {
            disputeBtn.innerHTML = `<i class="fa-solid fa-scale-balanced"></i> Seller (${activeTrade.sellerName || 'Seller'}) is applying for dispute — Under Admin Review`;
        } else {
            disputeBtn.innerHTML = `<i class="fa-solid fa-scale-balanced"></i> Dispute Submitted — Under Admin Review`;
        }
    } else {
        disputeBtn.disabled = false;
        disputeBtn.style.opacity = '1';
        disputeBtn.style.cursor = 'pointer';
        disputeBtn.innerHTML = `<i class="fa-solid fa-scale-balanced"></i> Apply for Dispute (Appeal to Admin)`;
    }

    const isMobileWalletMethod = ['telebirr', 'm-pesa', 'cbe birr'].includes(payMethod.toLowerCase().trim());
    const accLabelText = isMobileWalletMethod ? 'Phone' : 'Account No.';

    if (isBuyer) {
        sendPayCard.style.display = 'block';
        document.getElementById('uiSptMethodPill').innerText = payMethod;
        document.getElementById('uiSptAccountName').innerText = payDetails.accountName || partnerName;
        document.getElementById('uiSptAccLabel').innerText = accLabelText;
        document.getElementById('uiSptAccountNo').innerText = payDetails.accountNumber || '-';
        document.getElementById('uiSptBankName').innerText = payDetails.bankName || payMethod;
        document.getElementById('uiSptAmountEtb').innerText = etbFormatted;

        document.getElementById('uiBuyerPayDropdown').style.display = 'block';
        document.getElementById('uiDropdownBankPill').innerText = payMethod;
        document.getElementById('uiPayAccountName').innerText = payDetails.accountName || partnerName;
        document.getElementById('uiPayAccountNo').innerText = payDetails.accountNumber || '-';
        document.getElementById('uiPayBankName').innerText = payDetails.bankName || payMethod;
        document.getElementById('uiPayEtbExact').innerText = etbFormatted;

        document.getElementById('uiSellerSummaryCard').style.display = 'none';
        document.getElementById('uiLeftSellerReleaseBtn').style.display = 'none';
        document.getElementById('uiRightSellerReleaseBtn').style.display = 'none';

        if (status === 'funds_locked') {
            instCard.innerHTML = `
                <div class="inst-row highlight"><div class="inst-num">1</div><div>Transfer exactly ${etbFormatted} to the seller's account shown below.</div></div>
                <div class="inst-row"><div class="inst-num">2</div><div>Take a screenshot of your transfer receipt.</div></div>
                <div class="inst-row"><div class="inst-num">3</div><div>Click "Transferred, Notify Seller" and upload your receipt.</div></div>
                <div class="inst-row"><div class="inst-num">4</div><div>Wait for the seller to confirm receipt and release USDT.</div></div>
            `;
            waitingCard.style.display = 'none';
            document.getElementById('uiLeftMarkPaidBtn').style.display = 'flex';
            document.getElementById('uiRightMarkPaidBtn').style.display = 'flex';

            cancelBtn.innerText = 'Cancel Order';
            cancelBtn.disabled = false;
            cancelBtn.style.display = 'block';
        } else {
            instCard.innerHTML = `
                <div class="inst-row highlight"><div class="inst-num">1</div><div>Your payment has been marked as sent.</div></div>
                <div class="inst-row"><div class="inst-num">2</div><div>The seller is verifying your payment in their bank app.</div></div>
                <div class="inst-row"><div class="inst-num">3</div><div>USDT will be credited to your wallet once the seller releases.</div></div>
            `;
            waitingCard.className = 'status-waiting-card';
            waitingCard.style.display = 'flex';
            document.getElementById('uiWaitingTitle').innerText = status === 'disputed'
                ? (resState.applicantRole === 'seller' ? 'Seller has applied for dispute (Admin Reviewing)' : 'You applied for dispute — Under Admin Review')
                : 'Waiting for seller to release';
            document.getElementById('uiWaitingSub').innerText = status === 'disputed'
                ? 'Admin is reviewing the uploaded receipt and chat history.'
                : 'Your payment is being verified. USDT will be credited once the seller confirms.';

            document.getElementById('uiLeftMarkPaidBtn').style.display = 'none';
            document.getElementById('uiRightMarkPaidBtn').style.display = 'none';
            cancelBtn.style.display = 'none';
        }
    } else {
        sendPayCard.style.display = 'none';
        document.getElementById('uiBuyerPayDropdown').style.display = 'none';
        document.getElementById('uiLeftMarkPaidBtn').style.display = 'none';
        document.getElementById('uiRightMarkPaidBtn').style.display = 'none';

        document.getElementById('uiSellerSummaryCard').style.display = 'flex';
        document.getElementById('uiSellerHolderName').innerText = payDetails.accountName || 'Account Holder';
        document.getElementById('uiSellerEtbAmount').innerText = etbFormatted;
        document.getElementById('uiSellerBankSub').innerText = payMethod;
        document.getElementById('uiSellerMethodBadge').innerText = payMethod;

        instCard.innerHTML = `
            <div class="inst-row highlight"><div class="inst-num">1</div><div>Your USDT is secured in escrow — the buyer will pay shortly.</div></div>
            <div class="inst-row"><div class="inst-num">2</div><div>Once the buyer transfers payment, they will upload their receipt.</div></div>
            <div class="inst-row"><div class="inst-num">3</div><div>Check your bank app to verify the exact amount before releasing.</div></div>
            <div class="inst-row"><div class="inst-num">4</div><div>Click "I Have Received" to confirm and release USDT to the buyer.</div></div>
        `;

        waitingCard.className = 'status-waiting-card blue-theme';
        waitingCard.style.display = 'flex';

        if (status === 'payment_sent' || status === 'disputed') {
            document.getElementById('uiWaitingTitle').innerText = status === 'disputed'
                ? (resState.applicantRole === 'buyer' ? 'Buyer has applied for dispute (Admin Reviewing)' : 'You applied for dispute — Under Admin Review')
                : 'Buyer uploaded payment receipt!';
            document.getElementById('uiWaitingSub').innerText = `Verify ${etbFormatted} in your bank app and click "I Have Received" if payment arrived.`;
            document.getElementById('uiLeftSellerReleaseBtn').style.display = 'flex';
            document.getElementById('uiRightSellerReleaseBtn').style.display = 'flex';
            cancelBtn.style.display = 'none';
        } else {
            document.getElementById('uiWaitingTitle').innerText = "Waiting for buyer's payment";
            document.getElementById('uiWaitingSub').innerText = `Your ${usdtFormatted} is secured in escrow.`;
            document.getElementById('uiLeftSellerReleaseBtn').style.display = 'none';
            document.getElementById('uiRightSellerReleaseBtn').style.display = 'none';

            const alreadyRequested = Array.isArray(activeTrade.messages) &&
                activeTrade.messages.some(m => m.isSystem && String(m.text || '').includes('requested to cancel'));

            cancelBtn.innerText = alreadyRequested ? 'Cancellation Requested ✓' : 'Request for Cancel';
            cancelBtn.disabled = alreadyRequested;
            cancelBtn.style.display = 'block';
        }
    }

    renderChatMessages(partnerAvatar, initials);
    attachImageFallbacks(); // 🚀 Fallback check 
}

function startCountdownTimer() {
    if (countdownInterval) clearInterval(countdownInterval);
    const baseWindowMs = 10 * 60 * 1000;

    countdownInterval = setInterval(async () => {
        if (!activeTrade) return;
        const resState = detectTradeResolutionState(activeTrade);
        const st = resState.effectiveStatus;

        if (st === 'completed' || st === 'cancelled' || resState.isDisputeResolved || resState.isDisputeRefunded) {
            return;
        }

        const expiresAt = activeTrade.expiresAt ? new Date(activeTrade.expiresAt).getTime() : (Date.now() + baseWindowMs);
        const remaining = Math.max(0, expiresAt - Date.now());

        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        const formatted = `${mins}m ${String(secs).padStart(2, '0')}s`;

        document.getElementById('uiCountdownClock').innerText = formatted;
        document.getElementById('uiAppealClock').innerText = formatted;

        const timerCard = document.getElementById('uiTimerCard');
        const timerLabel = document.getElementById('uiTimerLabel');
        if (activeTrade.warningExtended) {
            timerCard.classList.add('warning-mode');
            timerLabel.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Final 2m Warning before Cancel!`;
        } else {
            timerCard.classList.remove('warning-mode');
            timerLabel.innerHTML = `<i class="fa-regular fa-clock"></i> Payment window`;
        }

        const totalMs = activeTrade.warningExtended ? (2 * 60 * 1000) : baseWindowMs;
        const pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100));
        document.getElementById('uiTimerBarFill').style.width = `${pct}%`;

        if (st === 'disputed') {
            document.getElementById('uiApplyDisputeBtn').style.display = 'flex';
            document.getElementById('uiAppealLockCard').style.display = 'none';
            return;
        }

        if (remaining <= 0) {
            if (st === 'funds_locked') {
                await fetchTradeFromServer(activeTrade._id);
            } else if (st === 'payment_sent') {
                document.getElementById('uiApplyDisputeBtn').style.display = 'flex';
                document.getElementById('uiAppealLockCard').style.display = 'none';
            }
        } else {
            document.getElementById('uiApplyDisputeBtn').style.display = 'none';
            document.getElementById('uiAppealLockCard').style.display = 'flex';
        }
    }, 1000);
}

function openConfirmPaymentModal() {
    if (!activeTrade) return;
    const etbStr = formatEtb(activeTrade.etbAmount);
    document.getElementById('cmDescEtb').innerText = etbStr;
    document.getElementById('cmBigEtb').innerText = etbStr;

    selectedReceiptBase64 = '';
    document.getElementById('cmReceiptPreviewImg').style.display = 'none';
    document.getElementById('cmChangeReceiptBtn').style.display = 'none';
    document.getElementById('cmUploadedBadge').style.display = 'none';
    document.getElementById('cmUploadPlaceholder').style.display = 'block';
    document.getElementById('cmConfirmSubmitBtn').disabled = true;

    document.getElementById('confirmPaymentModal').style.display = 'flex';
}

function closeConfirmPaymentModal() {
    document.getElementById('confirmPaymentModal').style.display = 'none';
}

function handleModalReceiptSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    compressImageFast(file, (compressedB64) => {
        selectedReceiptBase64 = compressedB64;
        const preview = document.getElementById('cmReceiptPreviewImg');
        preview.src = selectedReceiptBase64;
        preview.style.display = 'block';
        document.getElementById('cmUploadPlaceholder').style.display = 'none';
        document.getElementById('cmChangeReceiptBtn').style.display = 'inline-flex';
        document.getElementById('cmUploadedBadge').style.display = 'inline-flex';
        document.getElementById('cmConfirmSubmitBtn').disabled = false;
    });
}

async function submitMarkPaidWithReceipt() {
    if (!activeTrade || !selectedReceiptBase64) return;
    const { token, email, userId } = getLoggedUserIdentity();
    const btn = document.getElementById('cmConfirmSubmitBtn');
    btn.disabled = true;
    btn.innerText = 'Uploading Receipt...';

    try {
        const res = await fetch(`${API_BASE}/api/trades/${activeTrade._id}/mark-paid`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ receiptImage: selectedReceiptBase64, email, userId })
        });
        const json = await res.json();
        if (res.ok && json.success) {
            activeTrade = json.trade;
            localStorage.setItem('tbr_active_p2p_order', JSON.stringify(activeTrade));
            invalidateAllMarketAndBalanceCaches();
            closeConfirmPaymentModal();
            renderTradeRoomUI();
        } else {
            alert((json && json.message) || 'Failed to upload receipt. Please try again.');
        }
    } catch (e) {
        alert('Network error while uploading receipt.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-regular fa-circle-check"></i> Yes, I've Transferred`;
    }
}

function openSellerReleaseModal() {
    if (!activeTrade) return;
    document.getElementById('srBigEtb').innerText = formatEtb(activeTrade.etbAmount);
    document.getElementById('srVerifyCheckbox').checked = false;
    document.getElementById('srFinalReleaseBtn').disabled = true;
    document.getElementById('srFinalReleaseBtn').innerHTML = `<i class="fa-solid fa-unlock-keyhole"></i> Yes, I Have Received — Release USDT`;
    document.getElementById('sellerReleaseModal').style.display = 'flex';
}

function closeSellerReleaseModal() {
    document.getElementById('sellerReleaseModal').style.display = 'none';
}

async function confirmAndReleaseUsdt() {
    if (!activeTrade) return;
    const { token, email, userId } = getLoggedUserIdentity();
    const btn = document.getElementById('srFinalReleaseBtn');
    btn.disabled = true;
    btn.innerText = 'Releasing USDT...';

    try {
        const res = await fetch(`${API_BASE}/api/trades/${activeTrade._id}/release`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ email, userId })
        });
        const json = await res.json();
        if (res.ok && json.success) {
            activeTrade = json.trade;
            localStorage.setItem('tbr_active_p2p_order', JSON.stringify(activeTrade));
            invalidateAllMarketAndBalanceCaches();
            closeSellerReleaseModal();
            renderTradeRoomUI();
            return;
        } else {
            alert((json && json.message) || 'Could not release USDT. Please try again.');
        }
    } catch (e) {
        alert('Connection error while releasing USDT. Please try again.');
    }

    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-unlock-keyhole"></i> Yes, I Have Received — Release USDT`;
}

async function applyForDispute() {
    if (!activeTrade || activeTrade.status === 'disputed') return;

    const disputeBtn = document.getElementById('uiApplyDisputeBtn');
    disputeBtn.disabled = true;
    disputeBtn.style.opacity = '0.75';
    disputeBtn.style.cursor = 'not-allowed';
    disputeBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting Dispute...`;

    const { token, email, userId } = getLoggedUserIdentity();
    const isBuyer = isCurrentUserBuyer();
    const roleStr = isBuyer ? 'buyer' : 'seller';

    try {
        const res = await fetch(`${API_BASE}/api/trades/${activeTrade._id}/dispute`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                role: roleStr,
                reason: `${isBuyer ? 'Buyer' : 'Seller'} applied for dispute.`,
                email,
                userId
            })
        });
        const json = await res.json();
        if (res.ok && json.success) {
            activeTrade = json.trade;
            localStorage.setItem('tbr_active_p2p_order', JSON.stringify(activeTrade));
            invalidateAllMarketAndBalanceCaches();
            renderTradeRoomUI();
            return;
        }
    } catch (e) {}

    disputeBtn.disabled = false;
    disputeBtn.style.opacity = '1';
    disputeBtn.style.cursor = 'pointer';
    disputeBtn.innerHTML = `<i class="fa-solid fa-scale-balanced"></i> Apply for Dispute (Appeal to Admin)`;
}

async function requestTradeCancellation() {
    if (!activeTrade || !confirm('Send a cancellation request to the buyer? (Only the buyer can cancel the order).')) return;
    const { token, email, userId } = getLoggedUserIdentity();
    const btn = document.getElementById('uiCancelTradeBtn');
    btn.disabled = true;
    btn.innerText = 'Requesting Cancel...';

    try {
        const res = await fetch(`${API_BASE}/api/trades/${activeTrade._id}/request-cancel`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ email, userId })
        });
        const json = await res.json();
        if (res.ok && json.success) {
            activeTrade = json.trade;
            localStorage.setItem('tbr_active_p2p_order', JSON.stringify(activeTrade));
            renderTradeRoomUI();
            return;
        } else {
            alert((json && json.message) || 'Could not send cancellation request.');
        }
    } catch (e) {
        alert('Network error while sending request.');
    }
    btn.disabled = false;
    btn.innerText = 'Request for Cancel';
}

async function cancelActiveTrade() {
    if (!activeTrade || !confirm('Are you sure you want to cancel this order? Do NOT cancel if you have already sent payment!')) return;
    const { token, email, userId } = getLoggedUserIdentity();
    if (activeTrade._id && !String(activeTrade._id).startsWith('local_')) {
        try {
            const res = await fetch(`${API_BASE}/api/trades/${activeTrade._id}/cancel`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ email, userId })
            });
            const json = await res.json();
            if (res.ok && json.success) {
                activeTrade = json.trade;
                localStorage.setItem('tbr_active_p2p_order', JSON.stringify(activeTrade));
                invalidateAllMarketAndBalanceCaches();
                renderTradeRoomUI();
                return;
            } else {
                alert((json && json.message) || 'Cannot cancel trade.');
            }
        } catch (e) {}
    }
}

function renderChatMessages(partnerAvatar, partnerInitials) {
    const area = document.getElementById('uiChatMessagesArea');
    const msgs = (activeTrade && Array.isArray(activeTrade.messages)) ? activeTrade.messages : [];

    if (msgs.length === 0) {
        area.innerHTML = `<div class="msg-bubble-system">👋 Welcome! Start chatting with your trade counterparty below.</div>`;
        return;
    }

    const { userId } = getLoggedUserIdentity();
    const myId = currentUserId || userId || '';

    area.innerHTML = msgs.map(m => {
        if (m.isSystem || m.senderId === 'system' || m.senderId === 'admin') {
            return `<div class="msg-bubble-system">${m.text}</div>`;
        }

        const timeStr = m.createdAt
            ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
            : '';
        const imgHtml = m.image ? `<img src="${m.image}" data-full-img="true" title="Click to view full receipt">` : '';
        const isMine = (myId && String(m.senderId) === String(myId)) || m.senderId === 'me';

        if (isMine) {
            return `
                <div class="msg-row-mine">
                    <div class="bubble">${m.text || ''}${imgHtml}</div>
                    <div class="time-meta"><i class="fa-solid fa-check"></i> ${timeStr}</div>
                </div>
            `;
        } else {
            // 🚀 CSP Friendly Avatar Creation 🚀
            const avHtml = partnerAvatar 
                ? `<img src="${partnerAvatar}" data-initials="${partnerInitials || 'TR'}">` 
                : (partnerInitials || 'TR');
            return `
                <div class="msg-row-theirs">
                    <div class="msg-theirs-avatar">${avHtml}</div>
                    <div>
                        <div class="bubble">${m.text || ''}${imgHtml}</div>
                        <div class="time-meta">${timeStr}</div>
                    </div>
                </div>
            `;
        }
    }).join('');

    area.scrollTop = area.scrollHeight;
    attachImageFallbacks(); // 🚀 Fallback check 
}

async function sendChatMessage() {
    const input = document.getElementById('uiChatInput');
    const text = input.value.trim();
    if (!text || !activeTrade) return;
    input.value = '';

    const { token, email, userId } = getLoggedUserIdentity();
    if (!activeTrade.messages) activeTrade.messages = [];
    activeTrade.messages.push({ senderId: currentUserId || userId || 'me', text, isSystem: false, createdAt: new Date().toISOString() });
    renderTradeRoomUI();

    if (activeTrade._id && !String(activeTrade._id).startsWith('local_')) {
        try {
            const res = await fetch(`${API_BASE}/api/trades/${activeTrade._id}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ text, email, userId })
            });
            const json = await res.json();
            if (res.ok && json.trade) {
                activeTrade = json.trade;
                renderTradeRoomUI();
            }
        } catch (e) {}
    }
}

function sendImageInChat(event) {
    const file = event.target.files[0];
    if (!file || !activeTrade) return;
    const { token, email, userId } = getLoggedUserIdentity();
    compressImageFast(file, async (compressedB64) => {
        if (activeTrade._id && !String(activeTrade._id).startsWith('local_')) {
            await fetch(`${API_BASE}/api/trades/${activeTrade._id}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ text: 'Attachment:', image: compressedB64, email, userId })
            });
            await fetchTradeFromServer(activeTrade._id);
        }
    });
}

function togglePaymentDetailsDropdown() {
    const body = document.getElementById('uiDropdownBody');
    const icon = document.getElementById('uiDropdownChevron');
    body.classList.toggle('open');
    icon.className = body.classList.contains('open') ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
}

function showCopiedToast() {
    const toast = document.getElementById('copyToastBanner');
    if (!toast) return;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 1600);
}

function copyRawText(raw) {
    if (!raw) return;
    navigator.clipboard.writeText(String(raw).trim());
    showCopiedToast();
}

function copyTextValue(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const text = el.innerText.replace(' ETB', '').replace(/,/g, '').trim();
    navigator.clipboard.writeText(text);
    showCopiedToast();
}

function selectStar(num) {
    document.querySelectorAll('#uiStarRow i').forEach((star, idx) => {
        star.className = idx < num ? 'fa-solid fa-star active' : 'fa-regular fa-star';
    });
}