const API_BASE = 'https://tbr-exchange-backend.onrender.com';
const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('jwt');

if (!token) {
  window.location.href = 'index.html';
}

let activeCardMongoId = null;
let cardSecrets = null;
let secretsVisible = false;
let userWalletBalance = 0;
let isUserVerified = true;

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

// Load User's Cards, KYC Status, Verified Name & Wallet Balance from Backend
async function loadUserCards() {
  const createBox = document.getElementById('createBox');
  const unverifiedBox = document.getElementById('unverifiedBox');
  const nameInput = document.getElementById('nameOnCard');
  const balEl = document.getElementById('availableWalletBalance');

  try {
    const res = await fetch(`${API_BASE}/api/cards/my-cards`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.success) {
      userWalletBalance = Number(data.walletBalance || 0);
      isUserVerified = data.isVerified !== false;

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

      if (nameInput) {
        if (data.verifiedName && data.verifiedName.length >= 2) {
          nameInput.value = data.verifiedName;
          nameInput.readOnly = true;
          document.getElementById('cardHolderDisplay').textContent = data.verifiedName;
        } else {
          nameInput.readOnly = false;
          nameInput.placeholder = 'Enter your full legal name';
          nameInput.oninput = validateCardForm;
        }
      }

      validateCardForm();

      if (data.cards && data.cards.length > 0) {
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
    } else {
      if (balEl) balEl.textContent = '$0.00 USDT';
      if (nameInput) {
        nameInput.readOnly = false;
        nameInput.placeholder = 'Enter your full legal name';
        nameInput.oninput = validateCardForm;
      }
    }
  } catch (err) {
    console.error('Error loading cards:', err);
    if (balEl) balEl.textContent = 'Error loading balance';
    if (nameInput) {
      nameInput.readOnly = false;
      nameInput.placeholder = 'Enter your full legal name';
      nameInput.oninput = validateCardForm;
    }
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
updateTopupCost();
loadUserCards();