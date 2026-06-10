/**
 * FARMER DASHBOARD - Professional UI Script
 * Handles sections, modals, and API interactions
 */

// Global variables and functions
let currentDistrict = "";
let MARKETS_BY_BROKER = {};

// Modal and DOM references
let sidebar, openSidebarBtn, closeSidebarBtn, navItems;
let locationSelect, searchForm, marketContainer, priceSort, logoutBtn, pageTitle;
let sellModal, sellForm, successModal, errorModal;

async function getApiBase() {
    if (typeof window.ensureApiReady === 'function') {
        const detectedBase = await window.ensureApiReady();
        if (detectedBase) return detectedBase;
    }

    if (window.API_BASE_URL) return window.API_BASE_URL;

    const protocol = window.location.protocol === 'file:' ? 'http:' : window.location.protocol;
    const hostname = window.location.hostname || '127.0.0.1';
    return `${protocol}//${hostname}:5000`;
}

async function farmerFetch(endpoint, options = {}) {
    const base = await getApiBase();
    return fetch(`${base}${endpoint}`, {
        credentials: 'include',
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
}

// ============ UTILITY FUNCTIONS ============
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getStatusClass(status) {
    const s = (status || 'PENDING').toUpperCase();
    if (s === 'ACCEPTED') return 'success';
    if (s === 'REJECTED') return 'danger';
    if (s === 'PENDING') return 'pending';
    return 'pending';
}

function updatePageTitle(section) {
    const titles = {
        'overview': 'Find Markets',
        'my-requests': 'My Sell Requests',
        'accepted': 'Accepted Requests'
    };
    if (pageTitle) pageTitle.textContent = titles[section] || 'Dashboard';
}

function updateMetrics(markets) {
    if (document.getElementById('marketsCount')) {
        document.getElementById('marketsCount').textContent = markets.length;
    }
}

function updateRequestMetrics(requests) {
    const activeCount = requests.filter(r => r.status === 'PENDING').length;
    const elem = document.getElementById('activeRequests');
    if (elem) elem.textContent = requests.length;
    
    const taskElem = document.getElementById('myRequestsCount');
    if (taskElem) taskElem.textContent = activeCount;
    
    const badgeElem = document.getElementById('requestBadge');
    if (badgeElem) badgeElem.textContent = activeCount;
}

function updateAcceptedMetrics(requests) {
    const elem = document.getElementById('acceptedOrders');
    if (elem) elem.textContent = requests.length;
    
    const taskElem = document.getElementById('acceptedCount');
    if (taskElem) taskElem.textContent = requests.length;
}

function loadFarmerName() {
    try {
        const name = localStorage.getItem('user_name') || 'Farmer';
        const farmerNameElem = document.getElementById('farmerName');
        if (farmerNameElem) farmerNameElem.textContent = name;
    } catch (e) {
        console.warn('Could not load farmer name:', e);
    }
}

function switchSection(section) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(section + 'View');
    if (view) {
        view.classList.add('active');
        updatePageTitle(section);
    }
}

// ============ MODAL MANAGEMENT ============
function openModal(modal) {
    if (modal) {
        modal.classList.add('open');
        document.body.classList.add('modal-lock');
    }
}

function closeModal(modal) {
    if (modal) {
        modal.classList.remove('open');
        document.body.classList.remove('modal-lock');
    }
}

function showSuccess(msg) {
    document.getElementById('successMessage').textContent = msg;
    openModal(successModal);
    setTimeout(() => closeModal(successModal), 3000);
}

function showError(msg) {
    document.getElementById('errorMessage').textContent = msg;
    openModal(errorModal);
}

function showRequestDetails(request) {
    alert(`Request Details:\n\nMarket: ${request.market_name || 'Market'}\nVariety: ${request.mango_variety || request.variety || '-'}\nQuantity: ${request.quantity_tons || 0} tons\nStatus: ${request.status || 'PENDING'}\nPreferred Date: ${formatDate(request.preferred_date || request.date)}`);
}

// ============ LOCATIONS & MARKETS ============
async function loadLocations() {
    if (!locationSelect) return;
    
    try {
        const res = await farmerFetch('/farmer/locations', { method: 'GET' });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (data.locations && Array.isArray(data.locations)) {
            const uniqueDistricts = [...new Set(data.locations.map(l => l.district).filter(Boolean))];
            locationSelect.innerHTML = '<option value="">Select District</option>';
            if (uniqueDistricts.length) {
                uniqueDistricts.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d;
                    opt.textContent = d;
                    locationSelect.appendChild(opt);
                });
            } else {
                locationSelect.innerHTML = '<option value="">No markets available yet</option>';
            }
            console.log("Locations loaded:", uniqueDistricts);
        } else {
            locationSelect.innerHTML = '<option value="">No markets available yet</option>';
        }
    } catch (e) {
        console.error("Error loading locations:", e);
        locationSelect.innerHTML = '<option>Error loading locations</option>';
    }
}

