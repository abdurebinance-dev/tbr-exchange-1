document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    if (!token) {
        window.location.replace("signin.html");
    }
});
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:5000' : 'https://tbr-exchange-backend.onrender.com'; 

// 🚀 የደህንነት ማረጋገጫዎች የትኛውን ስራ እንደሚሰሩ የምንለይበት መያዣዎች 🚀
let pendingActionType = ""; 
let pendingTransferRecipient = "";
let pendingTransferAmount = 0;

let isBalanceVisible = true;
let userRawBalance = localStorage.getItem("user_balance_val") || "0.00";
let userBscAddress = localStorage.getItem("user_bsc_address") || ""; 
let pendingWithdrawAmount = 0;
let isNetworkSelected = false;
let userHasPasskey = false; 

const DAILY_LIMIT = 6000;
let dailyWithdrawn = parseFloat(localStorage.getItem("daily_withdrawn") || 0);

let allTransactions = [];

document.addEventListener("DOMContentLoaded", () => {
    updateBalanceDisplay();
    updateDailyLimitUI(); 
    
    if (userBscAddress) {
        document.getElementById('dep-address').value = userBscAddress;
        generateQRCode(userBscAddress);
    }

    const urlParams = new URLSearchParams(window.location.search);
    let action = urlParams.get('action');
    if (action) {
        action = action.trim().toLowerCase();
    }

    if (action === 'withdraw') {
        handleAction('Withdraw', document.querySelector('.withdraw-btn'));
    } else if (action === 'transfer') {
        handleAction('Transfer', document.querySelector('.transfer-btn'));
    } else {
        handleAction('Deposit', document.querySelector('.deposit-btn'));
    }
    
    loadUserData();
});

function updateDailyLimitUI() {
    const limitText = document.getElementById('daily-limit-text');
    const limitBar = document.getElementById('daily-limit-bar');
    const remainingText = document.getElementById('daily-remaining-text');
    
    if(!limitText) return;

    let remaining = DAILY_LIMIT - dailyWithdrawn;
    if (remaining < 0) remaining = 0;

    let percent = (dailyWithdrawn / DAILY_LIMIT) * 100;
    if (percent > 100) percent = 100;

    if (percent > 85) {
        limitBar.style.background = "var(--red-color)";
    } else {
        limitBar.style.background = "var(--green-color)";
    }

    limitText.innerHTML = `${dailyWithdrawn.toFixed(2)} / <span style="color: var(--text-muted);">6,000 USDT</span>`;
    limitBar.style.width = `${percent}%`;
    remainingText.innerText = `${remaining.toFixed(2)} USDT remaining today`;
}

function selectNetwork(shortName, longName, elementId) {
    closeNetworkModal();
    const netText = document.getElementById('selectedNetworkText');
    netText.innerHTML = longName;
    
    isNetworkSelected = true;

    document.getElementById('deposit-address-box').style.display = 'block';
    document.getElementById('withdraw-form-box').style.display = 'block';

    showToast(`${shortName} Network selected!`);
    validateWithdrawForm();
}

function handleAction(actionType, btnElement) {
    try {
        document.querySelectorAll('.wallet-btn').forEach(b => b.classList.remove('active'));
        if(btnElement) btnElement.classList.add('active');

        document.getElementById('deposit-section').style.display = 'none';
        document.getElementById('withdraw-section').style.display = 'none';
        document.getElementById('transfer-section').style.display = 'none';
        
        const activitySection = document.querySelector('.activity-section');

        if (actionType === 'Deposit') {
            document.getElementById('deposit-section').style.display = 'block';
            document.getElementById('network-container').style.display = 'block';
            if(activitySection) activitySection.style.display = 'block';
        } else if (actionType === 'Withdraw') {
            document.getElementById('withdraw-section').style.display = 'block';
            document.getElementById('network-container').style.display = 'block';
            if(activitySection) activitySection.style.display = 'block';
            if (isNetworkSelected) validateWithdrawForm();
        } else if (actionType === 'Transfer') {
            document.getElementById('transfer-section').style.display = 'block';
            document.getElementById('network-container').style.display = 'none';
            if(activitySection) activitySection.style.display = 'none';
        }
        
        const url = new URL(window.location.href);
        url.searchParams.set('action', actionType.toLowerCase());
        window.history.pushState({}, '', url);
    } catch(e) {
        console.error("Routing error:", e);
    }
}

