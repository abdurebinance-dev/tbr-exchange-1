document.addEventListener('DOMContentLoaded', () => {
    console.log('TBR Exchange JavaScript is working successfully!');
    
    // ለአዝራሮቹ መጫን (Click) የሚሆን ሙከራ
    const buttons = document.querySelectorAll('button, a.btn');
    buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            console.log('Button clicked:', e.target.innerText);
        });
    });

    // P2P Calculator Logic
    const calcInput = document.getElementById('calc-amount');
    const calcResult = document.getElementById('calc-result');
    const tabBuy = document.getElementById('tab-buy');
    const tabSell = document.getElementById('tab-sell');
    const payLabel = document.getElementById('pay-label');
    const receiveLabel = document.getElementById('receive-label');
    const payUnit = document.getElementById('pay-unit');

    let currentMode = 'sell';
    const rate = 189.00;

    function calculate() {
        if (!calcInput || !calcResult) return;
        const amount = parseFloat(calcInput.value) || 0;
        const receiveUnitText = currentMode === 'sell' ? 'ETB' : 'USDT';
        let result = 0;

        if (currentMode === 'sell') {
            result = amount * rate;
        } else {
            result = amount / rate;
        }

        calcResult.innerHTML = `${result.toFixed(2)} <span style="font-size: 12px; color: #777; font-weight: normal;">${receiveUnitText}</span>`;
    }

    window.setMode = function(mode) {
        currentMode = mode;
        if (!tabBuy || !tabSell || !payLabel || !receiveLabel || !payUnit || !calcInput) return;

        if (mode === 'buy') {
            tabBuy.classList.add('active');
            tabSell.classList.remove('active');
            payLabel.innerText = "PAY (ETB)";
            receiveLabel.innerText = "RECEIVE (USDT)";
            payUnit.innerText = "ETB";
            calcInput.value = "982.80";
        } else {
            tabSell.classList.add('active');
            tabBuy.classList.remove('active');
            payLabel.innerText = "PAY (USDT)";
            receiveLabel.innerText = "RECEIVE (ETB)";
            payUnit.innerText = "USDT";
            calcInput.value = "5.20";
        }
        calculate();
    };

    if (calcInput) {
        calcInput.addEventListener('input', calculate);
    }
});
document.addEventListener("DOMContentLoaded", function() {
    const navbarHTML = `
    <header class="navbar" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; background: #121212; border-bottom: 1px solid #222; width: 100%; position: sticky; top: 0; z-index: 1000;">
        <div class="nav-brand">
            <a href="dashboard.html" style="color: #f3ba2f; font-weight: bold; font-size: 20px; text-decoration: none;">TBR</a>
        </div>
        <nav class="nav-links" style="display: flex; gap: 20px; align-items: center;">
            <a href="dashboard.html" style="color: #fff; text-decoration: none;">Dashboard</a>
            <a href="market.html" style="color: #fff; text-decoration: none;">Market</a>
            <a href="my-ads.html" style="color: #fff; text-decoration: none;">My Ads</a>
            <a href="trades.html" style="color: #fff; text-decoration: none;">Trades</a>
            <a href="wallet.html" style="color: #fff; text-decoration: none;">Wallet</a>
            <a href="top-traders.html" style="color: #fff; text-decoration: none;">Top Traders</a>
        </nav>
        <div class="nav-right" style="display: flex; align-items: center; gap: 15px;">
            <div id="headerKycBadge" style="background: #0ecb81; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 12px; font-weight: bold;">Verified</div>
            <a href="profile.html" style="color: #fff; text-decoration: none;"><i class="fas fa-user"></i> Profile</a>
        </div>
    </header>`;

    // ነባሩን Navbar ካለ ማስወገድ
    const existingNavbar = document.querySelector('header.navbar');
    if (existingNavbar) {
        existingNavbar.remove();
    }

    const placeholder = document.getElementById('navbar-placeholder');
    if (placeholder) {
        placeholder.innerHTML = navbarHTML;
    } else {
        document.body.insertAdjacentHTML('afterbegin', navbarHTML);
    }
});