document.addEventListener('DOMContentLoaded', async () => {
    const table = document.getElementById('acceptedTableBody');
    try {
        const res = await fetch(`${API_BASE_URL}/farmer/dashboard`, { method: 'GET', credentials: 'include' });
        if (!res.ok) {
            table.innerHTML = `<tr><td colspan="12" style="text-align:center;">Failed to load: ${res.status}</td></tr>`;
            return;
        }
        const data = await res.json();
        const rows = (data.requests || []).filter(r => r.status === 'ACCEPTED');
        if (rows.length === 0) {
            table.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:18px;">No accepted requests found.</td></tr>`;
            return;
        }

        table.innerHTML = rows.map(r => `
            <tr>
                <td>${new Date(r.created_at || r.date).toLocaleDateString()}</td>
                <td>${r.variety || '-'}</td>
                <td>${r.quantity_tons || '-'}</td>
                <td>${r.agreed_price ? '₹'+Number(r.agreed_price).toFixed(2) : '-'}</td>
                <td>${r.market_name || '-'}</td>
                <td>${r.expected_delivery_date || '-'}</td>
                <td>${r.order_id || '-'}</td>
                <td>${(r.weighment_weight_tons !== null && r.weighment_weight_tons !== undefined) ? r.weighment_weight_tons : (r.latest_weighment ? r.latest_weighment.actual_weight_tons : '-') }</td>
                <td>${(r.broker_final_price !== null && r.broker_final_price !== undefined) ? ('₹'+Number(r.broker_final_price).toFixed(2)) : (r.latest_weighment ? ('₹'+Number(r.latest_weighment.final_price_per_kg).toFixed(2)) : '-')}</td>
                <td>${r.transaction ? ('₹'+Number(r.transaction.net_payable).toFixed(2)) : '-'}</td>
                <td>${r.transaction ? new Date(r.transaction.transaction_date).toLocaleDateString() : '-'}</td>
                <td>${r.transaction ? r.transaction.payment_status : 'Pending'}</td>
            </tr>
        `).join('');

    } catch (e) {
        console.error('Accepted page load error', e);
        table.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:18px;">Error loading accepted requests.</td></tr>`;
    }

    // Logout wiring (same as farmer.js)
    document.getElementById('logoutBtn').addEventListener('click', async (ev) => {
        ev.preventDefault();
        try { await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }); } catch (err) { }
        window.location.href = 'home.html';
    });
});