async function loadUserData() {
    await fetchUserProfile();
    fetchTransactions(); 
    checkUserPasskeys(); 
    if (userBscAddress) {
        checkDepositSilently();
        setInterval(checkDepositSilently, 15000);
    }
}

async function checkUserPasskeys() {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    if (!token) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/passkey/list`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.passkeys && data.passkeys.length > 0) {
            userHasPasskey = true;
        }
    } catch(e) {}
}

function timeAgo(dateParam) {
    const date = new Date(dateParam);
    const seconds = Math.round((new Date() - date) / 1000);
    const minutes = Math.round(seconds / 60);
    const hours = Math.round(minutes / 60);
    const days = Math.round(hours / 24);

    if (seconds < 60) return "Just now";
    else if (minutes < 60) return minutes + "m ago";
    else if (hours < 24) return hours + "h ago";
    else return days + "d ago";
}

function formatAddress(addr) {
    if(!addr || addr.length < 10) return addr || '';
    return addr.substring(0, 6) + "..." + addr.substring(addr.length - 4);
}

async function fetchTransactions() {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    if (!token) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
        const res = await fetch(`${API_BASE_URL}/api/transactions`, { 
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await res.json();

        if (data.success && data.transactions) {
            allTransactions = data.transactions.filter(tx => !(tx.type || '').toLowerCase().includes('sweep'));
            
            renderRecentActivity();
            renderWithdrawalStatus();
            filterHistory('All');
        }
    } catch (err) {
        clearTimeout(timeoutId);
        console.error("Error fetching tx:", err);
    }
}

function renderRecentActivity() {
    const list = document.getElementById('recent-activity-list');
    list.innerHTML = '';
    
    const recent6 = allTransactions.slice(0, 6);
    
    if (recent6.length === 0) {
        list.innerHTML = `<div class="empty-activity"><i class="fa-regular fa-file-lines"></i><p>No transactions yet</p></div>`;
        return;
    }

    recent6.forEach(tx => {
        list.insertAdjacentHTML('beforeend', createTxHTML(tx));
    });
}

function renderWithdrawalStatus() {
    const statusContainer = document.getElementById('withdrawal-status-container');
    const statusList = document.getElementById('withdrawal-status-list');
    statusList.innerHTML = '';

    const withdrawals = allTransactions.filter(tx => (tx.type || '').toLowerCase().includes('withdraw')).slice(0, 3);
    
    if (withdrawals.length === 0) {
        statusContainer.style.display = 'none';
        return;
    }

    statusContainer.style.display = 'block';
    withdrawals.forEach(tx => {
        const addr = formatAddress(tx.destinationAddress);
        const hash = tx.transactionHash || tx.txHash || tx.hash || tx.txId || ''; 
        const isValidHash = hash && String(hash).startsWith('0x');
        const onClickAction = isValidHash ? `window.open('https://bscscan.com/tx/${hash}', '_blank')` : `showToast('Transaction hash processing...')`;
        
        const html = `
        <div class="status-item">
            <div style="display: flex; align-items: center; gap: 12px;">
                <span class="dot"></span>
                <div>
                    <div style="font-weight: 700; color: #fff; font-size: 14px;">${parseFloat(tx.amount).toFixed(2)} USDT <span class="tx-badge">BNB</span></div>
                    <div style="color: #848e9c; font-size: 12px; margin-top: 2px;">→ ${addr} • ${timeAgo(tx.createdAt)}</div>
                </div>
            </div>
            <div style="text-align: right;">
                <div style="color: var(--green-color); font-size: 12px; font-weight: 600;">Confirmed</div>
                <span onclick="${onClickAction}" style="color: var(--green-color); font-size: 11px; margin-top: 2px; cursor: pointer; display: inline-block;">Tx <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 10px;"></i></span>
            </div>
        </div>`;
        statusList.insertAdjacentHTML('beforeend', html);
    });
}

function openHistoryModal() {
    document.getElementById('historyModal').style.display = 'flex';
}
function closeHistoryModal() {
    document.getElementById('historyModal').style.display = 'none';
}

function filterHistory(type, btnElement) {
    if(btnElement) {
        document.querySelectorAll('.history-tab').forEach(b => b.classList.remove('active'));
        btnElement.classList.add('active');
    }

    const list = document.getElementById('full-history-list');
    list.innerHTML = '<div style="font-size:12px; color:#848e9c; margin-top: 20px; font-weight:600;">TODAY</div>';

    let filtered = allTransactions;
    if(type !== 'All') {
        filtered = allTransactions.filter(tx => {
            const t = (tx.type || '').toLowerCase();
            if(type === 'Deposit') return t.includes('deposit');
            if(type === 'Withdrawal') return t.includes('withdraw');
            if(type === 'Trades') return t.includes('trade');
            return true;
        });
    }

    if (filtered.length === 0) {
        list.innerHTML += `<div class="empty-activity"><p>No ${type} transactions found.</p></div>`;
        return;
    }

    filtered.forEach(tx => {
        list.insertAdjacentHTML('beforeend', createTxHTML(tx));
    });
}

function createTxHTML(tx) {
    const typeStr = (tx.type || '').toLowerCase();
    
    const isWithdrawal = typeStr.includes('withdraw');
    const isP2pTrade = typeStr.includes('trade') || typeStr.includes('p2p');
    const isTransfer = typeStr.includes('transfer');
    const isDeposit = !isWithdrawal && !isP2pTrade && !isTransfer && (typeStr.includes('deposit') || typeStr.includes('credit'));
    
    let title = tx.type || 'Transaction';
    let color = 'var(--green-color)'; // Default deposit color
    let sign = '+';
    let icon = 'fa-arrow-down';
    let desc = 'Received on BSC';

    // Withdrawal Styling
    if (isWithdrawal) {
        title = 'Withdrawal';
        color = 'var(--red-color)';
        sign = '-';
        icon = 'fa-arrow-up';
        desc = `Withdrawal to ${formatAddress(tx.destinationAddress)} on BSC`;
    } 
    // P2P Trade Styling (Gold/Yellow)
    else if (isP2pTrade) {
        title = 'P2P Trade';
        color = 'var(--accent-color)'; // Gold color
        sign = '+';
        icon = 'fa-right-left';
        desc = 'P2P Escrow Release';
    } 
    // Transfer Styling (Purple/Teji)
    else if (isTransfer) {
        title = 'Transfer';
        color = '#a855f7'; // Purple/Weine Teji
        // If it's an outgoing transfer, make it minus. If incoming, make it plus.
        // Assuming your backend saves transfers with 'recipient' field.
        if (tx.recipient) {
            sign = '-';
            icon = 'fa-paper-plane';
            desc = `Transferred to User ID/Email`;
        } else {
            sign = '+';
            icon = 'fa-envelope-open-text';
            desc = `Received via Transfer`;
        }
    } 
    // Deposit Styling (Green)
    else {
        title = 'Deposit';
    }

    return `
    <div class="tx-item">
        <div class="tx-left">
            <div class="tx-icon">
                <i class="fa-solid ${icon}" style="color: ${color};"></i>
            </div>
            <div>
                <div class="tx-title">${title} <span class="tx-badge">BNB</span></div>
                <div class="tx-sub"><span class="dot"></span> Completed • ${timeAgo(tx.createdAt)}</div>
                <div style="font-size: 11px; color: #555; margin-top: 2px;">${desc}</div>
            </div>
        </div>
        <div class="tx-right" style="display: flex; align-items: center;">
            <div class="tx-amount" style="color: ${color}; margin-bottom: 0;">${sign}${parseFloat(tx.amount || tx.value || 0).toFixed(2)} USDT</div>
        </div>
    </div>`;
}

async function fetchUserProfile() {
    try {
        const token = localStorage.getItem("token") || localStorage.getItem("authToken") || localStorage.getItem("jwt");
        if (!token) {
            window.location.href = "signin.html";
            return;
        }

        const res = await fetch(`${API_BASE_URL}/api/user/profile`, {
            method: 'GET',
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}` 
            }
        });
        const data = await res.json();
        
        if (data.success && data.user) {
            const user = data.user;
            
            if (user.balance !== undefined) {
                userRawBalance = Number(user.balance).toFixed(2);
                localStorage.setItem("user_balance_val", userRawBalance);
                updateBalanceDisplay();
            }

            if (user.bscAddress) {
                userBscAddress = user.bscAddress;
                localStorage.setItem("user_bsc_address", userBscAddress);
                document.getElementById('dep-address').value = userBscAddress;
                generateQRCode(userBscAddress);
            } else {
                document.getElementById('dep-address').value = "No address found.";
            }
        }
    } catch (e) {
        console.error("Error fetching user profile:", e);
    }
}

