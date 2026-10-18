const API_BASE_URL = window.location.hostname.includes('localhost') ? '' : 'https://tbr-exchange-backend.onrender.com'; 
let userPaymentMethods = [];
let userAvailableBalance = 0;
let userKycStatus = localStorage.getItem('kycStatus') || 'unverified'; 
let currentTradeType = 'buy';
let calculatedMaxEtb = 0; 
let confirmResolve = null;
let allUserAds = [];
let currentStatusFilter = 'all';

function clearMarketAdsCacheNow(cancelledAdId) {
    try {
        sessionStorage.removeItem('tbr_market_ads_v1');
        localStorage.removeItem('tbr_market_ads_v1');
        if (cancelledAdId) {
            const raw = localStorage.getItem('tbr_market_light_ads_v5') || sessionStorage.getItem('tbr_market_light_ads_v5');
            if (raw) {
                const list = JSON.parse(raw).filter(a => String(a._id) !== String(cancelledAdId));
                localStorage.setItem('tbr_market_light_ads_v5', JSON.stringify(list));
                sessionStorage.setItem('tbr_market_light_ads_v5', JSON.stringify(list));
            }
        }
    } catch (e) {}
}

function switchMainTab(tab) {
    document.getElementById('tab-my-ads').classList.remove('active');
    document.getElementById('tab-boosts').classList.remove('active');
    
    document.getElementById('content-my-ads').style.display = 'none';
    document.getElementById('content-boosts').style.display = 'none';
    
    if(tab === 'ads') {
        document.getElementById('tab-my-ads').classList.add('active');
        document.getElementById('content-my-ads').style.display = 'block';
        document.getElementById('header-action-btn').style.display = 'inline-flex';
    } else {
        document.getElementById('tab-boosts').classList.add('active');
        document.getElementById('content-boosts').style.display = 'block';
        document.getElementById('header-action-btn').style.display = 'none';
    }
}

function switchView(viewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    window.scrollTo(0, 0);
}

async function openPostOrderForm() {
    let status = String(userKycStatus).toLowerCase();
    if (status === 'pending' || status === 'under_review' || status === 'review') {
        switchView('view-under-review');
        return;
    } else if (status !== 'verified' && status !== 'approved' && status !== 'true') {
        switchView('view-verification-required');
        return;
    }
    switchView('view-post-order');
    history.pushState({view: 'post'}, '', '?action=create');
    validatePrice(); 
    checkOverallValidity();
    updateBalanceDisplay();
    await loadPaymentMethods();
}

function closePostOrderForm() {
    switchView('view-main-ads');
    history.pushState({view: 'main'}, '', window.location.pathname);
    loadUserAds(); 
}

function setTradeType(type, element) {
    document.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
    currentTradeType = type; 
    updateBalanceDisplay();
    validateAmount();
    checkOverallValidity();
}

function updateBalanceDisplay() {
    const balanceDisplay = document.getElementById('available-balance-display');
    const errorBalanceAmount = document.getElementById('error-balance-amount');
    if (currentTradeType === 'sell') {
        balanceDisplay.style.display = 'block';
        balanceDisplay.innerText = `Available: ${userAvailableBalance.toFixed(2)} USDT`;
        errorBalanceAmount.innerText = userAvailableBalance.toFixed(2);
    } else {
        balanceDisplay.style.display = 'none';
    }
}

function updateCalculatedMax() {
    const price = parseFloat(document.getElementById('price-input').value) || 0;
    const amount = parseFloat(document.getElementById('total-amount-input').value) || 0;
    calculatedMaxEtb = Math.floor(price * amount);

    const useMaxDisplay = document.getElementById('use-max-display');
    if (price > 0 && amount > 0) {
        useMaxDisplay.style.display = 'block';
        useMaxDisplay.innerText = `Use max: ${calculatedMaxEtb.toLocaleString('en-US')} ETB`;
    } else {
        useMaxDisplay.style.display = 'none';
    }
    validateLimits(); 
}

