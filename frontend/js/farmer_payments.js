document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    logoutBtn?.addEventListener('click', logoutUser);
    loadPayments();
});

async function loadPayments() {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;

    try {
        const res = await fetch(`${API_BASE_URL}/farmer/payments`, {
            method: 'GET',
            credentials: 'include'
        });
        const data = await res.json();
        if (!data.success || !Array.isArray(data.payments) || data.payments.length === 0) {
            showNoDataMessage(tbody, 9, 'No payment records found.');
            return;
        }

        tbody.innerHTML = data.payments.map(tx => `
            <tr>
                <td>${formatDate(tx.payment_date)}</td>
                <td>${safeText(tx.order_id)}</td>
                <td>${safeText(tx.variety)}</td>
                <td>${safeText(tx.market_name)}</td>
                <td class="amount right">${formatCurrency(tx.total_amount_debited)}</td>
                <td class="status-col">${renderStatusBadge(tx.payment_status)}</td>
                <td>${tx.payment_proof_url ? `<button class="btn-proof" type="button" onclick="showProofModal('${encodeURI(tx.payment_proof_url)}')">View Proof</button>` : '-'}</td>
                <td>${safeText(tx.transaction_id)}</td>
                <td>${safeText(tx.upi_transaction_id)}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadPayments failed', err);
        showNoDataMessage(tbody, 9, 'Unable to load payments.');
    }
}
