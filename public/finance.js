const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://tbr-exchange-backend.onrender.com';

// Token pa kpa-kpa-h-u (adminToken, token, authToken)
const token = localStorage.getItem('adminToken') || localStorage.getItem('token') || localStorage.getItem('authToken');

async function fetchStats() {
    if (!token) {
        console.error("No admin token found in localStorage!");
        alert("Please login as Admin first.");
        window.location.replace("signin.html");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/admin/finance/stats`, {
            method: 'GET',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token 
            }
        });
        
        const data = await res.json();
        console.log("Finance Stats Response:", data); // Kpa console log pa check ma-konta-h-u
        
        if (res.ok && data.success) {
            document.getElementById('totalVolume').innerHTML = `${data.stats.totalVolume || 0.00} <span>USDT</span>`;
            document.getElementById('todayVolume').innerHTML = `${data.stats.todayVolume || 0.00} <span>USDT</span>`;
            document.getElementById('totalProfit').innerHTML = `${data.stats.totalProfit || 0.00} <span>USDT</span>`;
            document.getElementById('todayProfit').innerHTML = `${data.stats.todayProfit || 0.00} <span>USDT</span>`;

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
        } else {
            console.error("Server error message:", data.message || res.statusText);
            document.getElementById('pendingTable').innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--danger-color);">Error: ${data.message || 'Unauthorized or failed to load data.'}</td></tr>`;
        }
    } catch (error) {
        console.error("Fetch Error:", error);
        document.getElementById('pendingTable').innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--danger-color);">Network connection error.</td></tr>';
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

document.addEventListener('click', function(e) {
    if (e.target.closest('#logoutBtn') || e.target.closest('.btn-logout')) {
        logout();
        return;
    }

    const sweepBtn = e.target.closest('.btn-sweep');
    if (sweepBtn) {
        const userId = sweepBtn.getAttribute('data-userid');
        if (userId) {
            manualSweep(userId);
        }
        return;
    }
});

document.addEventListener('DOMContentLoaded', fetchStats);