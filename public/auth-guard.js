// 🔒 CENTRAL AUTH GUARD (Frontend) 🔒
(function() {
    const publicPages = ['signin.html', 'signup.html', 'index.html', 'forgot-password.html', 'reset-password.html', ''];
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // ገጹ ከነጻ ገጾቹ ውጪ ከሆነ (ለምሳሌ market.html, wallet.html...) ቶክን መኖሩን ይፈትሻል
    if (!publicPages.includes(currentPage)) {
        const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('jwtToken');
        if (!token) {
            // ቶክን ከሌለው በ 0.00 ሰከንድ ቀጥታ ወደ Sign In ይመልሰዋል
            window.location.replace('signin.html');
        }
    }
})();