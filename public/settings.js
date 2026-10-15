// =========================================================
// 🔴 SETTINGS PAGE LOGIC (settings.js) 🔴
// =========================================================

const API_BASE_URL = window.location.hostname.includes('localhost') 
    ? '' 
    : 'https://tbr-exchange-backend.onrender.com';

let currentField = "";
let paymentMethods = [];
let editingPaymentId = null;

// ==========================================
// 🔴 1. GLOBAL FUNCTIONS 🔴
// ==========================================
window.showCenterNotification = function(title, message, isSuccess = true) {
    const modal = document.getElementById('centerNotifyModal');
    const icon = document.getElementById('notifyIcon');
    const titleEl = document.getElementById('notifyTitle');
    const descEl = document.getElementById('notifyDesc');
    if(!modal || !titleEl || !descEl) return;

    titleEl.innerText = title;
    descEl.innerHTML = message;
    if (icon) {
        icon.innerHTML = isSuccess 
            ? '<i class="fa-solid fa-circle-check" style="color: var(--green-color);"></i>'
            : '<i class="fa-solid fa-triangle-exclamation" style="color: var(--red-color);"></i>';
    }
    modal.style.display = 'flex';
};

window.closeCenterNotification = function() {
    const m = document.getElementById('centerNotifyModal');
    if(m) m.style.display = 'none';
};

window.showToast = function(message) {
    const toast = document.getElementById("toastNotification");
    const msgEl = document.getElementById("toastMessage");
    if (!toast || !msgEl) return;
    
    msgEl.innerText = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
};

