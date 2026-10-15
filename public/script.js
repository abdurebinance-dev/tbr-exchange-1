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
function renderGoogleBtn() {
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
    } else {
        // Google ገና ሎድ አድርጎ ካልጨረሰ፣ እስኪመጣ ድረስ በየ 100 ሚሊ-ሰከንድ ደጋግሞ ይፈልገዋል
        setTimeout(renderGoogleBtn, 100);
    }
}
window.addEventListener('load', renderGoogleBtn);


// 🔴 3. ያንተ የ P2P ካልኩሌተር፣ Theme እና የተቀሩት ኮዶች በሙሉ እዚህ አሉ! 🔴
document.addEventListener("DOMContentLoaded", () => {
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

// =========================================================
// 🔴 LOGIN VERIFICATION PAGE LOGIC (login-verify.html) 🔴
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    const verifyForm = document.getElementById('verifyLoginOtpForm');
    
    if (verifyForm) {
        const verifyEmail = localStorage.getItem('verifyEmail') || localStorage.getItem('signinEmail') || localStorage.getItem('loginEmail') || localStorage.getItem('signupEmail');
        if (!verifyEmail) {
            alert('Session not found. Please sign in again.');
            window.location.href = 'signin.html';
        } else {
            const masked = verifyEmail.substring(0, 2) + '***' + verifyEmail.substring(verifyEmail.indexOf('@'));
            const emailDisplay = document.getElementById('userEmailDisplay');
            if (emailDisplay) emailDisplay.innerText = masked;
        }

        const verifyInputs = document.querySelectorAll('#verifyLoginOtpForm .code-input');

        verifyInputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                const val = e.target.value.replace(/\D/g, '');
                if (val.length > 0) {
                    e.target.value = val.charAt(val.length - 1);
                    if (index < verifyInputs.length - 1) {
                        verifyInputs[index + 1].focus();
                    }
                } else {
                    e.target.value = '';
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !input.value && index > 0) {
                    verifyInputs[index - 1].focus();
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text');
                handleVerificationPaste(text);
            });
        });

        function handleVerificationPaste(text) {
            const digits = text.trim().replace(/\D/g, '').split('');
            verifyInputs.forEach((input, idx) => {
                if (digits[idx]) {
                    input.value = digits[idx];
                }
            });
            if (digits.length > 0) {
                verifyInputs[Math.min(digits.length - 1, 5)].focus();
            }
        }

        // ግሎባል (Global) ለሆነው የ Paste አዝራር
        window.pasteCode = async function() {
            try {
                const text = await navigator.clipboard.readText();
                handleVerificationPaste(text);
            } catch (err) {
                console.error('Failed to read clipboard');
            }
        };

        // የ 10 ደቂቃ ቆጣሪ
        let expireTimeLeft = 10 * 60; 
        const expireTimerDisplay = document.getElementById('expireTimer');
        const messageDiv = document.getElementById('message');
        const verifyBtn = document.getElementById('verifyBtn');

        const expireInterval = setInterval(() => {
            if (expireTimeLeft <= 0) {
                clearInterval(expireInterval);
                if (expireTimerDisplay) {
                    expireTimerDisplay.innerText = "Expired";
                    expireTimerDisplay.style.color = "#ff6b6b";
                }
                verifyInputs.forEach(input => input.disabled = true);
                if (verifyBtn) verifyBtn.disabled = true;
                if (messageDiv) {
                    messageDiv.style.color = '#ff6b6b';
                    messageDiv.innerText = 'Verification code has expired. Please request a new one.';
                }
                return;
            }
            expireTimeLeft--;
            const minutes = Math.floor(expireTimeLeft / 60);
            const seconds = expireTimeLeft % 60;
            if (expireTimerDisplay) {
                expireTimerDisplay.innerText = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
            }
        }, 1000);

        // የ 60 ሰከንድ Resend ቆጣሪ
        let resendCountdown = 60;
        const resendBtn = document.getElementById('resendBtn');

        function startResendTimer() {
            resendCountdown = 60;
            if (resendBtn) {
                resendBtn.disabled = true;
                resendBtn.innerHTML = `Resend in <span id="resendTimer">60</span>s`;
            }
            
            const resendInterval = setInterval(() => {
                resendCountdown--;
                const resendTimerSpan = document.getElementById('resendTimer');
                if (resendCountdown <= 0) {
                    clearInterval(resendInterval);
                    if (resendBtn) {
                        resendBtn.disabled = false;
                        resendBtn.innerHTML = "Resend Code";
                    }
                } else if (resendTimerSpan) {
                    resendTimerSpan.innerText = resendCountdown;
                }
            }, 1000);
        }

        startResendTimer();

        if (resendBtn) {
            resendBtn.addEventListener('click', async () => {
                if (resendBtn.disabled) return;
                try {
                    const response = await fetch(`${API_BASE_URL}/api/resend-code`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: verifyEmail })
                    });
                    const data = await response.json();
                    if (response.ok && data.success) {
                        if (messageDiv) {
                            messageDiv.style.color = '#51cf66';
                            messageDiv.innerText = 'New verification code sent successfully!';
                        }
                        expireTimeLeft = 10 * 60;
                        verifyInputs.forEach(input => {
                            input.disabled = false;
                            input.value = '';
                        });
                        if (verifyBtn) verifyBtn.disabled = false;
                        if (verifyInputs[0]) verifyInputs[0].focus();
                        startResendTimer();
                    } else {
                        if (messageDiv) {
                            messageDiv.style.color = '#ff6b6b';
                            messageDiv.innerText = data.message || 'Failed to resend code.';
                        }
                    }
                } catch (err) {
                    if (messageDiv) {
                        messageDiv.style.color = '#ff6b6b';
                        messageDiv.innerText = 'Error connecting to server!';
                    }
                }
            });
        }

        verifyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            let code = '';
            verifyInputs.forEach(input => code += input.value);

            if (code.length < 6) {
                if (messageDiv) {
                    messageDiv.style.color = '#ff6b6b';
                    messageDiv.innerText = 'Please enter the complete 6-digit code.';
                }
                return;
            }

            if (verifyBtn) {
                verifyBtn.disabled = true;
                verifyBtn.innerText = 'Verifying...';
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/verify-login-otp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: verifyEmail, otp: code })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    if (messageDiv) {
                        messageDiv.style.color = '#51cf66';
                        messageDiv.innerText = 'Verification successful! Loading dashboard...';
                    }
                    if (data.token) {
                        localStorage.setItem('token', data.token);
                        localStorage.setItem('authToken', data.token);
                    }
                    localStorage.setItem('userEmail', verifyEmail);
                    localStorage.removeItem('verifyEmail');
                    localStorage.removeItem('loginEmail');
                    
                    // preFetchAndRedirect ሎጂክ (script.js ውስጥ አስቀድሞ ስላለ በቀጥታ ይጠራል)
                    await preFetchAndRedirect(data.token, data.redirectUrl);
                } else {
                    if (verifyBtn) {
                        verifyBtn.disabled = false;
                        verifyBtn.innerText = 'Verify & Sign In';
                    }
                    if (messageDiv) {
                        messageDiv.style.color = '#ff6b6b';
                        messageDiv.innerText = data.message || 'Invalid verification code.';
                    }
                }
            } catch (err) {
                if (verifyBtn) {
                    verifyBtn.disabled = false;
                    verifyBtn.innerText = 'Verify & Sign In';
                }
                if (messageDiv) {
                    messageDiv.style.color = '#ff6b6b';
                    messageDiv.innerText = 'Error connecting to server!';
                }
            }
        });
    }
});

