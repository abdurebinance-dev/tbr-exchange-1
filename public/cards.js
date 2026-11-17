const API_BASE = window.location.hostname.includes('localhost')
  ? ''
  : 'https://tbr-exchange-backend.onrender.com';

function getIdentity() {
  let t = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
  let email = localStorage.getItem('userEmail') || localStorage.getItem('email') || '';
  let userId = localStorage.getItem('userId') || localStorage.getItem('tbr_resolved_uid') || '';
  return {
    token: t.replace(/^Bearer\s+/i, '').trim(),
    email: email.trim(),
    userId: userId.trim()
  };
}

const { token } = getIdentity();
if (!token) {
  window.location.replace('signin.html');
}

let activeCardMongoId = null;
let cardSecrets = null;
let secretsVisible = false;
let userWalletBalance = Number(localStorage.getItem('user_balance_val') || localStorage.getItem('balance') || 0);
let isUserVerified = false;

function showAlert(msg, type = 'success') {
  const box = document.getElementById('alertBox');
  box.textContent = msg;
  box.className = `alert ${type === 'success' ? 'alert-success' : 'alert-error'}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 6000);
}

// Validate Amount (>= $12 & <= Available TBR USDT Balance with fee) & Verified Name
function validateCardForm() {
  const amtInput = document.getElementById('initialAmountInput');
  const nameInput = document.getElementById('nameOnCard');
  const errorEl = document.getElementById('amountErrorMsg');
  const btn = document.getElementById('createBtn');

  if (!amtInput || !btn) return false;

  btn.textContent = 'Request TBR Card';
  const rawVal = amtInput.value.trim();
  const amt = Number(rawVal);
  const nameVal = nameInput ? nameInput.value.trim() : '';

  const totalFee = 1.00 + (amt * 0.05);
  const totalRequired = Number((amt + totalFee).toFixed(2));

  if (!rawVal || isNaN(amt) || amt < 12) {
    amtInput.classList.add('input-invalid');
    errorEl.textContent = 'Minimum initial card balance is $12.00 USD.';
    errorEl.style.display = 'block';
    btn.disabled = true;
    return false;
  }

  if (totalRequired > userWalletBalance) {
    amtInput.classList.add('input-invalid');
    errorEl.textContent = `Insufficient USDT balance! Need $${totalRequired.toFixed(2)} USDT (incl. fee), available: $${userWalletBalance.toFixed(2)} USDT.`;
    errorEl.style.display = 'block';
    btn.disabled = true;
    return false;
  }

  amtInput.classList.remove('input-invalid');
  errorEl.style.display = 'none';

  if (nameVal.length < 2) {
    btn.disabled = true;
    return false;
  }

  btn.disabled = false;
  return true;
}

function updateTopupCost() {
  const amtInput = document.getElementById('topupAmount');
  const btn = document.getElementById('topupBtn');
  if (!amtInput || !btn) return;

  const amt = Number(amtInput.value) || 10;
  const fee = 1.00 + (amt * 0.04);
  const total = (amt + fee).toFixed(2);
  btn.textContent = `Add Funds ($${total} USDT Total)`;
}

// Apply User Profile (Balance, KYC Status, Verified Name) to UI
function applyUserStateToUI(balanceVal, kycRaw, legalName) {
  const createBox = document.getElementById('createBox');
  const unverifiedBox = document.getElementById('unverifiedBox');
  const nameInput = document.getElementById('nameOnCard');
  const balEl = document.getElementById('availableWalletBalance');

  userWalletBalance = Number(balanceVal || 0);
  const kycLower = String(kycRaw || '').toLowerCase();
  isUserVerified = (kycLower === 'verified' || kycLower === 'approved' || kycLower === 'true');

  if (balEl) {
    balEl.textContent = `$${userWalletBalance.toFixed(2)} USDT`;
    balEl.style.color = userWalletBalance >= 13.60 ? '#0ECB81' : '#F6465D';
  }

  if (!isUserVerified) {
    if (createBox) createBox.style.display = 'none';
    if (unverifiedBox) unverifiedBox.style.display = 'block';
    return;
  }

  if (unverifiedBox) unverifiedBox.style.display = 'none';
  if (createBox) createBox.style.display = 'block';

  const cleanName = (legalName || '').trim();
  if (nameInput) {
    if (cleanName.length >= 2) {
      nameInput.value = cleanName;
      nameInput.readOnly = true;
      document.getElementById('cardHolderDisplay').textContent = cleanName.toUpperCase();
    } else {
      nameInput.readOnly = false;
      nameInput.placeholder = 'Enter your verified full name';
      nameInput.oninput = validateCardForm;
    }
  }

  validateCardForm();
}

// Step 1: Instant paint from localStorage (Zero-second load just like dashboard.js)
function initFromLocalCache() {
  const cachedBal = localStorage.getItem('user_balance_val') || localStorage.getItem('balance') || '0';
  const cachedKyc = localStorage.getItem('kycStatus') || 'not_submitted';
  const cachedName = localStorage.getItem('kycFullName') || localStorage.getItem('fullName') || localStorage.getItem('userName') || '';
  applyUserStateToUI(cachedBal, cachedKyc, cachedName);
}

// Step 2: Sync live Profile & Cards from Backend
async function loadUserCards() {
  const { token, email, userId } = getIdentity();
  if (!token) return;

  try {
    // Fetch user profile using the exact same endpoint as dashboard.js
    const params = new URLSearchParams();
    if (email) params.set('email', email);
    if (userId) params.set('userId', userId);

    const profileRes = await fetch(`${API_BASE}/api/user/profile?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (profileRes.ok) {
      const pData = await profileRes.json();
      const userObj = pData.user || pData.data || pData;
      if (userObj) {
        if (userObj._id) localStorage.setItem('userId', String(userObj._id));
        if (userObj.email) localStorage.setItem('userEmail', userObj.email);
        const fullName = (userObj.fullName || userObj.kycFullName || userObj.name || '').trim();
        if (fullName) {
          localStorage.setItem('userName', fullName);
          localStorage.setItem('kycFullName', fullName);
        }
        if (userObj.kycStatus) localStorage.setItem('kycStatus', userObj.kycStatus);
        if (userObj.balance !== undefined && userObj.balance !== null) {
          localStorage.setItem('user_balance_val', Number(userObj.balance).toFixed(2));
        }

        const kycVal = userObj.isVerified === true ? 'verified' : (userObj.kycStatus || localStorage.getItem('kycStatus'));
        applyUserStateToUI(userObj.balance, kycVal, fullName);
      }
    }

    // Fetch existing virtual cards / pending requests
    const cardsRes = await fetch(`${API_BASE}/api/cards/my-cards`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (cardsRes.ok) {
      const data = await cardsRes.json();
      if (data.success && data.cards && data.cards.length > 0) {
        const card = data.cards[0];
        activeCardMongoId = card._id;
        document.getElementById('cardHolderDisplay').textContent = card.name_on_card;

        if (card.status === 'active') {
          document.getElementById('topupBox').style.display = 'block';
          updateTopupCost();
        } else {
          document.getElementById('topupBox').style.display = 'none';
        }

        await loadCardDetails(card._id);
      }
    }
  } catch (err) {
    console.error('Error syncing card page:', err);
  }
}

