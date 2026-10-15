// =========================================================
// 🔴 SETTINGS PAGE LOGIC (100% BULLETPROOF) 🔴
// =========================================================

const API_BASE_URL = window.location.hostname.includes('localhost') 
    ? '' : 'https://tbr-exchange-backend.onrender.com';

// 1. MODAL FUNCTIONS
window.currentField = "";

window.openModal = function(field) {
    window.currentField = field;
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
        input.value = profileName ? profileName.innerText.replace(/<i.*/, '').trim() : "";
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
    let apiField = window.currentField;

    if (window.currentField === 'phone') {
        const phoneDisplay = document.getElementById("phone-display");
        if (phoneDisplay) phoneDisplay.innerText = val;
        localStorage.setItem("userPhone", val);
        apiField = "phoneNumber"; 
    } else if (window.currentField === 'username') {
        if (!finalVal.startsWith('@')) finalVal = '@' + finalVal;
        const usernameDisplay = document.getElementById("username-display");
        if (usernameDisplay) usernameDisplay.innerText = finalVal;
        localStorage.setItem("traderUsername", finalVal);
        apiField = "traderUsername"; 
    } else if (window.currentField === 'name') {
        localStorage.setItem("userName", val);
        const profileName = document.getElementById("profile-name");
        if (profileName) profileName.innerHTML = `${val} <i class="fa-solid fa-pen edit-icon"></i>`;
        apiField = "fullName";
    }
    
    window.showToast("Profile updated successfully!");
    window.closeModal();

    try {
        const token = localStorage.getItem("token") || localStorage.getItem("authToken");
        const dataToSend = (window.currentField === 'username') ? finalVal : val;
        await fetch(`${API_BASE_URL}/api/user/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ field: apiField, value: dataToSend })
        });
    } catch (e) { console.error("Sync update error:", e); }
};

window.showToast = function(message) {
    const toast = document.getElementById("toastNotification");
    const msgEl = document.getElementById("toastMessage");
    if (!toast || !msgEl) return;
    msgEl.innerText = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
};

// 2. 🔴 አዲሱ ኃይለኛ የ CLICK መቆጣጠሪያ (Event Delegation) 🔴
document.addEventListener("DOMContentLoaded", async function() {
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    if (!token) {
        window.location.replace("signin.html");
        return;
    }

    // HTML ውስጥ ምን ቢጻፍም ይህ ኮድ በግድ Click እንዲያደርጉ ያዛቸዋል!
    document.body.addEventListener('click', (e) => {
        // 1. ስም ማስተካከያ (Edit Name)
        if (e.target.closest('.edit-icon') && e.target.closest('#profile-name')) {
            e.preventDefault();
            window.openModal('name');
        }
        // 2. ስልክ እና ዩዘርኔም (Phone & Username Add/Edit Buttons)
        const actionLink = e.target.closest('.action-link');
        if (actionLink) {
            const parentRow = actionLink.closest('.info-row');
            if (parentRow) {
                const titleText = parentRow.querySelector('.info-title')?.innerText || '';
                if (titleText.includes('Phone')) {
                    e.preventDefault();
                    window.openModal('phone');
                } else if (titleText.includes('Username')) {
                    e.preventDefault();
                    window.openModal('username');
                }
            }
        }
        // 3. ID Copy
        if (e.target.closest('.fa-copy') && e.target.closest('.id-container')) {
            e.preventDefault();
            const profileId = document.getElementById("profile-id");
            if (profileId && profileId.innerText !== 'Loading...') {
                navigator.clipboard.writeText(profileId.innerText);
                window.showToast("Account ID copied to clipboard!");
            }
        }
        // 4. Modal Buttons
        if (e.target.closest('.btn-confirm')) {
            e.preventDefault();
            window.saveModalData();
        }
        if (e.target.closest('.btn-cancel')) {
            e.preventDefault();
            window.closeModal();
        }
    });

    // 🚀 Tab Switcher
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-tab');
            document.querySelectorAll('.content-section').forEach(section => section.style.display = 'none');
            const targetSection = document.getElementById(target + '-section');
            if (targetSection) targetSection.style.display = 'block';
        });
    });

    // 🚀 Data Loading
    function getStoredId() {
        let tbrId = localStorage.getItem('tbrId') || localStorage.getItem('tbrExchangeId');
        if (tbrId && String(tbrId).startsWith('TBR-')) return tbrId;
        return ''; 
    }

    function updateUI(user) {
        const nameEl = document.getElementById("profile-name");
        if (nameEl) nameEl.innerHTML = `${user.username || 'User'} <i class="fa-solid fa-pen edit-icon"></i>`;
        const emailEl = document.getElementById("profile-email");
        if (emailEl) emailEl.innerText = user.email || '';
        const idEl = document.getElementById("profile-id");
        if (idEl) idEl.innerText = user.tbrId || getStoredId();
        const phoneDisplay = document.getElementById("phone-display");
        if (phoneDisplay) phoneDisplay.innerText = user.phone || 'Not added';
        const usernameDisplay = document.getElementById("username-display");
        if (usernameDisplay) usernameDisplay.innerText = user.traderHandle || 'Not set — tap to choose your handle';
    }

    function loadFromLocalStorageFallback() {
        const username = localStorage.getItem("userName") || localStorage.getItem("fullName") || "User";
        const email = localStorage.getItem("userEmail") || "";
        let tbrId = getStoredId();
        const phone = localStorage.getItem("userPhone") || "";
        const traderHandle = localStorage.getItem("traderUsername") || "";
        updateUI({ username, email, tbrId, phone, traderHandle });
    }

    loadFromLocalStorageFallback();

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

            if (newId !== "") localStorage.setItem("tbrId", newId);
            if (username) localStorage.setItem("userName", username);
            if (email) localStorage.setItem("userEmail", email);
            if (phone) localStorage.setItem("userPhone", phone);
            if (traderHandle) localStorage.setItem("traderUsername", traderHandle);

            updateUI({ username, email, tbrId: newId, phone, traderHandle });
        }
    } catch (error) {
        console.error("Network error during profile sync:", error);
    }
});