// =========================================================
// 🔴 IDENTITY VERIFICATION (KYC) LOGIC (verification.html) 🔴
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    const kycForm = document.getElementById('kycForm');
    
    if (kycForm) {
        // 1. ፎቶ ሲመረጥ Preview የሚያደርግ ፈንክሽን
        function setupImagePreview(inputId, previewId, iconId, textId) {
            const input = document.getElementById(inputId);
            const preview = document.getElementById(previewId);
            const icon = document.getElementById(iconId);
            const text = document.getElementById(textId);
            
            if (!input || !preview) return;

            input.addEventListener('change', function() {
                const file = this.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        preview.src = e.target.result;
                        preview.style.display = 'block';
                        if (icon) icon.style.display = 'none';
                        if (text) text.style.display = 'none';
                        
                        // የሳጥኑን ቦርደር ወደ ወርቃማ እንቀይረዋለን
                        const box = input.closest('.upload-box, .upload-box-full');
                        if(box) {
                            box.style.borderStyle = 'solid';
                            box.style.borderColor = '#d4af37';
                        }
                    }
                    reader.readAsDataURL(file);
                }
            });
        }

        // ለሶስቱም የፎቶ ሳጥኖች Preview እንዲሰራ እናደርጋለን
        setupImagePreview('uploadFront', 'previewFront', 'iconFront', 'textFront');
        setupImagePreview('uploadBack', 'previewBack', 'iconBack', 'textBack');
        setupImagePreview('uploadSelfie', 'previewSelfie', 'iconSelfie', 'textSelfie');

        // 2. ፎርሙ ሲላክ (Submit) ሲደረግ 
        kycForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const submitBtn = document.getElementById('kycSubmitBtn');
            const messageDiv = document.getElementById('kycMessage');
            
            // ፎቶዎቹ መመረጣቸውን ማረጋገጥ
            const frontFile = document.getElementById('uploadFront').files[0];
            const backFile = document.getElementById('uploadBack').files[0];
            const selfieFile = document.getElementById('uploadSelfie').files[0];

            if (!frontFile || !backFile || !selfieFile) {
                messageDiv.style.display = 'block';
                messageDiv.style.color = '#ff6b6b';
                messageDiv.innerText = 'Please upload all required documents (Front, Back, and Selfie).';
                return;
            }

            // አዝራሩን Disable አድርጎ "Submitting..." ማሳየት
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
            messageDiv.style.display = 'none';

            // ዳታውን እና ፎቶዎቹን ወደ ሰርቨር ለመላክ ማዘጋጀት (FormData)
            const formData = new FormData();
            formData.append('documentType', document.getElementById('kycDocType').value);
            formData.append('idNumber', document.getElementById('kycIdNumber').value);
            formData.append('dob', document.getElementById('kycDob').value);
            formData.append('address', document.getElementById('kycAddress').value);
            formData.append('frontImage', frontFile);
            formData.append('backImage', backFile);
            formData.append('selfieImage', selfieFile);

            try {
                const token = localStorage.getItem('authToken') || localStorage.getItem('token');
                
                // ወደ ባክኤንድ መላክ
                const response = await fetch(`${API_BASE_URL}/api/kyc/submit`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                        // ማሳሰቢያ፡ FormData ስንጠቀም 'Content-Type' አንጽፍም፣ ብሮውዘሩ ራሱ ያስተካክለዋል
                    },
                    body: formData
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    messageDiv.style.display = 'block';
                    messageDiv.style.color = '#51cf66';
                    messageDiv.innerText = 'KYC Documents submitted successfully! Pending review.';
                    
                    // ፎርሙን ማጽዳት
                    kycForm.reset();
                    
                    // ከ 2 ሰከንድ በኋላ ወደ ዳሽቦርድ መመለስ
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 2000);
                } else {
                    messageDiv.style.display = 'block';
                    messageDiv.style.color = '#ff6b6b';
                    messageDiv.innerText = data.message || 'Failed to submit KYC. Please try again.';
                }
            } catch (error) {
                console.error('KYC Submit Error:', error);
                messageDiv.style.display = 'block';
                messageDiv.style.color = '#ff6b6b';
                messageDiv.innerText = 'Error connecting to server!';
            } finally {
                // አዝራሩን ወደ ነበረበት መመለስ
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit for Review';
            }
        });
    }
});