async function loadCardDetails(mongoId) {
  try {
    const res = await fetch(`${API_BASE}/api/cards/details/${mongoId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.success && data.status === 'pending_approval') {
      const reqAmt = Number(data.requested_amount_usd || 12).toFixed(2);
      document.getElementById('cardBalanceDisplay').textContent = `⏳ Pending Admin Approval ($${reqAmt})`;
      document.getElementById('cardHolderDisplay').textContent = data.name_on_card;
      document.getElementById('topupBox').style.display = 'none';
      return;
    }

    if (data.success && data.status === 'rejected') {
      const refAmt = Number(data.total_charged_tbr_usdt || 13.60).toFixed(2);
      document.getElementById('cardBalanceDisplay').textContent = `❌ Rejected ($${refAmt} Refunded)`;
      document.getElementById('topupBox').style.display = 'none';
      return;
    }

    if (data.success && data.status === 'pending') {
      document.getElementById('cardBalanceDisplay').textContent = 'Issuing (Pending)...';
      return;
    }

    if (data.success && data.card_number) {
      cardSecrets = data;
      document.getElementById('cardBalanceDisplay').textContent = `Balance: $${Number(data.balance || 0).toFixed(2)} USD`;
      document.getElementById('cardHolderDisplay').textContent = data.name_on_card;
      document.getElementById('topupBox').style.display = 'block';
      renderCardNumbers();
    }
  } catch (err) {
    console.error('Error fetching details:', err);
  }
}

function renderCardNumbers() {
  if (!cardSecrets) return;
  const numEl = document.getElementById('cardNumberDisplay');
  const expEl = document.getElementById('cardExpiryDisplay');
  const cvvEl = document.getElementById('cardCvvDisplay');
  const btn = document.getElementById('revealBtn');

  if (secretsVisible) {
    numEl.textContent = cardSecrets.card_number.replace(/(.{4})/g, '$1 ').trim();
    expEl.textContent = cardSecrets.expiry;
    cvvEl.textContent = cardSecrets.cvv;
    btn.textContent = 'Hide CVV';
  } else {
    const last4 = cardSecrets.card_number.slice(-4);
    numEl.textContent = `5378 72•• •••• ${last4}`;
    expEl.textContent = '••/••';
    cvvEl.textContent = '•••';
    btn.textContent = 'Show CVV';
  }
}

function toggleSecrets() {
  if (!cardSecrets) return showAlert('No active card details loaded yet.', 'error');
  secretsVisible = !secretsVisible;
  renderCardNumbers();
}

async function createCard() {
  if (!validateCardForm()) return;

  const name_on_card = document.getElementById('nameOnCard').value.trim();
  const dateOfBirth = document.getElementById('dobInput').value.trim();
  const amount = Number(document.getElementById('initialAmountInput').value);
  const btn = document.getElementById('createBtn');

  btn.disabled = true;
  btn.textContent = 'Submitting Request...';

  try {
    const res = await fetch(`${API_BASE}/api/cards/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name_on_card, dateOfBirth, amount })
    });
    const data = await res.json();

    if (data.success) {
      showAlert(data.message, 'success');
      await loadUserCards();
    } else {
      showAlert(data.message || 'Failed to submit request.', 'error');
    }
  } catch (err) {
    showAlert('Network error while submitting request.', 'error');
  } finally {
    validateCardForm();
  }
}

async function fundCard() {
  if (!activeCardMongoId) return;
  const amount = Number(document.getElementById('topupAmount').value);
  const btn = document.getElementById('topupBtn');

  if (!amount || amount < 10) return showAlert('Minimum top-up amount is $10 USDT.', 'error');

  btn.disabled = true;
  btn.textContent = 'Processing Top-up...';

  try {
    const res = await fetch(`${API_BASE}/api/cards/fund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ cardId: activeCardMongoId, amount })
    });
    const data = await res.json();

    if (data.success) {
      showAlert(data.message, 'success');
      await loadUserCards();
    } else {
      showAlert(data.message || 'Top-up failed.', 'error');
    }
  } catch (err) {
    showAlert('Network error during top-up.', 'error');
  } finally {
    btn.disabled = false;
    updateTopupCost();
  }
}

// Initialize
initFromLocalCache();
updateTopupCost();
loadUserCards();