async function fetchMarkets(district, sort) {
    if (!marketContainer) return;
    
    marketContainer.innerHTML = '<div class="empty-state">Loading markets...</div>';
    try {
        const res = await farmerFetch(`/farmer/markets?district=${encodeURIComponent(district)}&sort=${encodeURIComponent(sort)}`, {
            method: 'GET'
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (data.markets && Array.isArray(data.markets)) {
            MARKETS_BY_BROKER = {};
            data.markets.forEach(m => {
                MARKETS_BY_BROKER[m.broker_id] = m;
            });
            renderMarkets(data.markets);
            updateMetrics(data.markets);
        } else {
            marketContainer.innerHTML = '<div class="empty-state">No markets found in this district.</div>';
        }
    } catch (e) {
        console.error("Error loading markets:", e);
        marketContainer.innerHTML = `<div class="empty-state">Error: ${e.message}</div>`;
    }
}

function renderMarkets(markets) {
    if (!marketContainer) return;
    
    marketContainer.innerHTML = "";

    if (!markets || markets.length === 0) {
        marketContainer.innerHTML = '<div class="empty-state">No markets available.</div>';
        return;
    }

    markets.forEach(m => {
        const card = document.createElement('div');
        card.className = 'market-card';

        const city = m.city || m.market_area || '';
        const district = m.district || '';
        const commission = Number(m.market_commission || 0);
        const varietyList = (m.varieties || m.prices || []);

        const varietiesHtml = varietyList.length > 0
            ? varietyList.map(v => {
                const name = v.name || v.mango_variety || '-';
                const price = v.price != null ? Number(v.price) : (v.price_per_kg != null ? Number(v.price_per_kg) : null);
                return `<span style="background:#e8f5e9; padding:4px 8px; border-radius:4px; font-weight:600; color:#2e7d32; font-size:0.85rem;">
                    ${name}${price ? ` ₹${price.toFixed(2)}/kg` : ''}
                </span>`;
            }).join('')
            : '<span style="color:#999;">Price TBA</span>';

        card.innerHTML = `
            <h4>${m.market_name || 'Market'}</h4>
            <p><strong>Broker:</strong> ${m.broker_name || '-'}</p>
            <p><strong>Phone:</strong> ${m.broker_phone || '-'}</p>
            <p><strong>Location:</strong> ${city}${city && district ? ', ' + district : (district || '')}</p>
            <p><strong>Commission:</strong> ₹${commission.toFixed(2)} per ₹100</p>
            <p style="margin-top:10px;"><strong>Varieties:</strong></p>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">${varietiesHtml}</div>
            <button type="button" class="btn primary" style="margin-top:12px; width:100%;">Send Sell Request</button>
        `;

        card.querySelector('.btn').addEventListener('click', () => {
            openSellModal(m.broker_id, m.market_name);
        });

        marketContainer.appendChild(card);
    });
}

// ============ SELL REQUEST MODAL ============
function openSellModal(brokerId, marketName) {
    const market = MARKETS_BY_BROKER[brokerId];
    document.getElementById('sellMarketId').value = brokerId;
    document.getElementById('sellMarketName').textContent = marketName;

    const varietySelect = document.getElementById('mangoVariety');
    const pricePreview = document.getElementById('selectedPricePreview');

    varietySelect.innerHTML = '<option value="">Select variety...</option>';
    if (market && market.prices && market.prices.length > 0) {
        market.prices.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.mango_variety;
            opt.textContent = p.mango_variety;
            opt.dataset.price = Number(p.price_per_kg || 0);
            varietySelect.appendChild(opt);
        });
    }

    varietySelect.onchange = () => {
        const sel = varietySelect.selectedOptions[0];
        if (sel && sel.dataset && sel.dataset.price) {
            const p = Number(sel.dataset.price);
            pricePreview.textContent = `Current price: ₹${p.toFixed(2)}/kg`;
        } else {
            pricePreview.textContent = '';
        }
    };

    const sellDateInput = document.getElementById('sellDate');
    if (sellDateInput) {
        const today = new Date().toISOString().split('T')[0];
        sellDateInput.min = today;
        sellDateInput.value = today;
    }

    openModal(sellModal);
}