function applyMaxEtb() {
    if (calculatedMaxEtb > 0) {
        document.getElementById('max-etb-input').value = calculatedMaxEtb;
        validateLimits();
        checkOverallValidity();
    }
}

function validatePrice() {
    const inputField = document.getElementById('price-input');
    const errorMsg = document.getElementById('price-error');
    const enteredValue = parseFloat(inputField.value);

    if (isNaN(enteredValue) || inputField.value === '') {
        errorMsg.style.display = 'none';
        inputField.style.borderColor = 'var(--border-color)';
    } else if (enteredValue < 170 || enteredValue > 210) {
        errorMsg.style.display = 'block';
        inputField.style.borderColor = 'var(--red-color)';
    } else {
        errorMsg.style.display = 'none';
        inputField.style.borderColor = 'var(--green-color)'; 
    }
    updateCalculatedMax();
    checkOverallValidity();
}

function validateAmount() {
    const inputField = document.getElementById('total-amount-input');
    const errorMsg = document.getElementById('amount-error');
    const enteredAmount = parseFloat(inputField.value);

    if (currentTradeType === 'sell' && !isNaN(enteredAmount)) {
        if (enteredAmount > userAvailableBalance) {
            errorMsg.style.display = 'block';
            inputField.style.borderColor = 'var(--red-color)';
        } else {
            errorMsg.style.display = 'none';
            inputField.style.borderColor = 'var(--green-color)';
        }
    } else if (!isNaN(enteredAmount) && enteredAmount > 0) {
        errorMsg.style.display = 'none';
        inputField.style.borderColor = 'var(--green-color)';
    } else {
        errorMsg.style.display = 'none';
        inputField.style.borderColor = 'var(--border-color)';
    }
    updateCalculatedMax();
    checkOverallValidity();
}

function validateLimits() {
    const minInput = document.getElementById('min-etb-input');
    const maxInput = document.getElementById('max-etb-input');
    const minError = document.getElementById('min-limit-error');
    const maxError = document.getElementById('max-limit-error');

    const minVal = parseFloat(minInput.value);
    const maxVal = parseFloat(maxInput.value);
    let isMinValid = false;
    let isMaxValid = false;

    if (!isNaN(minVal)) {
        if (minVal < 500) {
            minError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Lowest order is 500 ETB.';
            minError.style.display = 'block';
            minInput.style.borderColor = 'var(--red-color)';
        } else if (calculatedMaxEtb > 0 && minVal > calculatedMaxEtb) {
            minError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Minimum is over your total supply.';
            minError.style.display = 'block';
            minInput.style.borderColor = 'var(--red-color)';
        } else {
            minError.style.display = 'none';
            minInput.style.borderColor = 'var(--green-color)';
            isMinValid = true;
        }
    } else {
        minError.style.display = 'none';
        minInput.style.borderColor = 'var(--border-color)';
    }

    if (!isNaN(maxVal)) {
        if (calculatedMaxEtb > 0 && maxVal > calculatedMaxEtb) {
            maxError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Your maximum ETB is over your balance.';
            maxError.style.display = 'block';
            maxInput.style.borderColor = 'var(--red-color)';
        } else if (!isNaN(minVal) && maxVal < minVal) {
            maxError.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Max cannot be less than Min.';
            maxError.style.display = 'block';
            maxInput.style.borderColor = 'var(--red-color)';
        } else {
            maxError.style.display = 'none';
            maxInput.style.borderColor = 'var(--green-color)';
            isMaxValid = true;
        }
    } else {
        maxError.style.display = 'none';
        maxInput.style.borderColor = 'var(--border-color)';
    }
    return isMinValid && isMaxValid;
}

