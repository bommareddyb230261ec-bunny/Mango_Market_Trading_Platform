/**
 * FARMER DASHBOARD SCRIPT
 */

document.addEventListener('DOMContentLoaded', () => {

    // Use global API_BASE_URL from api.js (don't redefine it)
    // Just verify it exists
    if (typeof API_BASE_URL === 'undefined') {
        window.API_BASE_URL = window.location.protocol + '//' + window.location.hostname + ':5000';
    }

    console.log("Farmer.js initialized with API_BASE_URL:", API_BASE_URL);

    // 1. Auth Check
    /* Uncomment if using localStorage for simplified auth
    if (!localStorage.getItem('user_id')) {
        window.location.href = 'farmer_login.html'; 
    }
    */

    // 2. DOM Elements
    const locationSelect = document.getElementById('locationSelect');
    const searchForm = document.getElementById('searchForm');
    const marketContainer = document.getElementById('marketListContainer');
    const priceSort = document.getElementById('priceSort');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // Modal Elements
    const sellModal = document.getElementById('sellModal');
    const sellForm = document.getElementById('sellRequestForm');
    const closeModalBtn = document.querySelector('.close-modal');

    let currentDistrict = "";
        // Map from broker_id -> market object returned by /farmer/markets
        window.MARKETS_BY_BROKER = {};

    // 3. Init - Add safety checks
    if (locationSelect) {
        console.log("locationSelect element found, loading locations...");
        loadLocations();
    } else {
        console.error("locationSelect element not found!");
    }
    
    loadDashboard(); // Loads history table

    // Modal close helpers
    function closeSellModal() {
        if (!sellModal) return;
        sellModal.classList.remove('show');
        document.body.style.overflow = '';
        // reset form and preview
        try {
            sellForm?.reset();
            const pricePreview = document.getElementById('selectedPricePreview');
            if (pricePreview) pricePreview.innerText = '';
            const varietySelect = document.getElementById('mangoVariety');
            if (varietySelect) varietySelect.innerHTML = '';
        } catch (e) {
            console.warn('Error resetting modal fields', e);
        }
    }

    function closeSuccessModal() {
        const successModal = document.getElementById('successModal');
        if (successModal) {
            successModal.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    function closeErrorModal() {
        const errorModal = document.getElementById('errorModal');
        if (errorModal) {
            errorModal.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    // Close events: X button, click outside, Escape key
    closeModalBtn?.addEventListener('click', () => closeSellModal());
    window.addEventListener('click', (e) => { 
        if (e.target === sellModal) closeSellModal();
        if (e.target === document.getElementById('successModal')) closeSuccessModal();
        if (e.target === document.getElementById('errorModal')) closeErrorModal();
        if (e.target === document.getElementById('proofModal')) closeProofModal();
    });
    window.addEventListener('keydown', (e) => { 
        if (e.key === 'Escape') {
            closeSellModal();
            closeSuccessModal();
            closeErrorModal();
        }
    });

    // Ensure sell form submission is wired
    sellForm?.addEventListener('submit', submitSellRequest);

    // 4. Search Event
    searchForm?.addEventListener('submit', async e => {
        e.preventDefault();
        currentDistrict = locationSelect.value;
        if (!currentDistrict) return alert("Select a district");
        fetchMarkets(currentDistrict, priceSort.value);
    });

    // 5. Sort Event
    priceSort?.addEventListener('change', () => {
        if (currentDistrict) fetchMarkets(currentDistrict, priceSort.value);
    });

    // Logout handler (calls backend to clear session, then clears local storage)
    logoutBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
            await fetch(`${API_BASE_URL}/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (err) {
            console.warn('Logout API call failed', err);
        }

        // Clear client-side session info
        localStorage.removeItem('user_id');
        localStorage.removeItem('role');
        localStorage.removeItem('role_id');
        localStorage.removeItem('farmer_token');
        localStorage.removeItem('user_name');
        // Redirect to home or login
        window.location.href = 'home.html';
    });

    // ================= FUNCTIONS =================

    async function loadLocations() {
        try {
            console.log("Loading locations from:", `${API_BASE_URL}/farmer/locations`);
            
            const res = await fetch(`${API_BASE_URL}/farmer/locations`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'  // Include session cookies
            });
            
            console.log("Fetch response status:", res.status, res.ok);
            
            if (!res.ok) {
                throw new Error(`HTTP Error: ${res.status} ${res.statusText}`);
            }
            
            const data = await res.json();
            console.log("Locations Response Data:", data);
            console.log("Response Keys:", Object.keys(data));
            
            if (!locationSelect) {
                console.error("locationSelect not available!");
                return;
            }
            
            locationSelect.innerHTML = '<option value="">Select District</option>';
            
            // Check if locations exist and handle the response
            if (data.locations && Array.isArray(data.locations) && data.locations.length > 0) {
                console.log("Found " + data.locations.length + " total locations");
                
                // Deduplicate districts
                const uniqueDistricts = [...new Set(data.locations.map(l => l.district))];
                
                console.log("Unique Districts found:", uniqueDistricts);
                
                if (uniqueDistricts.length === 0) {
                    locationSelect.innerHTML = '<option>No districts found</option>';
                    console.warn("No unique districts extracted from locations");
                    return;
                }
                
                uniqueDistricts.forEach(d => {
                    const opt = document.createElement('option');
                    opt.value = d;
                    opt.textContent = d;
                    locationSelect.appendChild(opt);
                    console.log("Added option:", d);
                });
                
                console.log("Successfully loaded " + uniqueDistricts.length + " districts");
            } else {
                console.warn("No locations in response. Response structure:", data);
                locationSelect.innerHTML = '<option>No markets available yet</option>';
            }
        } catch (e) {
            console.error("Error loading locations:", e);
            console.error("Error details:", e.message, e.stack);
            if (locationSelect) {
                locationSelect.innerHTML = '<option>Error loading locations</option>';
            }
        }
    }

    async function fetchMarkets(district, sort) {
        if (!district) {
            marketContainer.innerHTML = "<p>Please select a district first.</p>";
            return;
        }
        
        marketContainer.innerHTML = "<p>Loading markets...</p>";
        try {
            console.log("Fetching markets for district:", district, "sort:", sort);
            
            const res = await fetch(`${API_BASE_URL}/farmer/markets?district=${encodeURIComponent(district)}&sort=${sort}`, {
                method: 'GET',
                headers: {'Content-Type': 'application/json'},
                credentials: 'include'
            });
            
            if (!res.ok) {
                throw new Error(`HTTP Error: ${res.status}`);
            }
            
            const data = await res.json();
            console.log("Markets Response:", data);
            if (data && data.markets) {
                // store markets by broker id for modal population
                window.MARKETS_BY_BROKER = {};
                data.markets.forEach(mk => { window.MARKETS_BY_BROKER[mk.broker_id] = mk; });
                renderMarkets(data.markets);
                renderAggregateVarieties(data.markets);
            } else {
                marketContainer.innerHTML = "<p>No markets found in this district.</p>";
            }
        } catch (e) {
            console.error("Error loading markets:", e);
            marketContainer.innerHTML = `<p>Error loading markets: ${e.message}</p>`;
        }
    }

    function renderMarkets(markets) {
        marketContainer.innerHTML = "";
        
        if (!markets || markets.length === 0) {
            marketContainer.innerHTML = `
                <div style="text-align: center; padding: 40px; background: #f9f9f9; border-radius: 8px;">
                    <p style="font-size: 1.1rem; color: #666;">No brokers found in this area.</p>
                    <p style="color: #999; font-size: 0.95rem;">Try selecting a different district.</p>
                </div>
            `;
            return;
        }

        markets.forEach(m => {
            const div = document.createElement('div');
            div.className = "market-card";
            // Render a richer market card with broker info and varieties
            const city = m.city || m.market_area || '';
            const district = m.district || '';

            // Build variety chips (use `varieties` if provided, otherwise fall back to `prices`)
            const varietyList = (m.varieties && m.varieties.length > 0)
                ? m.varieties
                : (m.prices || []);

            const varietiesHtml = varietyList.length > 0
                ? varietyList.map(v => {
                    const name = v.name || v.mango_variety || '-';
                    const priceVal = (v.price != null) ? Number(v.price) : (v.price_per_kg != null ? Number(v.price_per_kg) : null);
                    const priceText = priceVal != null ? `₹${priceVal.toFixed(2)}/kg` : '';
                    return `
                        <div style="background:#fff; border:1px solid #eee; padding:8px 12px; border-radius:10px; min-width:120px; text-align:center; box-shadow: 0 2px 6px rgba(0,0,0,0.04);">
                            <div style="font-weight:600; color:#333; margin-bottom:6px;">${name}</div>
                            <div style="color:#2e7d32; font-weight:700;">${priceText}</div>
                        </div>
                    `;
                }).join('') : `<div style="color:#999;">Price TBA</div>`;

            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap:20px;">
                    <div style="flex: 1;">
                        <h3 style="margin: 0 0 8px 0; color: var(--primary-green); font-size: 1.2rem;">${m.market_name || 'Market'}</h3>
                        <p style="margin:4px 0; color:#555;"><strong>Broker:</strong> ${m.broker_name || '-'}</p>
                        <p style="margin:4px 0; color:#555;"><strong>Mobile:</strong> ${m.broker_phone || '-'}</p>
                        <p style="margin:6px 0 12px 0; color:#666; font-size:0.95rem;"><strong>Location:</strong> ${city}${city && district ? ', ' + district : (district || '')}</p>
                        <div style="margin-top:6px;">
                            <strong style="display:block; margin-bottom:6px;">Varieties & Prices:</strong>
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">${varietiesHtml}</div>
                        </div>
                    </div>
                    <div style="text-align: right; min-width: 160px;">
                        <button class="btn-primary sell-here-btn" style="margin-top: 15px; cursor: pointer; width: 100%;">Sell Here</button>
                    </div>
                </div>
            `;
            marketContainer.appendChild(div);

            // Attach safe click handler to the Sell Here button to avoid inline-onclick pitfalls
            const btn = div.querySelector('.sell-here-btn');
            if (btn) {
                btn.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    try {
                        // openSellModal expects (brokerId, marketName)
                        openSellModal(m.broker_id || m.brokerId || m.id, m.market_name || m.marketName || m.market_name);
                    } catch (err) {
                        console.error('openSellModal failed:', err, 'brokerId:', m.broker_id, 'name:', m.market_name);
                        alert('Failed to open Sell modal. Check console for details.');
                    }
                });
            }
        });
    }

    // Exposed to window for the onclick in HTML
    window.openSellModal = (brokerId, name) => {
        const market = window.MARKETS_BY_BROKER[brokerId] || null;
        document.getElementById('modalMarketId').value = brokerId;
        document.getElementById('modalMarketName').innerText = name;

        const varietySelect = document.getElementById('mangoVariety');
        const pricePreview = document.getElementById('selectedPricePreview');
        if (varietySelect) {
            varietySelect.innerHTML = '';
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'Select variety...';
            varietySelect.appendChild(placeholder);

            if (market && market.prices && market.prices.length > 0) {
                market.prices.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.mango_variety;
                    opt.textContent = p.mango_variety;
                    opt.dataset.price = parseFloat(p.price_per_kg);
                    varietySelect.appendChild(opt);
                });
            } else {
                ['Alphonso','Kesar','Totapuri','Dasheri'].forEach(v => {
                    const opt = document.createElement('option'); opt.value = v; opt.textContent = v; varietySelect.appendChild(opt);
                });
            }

            // Update preview when selection changes
            varietySelect.onchange = () => {
                const sel = varietySelect.selectedOptions[0];
                if (sel && sel.dataset && sel.dataset.price) {
                    const p = parseFloat(sel.dataset.price);
                    pricePreview.innerText = `Current price: ₹${p.toFixed(2)}/kg`;
                } else {
                    pricePreview.innerText = '';
                }
            };
            // trigger change to set preview if preselected
            varietySelect.dispatchEvent(new Event('change'));
        }

        // Set minimum date to today (prevent selecting past dates)
        const sellDateInput = document.getElementById('sellDate');
        if (sellDateInput) {
            const today = new Date().toISOString().split('T')[0];
            sellDateInput.min = today;
            // Also set the default value to today
            sellDateInput.value = today;
        }

        sellModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    };

    // Render aggregate unique varieties across the given markets
    function renderAggregateVarieties(markets) {
        const container = document.getElementById('allVarietiesContainer');
        if (!container) return;

        const unique = {};
        markets.forEach(m => {
            if (m.prices && Array.isArray(m.prices)) {
                m.prices.forEach(p => {
                    if (!unique[p.mango_variety]) unique[p.mango_variety] = [];
                    unique[p.mango_variety].push(p.price_per_kg);
                });
            }
        });

        const varieties = Object.keys(unique);
        if (varieties.length === 0) {
            container.innerHTML = '<p style="color:#666">No varieties available in this district yet.</p>';
            return;
        }

        const chips = varieties.map(v => {
            const prices = unique[v];
            const min = Math.min(...prices);
            return `<div style="display:inline-block; background:#fff; border:1px solid #e6f4ea; padding:8px 12px; margin-right:8px; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                        <strong style="display:block">${v}</strong>
                        <small style="color:#2e7d32">₹${min.toFixed(2)}/kg</small>
                    </div>`;
        }).join('');

        container.innerHTML = `<h4 style="margin:6px 0;">Available Varieties:</h4><div style="margin-top:8px;">${chips}</div>`;
    }

    async function submitSellRequest(e) {
        e.preventDefault();
        
        const payload = {
            broker_id: document.getElementById('modalMarketId').value,
            variety: document.getElementById('mangoVariety').value,
            quantity: document.getElementById('quantity').value,
            date: document.getElementById('sellDate').value
        };

        try {
            const res = await fetch(`${API_BASE_URL}/farmer/sell-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',  // IMPORTANT: Send cookies with request
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if(res.ok) {
                // Show success modal instead of alert
                const successModal = document.getElementById('successModal');
                const successMessage = document.getElementById('successMessage');
                if (successMessage) {
                    successMessage.textContent = data.message || 'Sell request submitted successfully';
                }
                if (successModal) {
                    successModal.classList.add('show');
                    document.body.style.overflow = 'hidden';
                }
                
                // Close sell request modal
                closeSellModal();
                sellForm.reset();
                
                // Refresh dashboard after a short delay to allow user to read success message
                setTimeout(() => {
                    loadDashboard();
                }, 1500);
            } else {
                // Show error modal instead of alert
                const errorModal = document.getElementById('errorModal');
                const errorMessage = document.getElementById('errorMessage');
                if (errorMessage) {
                    errorMessage.textContent = data.message || 'Failed to submit request';
                }
                if (errorModal) {
                    errorModal.classList.add('show');
                    document.body.style.overflow = 'hidden';
                }
            }
        } catch (err) {
            console.error(err);
            // Show error modal instead of alert
            const errorModal = document.getElementById('errorModal');
            const errorMessage = document.getElementById('errorMessage');
            if (errorMessage) {
                errorMessage.textContent = 'Failed to submit request. Please try again.';
            }
            if (errorModal) {
                errorModal.classList.add('show');
                document.body.style.overflow = 'hidden';
            }
        }
    }

    async function loadDashboard() {
        await Promise.all([
            loadFarmerRequests(),
            loadAcceptedRequests(),
            loadWeighments(),
            loadPayments()
        ]);
    }

    async function loadFarmerRequests() {
        const tbody = document.getElementById('requestsTableBody');
        if (!tbody) return;
        try {
            const res = await fetch(`${API_BASE_URL}/farmer/requests`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
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
                        <div class="market-details" title="${r.market_location ? `Location: ${safeText(r.market_location)}` : 'Market details'}">
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

    async function loadAcceptedRequests() {
        const tbody = document.getElementById('acceptedTableBody');
        if (!tbody) return;
        try {
            const res = await fetch(`${API_BASE_URL}/farmer/accepted`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
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
                    <td>
                        <div class="market-details">
                            <strong>${safeText(r.market_name)}</strong>
                        </div>
                    </td>
                    <td class="amount right">${formatCurrency(r.agreed_price)}</td>
                    <td>${safeText(r.expected_delivery_date)}</td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('loadAcceptedRequests failed', err);
            showNoDataMessage(tbody, 7, 'Unable to load accepted requests.');
        }
    }

    async function loadWeighments() {
        const tbody = document.getElementById('weighmentsTableBody');
        if (!tbody) return;
        try {
            const res = await fetch(`${API_BASE_URL}/farmer/weighments`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
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
                    <td>
                        <div class="market-details">
                            <strong>${safeText(w.market_name)}</strong>
                        </div>
                    </td>
                    <td class="amount right">${formatCurrency(w.agreed_price)}</td>
                    <td>${formatDate(w.weighment_date)}</td>
                    <td class="amount right">${safeText(w.final_weight_tons)}</td>
                    <td class="amount right">${formatCurrency(w.final_price_per_kg)}</td>
                    <td class="amount right">${w.total_amount !== null ? formatCurrency(w.total_amount) : '-'}</td>
                    <td class="amount right">${w.commission !== null ? formatCurrency(w.commission) : '-'}</td>
                    <td class="status-col">${renderStatusBadge(w.payment_status, 'payment')}</td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('loadWeighments failed', err);
            showNoDataMessage(tbody, 10, 'Unable to load weighment details.');
        }
    }

    async function loadPayments() {
        const tbody = document.getElementById('paymentsTableBody');
        if (!tbody) return;
        try {
            const res = await fetch(`${API_BASE_URL}/farmer/payments`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
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
                    <td>
                        <div class="market-details">
                            <strong>${safeText(tx.market_name)}</strong>
                        </div>
                    </td>
                    <td class="amount right">${formatCurrency(tx.total_amount_debited)}</td>
                    <td class="status-col">${renderStatusBadge(tx.payment_status, 'payment')}</td>
                    <td>${tx.payment_proof_url ? `<button class="btn-secondary" type="button" onclick="showProofModal('${encodeURI(tx.payment_proof_url)}')">View Proof</button>` : '-'}</td>
                    <td>${safeText(tx.transaction_id)}</td>
                    <td>${safeText(tx.upi_transaction_id)}</td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('loadPayments failed', err);
            showNoDataMessage(tbody, 9, 'Unable to load payments.');
        }
    }

    function renderStatusBadge(status, type = 'request') {
        if (!status) status = 'PENDING';
        const normalized = String(status).trim().toUpperCase();
        let badgeClass = 'status-badge pending';
        let label = normalized;

        if (['ACCEPTED', 'PAID', 'COMPLETED'].includes(normalized)) {
            badgeClass = 'status-badge success';
            label = normalized === 'COMPLETED' ? 'COMPLETED' : normalized;
        } else if (['REJECTED', 'FAILED', 'CANCELLED'].includes(normalized)) {
            badgeClass = 'status-badge danger';
            label = normalized;
        } else if (['AWAITING_VERIFICATION', 'INITIATED', 'PENDING', 'PROCESSING'].includes(normalized)) {
            badgeClass = 'status-badge warning';
            label = normalized === 'AWAITING_VERIFICATION' ? 'Admin Verification' : (normalized === 'INITIATED' ? 'Pending' : normalized);
        }

        return `<span class="${badgeClass}">${label}</span>`;
    }

    function formatCurrency(value) {
        if (value === null || typeof value === 'undefined' || value === '') return '-';
        const num = Number(value);
        if (Number.isNaN(num)) return '-';
        return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function formatDate(value) {
        if (!value) return '-';
        try {
            const d = new Date(value);
            if (Number.isNaN(d.getTime())) return value;
            return d.toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' });
        } catch (e) {
            return value;
        }
    }

    function safeText(value) {
        if (value === null || typeof value === 'undefined' || value === '') return '-';
        return String(value);
    }

    function showNoDataMessage(body, columnCount, message) {
        body.innerHTML = `<tr><td colspan="${columnCount}" style="text-align:center; padding:24px; color:#555;">${message}</td></tr>`;
    }

    window.showProofModal = function(proofUrl) {
        const modal = document.getElementById('proofModal');
        const image = document.getElementById('proofImage');
        const link = document.getElementById('proofLink');
        const text = document.getElementById('proofModalText');

        if (!modal || !link || !text) return;

        text.textContent = proofUrl ? 'Proof is available below. If the preview cannot be loaded, open it in a new tab.' : 'No payment proof is attached to this transaction.';
        link.href = proofUrl || '#';
        link.style.display = proofUrl ? 'inline-block' : 'none';

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
    };

    function closeProofModal() {
        const modal = document.getElementById('proofModal');
        const image = document.getElementById('proofImage');
        if (!modal) return;
        modal.classList.remove('show');
        document.body.style.overflow = '';
        if (image) image.src = '';
    }

    // Bank OTP state
    let bankEmail = null;
    let bankVerified = false;
    let bankCountdownTimer = null;

    // Helper: disable/enable bank inputs and save button
    function setBankControlsDisabled(disabled) {
        const inputs = ['accountNum','ifscCode','upiId'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = disabled;
        });
        const btn = document.getElementById('saveBankBtn');
        if (btn) btn.disabled = disabled;
    }

    async function fetchCurrentUserEmail() {
        try {
            const res = await fetch(`${API_BASE_URL}/auth/me`, { method: 'GET', credentials: 'include' });
            if (!res.ok) return null;
            const data = await res.json();
            return { email: data.email || null, verified: !!data.verified };
        } catch (e) {
            console.warn('Failed to fetch current user email', e);
            return null;
        }
    }

    async function startBankOtpCountdown(seconds) {
        const timerSpan = document.getElementById('bankCountdown');
        const sendBtn = document.getElementById('sendBankOtpBtn');
        let timeLeft = seconds;

        sendBtn.disabled = true;

        if (bankCountdownTimer) clearInterval(bankCountdownTimer);
        timerSpan.textContent = timeLeft;
        bankCountdownTimer = setInterval(() => {
            timeLeft--;
            timerSpan.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(bankCountdownTimer);
                sendBtn.disabled = false;
                sendBtn.innerText = "Resend OTP";
                document.getElementById('bankTimer').textContent = "Resend OTP now";
            }
        }, 1000);
    }

    async function sendBankOTP() {
        if (!bankEmail) {
            alert('No email associated with your account. Please set an email in your profile and verify it.');
            return;
        }
        const sendBtn = document.getElementById('sendBankOtpBtn');
        sendBtn.disabled = true;
        sendBtn.innerText = 'Sending...';
        try {
            const res = await fetch(`${API_BASE_URL}/auth/send-otp`, {
                method: 'POST', headers: {'Content-Type':'application/json'}, credentials: 'include', body: JSON.stringify({ email: bankEmail })
            });
            const data = await res.json();
            if (data.success) {
                document.getElementById('bankOtpSection').style.display = 'block';
                startBankOtpCountdown(30);
                sendBtn.innerText = 'Sent';
            } else {
                alert(data.message || 'Failed to send OTP');
                sendBtn.disabled = false;
                sendBtn.innerText = 'Get OTP';
            }
        } catch (e) {
            console.error('sendBankOTP failed', e);
            alert('Failed to send OTP');
            sendBtn.disabled = false;
            sendBtn.innerText = 'Get OTP';
        }
    }

    async function verifyBankOTP() {
        const otp = (document.getElementById('bankOtpInput')?.value || '').trim();
        const verifyBtn = document.getElementById('verifyBankOtpBtn');
        if (otp.length !== 6) {
            alert('Enter 6-digit OTP');
            return;
        }
        verifyBtn.innerText = 'Verifying...';
        try {
            const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
                method: 'POST', headers: {'Content-Type':'application/json'}, credentials: 'include', body: JSON.stringify({ email: bankEmail, otp })
            });
            const data = await res.json();
            if (data.success) {
                bankVerified = true;
                document.getElementById('bankOtpSection').style.display = 'none';
                document.getElementById('bankOtpSuccessMsg').style.display = 'block';
                document.getElementById('sendBankOtpBtn').style.display = 'none';
                document.getElementById('bankVerifyWarning').style.display = 'none';
                setBankControlsDisabled(false);

                // Fetch full bank details after verification to prefill fields (if any)
                try {
                    const bankRes = await fetch(`${API_BASE_URL}/farmer/bank`, { method: 'GET', credentials: 'include' });
                    if (bankRes.ok) {
                        const bankData = await bankRes.json();
                        if (bankData && bankData.success && bankData.bank) {
                            if (bankData.verified) {
                                if (bankData.bank.account_number) document.getElementById('accountNum').value = bankData.bank.account_number;
                                if (bankData.bank.ifsc) document.getElementById('ifscCode').value = bankData.bank.ifsc;
                                if (bankData.bank.upi) document.getElementById('upiId').value = bankData.bank.upi;
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Failed to fetch bank after verify', err);
                }

            } else {
                alert(data.message || 'Invalid or expired OTP');
                verifyBtn.innerText = 'Verify';
            }
        } catch (e) {
            console.error('verifyBankOTP failed', e);
            alert('OTP verification failed');
            verifyBtn.innerText = 'Verify';
        }
    }

    // Attach to window for the onsubmit in HTML
    window.updateBankDetails = async (e) => {
        e.preventDefault();

        if (!bankVerified) {
            alert('Please verify your email before saving bank details.');
            return;
        }

        const payload = {
            account_number: document.getElementById('accountNum').value,
            ifsc: document.getElementById('ifscCode').value,
            upi: document.getElementById('upiId').value
        };

        try {
            const res = await fetch(`${API_BASE_URL}/farmer/update-bank`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            if(res.ok) {
                alert("Bank details updated successfully!");
                // Refresh bank details to show persisted values
                try {
                    const bankRes = await fetch(`${API_BASE_URL}/farmer/bank`, { method: 'GET', credentials: 'include' });
                    if (bankRes.ok) {
                        const bankData = await bankRes.json();
                        if (bankData && bankData.success && bankData.bank) {
                            if (bankData.verified) {
                                if (bankData.bank.account_number) document.getElementById('accountNum').value = bankData.bank.account_number;
                                if (bankData.bank.ifsc) document.getElementById('ifscCode').value = bankData.bank.ifsc;
                                if (bankData.bank.upi) document.getElementById('upiId').value = bankData.bank.upi;
                            } else {
                                if (bankData.bank.account_masked) document.getElementById('accountNum').placeholder = bankData.bank.account_masked;
                                if (bankData.bank.ifsc_masked) document.getElementById('ifscCode').placeholder = bankData.bank.ifsc_masked;
                                if (bankData.bank.upi_masked) document.getElementById('upiId').placeholder = bankData.bank.upi_masked;
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Failed to refresh bank details', err);
                }
            } else {
                const data = await res.json();
                alert("Error: " + (data.message || 'Update failed'));
            }
        } catch(err) {
            console.error('updateBankDetails failed', err);
            alert("Update failed");
        }
    };

    // Initialize bank OTP behavior on page load
    (async () => {
        try {
            setBankControlsDisabled(true);
            const userInfo = await fetchCurrentUserEmail();
            if (userInfo && userInfo.email) {
                bankEmail = userInfo.email;
                if (userInfo.verified) {
                    bankVerified = true;
                    document.getElementById('bankOtpSuccessMsg').style.display = 'block';
                    document.getElementById('bankVerifyWarning').style.display = 'none';
                    setBankControlsDisabled(false);
                    document.getElementById('sendBankOtpBtn').style.display = 'none';
                }
            } else {
                // Keep disabled and show hint (already present in warning)
                console.warn('User has no email on file');
            }

            // Load existing bank details (masked or full based on server-side verification)
            try {
                const bankRes = await fetch(`${API_BASE_URL}/farmer/bank`, { method: 'GET', credentials: 'include' });
                if (bankRes.ok) {
                    const bankData = await bankRes.json();
                    if (bankData && bankData.success && bankData.bank) {
                        if (bankData.verified) {
                            // Prefill full values
                            if (bankData.bank.account_number) document.getElementById('accountNum').value = bankData.bank.account_number;
                            if (bankData.bank.ifsc) document.getElementById('ifscCode').value = bankData.bank.ifsc;
                            if (bankData.bank.upi) document.getElementById('upiId').value = bankData.bank.upi;

                            bankVerified = true;
                            document.getElementById('bankOtpSuccessMsg').style.display = 'block';
                            document.getElementById('bankVerifyWarning').style.display = 'none';
                            setBankControlsDisabled(false);
                            document.getElementById('sendBankOtpBtn').style.display = 'none';
                        } else {
                            // Show masked placeholders
                            if (bankData.bank.account_masked) document.getElementById('accountNum').placeholder = bankData.bank.account_masked;
                            if (bankData.bank.ifsc_masked) document.getElementById('ifscCode').placeholder = bankData.bank.ifsc_masked;
                            if (bankData.bank.upi_masked) document.getElementById('upiId').placeholder = bankData.bank.upi_masked;
                        }
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch bank details', err);
            }

            const sendBtn = document.getElementById('sendBankOtpBtn');
            const verifyBtn = document.getElementById('verifyBankOtpBtn');
            sendBtn?.addEventListener('click', sendBankOTP);
            verifyBtn?.addEventListener('click', verifyBankOTP);
        } catch (e) {
            console.error('Bank OTP init failed', e);
        }
    })();
});