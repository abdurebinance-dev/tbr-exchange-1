document.addEventListener("DOMContentLoaded", async function() {
    // 1. መግቢያ (Auth) መኖሩን ማረጋገጥ
    const token = localStorage.getItem("token") || localStorage.getItem("authToken");
    if (!token) {
        window.location.replace("signin.html");
        return;
    }

    const API_BASE_URL = window.location.hostname.includes('localhost') 
        ? '' 
        : 'https://tbr-exchange-backend.onrender.com';

    let currentField = "";
    let paymentMethods = [];
    let editingPaymentId = null;

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

    // 🚀 Helper Functions 🚀
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

    function base64urlToBuffer(base64url) {
        const padding = '='.repeat((4 - base64url.length % 4) % 4);
        const base64 = (base64url + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const buffer = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) buffer[i] = rawData.charCodeAt(i);
        return buffer;
    }

    function bufferToBase64url(buffer) {
        const bytes = new Uint8Array(buffer);
        let str = '';
        for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
        return window.btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    }

    function getStoredId() {
        return localStorage.getItem('tbrId') || localStorage.getItem('tbrExchangeId') || localStorage.getItem('userId') || 'Loading...';
    }

    function resolveProfileAvatarUrl(raw) {
        if (!raw || raw === 'null' || raw === 'undefined') return '';
        let str = String(raw).trim();
        if (!str) return '';
        if (str.startsWith('data:image')) return str;
        if (str.startsWith('/')) str = `${API_BASE_URL}${str}`;
        if (str.includes('/api/user-avatar/')) {
            const sep = str.includes('?') ? '&' : '?';
            return `${str}${sep}t=${Date.now()}`;
        }
        return str;
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

    // 🚀 Load Initial Data 🚀
    loadFromLocalStorageFallback();
    window.loadUserPasskeys();
    loadPaymentMethods();

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

            const phone = userData.phone || userData.phoneNumber || "";
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

    // ==========================================
    // 🚀 PAYMENT METHODS LOGIC 🚀
    // ==========================================
    async function loadPaymentMethods() {
        const tkn = localStorage.getItem("token") || localStorage.getItem("authToken");
        if (!tkn) { paymentMethods = []; renderPaymentMethods(); return; }

        try {
            const res = await fetch(`${API_BASE_URL}/api/user/payments`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${tkn}`, 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                const data = await res.json();
                paymentMethods = data.payments || data || []; 
            } else { paymentMethods = []; }
        } catch (error) { paymentMethods = []; }
        renderPaymentMethods();
    }

    function renderPaymentMethods() {
        const listEl = document.getElementById('pm-list');
        const emptyEl = document.getElementById('pm-empty-state');
        const formEl = document.getElementById('pm-add-form');
        if(!listEl || !emptyEl || !formEl) return;

        if (!paymentMethods || paymentMethods.length === 0) {
            listEl.style.display = 'none';
            if (formEl.style.display === 'none') emptyEl.style.display = 'block';
            return;
        }

        emptyEl.style.display = 'none';
        listEl.style.display = 'flex';
        listEl.innerHTML = '';

        paymentMethods.forEach((pm, index) => {
            const isDefault = pm.isDefault ? true : false;
            const pmId = pm._id || pm.id || index;
            const html = `
            <div class="pm-item-box">
                <div>
                    <div class="pm-item-type">
                        ${pm.type || pm.bankName || 'Bank'}
                        ${isDefault ? '<span class="pm-default-badge"><i class="fa-regular fa-star"></i> Default</span>' : ''}
                    </div>
                    <div class="pm-item-holder">${pm.name || pm.accountName || pm.fullName}</div>
                    <div class="pm-item-number">${pm.account || pm.accountNumber || pm.number}</div>
                </div>
                <div class="pm-item-actions">
                    ${!isDefault ? `<button class="pm-set-default-btn" onclick="window.setDefaultPaymentMethod(${index}, '${pmId}')"><i class="fa-regular fa-circle-check"></i> Set default</button>` : ''}
                    <i class="fa-solid fa-pen" style="color: #848e9c; cursor: pointer; font-size: 14px;" title="Edit" onclick="window.editPaymentMethod(${index})"></i>
                    <i class="fa-solid fa-trash" style="color: var(--red-color); cursor: pointer; font-size: 14px;" title="Delete" onclick="window.deletePaymentMethod(${index}, '${pmId}')"></i>
                </div>
            </div>`;
            listEl.insertAdjacentHTML('beforeend', html);
        });
    }

    window.toggleAddPaymentForm = function() {
        const form = document.getElementById('pm-add-form');
        const emptyState = document.getElementById('pm-empty-state');
        const addBtn = document.getElementById('pm-add-btn');
        if(!form) return;

        if (form.style.display === 'none') {
            form.style.display = 'block';
            if(emptyState) emptyState.style.display = 'none';
            if(addBtn) addBtn.style.display = 'none';
        } else {
            form.style.display = 'none';
            if(addBtn) addBtn.style.display = 'flex';
            
            document.getElementById('pm-type').value = "";
            document.getElementById('pm-account-name').value = "";
            document.getElementById('pm-account-number').value = "";
            document.getElementById('pm-account-number-group').style.display = 'none';
            editingPaymentId = null;
            renderPaymentMethods(); 
        }
    };

    window.handlePaymentTypeChange = function() {
        const type = document.getElementById('pm-type').value;
        const accountGroup = document.getElementById('pm-account-number-group');
        const accountLabel = document.getElementById('pm-account-number-label');
        const accountInput = document.getElementById('pm-account-number');
        if(!accountGroup) return;

        if (type) {
            accountGroup.style.display = 'block';
            if (type === 'Telebirr' || type === 'M-Pesa' || type === 'CBE Birr') {
                accountLabel.innerText = "Phone Number";
                accountInput.placeholder = "Enter registered phone number";
            } else {
                accountLabel.innerText = "Account Number";
                accountInput.placeholder = "Enter bank account number";
            }
        } else {
            accountGroup.style.display = 'none';
        }
    };

    window.savePaymentMethod = async function() {
        const type = document.getElementById('pm-type').value;
        const name = document.getElementById('pm-account-name').value.trim();
        const account = document.getElementById('pm-account-number').value.trim();
        const tkn = localStorage.getItem("token") || localStorage.getItem("authToken");

        if (!type || !name || !account) {
            window.showCenterNotification("Missing Details", "Please select payment type and fill in both account name and account number.", false);
            return;
        }
        if (!tkn) {
            window.showCenterNotification("Authentication Error", "You must be logged in to save payment methods.", false);
            return;
        }

        const payload = { type, name, account };
        let tempId = Date.now().toString();
        
        if (editingPaymentId !== null) {
            paymentMethods[editingPaymentId].type = type;
            paymentMethods[editingPaymentId].name = name;
            paymentMethods[editingPaymentId].account = account;
            window.showCenterNotification("Updated", `Payment method <strong>${type}</strong> updated successfully!`);
        } else {
            const isFirst = paymentMethods.length === 0;
            payload.isDefault = isFirst;
            paymentMethods.push({ _id: tempId, type, name, account, isDefault: isFirst });
            window.showCenterNotification("Success", `Payment method <strong>${type}</strong> added successfully!`);
        }

        const currentEditId = editingPaymentId; 
        editingPaymentId = null;
        window.toggleAddPaymentForm();
        renderPaymentMethods();

        try {
            if (currentEditId !== null) {
                const pmId = paymentMethods[currentEditId]._id || paymentMethods[currentEditId].id;
                fetch(`${API_BASE_URL}/api/user/payments/${pmId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tkn}` },
                    body: JSON.stringify(payload)
                }).catch(e => console.error("Background sync error:", e));
            } else {
                fetch(`${API_BASE_URL}/api/user/payments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tkn}` },
                    body: JSON.stringify(payload)
                })
                .then(res => res.json())
                .then(data => {
                    if(data.success && data.payment) {
                        const index = paymentMethods.findIndex(p => p._id === tempId);
                        if(index !== -1) {
                            paymentMethods[index]._id = data.payment._id;
                            renderPaymentMethods();
                        }
                    }
                }).catch(e => console.error("Background sync error:", e));
            }
        } catch (error) { console.error("API Error:", error); }
    };

    window.setDefaultPaymentMethod = async function(index, pmId) {
        const tkn = localStorage.getItem("token") || localStorage.getItem("authToken");
        if (!tkn || !pmId) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/user/payments/${pmId}/default`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${tkn}`, 'Content-Type': 'application/json' }
            });
            if (res.ok) {
                window.showCenterNotification("Default Changed", `Default payment method updated successfully`);
                await loadPaymentMethods();
            } else throw new Error("Failed to set default");
        } catch (error) {
            window.showCenterNotification("Error", "Could not set default payment method.", false);
        }
    };

    let pendingDeleteIndex = null;
    let pendingDeleteId = null;

    window.deletePaymentMethod = function(index, pmId) {
        pendingDeleteIndex = index;
        pendingDeleteId = pmId;
        const modal = document.getElementById('deleteConfirmModal');
        if(modal) modal.style.display = 'flex';
    };

    window.closeDeleteModal = function() {
        const modal = document.getElementById('deleteConfirmModal');
        if(modal) modal.style.display = 'none';
        pendingDeleteIndex = null;
        pendingDeleteId = null;
    };

    const confirmDelBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDelBtn) {
        confirmDelBtn.addEventListener('click', function() {
            if (pendingDeleteId === null) return;
            const pmId = pendingDeleteId;
            window.closeDeleteModal();
            const tkn = localStorage.getItem("token") || localStorage.getItem("authToken");
            if (!tkn) return;

            try {
                paymentMethods = paymentMethods.filter(p => (p._id || p.id) !== pmId);
                renderPaymentMethods();
                window.showCenterNotification("Deleted", "Payment method has been removed successfully.");

                fetch(`${API_BASE_URL}/api/user/payments/${pmId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${tkn}` }
                }).then(async (res) => {
                    if (!res.ok) throw new Error("Failed to delete from server");
                    await loadPaymentMethods();
                }).catch(error => {
                    window.showCenterNotification("Error", "Could not delete payment method from server.", false);
                    loadPaymentMethods();
                });
            } catch (error) { console.error("Delete Error:", error); }
        });
    }
    
    window.editPaymentMethod = function(index) {
        const pm = paymentMethods[index];
        editingPaymentId = index;
        document.getElementById('pm-type').value = pm.type || pm.bankName;
        window.handlePaymentTypeChange();
        document.getElementById('pm-account-name').value = pm.name || pm.accountName || pm.fullName;
        document.getElementById('pm-account-number').value = pm.account || pm.accountNumber || pm.number;

        document.getElementById('pm-add-form').style.display = 'block';
        document.getElementById('pm-empty-state').style.display = 'none';
        document.getElementById('pm-add-btn').style.display = 'none';
    };


    // ==========================================
    // 🚀 PROFILE PICTURE & AVATAR UPLOAD 🚀
    // ==========================================
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
            syncAvatarToBackend(base64Image);
        };
        reader.readAsDataURL(file);
    };

    async function syncAvatarToBackend(base64Image) {
        try {
            const tkn = localStorage.getItem("token") || localStorage.getItem("authToken");
            await fetch(`${API_BASE_URL}/api/user/update`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": tkn ? `Bearer ${tkn}` : "" },
                body: JSON.stringify({ field: "avatar", value: base64Image })
            });
        } catch (error) { console.error("Avatar sync error:", error); }
    }


    // ==========================================
    // 🚀 WEBAUTHN PASSKEY LOGIC 🚀
    // ==========================================
    window.loadUserPasskeys = async function() {
        try {
            const tkn = localStorage.getItem("token") || localStorage.getItem("authToken");
            const res = await fetch(`${API_BASE_URL}/api/passkey/list`, {
                headers: { "Authorization": `Bearer ${tkn}` }
            });
            const data = await res.json();
            const container = document.getElementById("passkeys-list-container");
            if (!container) return;

            if (data.success && data.passkeys && data.passkeys.length > 0) {
                container.innerHTML = data.passkeys.map(pk => `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <div>
                            <div style="font-size: 14px; font-weight: 500; color: #fff;">
                                <i class="fa-solid fa-key" style="color: var(--accent-color); margin-right: 6px;"></i> 
                                ${pk.deviceType || 'Synced passkey'}
                            </div>
                            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                                Added ${new Date(pk.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                        <div style="display: flex; gap: 12px; font-size: 14px;">
                            <i class="fa-solid fa-pen" style="cursor: pointer; color: var(--text-muted);" title="Rename" onclick="window.renamePasskey('${pk._id}', '${pk.deviceType || 'Synced passkey'}')"></i>
                            <i class="fa-solid fa-trash" style="cursor: pointer; color: var(--red-color);" title="Delete" onclick="window.deletePasskey('${pk._id}')"></i>
                        </div>
                    </div>
                `).join('');
            } else {
                container.innerHTML = `<div style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 10px;">No passkeys registered yet.</div>`;
            }
        } catch (e) { console.error("Failed to load passkeys"); }
    };

    window.registerPasskey = async function() {
        try {
            window.showToast("Requesting device biometric setup...");
            const tkn = localStorage.getItem("token") || localStorage.getItem("authToken");
            
            const res = await fetch(`${API_BASE_URL}/api/passkey/register-options`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tkn}` }
            });
            const data = await res.json();
            
            if (!data.success) {
                window.showToast(data.message || "Failed to start passkey registration.");
                return;
            }

            const options = data.options;
            options.challenge = base64urlToBuffer(options.challenge);
            options.user.id = base64urlToBuffer(options.user.id);
            if (options.excludeCredentials) {
                options.excludeCredentials = options.excludeCredentials.map(cred => ({ ...cred, id: base64urlToBuffer(cred.id) }));
            }

            const credential = await navigator.credentials.create({ publicKey: options });

            const verifyRes = await fetch(`${API_BASE_URL}/api/passkey/register-verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tkn}` },
                body: JSON.stringify({
                    id: credential.id,
                    rawId: bufferToBase64url(credential.rawId),
                    response: {
                        clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
                        attestationObject: bufferToBase64url(credential.response.attestationObject)
                    },
                    type: credential.type
                })
            });

            const verifyResult = await verifyRes.json();
            if (verifyResult.success) {
                window.showToast("Passkey registered successfully! 🎉");
                window.loadUserPasskeys();
            } else {
                window.showToast(verifyResult.message || "Passkey registration failed.");
            }
        } catch (err) {
            console.error(err);
            window.showToast("Passkey registration cancelled or not supported.");
        }
    };

    window.deletePasskey = async function(id) {
        if (!confirm("Are you sure you want to delete this passkey?")) return;
        try {
            const tkn = localStorage.getItem("token") || localStorage.getItem("authToken");
            const res = await fetch(`${API_BASE_URL}/api/passkey/${id}`, {
                method: 'DELETE',
                headers: { "Authorization": `Bearer ${tkn}` }
            });
            const data = await res.json();
            if (data.success) {
                window.showToast("Passkey deleted successfully!");
                window.loadUserPasskeys();
            } else window.showToast(data.message || "Failed to delete passkey.");
        } catch (e) { window.showToast("Error deleting passkey."); }
    };

    window.renamePasskey = async function(id, currentName) {
        const newName = prompt("Enter new passkey name:", currentName);
        if (!newName) return;
        try {
            const tkn = localStorage.getItem("token") || localStorage.getItem("authToken");
            const res = await fetch(`${API_BASE_URL}/api/passkey/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', "Authorization": `Bearer ${tkn}` },
                body: JSON.stringify({ name: newName })
            });
            const data = await res.json();
            if (data.success) {
                window.showToast("Passkey renamed successfully!");
                window.loadUserPasskeys();
            } else window.showToast(data.message || "Failed to rename passkey.");
        } catch (e) { window.showToast("Error renaming passkey."); }
    };


    // ==========================================
    // 🚀 PROFILE EDIT MODALS 🚀
    // ==========================================
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
        if (currentField === 'phone') {
            const phoneDisplay = document.getElementById("phone-display");
            if (phoneDisplay) phoneDisplay.innerText = val;
            localStorage.setItem("userPhone", val);
        } else if (currentField === 'username') {
            if (!finalVal.startsWith('@')) finalVal = '@' + finalVal;
            const usernameDisplay = document.getElementById("username-display");
            if (usernameDisplay) usernameDisplay.innerText = finalVal;
            localStorage.setItem("traderUsername", finalVal);
        } else if (currentField === 'name') {
            localStorage.setItem("userName", val);
            const profileName = document.getElementById("profile-name");
            if (profileName) profileName.innerHTML = `${val} <i class="fa-solid fa-pen edit-icon" onclick="window.openModal('name')"></i>`;
        }
        
        window.showToast("Profile updated successfully!");

        try {
            const tkn = localStorage.getItem("token") || localStorage.getItem("authToken");
            const dataToSend = (currentField === 'username') ? finalVal : val;
            await fetch(`${API_BASE_URL}/api/user/update`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": tkn ? `Bearer ${tkn}` : "" },
                body: JSON.stringify({ field: currentField, value: dataToSend })
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
});