// ==========================================
// 🔴 2. INITIALIZATION (ፔጁ ሲከፈት የሚሰራ) 🔴
// ==========================================
document.addEventListener("DOMContentLoaded", async function() {
    // 1. መግቢያ (Auth) ማረጋገጥ
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    if (!token) {
        window.location.replace("signin.html");
        return;
    }

    // 🔴 ሞዳል ፈንክሽኖች (HTML ን ካገኘ በኋላ ብቻ ይሰራል) 🔴
    window.openModal = function(field) {
        currentField = field;
        const modal = document.getElementById("customModal");
        const title = document.getElementById("modalTitle");
        const input = document.getElementById("modalInput");
        if (!modal || !input) return;

        modal.style.display = "flex";
        input.oninput = null; 

        if(field === 'phone') {
            const phoneDisplay = document.getElementById("phone-display");
            let existingPhone = (phoneDisplay && phoneDisplay.innerText !== 'Not added') ? phoneDisplay.innerText : "";
            input.value = existingPhone.replace(/@/g, ''); 
            title.innerText = "Add/Edit Phone Number";
            input.placeholder = "e.g. +251911223344";
        } else if(field === 'username') {
            title.innerText = "Set Trader Username";
            input.placeholder = "Enter handle...";
            const usernameDisplay = document.getElementById("username-display");
            let existingHandle = (usernameDisplay && usernameDisplay.innerText !== 'Not set — tap to choose your handle') ? usernameDisplay.innerText : "@";
            if (!existingHandle.startsWith('@')) existingHandle = '@' + existingHandle;
            input.value = existingHandle;
            input.oninput = function() {
                if (!input.value.startsWith('@')) input.value = '@' + input.value.replace(/@/g, '');
            };
        } else if(field === 'name') {
            const profileName = document.getElementById("profile-name");
            input.value = profileName ? profileName.innerText.trim() : "";
            title.innerText = "Edit Profile Name";
        }
        input.focus();
    };

    window.closeModal = function() {
        const modal = document.getElementById("customModal");
        if (modal) modal.style.display = "none";
    };

    window.saveModalData = async function() {
        const modalInput = document.getElementById("modalInput");
        if (!modalInput) return;
        const val = modalInput.value.trim();
        if (!val) return;

        let finalVal = val;
        let apiField = currentField;

        if (currentField === 'phone') {
            const phoneDisplay = document.getElementById("phone-display");
            if (phoneDisplay) phoneDisplay.innerText = val;
            localStorage.setItem("userPhone", val);
            apiField = "phoneNumber"; 
        } else if (currentField === 'username') {
            if (!finalVal.startsWith('@')) finalVal = '@' + finalVal;
            const usernameDisplay = document.getElementById("username-display");
            if (usernameDisplay) usernameDisplay.innerText = finalVal;
            localStorage.setItem("traderUsername", finalVal);
            apiField = "traderUsername"; 
        } else if (currentField === 'name') {
            localStorage.setItem("userName", val);
            const profileName = document.getElementById("profile-name");
            if (profileName) profileName.innerHTML = `${val} <i class="fa-solid fa-pen edit-icon" onclick="window.openModal('name')"></i>`;
            apiField = "fullName";
        }
        
        window.showToast("Profile updated successfully!");

        try {
            const tokenToUse = localStorage.getItem("token") || localStorage.getItem("authToken");
            const dataToSend = (currentField === 'username') ? finalVal : val;
            await fetch(`${API_BASE_URL}/api/user/update`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tokenToUse}` },
                body: JSON.stringify({ field: apiField, value: dataToSend })
            });
        } catch (e) { console.error("Sync update error:", e); }

        window.closeModal();
    };

    window.copyId = function() {
        const profileId = document.getElementById("profile-id");
        if (profileId && profileId.innerText !== 'Loading...') {
            navigator.clipboard.writeText(profileId.innerText);
            window.showToast("Account ID copied to clipboard!");
        }
    };

    window.triggerImageUpload = function() {
        const fileInput = document.getElementById("profileImageInput");
        if (fileInput) fileInput.click();
    };

    window.handleImageUpload = function(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const base64Image = e.target.result;
            const avatarBox = document.getElementById("avatar-initials");
            if (avatarBox) {
                avatarBox.style.backgroundImage = `url('${base64Image}')`;
                avatarBox.style.backgroundSize = "cover";
                avatarBox.style.backgroundPosition = "center";
                avatarBox.innerHTML = `<div class="camera-badge"><i class="fa-solid fa-camera"></i></div>`;
            }
            window.showToast("Profile picture updated successfully!");
            localStorage.setItem("userAvatar", base64Image);
            
            const tokenToUse = localStorage.getItem("token") || localStorage.getItem("authToken");
            fetch(`${API_BASE_URL}/api/user/update`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tokenToUse}` },
                body: JSON.stringify({ field: "avatar", value: base64Image })
            }).catch(e => console.error(e));
        };
        reader.readAsDataURL(file);
    };

    // 🚀 Tab Switcher 🚀
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const target = btn.getAttribute('data-tab');
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = 'none';
            });

            const targetSection = document.getElementById(target + '-section');
            if (targetSection) targetSection.style.display = 'block';
        });
    });

    const urlParams = new URLSearchParams(window.location.search);
    const activeTab = urlParams.get('tab');
    if (activeTab) {
        const targetBtn = document.querySelector(`.tab-btn[data-tab="${activeTab}"]`);
        if (targetBtn) setTimeout(() => targetBtn.click(), 50);
    }

    function getStoredId() {
        let tbrId = localStorage.getItem('tbrId') || localStorage.getItem('tbrExchangeId');
        if (tbrId && String(tbrId).startsWith('TBR-')) return tbrId;
        try {
            if (token && token.includes('.')) {
                const base64Url = token.split('.')[1];
                const payload = JSON.parse(window.atob(base64Url.replace(/-/g, '+').replace(/_/g, '/')));
                let exId = payload.tbrId || payload.userId || payload.numericId;
                if (exId) {
                    let formatted = 'TBR-' + String(exId).replace('TBR-', '').padStart(6, '0');
                    localStorage.setItem('tbrId', formatted);
                    return formatted;
                }
            }
        } catch (e) {}
        return ''; 
    }

    function updateUI(user) {
        const nameEl = document.getElementById("profile-name");
        if (nameEl) nameEl.innerHTML = `${user.username || 'User'} <i class="fa-solid fa-pen edit-icon" onclick="window.openModal('name')"></i>`;
        
        const emailEl = document.getElementById("profile-email");
        if (emailEl) emailEl.innerText = user.email || '';
        
        const idEl = document.getElementById("profile-id");
        if (idEl) idEl.innerText = user.tbrId || getStoredId();
        
        const avatarBox = document.getElementById("avatar-initials");
        if (avatarBox) {
            if (user.avatar && user.avatar.trim() !== "" && user.avatar !== 'null' && user.avatar !== 'undefined') {
                avatarBox.style.backgroundImage = `url('${user.avatar}')`;
                avatarBox.style.backgroundSize = "cover";
                avatarBox.style.backgroundPosition = "center";
                avatarBox.innerHTML = `<div class="camera-badge"><i class="fa-solid fa-camera"></i></div>`;
            } else {
                avatarBox.style.backgroundImage = "none";
                const initials = user.username ? user.username.substring(0,2).toUpperCase() : "UI";
                avatarBox.innerHTML = `${initials} <div class="camera-badge"><i class="fa-solid fa-camera"></i></div>`;
            }
        }

        const phoneDisplay = document.getElementById("phone-display");
        if (phoneDisplay) phoneDisplay.innerText = user.phone || 'Not added';

        const usernameDisplay = document.getElementById("username-display");
        if (usernameDisplay) usernameDisplay.innerText = user.traderHandle || 'Not set — tap to choose your handle';

        const kycBadge = document.getElementById('kyc-badge');
        if (kycBadge) {
            let status = String(user.kycStatus || 'approved').toLowerCase();
            if (status === 'approved' || status === 'verified' || status === 'true') {
                kycBadge.innerHTML = '<i class="fa-solid fa-check"></i> Verified';
                kycBadge.className = 'badge-verified';
            } else {
                kycBadge.innerHTML = '<i class="fa-solid fa-clock"></i> Unverified';
                kycBadge.className = 'badge-unverified';
            }
        }
    }

    function loadFromLocalStorageFallback() {
        const username = localStorage.getItem("userName") || localStorage.getItem("fullName") || "User";
        const email = localStorage.getItem("userEmail") || "";
        let tbrId = getStoredId();
        const phone = localStorage.getItem("userPhone") || "";
        const traderHandle = localStorage.getItem("traderUsername") || "";
        const kycStatus = localStorage.getItem("kycStatus") || "approved";
        const avatar = localStorage.getItem("userAvatar") || "";
        updateUI({ username, email, tbrId, phone, traderHandle, kycStatus, avatar });
    }

    // Load initial data
    loadFromLocalStorageFallback();

    // Fetch from Backend
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/profile?t=${Date.now()}`, {
            method: "GET",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
        });

        if (response.ok) {
            const result = await response.json();
            const userData = result.user || result;
            
            const username = userData.fullName || userData.username || userData.name || localStorage.getItem("userName") || "User";
            const email = userData.email || localStorage.getItem("userEmail") || "";
            
            let newId = userData.tbrId || userData.userId || userData.customId || userData.id || userData._id || "";
            if (userData.numericId && (!newId.startsWith('TBR-'))) newId = 'TBR-' + String(userData.numericId).padStart(6, '0');

            const phone = userData.phoneNumber || userData.phone || "";
            const traderHandle = userData.traderUsername || "";
            const kycVal = userData.kycStatus || 'approved';

            let serverAvatar = userData.avatar || userData.profilePicture;
            let finalAvatar = localStorage.getItem("userAvatar") || "";
            if (serverAvatar && serverAvatar !== 'null' && serverAvatar !== 'undefined' && serverAvatar.trim() !== "") {
                finalAvatar = serverAvatar;
            }

            if (newId !== "") {
                localStorage.setItem("tbrId", newId);
                localStorage.setItem("tbrExchangeId", newId);
            }
            localStorage.setItem("kycStatus", kycVal);
            if (username) localStorage.setItem("userName", username);
            if (email) localStorage.setItem("userEmail", email);
            if (phone) localStorage.setItem("userPhone", phone);
            if (traderHandle) localStorage.setItem("traderUsername", traderHandle);
            if (finalAvatar) localStorage.setItem("userAvatar", finalAvatar);

            updateUI({ username, email, tbrId: newId, phone, traderHandle, kycStatus: kycVal, avatar: finalAvatar });
        }
    } catch (error) {
        console.error("Network error during profile sync:", error);
    }
});