// =========================================================
// 🔴 SIGNUP EMAIL VERIFICATION LOGIC (verify.html) 🔴
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    const signupVerifyForm = document.getElementById('verifyForm');
    
    if (signupVerifyForm) {
        const signupEmail = localStorage.getItem('signupEmail');
        if (!signupEmail) {
            alert('Session not found. Please sign up again.');
            window.location.href = 'signup.html';
        } else {
            const masked = signupEmail.substring(0, 2) + '***' + signupEmail.substring(signupEmail.indexOf('@'));
            const emailDisplay = document.getElementById('userEmailDisplay');
            if (emailDisplay) emailDisplay.innerText = masked;
        }

        const inputs = document.querySelectorAll('#verifyForm .code-input');

        inputs.forEach((input, index) => {
            input.addEventListener('focus', () => input.select());

            input.addEventListener('input', (e) => {
                const val = e.target.value;
                const numericVal = val.replace(/\D/g, '');
                
                if (numericVal) {
                    const chars = numericVal.split('');
                    let currentIndex = index;
                    for (let i = 0; i < chars.length && currentIndex < inputs.length; i++) {
                        inputs[currentIndex].value = chars[i];
                        currentIndex++;
                    }
                    if (currentIndex < inputs.length) {
                        inputs[currentIndex].focus();
                    } else {
                        inputs[inputs.length - 1].focus();
                    }
                } else {
                    e.target.value = '';
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace') {
                    e.preventDefault();
                    if (input.value !== '') {
                        input.value = '';
                    } else if (index > 0) {
                        inputs[index - 1].focus();
                        inputs[index - 1].value = '';
                    }
                }
            });

            input.addEventListener('paste', (e) => {
                e.preventDefault();
                const pasteData = e.clipboardData.getData('text').trim();
                handleSignupPaste(pasteData);
            });
        });

        function handleSignupPaste(pasteData) {
            const digits = pasteData.replace(/\D/g, '').split('');
            inputs.forEach((inp, idx) => {
                if (digits[idx]) {
                    inp.value = digits[idx];
                }
            });
            if (digits.length > 0) {
                inputs[Math.min(digits.length - 1, 5)].focus();
            }
        }

        // ግሎባል (Global) የሆነ የ Paste መቆጣጠሪያ ለ Signup Verification 
        window.pasteSignupCode = async function() {
            try {
                const text = await navigator.clipboard.readText();
                handleSignupPaste(text);
            } catch (err) {
                console.error('Failed to read clipboard');
            }
        };

        // የ 10 ደቂቃ ቆጣሪ (Expiration Timer)
        let expireSeconds = 600;
        const expireTimerEl = document.getElementById('expireTimer');
        
        const expireInterval = setInterval(() => {
            if (expireSeconds <= 0) {
                clearInterval(expireInterval);
                if (expireTimerEl) {
                    expireTimerEl.innerText = "Expired";
                    expireTimerEl.style.color = "#e95454";
                }
            } else {
                expireSeconds--;
                let mins = Math.floor(expireSeconds / 60);
                let secs = expireSeconds % 60;
                if (expireTimerEl) {
                    expireTimerEl.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                }
            }
        }, 1000);

        // የ 60 ሰከንድ ድጋሚ መላኪያ (Resend Timer)
        let resendSeconds = 60;
        const resendBtn = document.getElementById('resendBtn');
        const resendTimerSpan = document.getElementById('resendTimer');
        let resendInterval;
        
        function startSignupResendTimer() {
            resendSeconds = 60;
            if (resendBtn) {
                resendBtn.disabled = true;
                resendBtn.classList.remove('active');
            }
            resendInterval = setInterval(() => {
                if (resendSeconds <= 0) {
                    clearInterval(resendInterval);
                    if (resendBtn) {
                        resendBtn.disabled = false;
                        resendBtn.classList.add('active');
                        resendBtn.innerHTML = "Resend Code";
                    }
                } else {
                    resendSeconds--;
                    if (resendTimerSpan) {
                        resendTimerSpan.innerText = resendSeconds;
                    } else if (resendBtn) {
                        resendBtn.innerHTML = `Resend in <span id="resendTimer">${resendSeconds}</span>s`;
                    }
                }
            }, 1000);
        }
        startSignupResendTimer();

        if (resendBtn) {
            resendBtn.addEventListener('click', async () => {
                if (resendBtn.disabled) return;

                const messageDiv = document.getElementById('message');
                resendBtn.innerText = "Sending...";

                try {
                    const response = await fetch(`${API_BASE_URL}/api/resend`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: signupEmail })
                    });
                    const data = await response.json();

                    if (data.success) {
                        if (messageDiv) {
                            messageDiv.style.color = '#51cf66';
                            messageDiv.innerText = 'New verification code sent successfully!';
                        }
                        clearInterval(resendInterval);
                        startSignupResendTimer();
                    } else {
                        if (messageDiv) {
                            messageDiv.style.color = '#ff6b6b';
                            messageDiv.innerText = data.message;
                        }
                        resendBtn.innerHTML = "Resend Code";
                    }
                } catch (err) {
                    console.error('Resend Error:', err);
                    if (messageDiv) {
                        messageDiv.style.color = '#ff6b6b';
                        messageDiv.innerText = 'Server error while resending.';
                    }
                    resendBtn.innerHTML = "Resend Code";
                }
            });
        }

        signupVerifyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            let code = '';
            inputs.forEach(input => code += input.value);

            const messageDiv = document.getElementById('message');

            if (code.length < 6) {
                if (messageDiv) {
                    messageDiv.style.color = '#ff6b6b';
                    messageDiv.innerText = 'Please enter the complete 6-digit code.';
                }
                return;
            }

            try {
                const endpoint = `${API_BASE_URL}/api/verify`;
                const res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: signupEmail, code })
                });

                const data = await res.json();

                if (data.success) {
                    if (messageDiv) {
                        messageDiv.style.color = '#51cf66';
                        messageDiv.innerText = 'Account verified successfully! Redirecting...';
                    }
                    localStorage.removeItem('signupEmail');
                    setTimeout(() => {
                        window.location.href = 'dashboard.html';
                    }, 1500);
                } else {
                    if (messageDiv) {
                        messageDiv.style.color = '#ff6b6b';
                        messageDiv.innerText = data.message;
                    }
                }
            } catch (err) {
                console.error('Error:', err);
                if (messageDiv) {
                    messageDiv.style.color = '#ff6b6b';
                    messageDiv.innerText = 'Error connecting to server!';
                }
            }
        });
    }
});

