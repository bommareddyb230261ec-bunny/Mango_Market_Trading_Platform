document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn?.addEventListener('click', logoutUser);
    loadWeighments();
});

async function loadWeighments() {
    const tbody = document.getElementById('weighmentsTableBody');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_BASE_URL}/farmer/weighments`, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await res.json();
        if (!data.success || !Array.isArray(data.weighments) || data.weighments.length === 0) {
            showNoDataMessage(tbody, 11, 'No weighment records available.');
            return;
        }

        tbody.innerHTML = data.weighments.map(w => `
            <tr>
                <td>${formatDate(w.order_date)}</td>
                <td>${safeText(w.order_id)}</td>
                <td>${safeText(w.variety)}</td>
                <td>${safeText(w.market_name)}</td>
                <td class="amount right">${formatCurrency(w.agreed_price)}</td>
                <td>${formatDate(w.weighment_date)}</td>
                <td class="amount right">${safeText(w.final_weight_tons)}</td>
                <td class="amount right">${formatCurrency(w.final_price_per_kg)}</td>
                <td class="amount right">${w.total_amount !== null ? formatCurrency(w.total_amount) : '-'}</td>
                <td class="amount right">${w.commission !== null ? formatCurrency(w.commission) : '-'}</td>
                <td class="status-col">${renderStatusBadge(w.payment_status)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadWeighments failed', err);
        showNoDataMessage(tbody, 11, 'Unable to load weighment details.');
    }
}
