document.addEventListener("DOMContentLoaded", () => {
    const forgotForm = document.getElementById('forgotForm');
    
    if (forgotForm) {
        forgotForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // ሪፍሬሽ እንዳያደርግ 100% ያቆመዋል
            
            const emailInput = document.getElementById('forgot-email');
            const submitBtn = document.getElementById('forgotSubmitBtn');
            const msgBox = document.getElementById('responseMessage');
            
            if(!emailInput) return;
            const email = emailInput.value.trim();
            
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
            msgBox.style.display = 'none';

            // የባክኤንድህ ትክክለኛ ሊንክ
            const BASE_URL = window.location.hostname.includes('localhost') 
                ? '' 
                : 'https://tbr-exchange-backend.onrender.com';

            try {
                const response = await fetch(`${BASE_URL}/api/forgot-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                
                const data = await response.json();

                if (response.ok && data.success) {
                    const sentDisplay = document.getElementById('sentEmailDisplay');
                    if(sentDisplay) sentDisplay.textContent = email;
                    
                    document.getElementById('formState').style.display = 'none';
                    document.getElementById('successState').style.display = 'block';
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