async function checkDepositSilently() {
    try {
        if (!userBscAddress || userBscAddress.startsWith("Error") || userBscAddress.startsWith("No address")) return;

        const depositRes = await fetch(`${API_BASE_URL}/api/check-deposits/${userBscAddress}`, {
            method: 'GET'
        });
        const depositData = await depositRes.json();

        if (depositData.success) {
            let finalBal = 0;
            if (depositData.balance !== undefined) {
                finalBal = parseFloat(depositData.balance);
            } else if (depositData.transactions && depositData.transactions.length > 0) {
                finalBal = parseFloat(depositData.transactions[0].value);
            }

            if (finalBal >= parseFloat(userRawBalance) && finalBal > 0) {
                userRawBalance = finalBal.toFixed(2);
                localStorage.setItem("user_balance_val", userRawBalance);
                updateBalanceDisplay();
                fetchTransactions();
            }
        }
    } catch (error) {
        console.error('Auto check failed silently:', error);
    }
}

let recipientCheckTimer = null;
let isRecipientValid = false;

function checkTransferForm() {
    const recipient = document.getElementById('transfer-recipient').value.trim();
    const amountVal = document.getElementById('transfer-amount').value.trim();
    const amount = parseFloat(amountVal);
    const submitBtn = document.getElementById('transfer-submit-btn');
    const amountFeedback = document.getElementById('amount-feedback');

    let currentBalance = 0;
    try {
        currentBalance = parseFloat(userRawBalance || localStorage.getItem("user_balance_val") || 0);
    } catch(e) {
        currentBalance = 0;
    }

    if (!isNaN(amount) && amount > currentBalance) {
        amountFeedback.innerText = `Your available balance is ${currentBalance.toFixed(2)} USDT. Insufficient balance!`;
        amountFeedback.style.display = 'block';
    } else {
        amountFeedback.innerText = '';
        amountFeedback.style.display = 'none';
    }

    if (!recipient || !isRecipientValid || isNaN(amount) || amount <= 0 || amount > currentBalance) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = "0.5";
        submitBtn.style.cursor = "not-allowed";
    } else {
        submitBtn.disabled = false;
        submitBtn.style.opacity = "1";
        submitBtn.style.cursor = "pointer";
    }
}

