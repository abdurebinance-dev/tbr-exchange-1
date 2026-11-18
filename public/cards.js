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

const EYE_OPEN_SVG = `
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
  <circle cx="12" cy="12" r="3"></circle>
`;

const EYE_OFF_SVG = `
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
  <line x1="1" y1="1" x2="23" y2="23"></line>
`;

const COPY_SVG = `
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
`;

const CHECK_SVG = `
  <polyline points="20 6 9 17 4 12"></polyline>
`;

function showAlert(msg, type = 'success') {
  const box = document.getElementById('alertBox');
  if (!box) {
    alert(msg);
    return;
  }
  box.textContent = msg;
  box.className = `alert ${type === 'success' ? 'alert-success' : 'alert-error'}`;
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => { box.style.display = 'none'; }, 7000);
}

// Strict Real-Time Validation (< $12 or > Available USDT Balance disables button & shows red error)
function validateCardForm() {
  const amtInput = document.getElementById('initialAmountInput');
  const nameInput = document.getElementById('nameOnCard');
  const errorEl = document.getElementById('amountErrorMsg');
  const btn = document.getElementById('createBtn');

  if (!amtInput || !btn) return false;

  if (btn.dataset.submitting !== 'true') {
    btn.textContent = 'Request TBR Card';
  }

  const rawVal = amtInput.value.trim();
  const amt = Number(rawVal);
  const nameVal = nameInput ? nameInput.value.trim() : '';

  if (!rawVal || isNaN(amt) || amt < 12) {
    amtInput.style.borderColor = '#F6465D';
    if (errorEl) {
      errorEl.textContent = '⚠️ Minimum amount is $12.00 USDT.';
      errorEl.style.display = 'block';
    }
    btn.disabled = true;
    btn.style.opacity = '0.35';
    btn.style.cursor = 'not-allowed';
    return false;
  }

  if (amt > userWalletBalance) {
    amtInput.style.borderColor = '#F6465D';
    if (errorEl) {
      errorEl.textContent = `⚠️ Insufficient balance! Your available TBR Wallet balance is $${userWalletBalance.toFixed(2)} USDT.`;
      errorEl.style.display = 'block';
    }
    btn.disabled = true;
    btn.style.opacity = '0.35';
    btn.style.cursor = 'not-allowed';
    return false;
  }

  if (nameVal.length < 2) {
    amtInput.style.borderColor = '#2B3139';
    if (errorEl) errorEl.style.display = 'none';
    btn.disabled = true;
    btn.style.opacity = '0.35';
    btn.style.cursor = 'not-allowed';
    return false;
  }

  // Valid -> Enable gold button
  amtInput.style.borderColor = '#0ECB81';
  if (errorEl) errorEl.style.display = 'none';
  if (btn.dataset.submitting !== 'true') {
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
  }
  return true;
}

function updateTopupCost() {
  const amtInput = document.getElementById('topupAmount');
  const btn = document.getElementById('topupBtn');
  if (!amtInput || !btn) return;

  const amt = Number(amtInput.value) || 12;
  btn.textContent = `Add Funds ($${amt.toFixed(2)} USDT)`;
}

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
    balEl.style.color = userWalletBalance >= 12 ? '#0ECB81' : '#F6465D';
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
      nameInput.addEventListener('input', validateCardForm);
    }
  }

  validateCardForm();
}

function initFromLocalCache() {
  const cachedBal = localStorage.getItem('user_balance_val') || localStorage.getItem('balance') || '0';
  const cachedKyc = localStorage.getItem('kycStatus') || 'not_submitted';
  const cachedName = localStorage.getItem('kycFullName') || localStorage.getItem('fullName') || localStorage.getItem('userName') || '';
  applyUserStateToUI(cachedBal, cachedKyc, cachedName);
}