function checkOverallValidity() {
    const reviewBtn = document.getElementById('review-order-btn');
    const price = parseFloat(document.getElementById('price-input').value);
    const isPriceValid = !isNaN(price) && price >= 170 && price <= 210;
    const amount = parseFloat(document.getElementById('total-amount-input').value);
    let isAmountValid = !isNaN(amount) && amount > 0;
    
    if (currentTradeType === 'sell' && isAmountValid) {
        isAmountValid = amount <= userAvailableBalance;
    }
    
    const isLimitsValid = validateLimits();
    const checkedPayments = document.querySelectorAll('input[name="payment_methods"]:checked');
    const isPaymentValid = checkedPayments.length > 0;

    if (isPriceValid && isAmountValid && isLimitsValid && isPaymentValid) {
        reviewBtn.disabled = false;
        reviewBtn.style.opacity = '1';
        reviewBtn.style.cursor = 'pointer';
        if (currentTradeType === 'sell') {
            reviewBtn.style.backgroundColor = 'var(--red-color)';
            reviewBtn.style.color = '#fff';
        } else {
            reviewBtn.style.backgroundColor = 'var(--green-color)';
            reviewBtn.style.color = '#000';
        }
    } else {
        reviewBtn.disabled = true;
        reviewBtn.style.opacity = '0.5';
        reviewBtn.style.cursor = 'not-allowed';
        reviewBtn.style.backgroundColor = 'var(--green-color)';
        reviewBtn.style.color = '#000';
    }
}

function openReviewModal() {
    const price = parseFloat(document.getElementById('price-input').value).toFixed(2);
    const amount = parseFloat(document.getElementById('total-amount-input').value).toFixed(2);
    const totalEtb = (price * amount).toLocaleString('en-US');
    
    const minLimit = parseFloat(document.getElementById('min-etb-input').value).toLocaleString('en-US');
    const maxLimit = parseFloat(document.getElementById('max-etb-input').value).toLocaleString('en-US');
    
    const verLevelInput = document.querySelector('input[name="ver_level"]:checked');
    const verLevel = verLevelInput ? verLevelInput.value : "Anyone (no restriction)";

    document.getElementById('rv-rate').innerText = price;
    document.getElementById('rv-supply').innerText = amount;
    document.getElementById('rv-supply-etb').innerText = `≈ ${totalEtb} ETB`;
    document.getElementById('rv-limit-min').innerText = minLimit;
    document.getElementById('rv-limit-max').innerText = maxLimit;
    document.getElementById('rv-verification').innerText = verLevel;

    const badge = document.getElementById('rv-trade-badge');
    const confirmBtn = document.getElementById('final-confirm-btn');
    if(currentTradeType === 'buy') {
        badge.className = 'review-type-badge buy';
        badge.innerHTML = '<i class="fa-solid fa-arrow-down"></i> Buy USDT';
        confirmBtn.style.backgroundColor = 'var(--green-color)';
    } else {
        badge.className = 'review-type-badge sell';
        badge.innerHTML = '<i class="fa-solid fa-arrow-up"></i> Sell USDT';
        confirmBtn.style.backgroundColor = 'var(--red-color)';
    }

    const pmListContainer = document.getElementById('rv-pm-list');
    pmListContainer.innerHTML = '';
    
    document.querySelectorAll('input[name="payment_methods"]:checked').forEach(checkbox => {
        const cardLabel = checkbox.closest('label');
        const bankTitle = cardLabel.querySelector('div > div:first-child');
        const pmName = bankTitle ? bankTitle.innerText.replace('Default', '').trim() : 'Bank Transfer';
        pmListContainer.innerHTML += `<div class="review-pm-pill"><i class="fa-regular fa-circle-check"></i> ${pmName}</div>`;
    });

    document.getElementById('review-modal').style.display = 'block';
    document.body.style.overflow = 'hidden'; 
}

