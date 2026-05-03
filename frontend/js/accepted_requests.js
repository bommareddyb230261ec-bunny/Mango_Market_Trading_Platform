document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn?.addEventListener('click', logoutUser);
    loadAcceptedRequests();
});

async function loadAcceptedRequests() {
    const tbody = document.getElementById('acceptedTableBody');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_BASE_URL}/farmer/accepted`, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await res.json();
        if (!data.success || !Array.isArray(data.requests) || data.requests.length === 0) {
            showNoDataMessage(tbody, 7, 'No accepted requests found.');
            return;
        }

        tbody.innerHTML = data.requests.map(r => `
            <tr>
                <td>${formatDate(r.date)}</td>
                <td>${safeText(r.order_id)}</td>
                <td>${safeText(r.variety)}</td>
                <td class="amount right">${safeText(r.quantity_tons)}</td>
                <td>${safeText(r.market_name)}</td>
                <td class="amount right">${formatCurrency(r.agreed_price)}</td>
                <td>${safeText(r.expected_delivery_date)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadAcceptedRequests failed', err);
        showNoDataMessage(tbody, 7, 'Unable to load accepted requests.');
    }
}
