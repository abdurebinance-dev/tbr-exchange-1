// 🔴 1. URL Auto-Cleaner: በሊንኩ ላይ የድሮ ኢሜይል ወይም ፓስወርድ ካለ ብሮውዘሩ ላይ እንዳይታይ ወዲያውኑ ያጸዳዋል
if (window.location.search.includes('email=') || window.location.search.includes('password=')) {
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
}

const API_BASE_URL = window.location.hostname.includes('localhost') 
    ? '' 
    : 'https://tbr-exchange-backend.onrender.com';

function togglePass(id, icon) {
    const input = document.getElementById(id);
    if (!input) return;
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
    }
}

function base64UrlToUint8Array(base64UrlData) {
    const padding = '='.repeat((4 - base64UrlData.length % 4) % 4);
    const base64 = (base64UrlData + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function showError(title, message) {
    const msgBox = document.getElementById('responseMessage');
    const errorTitle = document.getElementById('errorTitle');
    const errorText = document.getElementById('errorText');
    if(errorTitle) errorTitle.textContent = title;
    if(errorText) errorText.textContent = message;
    if(msgBox) msgBox.style.display = 'block';
}

function hideError() {
    const msgBox = document.getElementById('responseMessage');
    if(msgBox) msgBox.style.display = 'none';
}

function showErrorToast(msg) {
    showError("Error", msg);
}

async function preFetchAndRedirect(token, redirectUrl) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.user) {
                if (data.user.fullName) localStorage.setItem('userName', data.user.fullName);
                localStorage.setItem('kycStatus', data.user.kycStatus || 'unverified');
                if (data.user.avatar) {
                    localStorage.setItem('userAvatar', data.user.avatar);
                    localStorage.setItem('profilePicture', data.user.avatar);
                }
            }
        }
    } catch (e) {
        console.error("Prefetch failed", e);
    }
    window.location.href = redirectUrl || 'dashboard.html';
}

let countdownInterval = null;

function checkSignInRateLimit(identifier) {
    const lockoutKey = 'tbr_signin_lockout_' + identifier;
    const lockoutUntil = localStorage.getItem(lockoutKey);
    
    if (lockoutUntil) {
        const lockoutTimeNum = Number(lockoutUntil);
        const remainingTime = lockoutTimeNum - new Date().getTime();
        if (!isNaN(remainingTime) && remainingTime > 0) {
            startCountdownFromTarget(lockoutTimeNum);
        } else {
            localStorage.removeItem(lockoutKey);
            localStorage.removeItem('tbr_signin_attempts_' + identifier);
            unlockSignInForm();
        }
    } else {
        unlockSignInForm();
    }
}

function startCountdown(durationMs) {
    const emailInputElement = document.getElementById('signin-email');
    if (!emailInputElement) return;
    const identifier = emailInputElement.value.trim();
    const lockoutEnd = new Date().getTime() + Number(durationMs);
    localStorage.setItem('tbr_signin_lockout_' + identifier, lockoutEnd);
    startCountdownFromTarget(lockoutEnd);
}

function startCountdownFromTarget(lockoutEndTime) {
    const submitBtn = document.getElementById('submitBtn');
    const passInput = document.getElementById('signin-pass');

    if(passInput) passInput.disabled = true;
    if(submitBtn) submitBtn.disabled = true;

    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
        const now = new Date().getTime();
        const distance = Number(lockoutEndTime) - now;

        if (isNaN(distance) || distance <= 0) {
            clearInterval(countdownInterval);
            const emailInputElement = document.getElementById('signin-email');
            const identifier = emailInputElement ? emailInputElement.value.trim() : "";
            if (identifier) {
                localStorage.removeItem('tbr_signin_lockout_' + identifier);
                localStorage.removeItem('tbr_signin_attempts_' + identifier);
            }
            unlockSignInForm();
        } else {
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            
            if(submitBtn) submitBtn.textContent = `Locked (${minutes}m ${seconds}s)`;
            showError("Access Locked", `Too many failed attempts. Try again in ${minutes}m ${seconds}s.`);
        }
    }, 1000);
}

function unlockSignInForm() {
    if (countdownInterval) clearInterval(countdownInterval);
    const submitBtn = document.getElementById('submitBtn');
    const emailInput = document.getElementById('signin-email');
    const passInput = document.getElementById('signin-pass');

    if(emailInput) emailInput.disabled = false;
    if(passInput) passInput.disabled = false;
    if(submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In →';
    }
    hideError();
}