function closeReviewModal() {
    document.getElementById('review-modal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function filterAds(status, element) {
    document.querySelectorAll('#content-my-ads .sub-tab').forEach(tab => tab.classList.remove('active'));
    element.classList.add('active');
    currentStatusFilter = status;
    renderAdsTable();
}

async function loadUserAds() {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken") || localStorage.getItem("access_token");
    if (!token) return;

    const emptyStateDiv = document.getElementById('empty-state-div');
    
    if(emptyStateDiv && allUserAds.length === 0) {
        emptyStateDiv.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin" style="font-size: 30px; margin-bottom: 15px; color: var(--accent-color);"></i><br><p style="color: var(--text-muted); font-size: 13px;">Loading your ads...</p>';
        emptyStateDiv.style.display = 'block';
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/ads/my?t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            cache: 'no-store'
        });
        const json = await res.json();
        
        if (json.success && json.ads) {
            allUserAds = json.ads.map(ad => {
                if (Number(ad.totalAmount || 0) <= 0.0001 && ad.status === 'active') {
                    return { ...ad, status: 'cancelled', totalAmount: 0 };
                }
                return ad;
            });
        } else {
            allUserAds = [];
        }
        renderAdsTable();
    } catch (e) {
        console.error("Load user ads error:", e);
        if (emptyStateDiv) {
            emptyStateDiv.innerHTML = `<p style="color: var(--red-color);">Error loading ads. Please refresh.</p>`;
        }
    }
}

