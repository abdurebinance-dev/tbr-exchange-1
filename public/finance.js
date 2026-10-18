// --- 🚀 FINANCE ADMIN CSP-COMPLIANT SCRIPT 🚀 ---
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://tbr-exchange-backend.onrender.com';

const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('authToken');
if (!token) {
    window.location.replace("signin.html");
}

// ⚡ EVENT DELEGATION FOR ALL CLICKS (Logout & Sweep to Master) ⚡
document.addEventListener('click', function(e) {
    // 1. Logout Button
    if (e.target.closest('#logoutBtn') || e.target.closest('.btn-logout')) {
        logout();
        return;
    }

    // 2. Sweep to Master Button (Dynamic rows)
    const sweepBtn = e.target.closest('.btn-sweep');
    if (sweepBtn) {
        const userId = sweepBtn.getAttribute('data-userid');
        if (userId) {
            manualSweep(userId);
        }
        return;
    }
});

async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/finance/stats`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('totalVolume').innerHTML = `${data.stats.totalVolume} <span>USDT</span>`;
            document.getElementById('todayVolume').innerHTML = `${data.stats.todayVolume} <span>USDT</span>`;
            document.getElementById('totalProfit').innerHTML = `${data.stats.totalProfit} <span>USDT</span>`;
            document.getElementById('todayProfit').innerHTML = `${data.stats.todayProfit} <span>USDT</span>`;

            const tbody = document.getElementById('pendingTable');
            tbody.innerHTML = '';
            if (!data.pendingSweeps || data.pendingSweeps.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No pending sweeps at the moment.</td></tr>';
            } else {
                let rowsHtml = '';
                data.pendingSweeps.forEach(user => {
                    rowsHtml += `
                        <tr>
                            <td>${user.email || '-'}</td>
                            <td class="wallet-addr">${user.bscAddress || '-'}</td>
                            <td class="balance-val">${user.balance || 0} USDT</td>
                            <td><button type="button" class="btn-sweep" data-userid="${user._id}">Sweep to Master</button></td>
                        </tr>
                    `;
                });
                tbody.innerHTML = rowsHtml;
            }
        }
    } catch (error) {
        console.error("Fetch Error:", error);
    }
}

async function manualSweep(userId) {
    if (!confirm("Are you sure you want to sweep this balance to the Master Wallet?")) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/manual-sweep`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': 'Bearer ' + token 
            },
            body: JSON.stringify({ userId })
        });
        const data = await res.json();
        alert(data.message);
        if (data.success) fetchStats(); 
    } catch (error) {
        alert('Sweep request failed.');
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('authToken');
    window.location.replace("signin.html");
}

// Initial Load
document.addEventListener('DOMContentLoaded', fetchStats);