async function handleGoogleResponse(response) {
    try {
        localStorage.clear(); 
        sessionStorage.clear();

        const res = await fetch(`${API_BASE_URL}/api/google-auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                token: response.credential,
                action: 'signin' 
            })
        });

        const data = await res.json();
        
        if (data.requiresSignup) {
            window.location.href = 'signup.html';
            return;
        }

        if (data.success) {
            if (data.token) {
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('token', data.token);
            }
            if (data.user && data.user.email) {
                localStorage.setItem('userEmail', data.user.email);
            } else if (data.email) {
                localStorage.setItem('userEmail', data.email);
            }

            await preFetchAndRedirect(data.token, data.redirectUrl);
        } else {
            showErrorToast(data.message || 'Google authentication failed.');
        }
    } catch (err) {
        console.error('Error:', err);
        showErrorToast('Server error during Google sign-in.');
    }
}

// 🔴 2. የ Google Login ቁልፍ ዌብሳይቱ ሎድ አድርጎ ሲጨርስ ብቻ እንዲመጣ 🔴
window.addEventListener('load', () => {
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
            client_id: "661544926174-8kp01crhke9m1vmjf6kcts5o2e7sqek8.apps.googleusercontent.com",
            callback: handleGoogleResponse
        });

        const googleBtnContainer = document.getElementById("googleSignInBtnContainer");
        if(googleBtnContainer) {
            google.accounts.id.renderButton(
                googleBtnContainer,
                { 
                    theme: "filled_black", 
                    size: "large", 
                    width: "340",
                    shape: "rectangular",
                    text: "continue_with"
                }
            );
        }
    }
});


// 🔴 3. ያንተ የ P2P ካልኩሌተር፣ Theme እና የተቀሩት ኮዶች በሙሉ እዚህ አሉ! 🔴
document.addEventListener("DOMContentLoaded", () => {
   // 🔴 OTP Auto-Advance (የማረጋገጫ ሳጥኖቹ በራሱ ጊዜ ወደ ቀጣዩ እንዲዘል እና Paste እንዲሰራ) 🔴
    const otpInputs = document.querySelectorAll('.code-input, .otp-input, input[type="text"][maxlength="1"], input[type="number"][maxlength="1"], input[maxlength="1"]');
    
    if (otpInputs.length > 0) {
        otpInputs.forEach((input, index) => {
            // ቁጥር ሲገባ ወደ ቀጣዩ ሳጥን መዝለል
            input.addEventListener('input', (e) => {
                if (e.target.value.length === 1 && index < otpInputs.length - 1) {
                    otpInputs[index + 1].focus();
                }
            });
            
            // Backspace ሲነካ ወደ ኋላ መመለስ
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
                    otpInputs[index - 1].focus();
                }
            });
            
            // ኮዱን Paste ሲያደርግ በየሳጥኑ መበተን
            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pastedData = e.clipboardData.getData('text').trim().slice(0, otpInputs.length);
                if (/^\d+$/.test(pastedData)) {
                    for (let i = 0; i < pastedData.length; i++) {
                        otpInputs[i].value = pastedData[i];
                        if (i < otpInputs.length - 1) otpInputs[i + 1].focus();
                    }
                }
            });
        });
    }
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

    // የ Theme Toggle Logic
    const themeBtn = document.getElementById("theme-toggle");
    if (localStorage.getItem("theme") === "light") {
        document.body.style.backgroundColor = "#f4f5f7";
        document.body.style.color = "#121212";
        if (themeBtn) {
            themeBtn.classList.remove("fa-moon");
            themeBtn.classList.add("fa-sun");
            themeBtn.style.color = "#f3ba2f";
        }
    }

    if (themeBtn) {
        themeBtn.style.cursor = "pointer";
        themeBtn.addEventListener("click", function() {
            const currentBg = window.getComputedStyle(document.body).backgroundColor;
            
            if (currentBg === "rgb(244, 245, 247)" || document.body.style.backgroundColor === "rgb(244, 245, 247)" || document.body.style.backgroundColor === "#f4f5f7") {
                // ወደ ጥቁር መመለስ
                document.body.style.backgroundColor = "#080808";
                document.body.style.color = "#ffffff";
                themeBtn.classList.remove("fa-sun");
                themeBtn.classList.add("fa-moon");
                localStorage.setItem("theme", "dark");
            } else {
                // ወደ ነጭ መቀየር
                document.body.style.backgroundColor = "#f4f5f7";
                document.body.style.color = "#121212";
                themeBtn.classList.remove("fa-moon");
                themeBtn.classList.add("fa-sun");
                localStorage.setItem("theme", "light");
            }
        });
    }

    // የፓስወርድ ማሳያ አይኮን Event
    const toggleIcon = document.getElementById('togglePasswordIcon');
    if (toggleIcon) {
        toggleIcon.addEventListener('click', function() {
            togglePass('signin-pass', this);
        });
    }

    localStorage.removeItem('userEmail');
    localStorage.removeItem('authToken');

    const savedEmail = localStorage.getItem('signinEmail');
    const emailInput = document.getElementById('signin-email');
    if (savedEmail && emailInput) {
        emailInput.value = savedEmail;
        checkSignInRateLimit(savedEmail);
    }

    if (emailInput) {
        emailInput.addEventListener('input', function() {
            const identifier = this.value.trim();
            if (identifier) checkSignInRateLimit(identifier);
        });
    }

    // Passkey ሎጊን
    let passkeyAbortController = new AbortController();
    const passkeyBtn = document.getElementById('passkeyBtn');
    if(passkeyBtn) {
        passkeyBtn.addEventListener('click', async () => {
            if (!window.PublicKeyCredential) {
                showError("Unsupported", "Passkeys are not supported on this device/browser.");
                return;
            }

            if (passkeyAbortController) {
                passkeyAbortController.abort();
                passkeyAbortController = new AbortController();
            }

            try {
                showError("Passkey", "Requesting biometric authentication...");
                
                const res = await fetch(`${API_BASE_URL}/api/passkey/login-options`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                const optionsData = await res.json();
                
                if (!optionsData.success) {
                    showError("Passkey Failed", optionsData.message || "No passkey found for this device.");
                    return;
                }

                const challengeArray = base64UrlToUint8Array(optionsData.options.challenge);

                const publicKeyCredentialRequestOptions = {
                    challenge: challengeArray,
                    timeout: 60000,
                    userVerification: "preferred",
                    rpId: window.location.hostname
                };

                const assertion = await navigator.credentials.get({
                    publicKey: publicKeyCredentialRequestOptions,
                    signal: passkeyAbortController.signal
                });

                const authResponse = await fetch(`${API_BASE_URL}/api/passkey/login-verify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: assertion.id,
                        rawId: arrayBufferToBase64(assertion.rawId),
                        response: {
                            clientDataJSON: arrayBufferToBase64(assertion.response.clientDataJSON),
                            authenticatorData: arrayBufferToBase64(assertion.response.authenticatorData),
                            signature: arrayBufferToBase64(assertion.response.signature),
                            userHandle: assertion.response.userHandle ? arrayBufferToBase64(assertion.response.userHandle) : null
                        },
                        type: assertion.type
                    })
                });

                const verifyData = await authResponse.json();

                if (verifyData.success && verifyData.token) {
                    localStorage.setItem('authToken', verifyData.token);
                    localStorage.setItem('token', verifyData.token);
                    if (verifyData.user && verifyData.user.email) {
                        localStorage.setItem('userEmail', verifyData.user.email);
                    }
                    await preFetchAndRedirect(verifyData.token, verifyData.redirectUrl);
                } else {
                    showError("Passkey Failed", verifyData.message || "Passkey verification failed.");
                }

            } catch (err) {
                if (err.name === 'AbortError') return;
                console.error('Passkey login error:', err);
                showError("Passkey Error", err.message || "Passkey authentication was cancelled or not supported.");
            }
        });
    }

    // የኢሜይል Sign in ፎርም Event
    const signinForm = document.getElementById('signinForm');
    if(signinForm) {
        signinForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInputElement = document.getElementById('signin-email');
            const passInputElement = document.getElementById('signin-pass');
            const identifier = emailInputElement ? emailInputElement.value.trim() : "";
            const password = passInputElement ? passInputElement.value : "";
            const submitBtn = document.getElementById('submitBtn');

            const attemptsKey = 'tbr_signin_attempts_' + identifier;
            let currentAttempts = parseInt(localStorage.getItem(attemptsKey) || '0', 10);
            currentAttempts++;
            localStorage.setItem(attemptsKey, currentAttempts);

            if (currentAttempts > 5) {
                const lockoutDurationMs = 25 * 60 * 1000;
                startCountdown(lockoutDurationMs);
                return;
            }

            if(submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Signing in...';
            }
            hideError();

            try {
                const response = await fetch(`${API_BASE_URL}/api/signin`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: identifier, password })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    localStorage.removeItem(attemptsKey); 
                    if (data.email) {
                        localStorage.setItem('userEmail', data.email);
                    }
                    if (data.requiresVerification) {
                        localStorage.setItem('verifyEmail', data.email);
                        window.location.href = 'login-verify.html';
                    } else {
                        if(data.token) {
                            localStorage.setItem('token', data.token);
                            localStorage.setItem('authToken', data.token);
                            await preFetchAndRedirect(data.token, data.redirectUrl);
                        } else {
                            window.location.href = data.redirectUrl || 'dashboard.html';
                        }
                    }
                } else {
                    const errorMsg = data.message ? data.message.toLowerCase() : '';
                    if (currentAttempts >= 5 || errorMsg.includes('too many') || response.status === 429) {
                        let lockoutDurationMs = 25 * 60 * 1000;
                        if (data.lockUntil) {
                            const serverLockTime = new Date(data.lockUntil).getTime();
                            if (!isNaN(serverLockTime)) {
                                lockoutDurationMs = Math.max(serverLockTime - new Date().getTime(), lockoutDurationMs);
                            }
                        }
                        startCountdown(lockoutDurationMs);
                    } else {
                        showError("Sign in failed", data.message || 'Incorrect email or password.');
                        if(submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = 'Sign In →';
                        }
                    }
                }
            } catch (err) {
                console.error('Error:', err);
                showError("Connection Error", 'Server connection error. Please try again.');
                if(submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign In →';
                }
            }
        });
    }

});