function debouncedCheckRecipient() {
    clearTimeout(recipientCheckTimer);
    const recipient = document.getElementById('transfer-recipient').value.trim();
    const iconEl = document.getElementById('recipient-status-icon');

    if (!recipient) {
        iconEl.style.display = 'none';
        isRecipientValid = false;
        checkTransferForm();
        return;
    }

    iconEl.style.display = 'inline-block';
    iconEl.className = "fa-solid fa-spinner fa-spin";
    iconEl.style.color = "#f0b90b"; 
    isRecipientValid = false;
    checkTransferForm();

    recipientCheckTimer = setTimeout(async () => {
        try {
            const token = localStorage.getItem("token") || localStorage.getItem("authToken");
            const res = await fetch(`${API_BASE_URL}/api/verify-recipient?q=${encodeURIComponent(recipient)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            if (data.success) {
                iconEl.className = "fa-solid fa-circle-check";
                iconEl.style.color = "var(--green-color)"; 
                isRecipientValid = true;
            } else {
                iconEl.className = "fa-solid fa-circle-xmark";
                iconEl.style.color = "var(--red-color)"; 
                isRecipientValid = false;
            }
        } catch (err) {
            iconEl.style.display = 'none';
            isRecipientValid = false;
        }
        checkTransferForm(); 
    }, 500);
}

// =========================================================
// 🚀 1. TRANSFER ACTION: የደህንነት ሞዳል ይከፍታል
// =========================================================
async function initiateTransfer() {
    const recipient = document.getElementById('transfer-recipient').value.trim();
    const amount = parseFloat(document.getElementById('transfer-amount').value);

    let currentBalance = 0;
    try {
        currentBalance = parseFloat(userRawBalance || localStorage.getItem("user_balance_val") || 0);
    } catch(e) {
        currentBalance = 0;
    }

    if (!recipient || !isRecipientValid) {
        showToast("Recipient not found! Please check the Email or ID.", true);
        return;
    }

    if (isNaN(amount) || amount <= 0 || amount > currentBalance) {
        showToast("Please enter a valid amount within your balance.", true);
        return;
    }

    pendingActionType = "Transfer";
    pendingTransferRecipient = recipient;
    pendingTransferAmount = amount;

    const actionLabel = document.getElementById("securityModalActionName");
    if (actionLabel) actionLabel.innerText = "Transfer";

    if (userHasPasskey) {
        document.getElementById('securityModal').style.display = 'flex';
    } else {
        document.getElementById('otpModal').style.display = 'flex';
        document.getElementById('sendEmailCodeBtn').innerText = "Send Code";
        document.getElementById('sendEmailCodeBtn').disabled = false;
    }
}

async function executeTransferAPI(recipient, amount, verificationCode = '', authType = '') {
    const btn = document.getElementById('transfer-submit-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Processing...";
    }

    try {
        const token = localStorage.getItem("token") || localStorage.getItem("authToken");
        const res = await fetch(`${API_BASE_URL}/api/transfer`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ 
                recipient, 
                amount, 
                code: verificationCode, 
                authType: authType 
            })
        });

        const data = await res.json();
        
        if (data.success) {
            showToast(data.message, false);
            document.getElementById('transfer-recipient').value = "";
            document.getElementById('transfer-amount').value = "";
            document.getElementById('recipient-status-icon').style.display = 'none';
            isRecipientValid = false;
            
            userRawBalance = (parseFloat(userRawBalance) - amount).toFixed(2);
            localStorage.setItem("user_balance_val", userRawBalance);
            updateBalanceDisplay();
            fetchTransactions();
            checkTransferForm();
        } else {
            showToast(data.message || "Transfer failed.", true);
        }
    } catch (err) {
        console.error("Transfer error:", err);
        showToast("Server error during transfer.", true);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Confirm Transfer";
        }
        checkTransferForm();
    }
}

function updateBalanceDisplay() {
    if (isBalanceVisible) {
        document.getElementById("user-balance").innerText = userRawBalance;
    }
    const availBalEl = document.getElementById("withdraw-available-bal");
    if (availBalEl) {
        availBalEl.innerText = userRawBalance;
    }
}

function validateWithdrawForm() {
    if (!isNetworkSelected) return; 

    const amountInput = document.getElementById('withdraw-amount');
    const addressInput = document.getElementById('withdraw-address');
    const errorContainer = document.getElementById('withdraw-error-msg');
    const errorText = document.getElementById('error-text');
    const submitBtn = document.getElementById('withdraw-submit-btn');

    const val = parseFloat(amountInput.value) || 0;
    const maxVal = parseFloat(userRawBalance) || 0;
    const address = addressInput.value.trim();

    let isValid = true;

    // 1. የገንዘብ (Amount) ማጣሪያ
    if (amountInput.value !== "") {
        if (val < 2) {
            errorText.innerText = "Minimum is 2.00 USDT";
            errorContainer.style.display = "flex";
            amountInput.classList.add('input-error');
            isValid = false;
        } else if (val > maxVal) {
            errorText.innerText = `Exceeds available balance (${maxVal.toFixed(2)} USDT)`;
            errorContainer.style.display = "flex";
            amountInput.classList.add('input-error');
            isValid = false;
        } else if (val + dailyWithdrawn > DAILY_LIMIT) {
            errorText.innerText = `Exceeds daily withdrawal limit of 6,000 USDT`;
            errorContainer.style.display = "flex";
            amountInput.classList.add('input-error');
            isValid = false;
        } else {
            errorContainer.style.display = "none";
            amountInput.classList.remove('input-error');
        }
    } else {
        errorContainer.style.display = "none";
        amountInput.classList.remove('input-error');
        isValid = false;
    }

    // 🚀 2. የክሪፕቶ አድራሻ (Address) ጥብቅ ማጣሪያ 🚀
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (address === "" || !addressRegex.test(address)) {
        isValid = false;
        if (address !== "") {
            addressInput.classList.add('input-error');
        } else {
            addressInput.classList.remove('input-error');
        }
    } else {
        addressInput.classList.remove('input-error');
    }

    const netEl = document.getElementById('withdraw-net-receive');
    if (val >= 1) {
        netEl.innerText = (val - 1).toFixed(2) + " USDT";
    } else {
        netEl.innerText = "0.00 USDT";
    }

    // ሁሉም ትክክል ከሆነ ብቻ በተኑ ይበራል
    if (isValid) {
        submitBtn.classList.remove('btn-disabled');
        submitBtn.disabled = false;
    } else {
        submitBtn.classList.add('btn-disabled');
        submitBtn.disabled = true;
    }
}

function setMaxWithdrawAmount() {
    const maxVal = parseFloat(userRawBalance) || 0;
    document.getElementById('withdraw-amount').value = maxVal > 0 ? maxVal : 0;
    validateWithdrawForm();
}

// =========================================================
// 🚀 2. WITHDRAW ACTION: የደህንነት ሞዳል ይከፍታል
// =========================================================
async function initiateWithdrawal() {
    const address = document.getElementById('withdraw-address').value.trim();
    const amount = document.getElementById('withdraw-amount').value;

    if (!address || parseFloat(amount) < 2 || parseFloat(amount) > parseFloat(userRawBalance)) {
        showToast("Please enter a valid amount and address.", true);
        return;
    }

    pendingActionType = "Withdraw";
    pendingWithdrawAmount = parseFloat(amount);

    const actionLabel = document.getElementById("securityModalActionName");
    if (actionLabel) actionLabel.innerText = "Withdrawal";

    if (userHasPasskey) {
        document.getElementById('securityModal').style.display = 'flex';
    } else {
        document.getElementById('otpModal').style.display = 'flex';
        document.getElementById('sendEmailCodeBtn').innerText = "Send Code";
        document.getElementById('sendEmailCodeBtn').disabled = false;
    }
}

function closeSecurityModal() {
    document.getElementById('securityModal').style.display = 'none';
}

function switchToEmailOTP() {
    closeSecurityModal(); 
    document.getElementById('otpModal').style.display = 'flex'; 
    document.getElementById('sendEmailCodeBtn').innerText = "Send Code";
    document.getElementById('sendEmailCodeBtn').disabled = false;
}

// =========================================================
// 🚀 3. EMAIL OTP: ለጋራ የሚሰራ
// =========================================================
async function triggerEmailOTP() {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    const sendBtn = document.getElementById('sendEmailCodeBtn');
    
    sendBtn.disabled = true;
    sendBtn.innerText = "Sending...";

    const reqAmount = pendingActionType === "Transfer" ? pendingTransferAmount : pendingWithdrawAmount;
    const reqAddress = pendingActionType === "Transfer" ? pendingTransferRecipient : document.getElementById('withdraw-address').value.trim();

    try {
        let apiURL = `${API_BASE_URL}/api/withdraw/request`;
        let bodyData = { amount: reqAmount, destinationAddress: reqAddress, useEmailFallback: true, passkeyVerified: false };

        if (pendingActionType === "Transfer") {
            apiURL = `${API_BASE_URL}/api/transfer/request-otp`;
            bodyData = { amount: reqAmount, recipient: reqAddress };
        }

        const res = await fetch(apiURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(bodyData)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || "Server error/Not Ready");
        }

        const data = await res.json();
        
        if (data.requiresEmailOtp || (pendingActionType === "Transfer" && data.success) || data.success) {
            showToast("Verification code sent to your email!");
            startOtpCountdown();
        } else {
            showToast(data.message || "Error sending code.", true);
            sendBtn.disabled = false;
            sendBtn.innerText = "Send Code";
        }
    } catch (err) {
        console.error(err);
        showToast(err.message || "Server error switching to email.", true);
        sendBtn.disabled = false;
        sendBtn.innerText = "Send Code";
    }
}

function startOtpCountdown() {
    const btn = document.getElementById('sendEmailCodeBtn');
    let timeLeft = 60;
    btn.innerText = `${timeLeft}s`;
    
    const timer = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(timer);
            btn.innerText = "Send Code";
            btn.disabled = false;
        } else {
            btn.innerText = `${timeLeft}s`;
        }
    }, 1000);
}

function base64urlToBufferWallet(base64url) {
    const padding = '='.repeat((4 - base64url.length % 4) % 4);
    const base64 = (base64url + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const buffer = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        buffer[i] = rawData.charCodeAt(i);
    }
    return buffer;
}

// =========================================================
// 🚀 4. PASSKEY VERIFICATION: ለጋራ የሚሰራ
// =========================================================
async function verifyWithdrawalPasskey() {
    try {
        const token = localStorage.getItem('token') || localStorage.getItem('authToken');
        
        const optionsRes = await fetch(`${API_BASE_URL}/api/passkey/login-options`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const optionsData = await optionsRes.json();
        
        if (!optionsData.success) {
            showToast("Passkey system busy."); return;
        }

        const challengeBuffer = base64urlToBufferWallet(optionsData.options.challenge);
        const credential = await navigator.credentials.get({ 
            publicKey: {
                challenge: challengeBuffer,
                rpId: window.location.hostname.replace(/^www\./, ''),
                userVerification: "required"
            } 
        });
        
        if (!credential) {
            showToast("Passkey verification cancelled."); return;
        }

        if (pendingActionType === "Transfer") {
            closeSecurityModal();
            executeTransferAPI(pendingTransferRecipient, pendingTransferAmount, '', 'passkey');
            return;
        }

        const address = document.getElementById('withdraw-address').value.trim();
        const withdrawRes = await fetch(`${API_BASE_URL}/api/withdraw/request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ amount: pendingWithdrawAmount, destinationAddress: address, useEmailFallback: false, passkeyVerified: true })
        });

        const data = await withdrawRes.json();
        if (data.success) {
            dailyWithdrawn += pendingWithdrawAmount;
            localStorage.setItem("daily_withdrawn", dailyWithdrawn);
            updateDailyLimitUI();

            closeSecurityModal();
            showToast(data.message);
            document.getElementById('withdraw-amount').value = "";
            document.getElementById('withdraw-address').value = "";
            validateWithdrawForm();
            await fetchUserProfile();
            fetchTransactions();
        } else {
            showToast(data.message || "Passkey failed.", true);
        }

    } catch (err) {
        console.error("Passkey Verify Error:", err);
        showToast("Action cancelled or Passkey not supported.", true);
    }
}