async function loadUserCards() {
  const { token, email, userId } = getIdentity();
  if (!token) return;

  try {
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

    const cardsRes = await fetch(`${API_BASE}/api/cards/my-cards?${params.toString()}`, {
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
  const { token, email, userId } = getIdentity();
  const params = new URLSearchParams();
  if (email) params.set('email', email);
  if (userId) params.set('userId', userId);

  try {
    const res = await fetch(`${API_BASE}/api/cards/details/${mongoId}?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.success && data.status === 'pending_approval') {
      const reqAmt = Number(data.requested_amount_usd || 10.40).toFixed(2);
      document.getElementById('cardBalanceDisplay').textContent = `⏳ Pending Admin Approval ($${reqAmt})`;
      document.getElementById('cardHolderDisplay').textContent = data.name_on_card;
      document.getElementById('topupBox').style.display = 'none';
      return;
    }

    if (data.success && data.status === 'rejected') {
      const refAmt = Number(data.total_charged_tbr_usdt || 12.00).toFixed(2);
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
  const eyeSvg = document.getElementById('eyeIconSvg');

  if (secretsVisible) {
    numEl.textContent = cardSecrets.card_number.replace(/(.{4})/g, '$1 ').trim();
    expEl.textContent = cardSecrets.expiry;
    cvvEl.textContent = cardSecrets.cvv;
    if (eyeSvg) eyeSvg.innerHTML = EYE_OFF_SVG;
  } else {
    const first6 = cardSecrets.card_number.slice(0, 6).replace(/(.{4})/, '$1 ');
    const last4 = cardSecrets.card_number.slice(-4);
    numEl.textContent = `${first6}•• •••• ${last4}`;
    expEl.textContent = '••/••';
    cvvEl.textContent = '•••';
    if (eyeSvg) eyeSvg.innerHTML = EYE_OPEN_SVG;
  }
}

async function toggleSecrets() {
  if (!cardSecrets && activeCardMongoId) {
    await loadCardDetails(activeCardMongoId);
  }

  if (!cardSecrets || !cardSecrets.card_number) {
    return showAlert('No active card details loaded yet.', 'error');
  }

  secretsVisible = !secretsVisible;
  renderCardNumbers();
}

async function copyCardNumber() {
  if (!cardSecrets && activeCardMongoId) {
    await loadCardDetails(activeCardMongoId);
  }

  if (!cardSecrets || !cardSecrets.card_number) {
    return showAlert('No active card number to copy yet.', 'error');
  }

  const rawNumber = cardSecrets.card_number.replace(/\s+/g, '');
  const copySvg = document.getElementById('copyIconSvg');
  const copyBtn = document.getElementById('copyCardBtn');

  try {
    await navigator.clipboard.writeText(rawNumber);
    if (copySvg) copySvg.innerHTML = CHECK_SVG;
    if (copyBtn) copyBtn.style.color = '#0ECB81';
    showAlert('Card number copied to clipboard!', 'success');

    setTimeout(() => {
      if (copySvg) copySvg.innerHTML = COPY_SVG;
      if (copyBtn) copyBtn.style.color = '';
    }, 2000);
  } catch (err) {
    const tmp = document.createElement('input');
    tmp.value = rawNumber;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
    showAlert('Card number copied to clipboard!', 'success');
  }
}

// Submit Card Request
async function createCard() {
  if (!validateCardForm()) return;

  const { token, email, userId } = getIdentity();
  const name_on_card = document.getElementById('nameOnCard').value.trim();
  const dateOfBirth = document.getElementById('dobInput').value.trim();
  const amount = Number(document.getElementById('initialAmountInput').value);
  const btn = document.getElementById('createBtn');

  btn.dataset.submitting = 'true';
  btn.disabled = true;
  btn.style.opacity = '0.6';
  btn.textContent = 'Submitting Request...';

  try {
    const res = await fetch(`${API_BASE}/api/cards/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name_on_card, dateOfBirth, amount, email, userId })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      showAlert(data.message || 'Card request submitted! Waiting for Admin approval.', 'success');
      await loadUserCards();
    } else {
      showAlert(data.message || `Request failed (${res.status}).`, 'error');
    }
  } catch (err) {
    showAlert('Network error: Could not reach server. Please check connection.', 'error');
  } finally {
    btn.dataset.submitting = 'false';
    validateCardForm();
  }
}

async function fundCard() {
  if (!activeCardMongoId) return;
  const { token, email, userId } = getIdentity();
  const amount = Number(document.getElementById('topupAmount').value);
  const btn = document.getElementById('topupBtn');

  if (!amount || amount < 12) return showAlert('Minimum top-up amount is $12 USDT.', 'error');

  btn.disabled = true;
  btn.textContent = 'Processing Top-up...';

  try {
    const res = await fetch(`${API_BASE}/api/cards/fund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ cardId: activeCardMongoId, amount, email, userId })
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

window.validateCardForm = validateCardForm;
window.updateTopupCost = updateTopupCost;

document.addEventListener('DOMContentLoaded', () => {
  const amtInput = document.getElementById('initialAmountInput');
  const createBtn = document.getElementById('createBtn');
  const revealBtn = document.getElementById('revealBtn');
  const copyCardBtn = document.getElementById('copyCardBtn');
  const topupBtn = document.getElementById('topupBtn');

  if (amtInput) {
    amtInput.addEventListener('input', validateCardForm);
    amtInput.addEventListener('keyup', validateCardForm);
    amtInput.addEventListener('change', validateCardForm);
  }
  if (createBtn) {
    createBtn.addEventListener('click', (e) => {
      e.preventDefault();
      createCard();
    });
  }
  if (revealBtn) {
    revealBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleSecrets();
    });
  }
  if (copyCardBtn) {
    copyCardBtn.addEventListener('click', (e) => {
      e.preventDefault();
      copyCardNumber();
    });
  }
  if (topupBtn) {
    topupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      fundCard();
    });
  }

  initFromLocalCache();
  updateTopupCost();
  loadUserCards();
});