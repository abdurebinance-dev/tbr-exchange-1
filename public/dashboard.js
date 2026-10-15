document.addEventListener("DOMContentLoaded", () => {
    // መግቢያ (Auth) መኖሩን ማረጋገጥ
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    if (!token) {
        window.location.replace("signin.html");
        return;
    }

    const API_BASE_URL = window.location.hostname.includes('localhost') 
        ? '' : 'https://tbr-exchange-backend.onrender.com';

    let isBalanceHidden = false;
    let actualBalance = localStorage.getItem("user_balance_val") || "0.00";
    const balanceValEl = document.getElementById('user-balance');

    function getIdentity() {
        let t = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
        let email = localStorage.getItem('userEmail') || localStorage.getItem('email') || '';
        let userId = localStorage.getItem('userId') || localStorage.getItem('tbr_resolved_uid') || '';
        return { token: t.replace(/^Bearer\s+/i, '').trim(), email: email.trim(), userId: userId.trim() };
    }

    // የባላንስ መደበቂያ
    const balanceEyeBtn = document.getElementById('balance-eye-btn');
    if (balanceEyeBtn && balanceValEl) {
        balanceEyeBtn.addEventListener('click', () => {
            isBalanceHidden = !isBalanceHidden;
            if (isBalanceHidden) {
                balanceValEl.innerText = '******';
                balanceEyeBtn.classList.replace('fa-eye', 'fa-eye-slash');
            } else {
                balanceValEl.innerText = actualBalance;
                balanceEyeBtn.classList.replace('fa-eye-slash', 'fa-eye');
                if (!balanceEyeBtn.classList.contains('fa-eye')) balanceEyeBtn.classList.add('fa-eye');
            }
        });
    }

    // Profile Dropdown
    const profileBtn = document.getElementById('profile-icon-btn');
    const profileMenu = document.getElementById('profile-dropdown-menu');
    if (profileBtn && profileMenu) {
        profileBtn.addEventListener('click', (e) => { e.stopPropagation(); profileMenu.classList.toggle('active'); });
        profileMenu.addEventListener('click', (e) => e.stopPropagation());
        window.addEventListener('click', () => { if (profileMenu.classList.contains('active')) profileMenu.classList.remove('active'); });
    }

    // Sign Out
    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', (e) => {
            e.preventDefault(); localStorage.clear(); window.location.href = 'signin.html';
        });
    }

    // 🔴 1. Dashboard UI ማስተካከያ 🔴
    function updateDashboardUI() {
        const userEmail = localStorage.getItem('userEmail') || localStorage.getItem('email') || 'User';
        const kycStatus = (localStorage.getItem('kycStatus') || 'not_submitted').toLowerCase();
        const isVerified = (kycStatus === 'verified' || kycStatus === 'approved' || kycStatus === 'true');
        const emailPrefix = userEmail.includes('@') ? userEmail.split('@')[0] : userEmail;

        let storedName = localStorage.getItem('kycFullName') || localStorage.getItem('fullName') || localStorage.getItem('userName') || '';
        let rawName = (isVerified && storedName) ? storedName : emailPrefix;
        
        ['firstName', 'fullName', 'kycFullName', 'userName', 'name'].forEach(k => {
            const val = (localStorage.getItem(k) || '').trim().toLowerCase();
            if (val === 'yimam') localStorage.removeItem(k);
        });

        const firstWord = (isVerified ? rawName.split(/\s+/)[0] : emailPrefix).toUpperCase();

        const hour = new Date().getHours();
        let timeGreeting = hour < 12 ? "MORNING" : hour < 17 ? "AFTERNOON" : "EVENING";

        const greetingEl = document.getElementById('userGreeting');
        if (greetingEl) greetingEl.innerHTML = `${timeGreeting}, <span class="user-name" style="color: #fff; font-weight: 600;">${firstWord}</span>`;

        const menuUserName = document.getElementById('menuUserName');
        if (menuUserName) menuUserName.innerText = rawName.toUpperCase();
        const menuUserEmail = document.getElementById('menuUserEmail');
        if (menuUserEmail) menuUserEmail.innerText = userEmail;

        const badgeEl = document.getElementById('headerKycBadge');
        if (badgeEl) {
            badgeEl.className = 'nav-kyc-badge';
            if (kycStatus === 'not_submitted' || kycStatus === 'unverified') {
                badgeEl.classList.add('unverified'); badgeEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Unverified`;
            } else if (kycStatus === 'pending' || kycStatus === 'under_review') {
                badgeEl.classList.add('pending'); badgeEl.innerHTML = `<i class="fa-solid fa-clock"></i> Under Review`;
            } else if (isVerified) {
                badgeEl.classList.add('approved'); badgeEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Verified`;
            } else {
                badgeEl.classList.add('unverified'); badgeEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Unverified`;
            }
        }
    }

    // 🔴 2. ዳታ ከባክኤንድ ማምጣት (Profile & Balance) 🔴
    async function syncWithServer() {
        try {
            const { token, email, userId } = getIdentity();
            if (!token) return;

            const params = new URLSearchParams();
            if (email) params.set('email', email);
            if (userId) params.set('userId', userId);
            
            const res = await fetch(`${API_BASE_URL}/api/user/profile?${params.toString()}`, { 
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (res.ok) {
                const data = await res.json(); 
                const userObj = data.user || data.data || data;
                if (userObj) {
                    if (userObj._id) localStorage.setItem('userId', String(userObj._id));
                    if (userObj.email) localStorage.setItem('userEmail', userObj.email);
                    if (userObj.fullName || userObj.name) {
                        localStorage.setItem('userName', userObj.fullName || userObj.name);
                        localStorage.setItem('kycFullName', userObj.fullName || userObj.name);
                    }
                    if (userObj.kycStatus) localStorage.setItem('kycStatus', userObj.kycStatus);
                    if (userObj.bscAddress) localStorage.setItem('user_bsc_address', userObj.bscAddress);
                    
                    if (userObj.balance !== undefined && userObj.balance !== null) {
                        actualBalance = Number(userObj.balance).toFixed(2);
                        localStorage.setItem("user_balance_val", actualBalance); 
                        if (!isBalanceHidden && balanceValEl) balanceValEl.innerText = actualBalance;
                    }
                }
            }
        } catch (e) { console.error('Profile sync error:', e); }
        updateDashboardUI(); 
    }

    // 🔴 3. የተቆለፈ (On Market) ባላንስ ማምጣት 🔴
    async function fetchMyAdsBalance() {
        try {
            const { token, email, userId } = getIdentity();
            if(!token) return;

            const params = new URLSearchParams();
            if (email) params.set('email', email);
            if (userId) params.set('userId', userId);

            const res = await fetch(`${API_BASE_URL}/api/ads/my?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (res.ok) {
                const json = await res.json();
                let totalLocked = 0;
                
                if (json.success && json.ads) {
                    json.ads.forEach(ad => {
                        if (ad.tradeType === 'sell' && ad.status === 'active') totalLocked += Number(ad.totalAmount);
                    });
                }

                const onMarketContainer = document.getElementById('on-market-container');
                const onMarketPlaceholder = document.getElementById('on-market-placeholder');
                const displayLocked = document.getElementById('display-locked-balance');

                if (totalLocked > 0) {
                    if(displayLocked) displayLocked.innerText = `${totalLocked.toFixed(2)} USDT`;
                    if(onMarketContainer) onMarketContainer.style.display = 'flex';
                    if(onMarketPlaceholder) onMarketPlaceholder.style.display = 'none';
                } else {
                    if(onMarketContainer) onMarketContainer.style.display = 'none';
                    if(onMarketPlaceholder) onMarketPlaceholder.style.display = 'block';
                }
            }
        } catch (error) { console.error("Ads balance error:", error); }
    }

    // 🔴 4. የገበያ (Market) ዋጋ ማምጣት 🔴
    async function loadLiveMarketRates() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/ads`);
            if (res.ok) {
                const json = await res.json();
                if (json.success && json.ads && json.ads.length > 0) {
                    let totalRate = 0, count = 0, bestBuy = 0, bestSell = 999999; 
                    
                    json.ads.forEach(ad => {
                        if (ad.status === 'active') {
                            totalRate += ad.price; count++;
                            if (ad.tradeType === 'sell' && ad.price < bestSell) bestSell = ad.price;
                            else if (ad.tradeType === 'buy' && ad.price > bestBuy) bestBuy = ad.price;
                        }
                    });

                    if (count > 0) {
                        const liveVal = document.getElementById('liveRateValue');
                        if(liveVal) liveVal.innerText = `${(totalRate / count).toFixed(2)}`;
                    }
                    const bBuy = document.getElementById('bestBuyValue');
                    const bSell = document.getElementById('bestSellValue');
                    if (bestBuy > 0 && bBuy) bBuy.innerText = `${bestBuy.toFixed(2)} ETB`;
                    if (bestSell < 999999 && bSell) bSell.innerText = `${bestSell.toFixed(2)} ETB`;
                }
            }
        } catch(e) { console.error("Market rate error:", e); }
    }

    // 🔴 5. Active Trade Alert Banner 🔴
    function createBannerIfMissing() {
        let banner = document.getElementById('dashboardActiveTradeBanner');
        if (banner) return banner;
        banner = document.createElement('a');
        banner.id = 'dashboardActiveTradeBanner';
        banner.className = 'active-trade-alert-banner';
        banner.href = 'trades.html';
        banner.innerHTML = `<div class="atb-left"><span class="atb-pulse-dot"></span><span id="dashboardActiveTradeText">1 trade awaiting you for action</span></div><div class="atb-right"><span id="dashboardActiveTradeNum">Open Trade</span><i class="fa-solid fa-arrow-right" style="font-size: 11px;"></i></div>`;
        const mainContainer = document.querySelector('.container');
        if (mainContainer) mainContainer.prepend(banner);
        return banner;
    }

    async function checkActiveTradesForUser() {
        const { token, email, userId } = getIdentity();
        if (!token) return;
        try {
            const params = new URLSearchParams();
            if (email) params.set('email', email);
            if (userId) params.set('userId', userId);

            const res = await fetch(`${API_BASE_URL}/api/user/active-trades?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const json = await res.json();
                const banner = createBannerIfMissing();
                if (json.success && json.count > 0 && json.latestTrade) {
                    const trade = json.latestTrade;
                    const tradeNum = String(trade.tradeNumber || '00001').padStart(5, '0');
                    const isBuyer = json.currentUserId && String(trade.buyerId) === String(json.currentUserId);
                    
                    document.getElementById('dashboardActiveTradeText').innerText = json.count === 1 ? `1 trade awaiting you (${isBuyer ? 'Buyer' : 'Seller'}) — Click to action` : `${json.count} trades awaiting you — Click to view`;
                    document.getElementById('dashboardActiveTradeNum').innerText = `Trade #${tradeNum}`;
                    banner.href = `trades.html?tradeId=${trade._id}`;
                    banner.style.display = 'flex';
                } else {
                    banner.style.display = 'none';
                }
            }
        } catch (e) {}
    }

    // ዳታዎችን የማምጣት ትዕዛዝ
    if (!isBalanceHidden && balanceValEl) balanceValEl.innerText = actualBalance;
    updateDashboardUI();
    syncWithServer();
    fetchMyAdsBalance();
    loadLiveMarketRates();
    checkActiveTradesForUser();
});