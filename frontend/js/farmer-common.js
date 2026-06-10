if (typeof API_BASE_URL === 'undefined') {
    window.API_BASE_URL = window.location.protocol + '//' + window.location.hostname + ':5000';
}

async function logoutUser() {
    try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (err) {
        console.warn('Logout failed', err);
    }
    localStorage.removeItem('user_id');
    localStorage.removeItem('role');
    localStorage.removeItem('role_id');
    localStorage.removeItem('farmer_token');
    localStorage.removeItem('user_name');
    window.location.href = '../home.html';
}

function formatDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatCurrency(value) {
    if (value === null || value === undefined || value === '') return '-';
    const number = Number(value);
    if (Number.isNaN(number)) return '-';
    return `₹${number.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeText(value) {
    if (value === null || value === undefined || value === '') return '-';
    return String(value);
}

function renderStatusBadge(status) {
    const normalized = String(status || 'PENDING').trim().toUpperCase();
    let cls = 'status-badge pending';
    let label = normalized;

    if (normalized === 'PAID' || normalized === 'ACCEPTED' || normalized === 'COMPLETED') {
        cls = 'status-badge success';
    } else if (normalized === 'PENDING' || normalized === 'INITIATED' || normalized === 'PROCESSING') {
        cls = 'status-badge warning';
    } else if (normalized === 'REJECTED' || normalized === 'FAILED' || normalized === 'CANCELLED') {
        cls = 'status-badge danger';
    }

    return `<span class="${cls}">${label}</span>`;
}

function showNoDataMessage(body, columnCount, message) {
    body.innerHTML = `<tr><td colspan="${columnCount}" style="text-align:center; padding:24px; color:#555;">${message}</td></tr>`;
}

function showProofModal(proofUrl) {
    const modal = document.getElementById('proofModal');
    const image = document.getElementById('proofImage');
    const link = document.getElementById('proofLink');
    const text = document.getElementById('proofModalText');
    if (!modal || !link || !text) return;

    text.textContent = proofUrl ? 'Proof is available below. If the preview cannot be loaded, open it in a new tab.' : 'No payment proof is attached.';
    link.href = proofUrl || '#';
    link.style.display = proofUrl ? 'inline-flex' : 'none';

    if (image) {
        if (proofUrl && proofUrl.match(/\.(png|jpg|jpeg|webp|gif)$/i)) {
            image.src = proofUrl;
            image.style.display = 'block';
        } else {
            image.style.display = 'none';
        }
    }
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    // Close when clicking outside the modal
    const closeOnClickOutside = function(e) {
        if (e.target === modal) {
            closeProofModal();
        }
    };
    
    // Close on Escape key
    const closeOnEscape = function(e) {
        if (e.key === 'Escape') {
            closeProofModal();
        }
    };
    
    modal.addEventListener('click', closeOnClickOutside);
    document.addEventListener('keydown', closeOnEscape);
    
    // Store references for cleanup
    modal._closeOnClickOutside = closeOnClickOutside;
    modal._closeOnEscape = closeOnEscape;
}

function closeProofModal() {
    const modal = document.getElementById('proofModal');
    const image = document.getElementById('proofImage');
    if (!modal) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
    if (image) image.src = '';
}