// =========================================================
// 🚀 5. EMAIL OTP VERIFICATION: ለጋራ የሚሰራ
// =========================================================
async function verifyAndCompleteWithdrawal() {
    const otp = document.getElementById('otpCodeInput').value.trim();
    if (!otp || otp.length !== 6) {
        showToast("Please enter valid 6-digit OTP code.", true);
        return;
    }

    const submitBtn = document.querySelector('#otpModal .action-submit-btn');
    const originalText = submitBtn.innerText;
    submitBtn.disabled = true;
    submitBtn.innerText = "Verifying...";

    if (pendingActionType === "Transfer") {
        await executeTransferAPI(pendingTransferRecipient, pendingTransferAmount, otp, 'email');
        document.getElementById('otpCodeInput').value = "";
        closeOtpModal();
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
        return;
    }

    const address = document.getElementById('withdraw-address').value.trim();
    const token = localStorage.getItem('token') || localStorage.getItem('authToken');
    try {
        const res = await fetch(`${API_BASE_URL}/api/withdraw/verify-otp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ otp, amount: pendingWithdrawAmount, destinationAddress: address })
        });

        const data = await res.json();
        if (data.success) {
            dailyWithdrawn += pendingWithdrawAmount;
            localStorage.setItem("daily_withdrawn", dailyWithdrawn);
            updateDailyLimitUI();

            showToast(data.message);
            closeOtpModal();
            await fetchUserProfile(); 
            document.getElementById('otpCodeInput').value = "";
            document.getElementById('withdraw-amount').value = "";
            document.getElementById('withdraw-address').value = "";
            validateWithdrawForm();
            fetchTransactions(); 
        } else {
            showToast(data.message || "Verification failed.", true);
        }
    } catch (err) {
        console.error("OTP Verify Error:", err);
        showToast("Server error during verification.", true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = originalText;
    }
}

function closeOtpModal() {
    document.getElementById('otpModal').style.display = 'none';
}

function toggleBalanceVisibility() {
    isBalanceVisible = !isBalanceVisible;
    const balanceEl = document.getElementById("user-balance"); 
    const iconEl = document.getElementById("toggleBalanceIcon");

    if (isBalanceVisible) {
        balanceEl.innerText = userRawBalance;
        iconEl.className = "fa-solid fa-eye";
    } else {
        balanceEl.innerText = "****";
        iconEl.className = "fa-solid fa-eye-slash";
    }
}

function openNetworkModal() {
    document.getElementById("networkModal").style.display = "flex";
}

function closeNetworkModal() {
    document.getElementById("networkModal").style.display = "none";
}

function generateQRCode(address) {
    const qrWrapper = document.getElementById("qrcode-wrapper");
    const qrContainer = document.getElementById("qrcode");
    
    qrContainer.innerHTML = ""; 
    
    if (address && address !== "Generating Address..." && !address.startsWith("No address") && !address.startsWith("Error")) {
        qrWrapper.style.display = "flex"; 
        new QRCode(qrContainer, {
            text: address,
            width: 160,
            height: 160,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    } else {
        qrWrapper.style.display = "none"; 
    }
}

function copyAddress() {
    const copyText = document.getElementById("dep-address");
    copyText.select();
    copyText.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(copyText.value);
    showToast("Address copied to clipboard!");
}

function showToast(message, isError = false) {
    const toast = document.getElementById("toastNotification");
    if (!toast) return;
    const msgEl = document.getElementById("toastMessage");
    const iconEl = toast.querySelector("i");
    
    if (msgEl) msgEl.innerText = message;
    
    if (isError) {
        iconEl.className = "fa-solid fa-circle-xmark";
        iconEl.style.color = "var(--red-color)";
    } else {
        iconEl.className = "fa-solid fa-circle-check";
        iconEl.style.color = "var(--green-color)";
    }
    
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// 🚀 Event Delegation for CSP Compliance (Replaces all inline onclick/oninput) 🚀
document.addEventListener('click', (e) => {
    const target = e.target.closest('button, .network-card, i, span, div.network-item');
    if (!target) return;
    
    // Top Card Actions
    if (target.id === 'toggleBalanceIcon') toggleBalanceVisibility();
    if (target.classList.contains('deposit-btn')) handleAction('Deposit', target);
    if (target.classList.contains('withdraw-btn')) handleAction('Withdraw', target);
    if (target.classList.contains('transfer-btn')) handleAction('Transfer', target);
    
    // Modals
    if (target.classList.contains('network-card')) openNetworkModal();
    if (target.classList.contains('fa-xmark') || target.innerText.includes('Cancel')) {
        if (target.closest('#networkModal')) closeNetworkModal();
        if (target.closest('#securityModal') || target.innerText.includes('Cancel')) closeSecurityModal();
        if (target.closest('#otpModal')) closeOtpModal();
        if (target.closest('#historyModal')) closeHistoryModal();
    }
    
    // Network Options
    if (target.id === 'bsc-option') selectNetwork('BSC', 'BNB Smart Chain (BEP-20)', 'bsc-option');
    if (target.id === 'trx-option') showToast('TRON (TRC-20) Network is Coming Soon!');
    
    // Utility
    if (target.classList.contains('copy-btn')) copyAddress();
    if (target.innerText === 'MAX') setMaxWithdrawAmount();
    
    // History
    if (target.innerText === 'View all >') openHistoryModal();
    if (target.classList.contains('history-tab')) filterHistory(target.innerText, target);
    
    // Submits & Verifications
    if (target.id === 'withdraw-submit-btn') initiateWithdrawal();
    if (target.id === 'transfer-submit-btn') initiateTransfer();
    if (target.id === 'sendEmailCodeBtn') triggerEmailOTP();
    
    if (target.innerText.includes('Email Code')) switchToEmailOTP();
    if (target.innerText.includes('Verify with Passkey')) verifyWithdrawalPasskey();
    if (target.innerText.includes('Verify & Confirm')) verifyAndCompleteWithdrawal();
});

document.addEventListener('input', (e) => {
    if (e.target.id === 'withdraw-address' || e.target.id === 'withdraw-amount') {
        validateWithdrawForm();
    }
    if (e.target.id === 'transfer-recipient' || e.target.id === 'transfer-amount') {
        checkTransferForm();
        if (e.target.id === 'transfer-recipient') debouncedCheckRecipient();
    }
});