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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

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
                <td class="amount right">${formatTons(r.quantity_tons)}</td>
                <td>
                    <div class="market-details">
                        <strong>${safeText(r.market_name)}</strong>
                        <span>Broker: ${safeText(r.broker_name)}</span>
                        ${r.market_location ? `<span>${safeText(r.market_location)}</span>` : ''}
                    </div>
                </td>
                <td>${formatDate(r.expected_delivery_date || r.preferred_date || r.date)}</td>
                <td class="status-col">${renderStatusBadge(r.status)}</td>
                <td>${safeText(r.rejection_reason)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadFarmerRequests failed', err);
        showNoDataMessage(tbody, 8, 'Unable to load requests.');
    }
}

function formatTons(value) {
    if (value === null || value === undefined || value === '') return '-';
    const number = Number(value);
    if (Number.isNaN(number)) return safeText(value);
    return number.toFixed(2);
}