// =========================================================
// 🔴 SIGNUP PAGE LOGIC (signup.html) 🔴
// =========================================================

// 1. ጉግል ሲነካ ወደ ሰርቨር መረጃ የሚልከው (በነፃ ይቀመጣል)
async function handleGoogleSignUpResponse(response) {
    try {
        localStorage.clear(); 
        sessionStorage.clear();
        const res = await fetch(`${API_BASE_URL}/api/google-auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                token: response.credential,
                action: 'signup'
            })
        });
        const data = await res.json();
        
        if (data.success) {
            if (data.token) {
                localStorage.setItem('authToken', data.token);
                if (data.user && data.user.email) localStorage.setItem('userEmail', data.user.email);
                else if (data.email) localStorage.setItem('userEmail', data.email);
                window.location.href = data.redirectUrl || 'dashboard.html';
            } else if (data.exists === false) {
                const emailInput = document.getElementById('signup-email');
                if (emailInput && data.email) {
                    emailInput.value = data.email;
                    localStorage.setItem('signupEmail', data.email);
                    if (window.showSignupErrorToast) {
                        window.showSignupErrorToast("Google verified! Please create a password.");
                        const toastMsg = document.getElementById('toastMessage');
                        if(toastMsg) toastMsg.style.color = '#51cf66';
                    }
                } else {
                    window.location.href = data.redirectUrl || 'signup.html';
                }
            }
        } else {
            if (window.showSignupErrorToast) window.showSignupErrorToast(data.message || 'Google authentication failed.');
        }
    } catch (err) {
        console.error('Error:', err);
        if (window.showSignupErrorToast) window.showSignupErrorToast('Server error during Google sign-up.');
    }
}


// 2. 🔴 የተቀሩት የ Signup ፎርም ኮዶች እና የተስተካከለው የጉግል ማምጫ 🔴
document.addEventListener("DOMContentLoaded", () => {
    
    // 🔴 100% አስተማማኝ የጉግል ማምጫ (DOM ሎድ ካደረገ በኋላ ብቻ ይሰራል) 🔴
    const signupContainer = document.getElementById("googleSignUpBtnContainer");
    if (signupContainer) {
        const waitForGoogle = setInterval(() => {
            if (typeof google !== 'undefined' && google.accounts) {
                clearInterval(waitForGoogle); // ጉግል ሲመጣ ፍለጋውን ያቆማል
                google.accounts.id.initialize({
                    client_id: "661544926174-8kp01crhke9m1vmjf6kcts5o2e7sqek8.apps.googleusercontent.com",
                    callback: handleGoogleSignUpResponse
                });
                google.accounts.id.renderButton(signupContainer, { 
                    theme: "filled_black", size: "large", width: "340", shape: "rectangular", text: "continue_with"
                });
            }
        }, 100); // በየ 100 ሚሊ-ሰከንድ ያጣራል
    }

    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        // የድሮ ዳታዎችን ማጽዳት
        localStorage.removeItem('userEmail');
        localStorage.removeItem('authToken');

        const emailInput = document.getElementById('signup-email');
        const savedEmail = localStorage.getItem('signupEmail');
        
        if (savedEmail && emailInput) {
            emailInput.value = savedEmail;
            checkSignupRateLimit(savedEmail);
        }

        if (emailInput) {
            emailInput.addEventListener('input', function() {
                const em = this.value.trim();
                if (em) {
                    localStorage.setItem('signupEmail', em);
                    checkSignupRateLimit(em);
                }
            });
        }

        // Error Toast ማሳያ (Signup ልዩ)
        let toastTimer = null;
        window.showSignupErrorToast = function(message) {
            const toast = document.getElementById('errorToast');
            const toastMsg = document.getElementById('toastMessage');
            if(!toast || !toastMsg) return;
            
            toastMsg.innerText = message;
            toastMsg.style.color = '#fff';
            toast.style.display = 'flex';
            if (toastTimer) clearTimeout(toastTimer);
            
            if (!message.includes('try again in') && !message.includes('Google verified')) {
                toastTimer = setTimeout(() => { window.hideErrorToast(); }, 4000);
            } else if (message.includes('Google verified')) {
                toastTimer = setTimeout(() => { window.hideErrorToast(); }, 6000);
            }
        };

        window.hideErrorToast = function() {
            const toast = document.getElementById('errorToast');
            if(toast) toast.style.display = 'none';
        };

        // Rate Limiting (መቆለፊያ)
        let signupCountdownInterval = null;
        function checkSignupRateLimit(email) {
            const lockoutKey = 'signup_lockout_' + email;
            const lockoutUntil = localStorage.getItem(lockoutKey);
            if (lockoutUntil) {
                const remainingTime = parseInt(lockoutUntil, 10) - new Date().getTime();
                if (remainingTime > 0) {
                    lockSignupForm(remainingTime);
                } else {
                    localStorage.removeItem(lockoutKey);
                    unlockSignupForm();
                }
            } else {
                unlockSignupForm();
            }
        }

        function lockSignupForm(durationMs) {
            const submitBtn = document.getElementById('submitBtn');
            const pwdInput = document.getElementById('password-input');
            const confirmPwdInput = document.getElementById('confirm-password-input');
            const refCode = document.getElementById('referralCode');

            if(pwdInput) pwdInput.disabled = true;
            if(confirmPwdInput) confirmPwdInput.disabled = true;
            if(refCode) refCode.disabled = true;
            if(submitBtn) submitBtn.disabled = true;

            if (signupCountdownInterval) clearInterval(signupCountdownInterval);
            const lockoutEnd = new Date().getTime() + durationMs;

            signupCountdownInterval = setInterval(() => {
                const distance = lockoutEnd - new Date().getTime();
                if (distance <= 0) {
                    clearInterval(signupCountdownInterval);
                    const em = emailInput ? emailInput.value.trim() : '';
                    if (em) localStorage.removeItem('signup_lockout_' + em);
                    unlockSignupForm();
                } else {
                    const m = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                    const s = Math.floor((distance % (1000 * 60)) / 1000);
                    window.showSignupErrorToast(`Too many attempts. Please try again in ${m}m ${s}s.`);
                }
            }, 1000);
        }

        function unlockSignupForm() {
            if (signupCountdownInterval) clearInterval(signupCountdownInterval);
            const submitBtn = document.getElementById('submitBtn');
            const pwdInput = document.getElementById('password-input');
            const confirmPwdInput = document.getElementById('confirm-password-input');
            const refCode = document.getElementById('referralCode');

            if(emailInput) emailInput.disabled = false;
            if(pwdInput) pwdInput.disabled = false;
            if(confirmPwdInput) confirmPwdInput.disabled = false;
            if(refCode) refCode.disabled = false;
            if(submitBtn) submitBtn.disabled = false;
            window.hideErrorToast();
        }

        // Password Strength (ጥንካሬ መለኪያ)
        const passwordInput = document.getElementById('password-input');
        if(passwordInput) {
            passwordInput.addEventListener('input', function() {
                const pwd = this.value;
                const container = document.getElementById('strength-container');
                if (pwd.length > 0) container.style.display = 'block';
                else { container.style.display = 'none'; return; }

                const hasLength = pwd.length >= 8;
                const hasUpper = /[A-Z]/.test(pwd);
                const hasLower = /[a-z]/.test(pwd);
                const hasNumber = /[0-9]/.test(pwd);
                const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

                function updateReq(elId, isValid) {
                    const el = document.getElementById(elId);
                    if(el) {
                        if(isValid) el.classList.add('valid');
                        else el.classList.remove('valid');
                    }
                }

                updateReq('req-length', hasLength);
                updateReq('req-upper', hasUpper);
                updateReq('req-lower', hasLower);
                updateReq('req-number', hasNumber);
                updateReq('req-special', hasSpecial);

                let score = 0;
                if (hasLength) score++; if (hasUpper) score++; if (hasLower) score++; if (hasNumber) score++; if (hasSpecial) score++;

                const bars = [
                    document.getElementById('bar-1'), document.getElementById('bar-2'),
                    document.getElementById('bar-3'), document.getElementById('bar-4'),
                    document.getElementById('bar-5')
                ];
                const strengthText = document.getElementById('strength-text');
                bars.forEach(bar => { if(bar) bar.style.background = '#262626'; });
                if(strengthText) strengthText.innerText = '';

                let color = '#e95454'; let text = 'Weak';
                if (score >= 3 && score < 5) { color = '#f5d77f'; text = 'Medium'; }
                else if (score === 5) { color = '#00c087'; text = 'Strong'; }

                for (let i = 0; i < score; i++) { if(bars[i]) bars[i].style.background = color; }
                if(strengthText) { strengthText.style.color = color; strengthText.innerText = text; }
            });
        }

        // ፓስወርድ አሳይ/ደብቅ (Toggle Visibility)
        const togglePwd = document.getElementById('toggle-password');
        const toggleConfirm = document.getElementById('toggle-confirm');
        
        function togglePasswordVis(fieldId, icon) {
            const f = document.getElementById(fieldId);
            if(f && f.type === 'password') { f.type = 'text'; icon.classList.remove('fa-eye-slash'); icon.classList.add('fa-eye'); }
            else if(f) { f.type = 'password'; icon.classList.remove('fa-eye'); icon.classList.add('fa-eye-slash'); }
        }
        if(togglePwd) togglePwd.addEventListener('click', function() { togglePasswordVis('password-input', this); });
        if(toggleConfirm) toggleConfirm.addEventListener('click', function() { togglePasswordVis('confirm-password-input', this); });

        // Referral Code አሳይ/ደብቅ
        const refBtn = document.getElementById('referralToggleBtn');
        if(refBtn) {
            refBtn.addEventListener('click', function(e) {
                e.preventDefault();
                const refGroup = document.getElementById('referral-group');
                if(refGroup) refGroup.style.display = refGroup.style.display === 'block' ? 'none' : 'block';
            });
        }

        // ፎርም መላክ (Submit Event)
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const pwd = document.getElementById('password-input').value;
            const confirmVal = document.getElementById('confirm-password-input').value;
            const email = document.getElementById('signup-email').value.trim();
            const refCode = document.getElementById('referralCode') ? document.getElementById('referralCode').value : '';

            if (pwd !== confirmVal) {
                window.showSignupErrorToast("Passwords do not match!");
                return;
            }
            localStorage.setItem('signupEmail', email);

            try {
                const response = await fetch(`${API_BASE_URL}/api/signup`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password: pwd, referralCode: refCode })
                });
                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('signupEmail', email);
                    window.location.href = 'verify.html';
                } else {
                    if (response.status === 429 && data.lockUntil) {
                        const remainingMs = data.lockUntil - new Date().getTime();
                        localStorage.setItem('signup_lockout_' + email, data.lockUntil);
                        lockSignupForm(remainingMs);
                    } else {
                        window.showSignupErrorToast(data.message || "Something went wrong. Please try again.");
                        if(emailInput) emailInput.style.borderColor = '#ff4d4d';
                    }
                }
            } catch (err) {
                console.error(err);
                window.showSignupErrorToast("Error connecting to server!");
            }
        });
    }
});

// =========================================================
// 🔴 FORGOT PASSWORD LOGIC (forgot-password.html) 🔴
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    const forgotForm = document.getElementById('forgotForm');
    
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('forgot-email');
            const submitBtn = document.getElementById('forgotSubmitBtn');
            const msgBox = document.getElementById('responseMessage');
            
            const email = emailInput.value.trim();
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
            msgBox.style.display = 'none';

            try {
                // የ API_BASE_URL አስቀድሞ ስክሪፕቱ ላይ አለ
                const response = await fetch(`${API_BASE_URL}/api/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                
                const data = await response.json();

                if (response.ok && data.success) {
                    // ኢሜይሉ በትክክል ከተላከ Form State ን ደብቆ Success State ን ማሳየት
                    const sentDisplay = document.getElementById('sentEmailDisplay');
                    if(sentDisplay) sentDisplay.textContent = email;
                    
                    const formState = document.getElementById('formState');
                    const successState = document.getElementById('successState');
                    if(formState) formState.style.display = 'none';
                    if(successState) successState.style.display = 'block';
                } else {
                    msgBox.style.display = 'block';
                    msgBox.style.background = '#331e1e';
                    msgBox.style.color = '#f87171';
                    msgBox.style.border = '1px solid #ef4444';
                    msgBox.textContent = data.message || 'Failed to send reset link.';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Send Reset Link';
                }
            } catch (err) {
                console.error('Fetch Error:', err);
                msgBox.style.display = 'block';
                msgBox.style.background = '#331e1e';
                msgBox.style.color = '#f87171';
                msgBox.style.border = '1px solid #ef4444';
                msgBox.textContent = 'Server connection error. Please try again.';
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Reset Link';
            }
        });
    }
});