function renderAdsTable() {
    const container = document.getElementById('ads-list-container');
    const emptyStateDiv = document.getElementById('empty-state-div');

    let adsToRender = allUserAds;
    if (currentStatusFilter !== 'all') {
        adsToRender = allUserAds.filter(ad => {
            let adStatus = ad.status || 'active';
            return adStatus.toLowerCase() === currentStatusFilter.toLowerCase();
        });
    }

    if (adsToRender.length > 0) {
        let tableHTML = `
        <div class="p2p-table-card" style="margin-top: 20px; background: transparent; border: none;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; color: #fff;">
                <thead>
                    <tr style="border-bottom: 1px solid var(--border-color); font-size: 11px; color: var(--text-muted);">
                        <th style="padding: 15px; font-weight: 600;">TYPE</th>
                        <th style="padding: 15px; font-weight: 600;">PRICE</th>
                        <th style="padding: 15px; font-weight: 600;">AVAILABLE / TOTAL</th>
                        <th style="padding: 15px; font-weight: 600;">LIMITS</th>
                        <th style="padding: 15px; font-weight: 600;">PAYMENT</th>
                        <th style="padding: 15px; font-weight: 600;">STATUS</th>
                        <th style="padding: 15px; font-weight: 600;">DATE</th>
                        <th style="padding: 15px; text-align: right; font-weight: 600;"></th>
                    </tr>
                </thead>
                <tbody>`;

        adsToRender.forEach(ad => {
            const isBuy = ad.tradeType === 'buy';
            const typeColor = isBuy ? 'var(--green-color)' : 'var(--red-color)';
            const typeBg = isBuy ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)';
            const typeText = isBuy ? 'BUY' : 'SELL';
            const dateStr = new Date(ad.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            
            let payMethods = ad.paymentMethods || ['Telebirr'];
            if (typeof payMethods === 'string') {
                try { payMethods = JSON.parse(payMethods); } catch(e) { payMethods = [payMethods]; }
            }
            if (!Array.isArray(payMethods)) payMethods = [payMethods];
            const payList = payMethods.join('<br>');

            const isCancelled = ad.status === 'cancelled' || ad.status === 'completed' || Number(ad.totalAmount || 0) <= 0.0001;
            const statusBadge = isCancelled
                ? `<span style="background: rgba(255,255,255,0.1); color: var(--text-muted); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Cancelled</span>`
                : `<span style="background: rgba(14,203,129,0.1); color: var(--green-color); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Active</span>`;

            let actionMenu = '';
            if (!isCancelled) {
                actionMenu = `
                    <div data-action="boost" data-id="${ad._id}" class="action-menu-item">
                        <i class="fa-solid fa-bolt" style="color: var(--accent-color); margin-right: 10px; width: 14px; text-align: center;"></i> Boost Ad
                    </div>
                    <div style="height: 1px; background: #2b313a; margin: 4px 0;"></div>
                    <div data-action="pause" data-id="${ad._id}" class="action-menu-item">
                        <i class="fa-solid fa-pause" style="margin-right: 10px; width: 14px; text-align: center; color: var(--text-muted);"></i> Pause Ad
                    </div>
                    <div data-action="cancel" data-id="${ad._id}" class="action-menu-item cancel">
                        <i class="fa-solid fa-xmark" style="margin-right: 10px; width: 14px; text-align: center;"></i> Cancel Ad
                    </div>
                `;
            } else {
                actionMenu = `
                    <div style="padding: 10px 16px; font-size: 13px; color: var(--text-muted); text-align: center;">
                        No actions available
                    </div>
                `;
            }

            tableHTML += `
                    <tr class="table-row" style="${isCancelled ? 'opacity: 0.5;' : ''}">
                        <td style="padding: 20px 15px;">
                            <span style="color: ${typeColor}; background: ${typeBg}; padding: 4px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;">${typeText}</span>
                        </td>
                        <td style="padding: 20px 15px; font-weight: 700; color: ${typeColor}; font-size: 15px;">
                            ${Number(ad.price || 0).toFixed(2)}<br>
                            <span style="font-size: 11px; color: var(--text-muted); font-weight: 400;">ETB / USDT</span>
                        </td>
                        <td style="padding: 20px 15px; font-weight: 600;">
                            ${Number(ad.totalAmount || 0).toLocaleString('en-US')} USDT<br>
                            <span style="font-size: 11px; color: var(--text-muted); font-weight: 400;">of ${Number(ad.totalAmount || 0).toLocaleString('en-US')} USDT</span>
                        </td>
                        <td style="padding: 20px 15px; font-weight: 500;">
                            ${Number(ad.minLimit || 0).toLocaleString('en-US')} - ${Number(ad.maxLimit || 0).toLocaleString('en-US')}<br>
                            <span style="font-size: 11px; color: var(--text-muted); font-weight: 400;">ETB</span>
                        </td>
                        <td style="padding: 20px 15px; font-size: 12px; line-height: 1.6; color: #ccc;">
                            ${payList}
                        </td>
                        <td style="padding: 20px 15px;">
                            ${statusBadge}
                        </td>
                        <td style="padding: 20px 15px; color: var(--text-muted); font-size: 12px;">
                            ${dateStr}
                        </td>
                        <td style="padding: 20px 15px; text-align: right; position: relative;">
                            <button data-action="toggle-menu" data-id="${ad._id}" class="menu-btn">
                                <i class="fa-solid fa-ellipsis"></i>
                            </button>
                            <div id="menu-${ad._id}" class="action-dropdown" style="display: none; position: absolute; right: 15px; top: 55px; background: #181a20; border: 1px solid #2b313a; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 100; width: 160px; text-align: left; padding: 8px 0; overflow: hidden;">
                                ${actionMenu}
                            </div>
                        </td>
                    </tr>`;
        });

        tableHTML += `</tbody></table></div>`;
        
        const existingTable = container.querySelector('.p2p-table-card');
        if (existingTable) existingTable.remove();
        
        if (emptyStateDiv) emptyStateDiv.style.display = 'none';
        container.insertAdjacentHTML('beforeend', tableHTML);
    } else {
        const existingTable = container.querySelector('.p2p-table-card');
        if (existingTable) existingTable.remove();

        if (emptyStateDiv) {
            emptyStateDiv.style.display = 'block';
            if (allUserAds.length === 0) {
                emptyStateDiv.innerHTML = `
                    <i class="fa-regular fa-clipboard" style="font-size: 40px; color: #2b313a; margin-bottom: 20px;"></i>
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #fff;">No ads yet</h3>
                    <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 20px;">Post your first P2P trade offer</p>
                    <button class="btn-small" id="btn-post-ad-empty">
                        <i class="fa-solid fa-plus" style="font-size: 10px;"></i> Post an Ad
                    </button>`;
                
                document.getElementById('btn-post-ad-empty')?.addEventListener('click', openPostOrderForm);
            } else {
                emptyStateDiv.innerHTML = `
                    <i class="fa-regular fa-folder-open" style="font-size: 40px; color: #2b313a; margin-bottom: 20px;"></i>
                    <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #fff; text-transform: capitalize;">No ${currentStatusFilter} ads</h3>
                    <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 20px;">You don't have any ${currentStatusFilter} trade offers right now.</p>
                `;
            }
        }
    }
}