// ============ MY REQUESTS ============
async function loadMyRequests() {
    const tbody = document.getElementById('myRequestsTableBody');
    if (!tbody) return;

    try {
        const res = await farmerFetch('/farmer/requests', { method: 'GET' });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (data.requests && Array.isArray(data.requests)) {
            renderMyRequests(data.requests);
            updateRequestMetrics(data.requests);
        }
    } catch (e) {
        console.error("Error loading my requests:", e);
        tbody.innerHTML = `<tr><td colspan="6" class="empty-table">Error loading requests</td></tr>`;
    }
}

function renderMyRequests(requests) {
    const tbody = document.getElementById('myRequestsTableBody');
    if (!tbody) return;

    if (!requests || requests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-table">No sell requests yet</td></tr>`;
        return;
    }

    tbody.innerHTML = requests.map(req => `
        <tr>
            <td><strong>${req.market_name || 'Market'}</strong></td>
            <td>${req.mango_variety || req.variety || '-'}</td>
            <td>${Number(req.quantity_tons || 0).toFixed(2)} tons</td>
            <td>${formatDate(req.preferred_date || req.date)}</td>
            <td><span class="status-pill ${getStatusClass(req.status)}">${req.status || 'PENDING'}</span></td>
            <td><button type="button" class="btn mini secondary" data-request-id="${req.id}">View</button></td>
        </tr>
    `).join('');

    // Attach view handlers
    tbody.querySelectorAll('[data-request-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const reqId = btn.dataset.requestId;
            const request = requests.find(r => r.id == reqId);
            if (request) showRequestDetails(request);
        });
    });
}

// ============ ACCEPTED REQUESTS ============
async function loadAcceptedRequests() {
    const tbody = document.getElementById('acceptedTableBody');
    if (!tbody) return;

    try {
        const res = await farmerFetch('/farmer/accepted', { method: 'GET' });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (data.requests && Array.isArray(data.requests)) {
            renderAcceptedRequests(data.requests);
            updateAcceptedMetrics(data.requests);
        }
    } catch (e) {
        console.error("Error loading accepted requests:", e);
        tbody.innerHTML = `<tr><td colspan="6" class="empty-table">Error loading requests</td></tr>`;
    }
}

function renderAcceptedRequests(requests) {
    const tbody = document.getElementById('acceptedTableBody');
    if (!tbody) return;

    if (!requests || requests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-table">No accepted requests yet</td></tr>`;
        return;
    }

    tbody.innerHTML = requests.map(req => `
        <tr>
            <td><strong>${req.market_name || 'Market'}</strong></td>
            <td>${req.mango_variety || req.variety || '-'}</td>
            <td>${Number(req.quantity_tons || 0).toFixed(2)} tons</td>
            <td>Rs ${Number(req.agreed_price_per_kg || req.agreed_price || 0).toFixed(2)}/kg</td>
            <td>${formatDate(req.delivery_date || req.expected_delivery_date || req.date)}</td>
            <td>
                <button type="button" class="btn mini primary" data-order-id="${req.id}">Schedule</button>
            </td>
        </tr>
    `).join('');
}

