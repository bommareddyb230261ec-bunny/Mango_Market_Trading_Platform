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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!data.success || !Array.isArray(data.requests) || data.requests.length === 0) {
            showNoDataMessage(tbody, 8, 'No accepted requests found.');
            return;
        }

        tbody.innerHTML = data.requests.map(r => `
            <tr>
                <td>${formatDate(r.date)}</td>
                <td>${safeText(r.order_id)}</td>
                <td>${safeText(r.variety)}</td>
                <td class="amount right">${formatTons(r.quantity_tons)}</td>
                <td>${safeText(r.market_name)}</td>
                <td class="amount right">${formatCurrency(r.agreed_price)}</td>
                <td>${formatDate(r.expected_delivery_date || r.date)}</td>
                <td><a class="proof-link" href="weighment.html">Weighment</a></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadAcceptedRequests failed', err);
        showNoDataMessage(tbody, 8, 'Unable to load accepted requests.');
    }
}

function formatTons(value) {
    if (value === null || value === undefined || value === '') return '-';
    const number = Number(value);
    if (Number.isNaN(number)) return safeText(value);
    return number.toFixed(2);
}