function toggleActionMenu(id, event) {
    event.stopPropagation();
    document.querySelectorAll('.action-dropdown').forEach(m => {
        if (m.id !== `menu-${id}`) m.style.display = 'none';
    });
    const menu = document.getElementById(`menu-${id}`);
    if (menu) {
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
}

function showCustomConfirm() {
    document.getElementById('custom-confirm-modal').classList.add('show');
    return new Promise((resolve) => {
        confirmResolve = resolve;
    });
}

function handleConfirmResult(result) {
    document.getElementById('custom-confirm-modal').classList.remove('show');
    if (confirmResolve) {
        confirmResolve(result);
        confirmResolve = null;
    }
}

async function cancelAd(id) {
    const confirmed = await showCustomConfirm();
    if (!confirmed) return;

    allUserAds = allUserAds.map(ad => {
        if (String(ad._id) === String(id)) {
            return { ...ad, status: 'cancelled', totalAmount: 0 };
        }
        return ad;
    });
    renderAdsTable();
    clearMarketAdsCacheNow();
    
    const token = localStorage.getItem("token") || localStorage.getItem("authToken") || localStorage.getItem("access_token");
    try {
        const response = await fetch(`${API_BASE_URL}/api/ads/${id}/cancel`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            clearMarketAdsCacheNow();
            await loadUserAds();
            fetch(`${API_BASE_URL}/api/user/profile?t=${Date.now()}`, {
                headers: { "Authorization": `Bearer ${token}` }
            }).then(r => r.json()).then(res => {
                if (res && res.success && res.user) {
                    userAvailableBalance = res.user.balance || 0;
                    updateBalanceDisplay();
                }
            }).catch(() => {});
        } else {
            alert("Failed to cancel ad.");
            loadUserAds();
        }
    } catch(e) {
        console.error("Cancel Error:", e);
    }
}

function pauseAd(id) {
    alert("Ad paused.");
}

function boostAd(id) {
    alert("Ad boosted successfully!");
}

async function loadPaymentMethods() {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken") || localStorage.getItem("access_token");
    if (!token) {
        renderEmptyPaymentState();
        return;
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/payment-methods?t=${Date.now()}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (res.ok) {
            const data = await res.json();
            const list = data.paymentMethods || data.payments || data.data || (Array.isArray(data) ? data : []);
            userPaymentMethods = Array.isArray(list) ? list : [];
            localStorage.setItem("user_payment_methods", JSON.stringify(userPaymentMethods));

            if (userPaymentMethods.length === 0) {
                renderEmptyPaymentState();
            } else {
                renderPaymentMethods();
            }
        } else {
            fallbackToLocalStorage();
        }
    } catch (error) {
        console.error("Failed to fetch payment methods:", error);
        fallbackToLocalStorage();
    }
}

function fallbackToLocalStorage() {
    const stored = localStorage.getItem("user_payment_methods");
    if (stored) {
        try {
            userPaymentMethods = JSON.parse(stored);
        } catch(e) {
            userPaymentMethods = [];
        }
    } else {
        userPaymentMethods = [];
    }

    if (userPaymentMethods.length === 0) {
        renderEmptyPaymentState();
    } else {
        renderPaymentMethods();
    }
}

function renderEmptyPaymentState() {
    userPaymentMethods = [];
    const listContainer = document.getElementById('payment-methods-list');
    const noPaymentDiv = document.getElementById('no-payment-methods');
    if(listContainer) {
        listContainer.innerHTML = '';
        listContainer.style.display = 'none';
    }
    if(noPaymentDiv) {
        noPaymentDiv.style.display = 'block';
    }
    checkOverallValidity();
}

function renderPaymentMethods() {
    const listContainer = document.getElementById('payment-methods-list');
    const noPaymentDiv = document.getElementById('no-payment-methods');
    if(!listContainer) return;
    listContainer.innerHTML = '';

    if (!userPaymentMethods || userPaymentMethods.length === 0) {
        renderEmptyPaymentState();
        return;
    }

    listContainer.style.display = 'block';
    if(noPaymentDiv) noPaymentDiv.style.display = 'none';

    userPaymentMethods.forEach((method, index) => {
        const isChecked = 'checked'; 
        const defaultBadge = method.isDefault ? `<span style="background: rgba(14, 203, 129, 0.15); color: var(--green-color); font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 8px;">Default</span>` : '';
        const bankName = method.type || method.bankName || "Bank";
        const accountName = method.accountName || method.name || method.fullName || "Account Name";
        const accNumber = method.accountNumber || method.account || "00000";

        const cardHTML = `
            <label class="pm-card" style="margin-bottom: 10px; display: flex; align-items: flex-start; gap: 12px; cursor: pointer; background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 8px; padding: 15px;">
                <input type="checkbox" name="payment_methods" value="${method._id || index}" ${isChecked} style="margin-top: 3px; accent-color: var(--green-color); width: 14px; height: 14px; cursor: pointer;">
                <div>
                    <div style="font-size: 14px; font-weight: 700; margin-bottom: 4px; color: #fff; display: flex; align-items: center;">
                        ${bankName} ${defaultBadge}
                    </div>
                    <div style="font-size: 12px; color: var(--text-muted);">${accountName}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${accNumber}</div>
                </div>
            </label>
        `;
        listContainer.innerHTML += cardHTML;
    });
    checkOverallValidity();
}

async function initPage() {
    clearMarketAdsCacheNow();
    loadUserAds(); 
    
    const token = localStorage.getItem("token") || localStorage.getItem("authToken") || localStorage.getItem("access_token");
    if (token) {
        fetch(`${API_BASE_URL}/api/user/profile?t=${new Date().getTime()}`, {
            headers: { "Authorization": `Bearer ${token}` }
        }).then(res => res.json()).then(result => {
            if (result.success) {
                const userData = result.user || result;
                userAvailableBalance = userData.balance || 0;
                userKycStatus = userData.kycStatus || userKycStatus;
                localStorage.setItem('kycStatus', userKycStatus);
            }
        }).catch(e => console.error(e));
    }
    
    loadPaymentMethods();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'create') {
        openPostOrderForm();
    } else {
        switchView('view-main-ads');
    }
}