// ============ DOM INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
    console.log("Farmer Dashboard initializing...");

    // Initialize DOM references
    sidebar = document.getElementById('sidebar');
    openSidebarBtn = document.getElementById('openSidebarBtn');
    closeSidebarBtn = document.getElementById('closeSidebarBtn');
    navItems = document.querySelectorAll('.nav-item[data-section]');
    locationSelect = document.getElementById('locationSelect');
    searchForm = document.getElementById('searchForm');
    marketContainer = document.getElementById('marketListContainer');
    priceSort = document.getElementById('priceSort');
    logoutBtn = document.getElementById('logoutBtn');
    pageTitle = document.getElementById('pageTitle');

    // Modal references
    sellModal = document.getElementById('sellModal');
    sellForm = document.getElementById('sellForm');
    successModal = document.getElementById('successModal');
    errorModal = document.getElementById('errorModal');

    // ============ SIDEBAR NAVIGATION ============
    openSidebarBtn?.addEventListener('click', () => {
        sidebar?.classList.add('open');
    });

    closeSidebarBtn?.addEventListener('click', () => {
        sidebar?.classList.remove('open');
    });

    // Nav item click - switch sections
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const section = item.dataset.section;
            switchSection(section);
            navItems.forEach(ni => ni.classList.remove('active'));
            item.classList.add('active');
            sidebar?.classList.remove('open');
            
            // Reload data for specific sections
            if (section === 'my-requests') loadMyRequests();
            if (section === 'accepted') loadAcceptedRequests();
        });
    });

    // Task item click handlers (for task buttons in overview)
    document.querySelectorAll('.task-item[data-section]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const section = btn.dataset.section;
            switchSection(section);
            navItems.forEach(ni => ni.classList.remove('active'));
            document.querySelector(`.nav-item[data-section="${section}"]`)?.classList.add('active');
            sidebar?.classList.remove('open');

            if (section === 'my-requests') loadMyRequests();
            if (section === 'accepted') loadAcceptedRequests();
        });
    });

    // ============ MODAL EVENT HANDLERS ============
    // Close modal buttons (X icon)
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const modalId = btn.dataset.closeModal;
            const modal = document.getElementById(modalId);
            closeModal(modal);
        });
    });

    // Close on outside click
    [sellModal, successModal, errorModal].forEach(modal => {
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) closeModal(modal);
        });
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal(sellModal);
            closeModal(successModal);
            closeModal(errorModal);
        }
    });

    // ============ SEARCH & MARKETS ============
    if (locationSelect) {
        loadLocations();
    }

    // Search form submit
    searchForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        currentDistrict = locationSelect.value;
        if (!currentDistrict) {
            showError('Please select a district');
            return;
        }
        fetchMarkets(currentDistrict, priceSort.value);
    });

    // Sort change
    priceSort?.addEventListener('change', () => {
        if (currentDistrict) fetchMarkets(currentDistrict, priceSort.value);
    });

    // ============ SELL REQUEST FORM ============
    sellForm?.addEventListener('submit', async (e) => {
        e.preventDefault();

        const brokerId = document.getElementById('sellMarketId').value;
        const variety = document.getElementById('mangoVariety').value;
        const quantity = document.getElementById('quantity').value;
        const date = document.getElementById('sellDate').value;

        if (!variety || !quantity || !date) {
            showError('Please fill all fields');
            return;
        }

        try {
            const res = await farmerFetch('/farmer/sell-request', {
                method: 'POST',
                body: JSON.stringify({
                    broker_id: brokerId,
                    variety: variety,
                    quantity: parseFloat(quantity),
                    preferred_date: date
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                showSuccess('Request submitted successfully!');
                closeModal(sellModal);
                sellForm.reset();
                if (currentDistrict) fetchMarkets(currentDistrict, priceSort.value);
            } else {
                showError(data.message || 'Failed to submit request');
            }
        } catch (e) {
            console.error("Error submitting request:", e);
            showError('Error: ' + e.message);
        }
    });

    // ============ LOGOUT ============
    logoutBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await farmerFetch('/auth/logout', { method: 'POST' });
        } catch (e) {
            console.warn('Logout API failed', e);
        }

        localStorage.clear();
        window.location.href = 'home.html';
    });

    // ============ INITIAL SETUP ============
    switchSection('overview');
    loadMyRequests();
    loadAcceptedRequests();
    loadFarmerName();

    console.log("Farmer Dashboard initialized successfully");
});
