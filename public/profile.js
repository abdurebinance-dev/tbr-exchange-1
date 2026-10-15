document.addEventListener("DOMContentLoaded", () => {
    // 1. መግቢያ (Auth) መኖሩን ማረጋገጥ
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    if (!token) {
        window.location.replace("signin.html");
        return;
    }

    const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:5000'
        : 'https://tbr-exchange-backend.onrender.com';

    // 2. ፕሮፋይል ፎቶ (Avatar) ማምጫ
    function resolveProfileAvatarUrl(raw) {
        if (!raw || raw === 'null' || raw === 'undefined') return '';
        let str = String(raw).trim();
        if (!str) return '';
        if (str.startsWith('data:image')) return str;
        if (str.startsWith('/')) str = `${API_BASE}${str}`;
        if (str.includes('/api/user-avatar/')) {
            const sep = str.includes('?') ? '&' : '?';
            return `${str}${sep}t=${Date.now()}`;
        }
        return str;
    }

    // 3. User ID ኮፒ ማድረጊያ
    const copyIdBtn = document.getElementById('copyIdBtn');
    if (copyIdBtn) {
        copyIdBtn.addEventListener('click', () => {
            const userIdText = document.getElementById('userUniqueId').innerText;
            if (!userIdText || userIdText.includes('Loading') || !userIdText.startsWith('TBR-')) return;
            
            navigator.clipboard.writeText(userIdText).then(() => {
                const copyTextSpan = document.getElementById('copyText');
                if (copyTextSpan) {
                    copyTextSpan.innerText = 'Copied!';
                    copyTextSpan.style.color = '#00C087';
                    setTimeout(() => {
                        copyTextSpan.innerText = 'Copy';
                        copyTextSpan.style.color = '#848e9c';
                    }, 2000);
                }
            }).catch(err => {
                console.error('Failed to copy text: ', err);
            });
        });
    }

    // 4. የተጠቃሚ ID ማምጫ
    function getStoredId() {
        let tbrId = localStorage.getItem('tbrId') || localStorage.getItem('tbrExchangeId');
        if (tbrId && String(tbrId).startsWith('TBR-')) {
            return tbrId;
        }
        try {
            const tkn = localStorage.getItem('token') || localStorage.getItem('authToken');
            if (tkn && tkn.includes('.')) {
                const base64Url = tkn.split('.')[1];
                const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
                const payload = JSON.parse(window.atob(base64));
                let extractedId = payload.tbrId || payload.userId || payload.customId || payload.id;
                if (payload.numericId) {
                    extractedId = 'TBR-' + String(payload.numericId).padStart(6, '0');
                } else if (extractedId && !String(extractedId).startsWith('TBR-') && /^\d+$/.test(extractedId)) {
                    extractedId = 'TBR-' + String(extractedId).padStart(6, '0');
                }
                if (extractedId && String(extractedId).startsWith('TBR-')) {
                    localStorage.setItem('tbrId', extractedId);
                    return extractedId;
                }
            }
        } catch (e) {}
        return ''; 
    }

    // 5. የ Profile UI ማስተካከያ
    function updateProfileUI() {
        const email = localStorage.getItem('userEmail') || localStorage.getItem('email') || "";
        const emailPrefix = email ? email.split('@')[0] : "USER";
        const kycStatus = String(localStorage.getItem('kycStatus') || 'not_submitted').toLowerCase();
        const rejectionReason = localStorage.getItem('kycRejectionReason') || 'Document check failed';

        const verifiedFullName = (
            localStorage.getItem('kycFullName') ||
            localStorage.getItem('fullName') ||
            localStorage.getItem('userName') ||
            ''
        ).trim();

        const isVerified = (kycStatus === 'approved' || kycStatus === 'verified');
        const displayName = (isVerified && verifiedFullName) ? verifiedFullName : emailPrefix;
        const userId = getStoredId();
        const savedAvatar = resolveProfileAvatarUrl(
            localStorage.getItem('userAvatar') || localStorage.getItem('profilePicture') || localStorage.getItem('profilePic')
        );
        
        let totalTrades = localStorage.getItem('totalTrades') || '0';
        let volume = localStorage.getItem('volume') || '0 USDT';
        let completionRate = localStorage.getItem('completionRate') || '0%';
        let reputation = localStorage.getItem('reputation') || '0%';

        if (totalTrades === 'undefined') totalTrades = '0';
        if (volume === 'undefined') volume = '0 USDT';
        if (completionRate === 'undefined') completionRate = '0%';
        if (reputation === 'undefined') reputation = '0%';

        const is2FA = localStorage.getItem('is2FA') === 'true' || localStorage.getItem('twoFactorEnabled') === 'true';
        const memberSince = localStorage.getItem('memberSince') || '2026';

        const els = {
            email: document.getElementById('profileEmail'),
            userId: document.getElementById('userUniqueId'),
            statTrades: document.getElementById('statTotalTrades'),
            statVolume: document.getElementById('statVolume'),
            statCompletion: document.getElementById('statCompletionRate'),
            statReputation: document.getElementById('statReputation'),
            memberSince: document.getElementById('memberSince'),
            twoFactor: document.getElementById('twoFactorStatus'),
            avatar: document.getElementById('avatarInitial'),
            name: document.getElementById('profileName'),
            kycStatusText: document.getElementById('kycStatusRowText'),
            bannerContainer: document.getElementById('kycBannerContainer'),
            bannerTitle: document.getElementById('kycBannerTitle'),
            bannerDesc: document.getElementById('kycBannerDesc'),
            bannerAction: document.getElementById('kycBannerAction')
        };

        if(els.email) els.email.innerText = email;
        if(els.userId) els.userId.innerText = userId;
        if(els.statTrades) els.statTrades.innerText = totalTrades;
        if(els.statVolume) els.statVolume.innerText = volume;
        if(els.statCompletion) els.statCompletion.innerText = completionRate;
        if(els.statReputation) els.statReputation.innerText = reputation;
        if(els.memberSince) els.memberSince.innerText = memberSince;

        if(els.twoFactor) {
            if (is2FA) {
                els.twoFactor.innerText = 'Enabled';
                els.twoFactor.style.color = '#00C087';
            } else {
                els.twoFactor.innerText = 'Disabled';
                els.twoFactor.style.color = '#f6465d';
            }
        }

        if(els.avatar) {
            if (savedAvatar) {
                els.avatar.style.backgroundImage = `url('${savedAvatar}')`;
                els.avatar.style.backgroundSize = "cover";
                els.avatar.style.backgroundPosition = "center";
                els.avatar.innerText = "";
            } else {
                els.avatar.style.backgroundImage = "none";
                els.avatar.innerText = String(displayName).charAt(0).toUpperCase();
            }
        }

        if (!els.name) return;

        if (kycStatus === 'not_submitted' || kycStatus === 'unverified') {
            els.name.innerHTML = emailPrefix.toUpperCase();
            els.kycStatusText.innerHTML = `<a href="kyc-verify.html" style="color: #f6465d; text-decoration: none;">Not Submitted <i class="fa-solid fa-chevron-right" style="font-size: 10px;"></i></a>`;
            els.bannerContainer.style.borderColor = '#f6465d';
            els.bannerContainer.style.background = 'rgba(246, 70, 93, 0.05)';
            els.bannerTitle.innerText = "Identity not verified";
            els.bannerTitle.style.color = "#f6465d";
            els.bannerDesc.innerText = "Verify your ID to post ads and unlock 10× higher limits.";
            els.bannerAction.innerHTML = `<a href="kyc-verify.html" class="verify-btn" style="background:#f6465d; color:#fff;">VERIFY IDENTITY</a>`;
        } 
        else if (kycStatus === 'pending' || kycStatus === 'under_review') {
            els.name.innerHTML = emailPrefix.toUpperCase();
            els.kycStatusText.innerHTML = `<span style="color: #f3ba2f; font-weight: 500;">Under Review</span>`;
            els.bannerContainer.style.borderColor = '#f3ba2f';
            els.bannerContainer.style.background = 'rgba(243, 186, 47, 0.05)';
            els.bannerTitle.innerText = "Under Review";
            els.bannerTitle.style.color = "#f3ba2f";
            els.bannerDesc.innerText = "You are under review. Please wait for admin verification. Action disabled.";
            els.bannerAction.innerHTML = `<span style="color:#f3ba2f; font-size:13px; font-weight:500;">Under Review</span>`;
        } 
        else if (isVerified) {
            els.name.innerHTML = `${displayName.toUpperCase()} <span style="display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; background: #0ecb81; color: #fff; border-radius: 50%; font-size: 10px; margin-left: 8px;" title="Verified"><i class="fa-solid fa-check"></i></span>`;
            els.kycStatusText.innerHTML = `<span style="color: #0ecb81; font-weight: 600;">Verified <i class="fa-solid fa-circle-check"></i></span>`;
            els.bannerContainer.style.borderColor = '#0ecb81';
            els.bannerContainer.style.background = 'rgba(14, 203, 129, 0.05)';
            els.bannerTitle.innerText = "Approved";
            els.bannerTitle.style.color = "#0ecb81";
            els.bannerDesc.innerText = "Your identity verification is approved. Full access unlocked.";
            els.bannerAction.innerHTML = "";
        } 
        else if (kycStatus === 'rejected') {
            els.name.innerHTML = emailPrefix.toUpperCase();
            els.kycStatusText.innerHTML = `<a href="kyc-verify.html" style="color: #f6465d; text-decoration: none;">Rejected (Resubmit) <i class="fa-solid fa-chevron-right" style="font-size: 10px;"></i></a>`;
            els.bannerContainer.style.borderColor = '#f6465d';
            els.bannerContainer.style.background = 'rgba(246, 70, 93, 0.05)';
            els.bannerTitle.innerText = "Rejected";
            els.bannerTitle.style.color = "#f6465d";
            els.bannerDesc.innerText = `Reason: ${rejectionReason}`;
            els.bannerAction.innerHTML = `<a href="kyc-verify.html" class="verify-btn" style="background:#f6465d; color:#fff;">Resubmit ID</a>`;
        }
    }

    // 6. ዳታ ከባክኤንድ ማምጣት
    async function fetchFallbackStats() {
        try {
            const res = await fetch(`${API_BASE}/api/ads?t=${Date.now()}`);
            if (res.ok) {
                const json = await res.json();
                const ads = json.ads || [];
                const email = localStorage.getItem('userEmail') || '';
                const myId = getStoredId() || '';
                
                const myAd = ads.find(ad => 
                    (email && ad.email === email) || 
                    (myId && ad.tbrId === myId) || 
                    (myId && ad.userId === myId)
                );

                if (myAd) {
                    const tTrades = myAd.totalTrades ?? myAd.tradesCount ?? myAd.ordersCount ?? 0;
                    let cRate = myAd.completionRate || '0%';
                    if (!String(cRate).includes('%')) cRate += '%';

                    const statTotal = document.getElementById('statTotalTrades');
                    const statComp = document.getElementById('statCompletionRate');
                    
                    if(statTotal) statTotal.innerText = tTrades;
                    if(statComp) statComp.innerText = cRate;
                    
                    localStorage.setItem('totalTrades', String(tTrades));
                    localStorage.setItem('completionRate', cRate);
                }
            }
        } catch (e) {}
    }

    async function syncWithServer() {
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('authToken');
            if (!token) return;

            const response = await fetch(`${API_BASE}/api/user/profile?t=${Date.now()}`, {
                method: 'GET',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                cache: 'no-store'
            });
            
            if (response.ok) {
                const data = await response.json();
                const user = data.user || data.data || data;
                
                if (user) {
                    if (user.email) localStorage.setItem('userEmail', user.email);
                    if (user.kycStatus) localStorage.setItem('kycStatus', user.kycStatus);
                    if (user.kycRejectionReason) localStorage.setItem('kycRejectionReason', user.kycRejectionReason);

                    const fullKycName = (user.kycFullName || user.fullName || user.name || '').trim();
                    if (fullKycName) {
                        localStorage.setItem('fullName', fullKycName);
                        localStorage.setItem('kycFullName', fullKycName);
                        localStorage.setItem('userName', fullKycName);
                    }
                    if (user.firstName) localStorage.setItem('firstName', user.firstName);

                    let tTrades = 0, cRate = "0%", vol = "0 USDT", rep = "0%";
                    if (user.stats) {
                        tTrades = user.stats.totalTrades ?? user.stats.tradesCount ?? 0;
                        cRate = user.stats.completionRate ?? "0%";
                        vol = user.stats.volume ?? "0 USDT";
                        rep = user.stats.reputation ?? "0%";
                    } else {
                        tTrades = user.totalTrades ?? user.tradesCount ?? user.ordersCount ?? 0;
                        cRate = user.completionRate ?? user.lifetimeRate ?? "0%";
                        vol = user.volume ?? user.totalVolume ?? user.tradeVolume ?? "0 USDT";
                        rep = user.reputation ?? "0%";
                    }

                    const formattedCRate = String(cRate).includes('%') ? cRate : `${cRate}%`;
                    const formattedVol = String(vol).includes('USDT') ? vol : `${vol} USDT`;
                    const formattedRep = String(rep).includes('%') ? rep : `${rep}%`;

                    localStorage.setItem('totalTrades', String(tTrades));
                    localStorage.setItem('completionRate', formattedCRate);
                    localStorage.setItem('volume', formattedVol);
                    localStorage.setItem('reputation', formattedRep);

                    if (user.createdAt) {
                        const year = String(new Date(user.createdAt).getFullYear());
                        localStorage.setItem('memberSince', year);
                    }

                    let newId = "";
                    if (user.numericId) newId = 'TBR-' + String(user.numericId).padStart(6, '0');
                    else if (user.tbrId && String(user.tbrId).startsWith('TBR-')) newId = user.tbrId;
                    else if (user.userId && String(user.userId).startsWith('TBR-')) newId = user.userId;

                    if (newId !== "") {
                        localStorage.setItem('tbrId', newId);
                        localStorage.setItem('tbrExchangeId', newId);
                    }
                    
                    if (user.avatar && user.avatar !== 'null' && user.avatar.trim() !== '') {
                        const fullAvUrl = resolveProfileAvatarUrl(user.avatar);
                        localStorage.setItem('userAvatar', fullAvUrl);
                        localStorage.setItem('profilePicture', fullAvUrl);
                    }

                    updateProfileUI(); 
                    if (tTrades == 0) fetchFallbackStats();
                }
            }
        } catch (e) {}
    }

    window.addEventListener('pageshow', () => {
        updateProfileUI();
        syncWithServer();
    });

    localStorage.removeItem('completionRate');
    localStorage.removeItem('reputation');
    
    updateProfileUI();
    syncWithServer();
});