// =========================================
// 🚀 EVENT LISTENERS BINDING (CSP SAFE) 🚀
// =========================================
document.addEventListener('DOMContentLoaded', () => {
    initPage();

    document.getElementById('btn-back-dash')?.addEventListener('click', () => window.location.href='dashboard.html');
    document.getElementById('header-action-btn')?.addEventListener('click', openPostOrderForm);
    
    document.getElementById('tab-my-ads')?.addEventListener('click', () => switchMainTab('ads'));
    document.getElementById('tab-boosts')?.addEventListener('click', () => switchMainTab('boosts'));

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() { filterAds(this.dataset.filter, this); });
    });

    document.querySelectorAll('.btn-back-to-ads').forEach(btn => {
        btn.addEventListener('click', () => switchView('view-main-ads'));
    });

    document.getElementById('btn-verify-account')?.addEventListener('click', () => window.location.href='profile.html');
    document.getElementById('btn-go-dash-review')?.addEventListener('click', () => window.location.href='dashboard.html');
    document.getElementById('btn-close-post-form')?.addEventListener('click', closePostOrderForm);

    document.querySelector('.toggle-btn.btn-buy')?.addEventListener('click', function() { setTradeType('buy', this); });
    document.querySelector('.toggle-btn.btn-sell')?.addEventListener('click', function() { setTradeType('sell', this); });

    document.getElementById('price-input')?.addEventListener('input', validatePrice);
    document.getElementById('total-amount-input')?.addEventListener('input', validateAmount);
    document.getElementById('min-etb-input')?.addEventListener('input', validateLimits);
    document.getElementById('max-etb-input')?.addEventListener('input', validateLimits);
    document.getElementById('use-max-display')?.addEventListener('click', applyMaxEtb);
    
    document.getElementById('btn-add-pm')?.addEventListener('click', () => window.location.href='settings.html');
    document.getElementById('review-order-btn')?.addEventListener('click', openReviewModal);
    document.getElementById('btn-close-review')?.addEventListener('click', closeReviewModal);

    document.getElementById('btn-confirm-no')?.addEventListener('click', () => handleConfirmResult(false));
    document.getElementById('btn-confirm-yes')?.addEventListener('click', () => handleConfirmResult(true));

    document.querySelectorAll('.pill-option').forEach(pill => {
        pill.addEventListener('click', function() {
            const group = this.parentElement;
            group.querySelectorAll('.pill-option').forEach(p => {
                p.classList.remove('active');
                if (p.querySelector('i')) p.querySelector('i').remove();
            });
            this.classList.add('active');
            this.insertAdjacentHTML('afterbegin', '<i class="fa-regular fa-circle-check"></i> ');
        });
    });

    document.getElementById('payment-methods-list')?.addEventListener('change', (e) => {
        if (e.target.name === 'payment_methods') checkOverallValidity();
    });

    document.getElementById('ads-list-container')?.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('[data-action="toggle-menu"]');
        if (toggleBtn) {
            toggleActionMenu(toggleBtn.dataset.id, e);
            return;
        }
        const actionItem = e.target.closest('.action-menu-item');
        if (actionItem) {
            const action = actionItem.dataset.action;
            const id = actionItem.dataset.id;
            if (action === 'boost') boostAd(id);
            if (action === 'pause') pauseAd(id);
            if (action === 'cancel') cancelAd(id);
        }
    });

    document.addEventListener('click', function() {
        document.querySelectorAll('.action-dropdown').forEach(m => m.style.display = 'none');
    });

    document.getElementById('final-confirm-btn')?.addEventListener('click', async function() {
        const btn = this;
        const originalText = btn.innerHTML;
        
        const token = localStorage.getItem("token") || localStorage.getItem("authToken") || localStorage.getItem("access_token");
        if (!token) {
            alert("Please login first.");
            return;
        }

        const price = parseFloat(document.getElementById('price-input').value);
        const amount = parseFloat(document.getElementById('total-amount-input').value);
        const minLimit = parseFloat(document.getElementById('min-etb-input').value);
        const maxLimit = parseFloat(document.getElementById('max-etb-input').value);
        const terms = document.getElementById('terms-input').value;
        const verLevel = document.querySelector('input[name="ver_level"]:checked') ? document.querySelector('input[name="ver_level"]:checked').value : "Anyone (no restriction)";
        
        const selectedPayments = Array.from(document.querySelectorAll('input[name="payment_methods"]:checked')).map(cb => {
            const cardLabel = cb.closest('label');
            const bankTitle = cardLabel.querySelector('div > div:first-child');
            return bankTitle ? bankTitle.innerText.replace('Default', '').trim() : 'Bank Transfer';
        });

        const adData = {
            tradeType: currentTradeType, 
            price: price,
            totalAmount: amount,
            minLimit: minLimit,
            maxLimit: maxLimit,
            paymentMethods: selectedPayments,
            verificationLevel: verLevel,
            termsConditions: terms
        };

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Posting...';
        btn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/api/ads`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(adData)
            });

            if (response.ok) {
                clearMarketAdsCacheNow();
                closeReviewModal();
                if (currentTradeType === 'buy') {
                    window.location.href = 'market.html?tab=sell';
                } else {
                    window.location.href = 'market.html?tab=buy';
                }
            } else {
                const errData = await response.json();
                alert("Error posting ad: " + (errData.message || "Please try again."));
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        } catch (error) {
            console.error("Post Ad Error:", error);
            alert("Network error. Please check your connection.");
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    });
});