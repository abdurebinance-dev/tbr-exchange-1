const token = localStorage.getItem('token');
if (!token) {
  window.location.href = 'index.html';
}

let activeCardMongoId = null;
let cardSecrets = null;
let secretsVisible = false;

function showAlert(msg, type = 'success') {
  const box = document.getElementById('alertBox');
  box.textContent = msg;
  box.className = `alert ${type === 'success' ? 'alert-success' : 'alert-error'}`;
  box.style.display = 'block';
  setTimeout(() => { box.style.display = 'none'; }, 6000);
}

// 1. Update Total Cost on Create Card ($1.00 + 5% fee: 4% Kripicard + 1% TBR)
function updateTotalCost() {
  const amtInput = document.getElementById('initialAmountInput');
  const btn = document.getElementById('createBtn');
  if (!amtInput || !btn) return;

  const amt = Number(amtInput.value) || 10;
  const fee = 1.00 + (amt * 0.05);
  const total = (amt + fee).toFixed(2);
  btn.textContent = `Request TBR Card ($${total} USDT Total)`;
}

// 2. Update Total Cost on Top-up ($1.00 + 4% network fee, 0% TBR markup)
function updateTopupCost() {
  const amtInput = document.getElementById('topupAmount');
  const btn = document.getElementById('topupBtn');
  if (!amtInput || !btn) return;

  const amt = Number(amtInput.value) || 10;
  const fee = 1.00 + (amt * 0.04);
  const total = (amt + fee).toFixed(2);
  btn.textContent = `Add Funds ($${total} USDT Total)`;
}

// 3. Load User's Cards or Requests
async function loadUserCards() {
  try {
    const res = await fetch('/api/cards/my-cards', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

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
  } catch (err) {
    console.error('Error loading cards:', err);
  }
}

// 4. Load Card Details or Approval Status
async function loadCardDetails(mongoId) {
  try {
    const res = await fetch(`/api/cards/details/${mongoId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();

    if (data.success && data.status === 'pending_approval') {
      const reqAmt = Number(data.requested_amount_usd || 10).toFixed(2);
      document.getElementById('cardBalanceDisplay').textContent = `Status: ⏳ Pending Admin Approval ($${reqAmt})`;
      document.getElementById('cardHolderDisplay').textContent = data.name_on_card;
      document.getElementById('topupBox').style.display = 'none';
      return;
    }

    if (data.success && data.status === 'rejected') {
      const refAmt = Number(data.total_charged_tbr_usdt || 11.50).toFixed(2);
      document.getElementById('cardBalanceDisplay').textContent = `Status: ❌ Rejected ($${refAmt} Refunded)`;
      document.getElementById('topupBox').style.display = 'none';
      return;
    }

    if (data.success && data.status === 'pending') {
      document.getElementById('cardBalanceDisplay').textContent = 'Status: Issuing (Pending)...';
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

// 5. Submit New Card Request
async function createCard() {
  const name_on_card = document.getElementById('nameOnCard').value.trim();
  const dateOfBirth = document.getElementById('dobInput').value.trim();
  const amount = Number(document.getElementById('initialAmountInput').value);
  const btn = document.getElementById('createBtn');

  if (!amount || amount < 10) return showAlert('Minimum initial card balance is $10.00 USD.', 'error');
  if (!name_on_card) return showAlert('Please enter the cardholder name.', 'error');

  btn.disabled = true;
  btn.textContent = 'Submitting Request...';

  try {
    const res = await fetch('/api/cards/create', {
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
    btn.disabled = false;
    updateTotalCost();
  }
}

// 6. Top-up Active Card
async function fundCard() {
  if (!activeCardMongoId) return;
  const amount = Number(document.getElementById('topupAmount').value);
  const btn = document.getElementById('topupBtn');

  if (!amount || amount < 10) return showAlert('Minimum top-up amount is $10 USDT.', 'error');

  btn.disabled = true;
  btn.textContent = 'Processing Top-up...';

  try {
    const res = await fetch('/api/cards/fund', {
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
      await loadCardDetails(activeCardMongoId);
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
updateTotalCost();
updateTopupCost();
loadUserCards();