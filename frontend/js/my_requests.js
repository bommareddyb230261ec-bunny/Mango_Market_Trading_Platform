document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn?.addEventListener('click', logoutUser);
    loadFarmerRequests();
});

async function loadFarmerRequests() {
    const tbody = document.getElementById('requestsTableBody');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_BASE_URL}/farmer/requests`, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await res.json();
        if (!data.success || !Array.isArray(data.requests) || data.requests.length === 0) {
            showNoDataMessage(tbody, 8, 'No requests found.');
            return;
        }

        tbody.innerHTML = data.requests.map(r => `
            <tr>
                <td>${formatDate(r.date)}</td>
                <td>${safeText(r.order_id)}</td>
                <td>${safeText(r.variety)}</td>
                <td class="amount right">${safeText(r.quantity_tons)}</td>
                <td>
                    <div class="market-details">
                        <strong>${safeText(r.market_name)}</strong>
                        <span>Broker: ${safeText(r.broker_name)}</span>
                    </div>
                </td>
                <td>${safeText(r.expected_delivery_date)}</td>
                <td class="status-col">${renderStatusBadge(r.status)}</td>
                <td>${safeText(r.rejection_reason)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadFarmerRequests failed', err);
        showNoDataMessage(tbody, 8, 'Unable to load requests.');
    }
}
