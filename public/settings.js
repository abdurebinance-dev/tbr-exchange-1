const API_BASE_URL = window.location.hostname.includes('localhost') ? '' : 'https://tbr-exchange-backend.onrender.com';
let currentField = "";

function showToast(message) {
    const toast = document.getElementById("toastNotification");
    const msgEl = document.getElementById("toastMessage");
    if (!toast || !msgEl) return;
    msgEl.innerText = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
}

function openModal(field) {
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
        input.value = profileName ? profileName.innerText.replace(/<i.*/, '').trim() : "";
        title.innerText = "Edit Profile Name";
    }
    input.focus();
}

function closeModal() {
    const modal = document.getElementById("customModal");
    if (modal) modal.style.display = "none";
}

async function saveModalData() {
    const input = document.getElementById("modalInput");
    if (!input) return;
    const val = input.value.trim();
    if (!val) return;

    let finalVal = val;
    let apiField = currentField;

    if (currentField === 'phone') {
        const phoneDisplay = document.getElementById("phone-display");
        if(phoneDisplay) phoneDisplay.innerText = val;
        localStorage.setItem("userPhone", val);
        apiField = "phoneNumber"; 
    } else if (currentField === 'username') {
        if (!finalVal.startsWith('@')) finalVal = '@' + finalVal;
        const usernameDisplay = document.getElementById("username-display");
        if(usernameDisplay) usernameDisplay.innerText = finalVal;
        localStorage.setItem("traderUsername", finalVal);
        apiField = "traderUsername"; 
    } else if (currentField === 'name') {
        localStorage.setItem("userName", val);
        const profileName = document.getElementById("profile-name");
        if(profileName) profileName.innerHTML = `${val} <i class="fa-solid fa-pen edit-icon" id="edit-name-btn"></i>`;
        
        // Re-attach listener after innerHTML replace
        document.getElementById('edit-name-btn')?.addEventListener('click', () => openModal('name'));
        apiField = "fullName";
    }
    
    closeModal();
    showToast("Profile updated successfully!");

    try {
        const token = localStorage.getItem("token") || localStorage.getItem("authToken");
        await fetch(`${API_BASE_URL}/api/user/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ field: apiField, value: finalVal })
        });
    } catch (e) { console.error("Sync update error:", e); }
}

function copyId() {
    const profileId = document.getElementById("profile-id");
    if (profileId && profileId.innerText !== 'Loading...') {
        navigator.clipboard.writeText(profileId.innerText);
        showToast("Account ID copied to clipboard!");
    }
}

function triggerImageUpload() {
    const fileInput = document.getElementById("profileImageInput");
    if (fileInput) fileInput.click();
}

function handleImageUpload(event) {
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
        showToast("Profile picture updated successfully!");
        localStorage.setItem("userAvatar", base64Image);
        
        const token = localStorage.getItem("token") || localStorage.getItem("authToken");
        fetch(`${API_BASE_URL}/api/user/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ field: "avatar", value: base64Image })
        });
    };
    reader.readAsDataURL(file);
}

function toggleAddPaymentForm() {
    const form = document.getElementById("pm-add-form");
    if (form) form.style.display = form.style.display === "none" ? "block" : "none";
}

function handlePaymentTypeChange() {
    const group = document.getElementById("pm-account-number-group");
    if (group) group.style.display = "block";
}

function savePaymentMethod() {
    showToast("Payment method saved!");
    toggleAddPaymentForm();
}

// =========================================================
// 🚀 EVENT BINDINGS (Bypassing Server Security Rules) 🚀
// =========================================================
document.addEventListener("DOMContentLoaded", async function() {
    
    // Bind all buttons safely
    const bindSafe = (id, func) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', func);
    };

    bindSafe('avatar-initials', triggerImageUpload);
    document.getElementById('profileImageInput')?.addEventListener('change', handleImageUpload);
    
    bindSafe('edit-name-btn', () => openModal('name'));
    bindSafe('copy-id-btn', copyId);
    bindSafe('add-phone-btn', () => openModal('phone'));
    bindSafe('edit-username-btn', () => openModal('username'));
    bindSafe('add-passkey-btn', () => showToast("Requesting device biometric setup..."));
    
    bindSafe('pm-add-btn', toggleAddPaymentForm);
    document.getElementById('pm-type')?.addEventListener('change', handlePaymentTypeChange);
    bindSafe('pm-save-btn', savePaymentMethod);
    bindSafe('pm-cancel-btn', toggleAddPaymentForm);
    
    bindSafe('merchant-apply-btn', () => alert('Merchant application submitted successfully!'));
    
    bindSafe('center-notify-ok-btn', () => { document.getElementById("centerNotifyModal").style.display = "none"; });
    bindSafe('modal-cancel-btn', closeModal);
    bindSafe('modal-save-btn', saveModalData);
    bindSafe('delete-cancel-btn', () => { document.getElementById("deleteConfirmModal").style.display = "none"; });

    // Tab Switcher logic
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

    // Profile UI loading
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    if (!token) {
        window.location.replace("signin.html");
        return;
    }

    function updateUI(user) {
        const nameEl = document.getElementById("profile-name");
        if (nameEl) {
            nameEl.innerHTML = `${user.username || 'User'} <i class="fa-solid fa-pen edit-icon" id="edit-name-btn"></i>`;
            document.getElementById('edit-name-btn')?.addEventListener('click', () => openModal('name'));
        }
        
        const emailEl = document.getElementById("profile-email");
        if (emailEl) emailEl.innerText = user.email || '';
        
        const idEl = document.getElementById("profile-id");
        if (idEl) idEl.innerText = user.tbrId || localStorage.getItem('tbrId') || '';
        
        const avatarBox = document.getElementById("avatar-initials");
        if (avatarBox) {
            if (user.avatar && user.avatar.trim() !== "" && user.avatar !== 'null') {
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
    }

    updateUI({ 
        username: localStorage.getItem("userName") || localStorage.getItem("fullName") || "User", 
        email: localStorage.getItem("userEmail") || "", 
        phone: localStorage.getItem("userPhone") || "", 
        traderHandle: localStorage.getItem("traderUsername") || "", 
        avatar: localStorage.getItem("userAvatar") || "" 
    });

    try {
        const response = await fetch(`${API_BASE_URL}/api/user/profile?t=${Date.now()}`, {
            method: "GET",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
        });

        if (response.ok) {
            const result = await response.json();
            const userData = result.user || result;
            
            const uName = userData.fullName || userData.username || userData.name || "User";
            const uEmail = userData.email || "";
            let newId = userData.tbrId || userData.userId || userData._id || "";
            if (userData.numericId && (!newId.startsWith('TBR-'))) newId = 'TBR-' + String(userData.numericId).padStart(6, '0');
            const uPhone = userData.phoneNumber || userData.phone || "";
            const uTraderHandle = userData.traderUsername || "";
            let finalAvatar = userData.avatar || userData.profilePicture || "";

            if (newId) localStorage.setItem("tbrId", newId);
            if (uName) localStorage.setItem("userName", uName);
            if (uEmail) localStorage.setItem("userEmail", uEmail);
            if (uPhone) localStorage.setItem("userPhone", uPhone);
            if (uTraderHandle) localStorage.setItem("traderUsername", uTraderHandle);
            if (finalAvatar) localStorage.setItem("userAvatar", finalAvatar);

            updateUI({ username: uName, email: uEmail, tbrId: newId, phone: uPhone, traderHandle: uTraderHandle, avatar: finalAvatar });
        }
    } catch (error) { console.error("Profile sync error:", error); }
});