// =========================================================
// 🔴 RESET PASSWORD LOGIC (reset-password.html) 🔴
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    const resetForm = document.getElementById('resetForm');
    
    if (resetForm) {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');

        const newPasswordInput = document.getElementById('new-password');
        const confirmPasswordInput = document.getElementById('confirm-password');
        const submitBtn = document.getElementById('resetSubmitBtn');
        const feedbackContainer = document.getElementById('passwordFeedbackContainer');
        const strengthText = document.getElementById('strengthText');
        const successMessage = document.getElementById('successMessage');
        const successText = document.getElementById('successText');
        const responseMessage = document.getElementById('responseMessage');
        
        const bars = [
            document.getElementById('bar1'), document.getElementById('bar2'),
            document.getElementById('bar3'), document.getElementById('bar4'),
            document.getElementById('bar5')
        ];

        const reqs = {
            length: document.getElementById('req-length'),
            upper: document.getElementById('req-upper'),
            lower: document.getElementById('req-lower'),
            number: document.getElementById('req-number'),
            special: document.getElementById('req-special')
        };

        // ማሳያ/መደበቂያ
        const toggleNewPass = document.getElementById('toggleNewPass');
        const toggleConfirmPass = document.getElementById('toggleConfirmPass');
        
        if(toggleNewPass) {
            toggleNewPass.addEventListener('click', () => {
                const type = newPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                newPasswordInput.setAttribute('type', type);
                toggleNewPass.classList.toggle('fa-eye');
                toggleNewPass.classList.toggle('fa-eye-slash');
            });
        }

        if(toggleConfirmPass) {
            toggleConfirmPass.addEventListener('click', () => {
                const type = confirmPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                confirmPasswordInput.setAttribute('type', type);
                toggleConfirmPass.classList.toggle('fa-eye');
                toggleConfirmPass.classList.toggle('fa-eye-slash');
            });
        }

        if(newPasswordInput) {
            newPasswordInput.addEventListener('input', () => {
                const val = newPasswordInput.value;

                if (val.length > 0) feedbackContainer.style.display = 'block';
                else feedbackContainer.style.display = 'none';
                
                const hasLength = val.length >= 8;
                const hasUpper = /[A-Z]/.test(val);
                const hasLower = /[a-z]/.test(val);
                const hasNumber = /[0-9]/.test(val);
                const hasSpecial = /[\W_]/.test(val);

                function updateReqUI(element, isValid) {
                    if(!element) return;
                    if (isValid) {
                        element.classList.add('valid');
                        const icon = element.querySelector('i');
                        if(icon) icon.className = 'fa-solid fa-circle-check';
                    } else {
                        element.classList.remove('valid');
                        const icon = element.querySelector('i');
                        if(icon) icon.className = 'fa-solid fa-circle';
                    }
                }

                updateReqUI(reqs.length, hasLength);
                updateReqUI(reqs.upper, hasUpper);
                updateReqUI(reqs.lower, hasLower);
                updateReqUI(reqs.number, hasNumber);
                updateReqUI(reqs.special, hasSpecial);

                let score = [hasLength, hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
                
                const colors = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#22c55e'];
                const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];

                bars.forEach((bar, index) => {
                    if(!bar) return;
                    if (index < score) bar.style.background = colors[score - 1];
                    else bar.style.background = '#2a2a2a';
                });

                if(strengthText) {
                    strengthText.textContent = labels[score - 1] || 'Weak';
                    strengthText.style.color = colors[score - 1] || '#ef4444';
                }

                checkFormValidity();
            });
        }

        if(confirmPasswordInput) confirmPasswordInput.addEventListener('input', checkFormValidity);

        function checkFormValidity() {
            if(!newPasswordInput || !confirmPasswordInput || !submitBtn) return;
            const val = newPasswordInput.value;
            const confirmVal = confirmPasswordInput.value;
            
            const allValid = val.length >= 8 && 
                             /[A-Z]/.test(val) && 
                             /[a-z]/.test(val) && 
                             /[0-9]/.test(val) && 
                             /[\W_]/.test(val) && 
                             val === confirmVal && 
                             val !== '';

            submitBtn.disabled = !allValid;
        }

        // ፎርሙ ሲላክ
        resetForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = newPasswordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            if(responseMessage) responseMessage.style.display = 'none';

            if (newPassword !== confirmPassword) {
                if(responseMessage) {
                    responseMessage.style.display = 'block';
                    responseMessage.style.background = '#331e1e';
                    responseMessage.style.color = '#f87171';
                    responseMessage.style.border = '1px solid #ef4444';
                    responseMessage.textContent = 'Passwords do not match!';
                }
                return;
            }

            if (!token) {
                if(responseMessage) {
                    responseMessage.style.display = 'block';
                    responseMessage.style.background = '#331e1e';
                    responseMessage.style.color = '#f87171';
                    responseMessage.style.border = '1px solid #ef4444';
                    responseMessage.textContent = 'Invalid or missing reset token.';
                }
                return;
            }

            if(submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Updating...';
            }

            try {
                // የ API_BASE_URL አስቀድሞ አለ
                const response = await fetch(`${API_BASE_URL}/api/reset-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, newPassword })
                });
                
                const data = await response.json();

                if (response.ok && data.success) {
                    resetForm.style.display = 'none';
                    if(successText) successText.textContent = data.message || 'Your password has been successfully updated. Redirecting to login...';
                    if(successMessage) successMessage.style.display = 'block';

                    setTimeout(() => {
                        window.location.href = 'signin.html';
                    }, 2000);
                } else {
                    if(responseMessage) {
                        responseMessage.style.display = 'block';
                        responseMessage.style.background = '#331e1e';
                        responseMessage.style.color = '#f87171';
                        responseMessage.style.border = '1px solid #ef4444';
                        responseMessage.textContent = data.message || 'Password update failed.';
                    }
                    if(submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.textContent = 'Update Password';
                    }
                }
            } catch (err) {
                console.error('Fetch Error:', err);
                if(responseMessage) {
                    responseMessage.style.display = 'block';
                    responseMessage.style.background = '#331e1e';
                    responseMessage.style.color = '#f87171';
                    responseMessage.style.border = '1px solid #ef4444';
                    responseMessage.textContent = 'Server connection error. Please try again.';
                }
                if(submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Update Password';
                }
            }
        });
    }
});