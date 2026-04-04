/**
 * ========================================
 * BROKER DASHBOARD JAVASCRIPT
 * Handles all broker functionality
 * ========================================
 */

// =====================================================
// CONFIGURATION
// =====================================================
// Use unified API_BASE_URL from api.js
// This will be resolved at runtime via _ensureApiBase()
const BROKER_CONFIG = {
    // Will be set dynamically after api.js loads
    API_BASE: null,
    ENDPOINTS: {
        DASHBOARD: '/broker/dashboard',
        UPDATE_PRICES: '/broker/update-prices',
        UPDATE_REQUEST_STATUS: '/broker/request/<id>/status',
        WEIGHMENT: '/broker/weighment',
        PROFILE: '/broker/profile'
    }
};

// Initialize API_BASE after DOM is ready and api.js is loaded
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof window.API_BASE_URL !== 'undefined') {
        BROKER_CONFIG.API_BASE = window.API_BASE_URL;
    } else if (typeof window.ensureApiReady === 'function') {
        const base = await window.ensureApiReady();
        BROKER_CONFIG.API_BASE = base || (window.location.protocol + '//' + window.location.hostname + ':5000');
    } else {
        BROKER_CONFIG.API_BASE = window.location.protocol + '//' + window.location.hostname + ':5000';
    }
    window.BROKER_CONFIG = BROKER_CONFIG;
});

// =====================================================
// BROKER DASHBOARD MANAGER
// =====================================================
const BrokerDashboard = {
    
    // ===== State =====
    currentBroker: null,
    sellRequests: [],
    transactions: [],
    marketPrices: [],

    // ===== Initialization =====
    async init() {
        console.log('🚀 Initializing Broker Dashboard...');
        
        try {
            // Ensure API_BASE is resolved first
            if (!BROKER_CONFIG.API_BASE) {
                if (typeof window.API_BASE_URL !== 'undefined') {
                    BROKER_CONFIG.API_BASE = window.API_BASE_URL;
                } else if (typeof window.ensureApiReady === 'function') {
                    const base = await window.ensureApiReady();
                    BROKER_CONFIG.API_BASE = base || (window.location.protocol + '//' + window.location.hostname + ':5000');
                } else {
                    BROKER_CONFIG.API_BASE = window.location.protocol + '//' + window.location.hostname + ':5000';
                }
            }
            
            // First check if local storage has user details (fast path)
            const userDetails = AuthManager.getUserDetails();
            if (userDetails && userDetails.role !== 'BROKER') {
                console.error('❌ User is not a broker');
                window.location.href = 'broker_login.html';
                return;
            }

            // Attempt to load dashboard even when localStorage lacks user details.
            // Server-side session cookies might still be valid (so don't redirect immediately).
            await this.loadDashboard();

            if (!userDetails && this.currentBroker) {
                console.log('ℹ️ Authenticated via server session (no localStorage) for broker:', this.currentBroker.market_name);
            } else if (userDetails) {
                console.log('✅ User authenticated as Broker:', userDetails.name);
            }

            // Setup event listeners
            this.setupEventListeners();

            console.log('✅ Broker Dashboard loaded successfully');

            // Setup event listeners
            this.setupEventListeners();

            console.log('✅ Broker Dashboard loaded successfully');
        } catch (error) {
            console.error('❌ Dashboard initialization failed:', error);
            this.showError('Failed to initialize dashboard: ' + error.message);
        }
    },

    // ===== Load Dashboard Data =====
    async loadDashboard() {
        try {
            console.log('📊 Loading broker dashboard data...');

            const response = await fetch(BROKER_CONFIG.API_BASE + BROKER_CONFIG.ENDPOINTS.DASHBOARD, {
                method: 'GET',
                headers: APIClient.getHeaders(),
                credentials: 'include'
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('Unauthorized. Please log in again.');
                }
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Failed to load dashboard');
            }

            // Update state
            this.currentBroker = data.broker;
            this.sellRequests = data.sell_requests || [];
            this.transactions = data.transactions || [];
            this.marketPrices = data.market_prices || [];

            console.log('✅ Dashboard data loaded');
            console.log('   - Broker:', this.currentBroker.market_name);
            console.log('   - Sell Requests:', this.sellRequests.length);
            console.log('   - Transactions:', this.transactions.length);
            console.log('   - Market Prices:', this.marketPrices.length);

            // Render UI
            this.renderBrokerInfo();
            this.renderMarketPrices();
            // Populate variety dropdown with market prices
            this.refreshVarietyDropdown();
            // Render requests and transactions
            this.renderSellRequests();
            this.renderTransactions();

        } catch (error) {
            console.error('❌ Dashboard load error:', error);
            throw error;
        }
    },

    // ===== Render Broker Info =====
    renderBrokerInfo() {
        const marketNameDisplay = document.getElementById('market-name-display');
        if (marketNameDisplay && this.currentBroker) {
            marketNameDisplay.textContent = this.currentBroker.market_name || 'Market';
            
            const location = this.currentBroker.place || {};
            const locationParts = [];
            if (location.market_area) locationParts.push(location.market_area);
            if (location.district) locationParts.push(location.district);
            if (location.state) locationParts.push(location.state);
            const locationText = locationParts.join(', ') || 'Location N/A';
            
            const marketLocationEl = document.getElementById('market-location');
            if (marketLocationEl) {
                marketLocationEl.innerHTML = `<strong>📍 Location:</strong> ${locationText}`;
            }
        }
    },

    // ===== Render Current Market Prices =====
    // LAYOUT FIX: Current Buying Prices
    renderMarketPrices() {
        const container = document.getElementById('marketPricesContainer');
        if (!container) return;

        if (!this.marketPrices || this.marketPrices.length === 0) {
            container.innerHTML = '<div style="color:#666;">No prices set yet. Add prices using the form.</div>';
            return;
        }

        container.innerHTML = this.marketPrices.map(p => {
            const priceKg = parseFloat(p.price_per_kg) || 0;
            const priceTon = priceKg * 1000;
            const priceKgStr = priceKg > 0 ? `₹${priceKg.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}/kg` : 'Price TBA';
            const priceTonStr = priceKg > 0 ? ` (₹${priceTon.toLocaleString(undefined, {maximumFractionDigits: 0})}/ton)` : '';
            const qtyStr = p.available_quantity ? `${p.available_quantity} Tons` : 'Capacity TBA';

            return `
                <div class="price-entry">
                    <div class="variety-header">
                        <div class="variety">${p.mango_variety}</div>
                        <button class="btn-delete-variety" data-id="${p.id}" data-variety="${p.mango_variety}" title="Delete this variety">🗑️</button>
                    </div>
                    <div class="price">${priceKgStr}${priceTonStr}</div>
                    <div class="qty">Qty: ${qtyStr}</div>
                </div>
            `;
        }).join('');

        // Attach delete event listeners
        this.attachDeleteListeners();

        // Update variety dropdown whenever prices change
        this.refreshVarietyDropdown();
    },

    // ===== Attach Delete Event Listeners =====
    attachDeleteListeners() {
        const deleteButtons = document.querySelectorAll('.btn-delete-variety');
        deleteButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const id = btn.dataset.id;
                const variety = btn.dataset.variety;
                this.deleteFruit(id, variety);
            });
        });
    },

    // ===== Delete Fruit by ID (calls backend DELETE) =====
    async deleteFruit(id, varietyName) {
        if (!id) return;
        // Open the in-page confirmation modal (replaces native confirm)
        this.openConfirmDelete(id, varietyName);
    },

    openConfirmDelete(id, varietyName) {
        const modal = document.getElementById('confirmDeleteModal');
        if (!modal) return;
        modal.dataset.fruitId = id;
        modal.dataset.variety = varietyName || '';
        const msgEl = document.getElementById('confirmDeleteMessage');
        if (msgEl) msgEl.textContent = `Are you sure you want to delete "${varietyName || id}" from your market? This action cannot be undone.`;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    closeConfirmDelete() {
        const modal = document.getElementById('confirmDeleteModal');
        if (!modal) return;
        modal.style.display = 'none';
        modal.dataset.fruitId = '';
        modal.dataset.variety = '';
        document.body.style.overflow = '';
    },

    async confirmDeleteFromModal() {
        const modal = document.getElementById('confirmDeleteModal');
        if (!modal) return;
        const id = modal.dataset.fruitId;
        const variety = modal.dataset.variety;
        // Close modal first to provide responsive UI
        this.closeConfirmDelete();
        if (!id) return this.showError('No variety selected for deletion');
        await this.performDelete(id, variety);
    },

    async performDelete(id, varietyName) {
        try {
            console.log('🗑️ Deleting variety id:', id);
            const url = BROKER_CONFIG.API_BASE + '/api/broker/fruits/' + encodeURIComponent(id);
            const response = await fetch(url, {
                method: 'DELETE',
                headers: APIClient.getHeaders(),
                credentials: 'include'
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API Error: ${response.status} ${text}`);
            }

            const data = await response.json();
            if (data.success) {
                this.showSuccess(`"${varietyName}" removed from your market`);
                // Refresh dashboard data to reflect deletion
                await this.loadDashboard();
            } else {
                throw new Error(data.message || 'Failed to delete fruit');
            }
        } catch (err) {
            console.error('❌ Delete error:', err);
            this.showError('Error: ' + err.message);
        }
    },

    // ===== Render Sell Requests (table or card grid) =====
    renderSellRequests() {
        const tbody = document.querySelector('#requests tbody');

        console.log('📋 Rendering sell requests (showing only PENDING)...');

        // Show only requests that are currently pending (hide ACCEPTED/REJECTED)
        const pendingRequests = (this.sellRequests || []).filter(r => String(r.status || '').toUpperCase() === 'PENDING');

        if (pendingRequests.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center">No pending sell requests</td></tr>';
            return;
        }

        if (tbody) {
            tbody.innerHTML = pendingRequests.map(request => `
                <tr>
                    <td>${request.farmer_name || `Farmer #${request.farmer_id}`}</td>
                    <td>${request.variety || '-'}</td>
                    <td>${request.quantity_tons != null ? `${Number(request.quantity_tons).toFixed(2)} tons` : 'N/A'}</td>
                    <td>${this.formatDate(request.preferred_date)}</td>
                    <td>
                        <span class="status-badge pending">
                            ${request.status || 'PENDING'}
                        </span>
                    </td>
                    <td class="action-buttons">
                        <button class="btn-success" onclick="BrokerDashboard.acceptRequest(${request.id})">Accept</button>
                        <button class="btn-danger" onclick="BrokerDashboard.rejectRequest(${request.id})">Reject</button>
                    </td>
                </tr>
            `).join('');
        }
    },


    // ===== Render Transactions Table =====
    renderTransactions() {
        const tbody = document.querySelector('#transactions tbody');
        if (!tbody) return;

        console.log('💳 Rendering transactions...');

        if (this.transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">No transactions yet</td></tr>';
            return;
        }

        tbody.innerHTML = this.transactions.map(transaction => `
            <tr>
                <td>${transaction.farmer_name || `Farmer #${transaction.farmer_id}`}</td>
                <td>${this.formatDate(transaction.date)}</td>
                <td>${transaction.variety || '-'}</td>
                <td>${transaction.actual_weight != null ? `${Number(transaction.actual_weight).toFixed(2)} tons` : 'N/A'}</td>
                <td>${transaction.market_price_at_sale != null ? `₹${Number(transaction.market_price_at_sale).toFixed(2)}/kg` : 'N/A'}</td>
                <td>${transaction.commission != null ? `₹${Number(transaction.commission).toFixed(2)}` : 'N/A'}</td>
                <td>${transaction.net_payable != null ? `₹${Number(transaction.net_payable).toFixed(2)}` : 'N/A'}</td>
                <td>
                    <span class="status-badge ${String(transaction.payment_status || '').toLowerCase()}">
                        ${transaction.payment_status || 'N/A'}
                    </span>
                </td>
                <td>
                    <a href="#" onclick="BrokerDashboard.printTransaction(${transaction.id}); return false;">Print</a>
                </td>
            </tr>
        `).join('');
    },

    // ===== Price Management =====
    async updatePrice(event) {
        event.preventDefault();
        console.log('💰 Updating price...');

        try {
            const variety = document.getElementById('mango-variety').value;
            const price = parseFloat(document.getElementById('current-price').value);

            if (!variety || !price || price < 1) {
                this.showError('Please enter valid variety and price');
                return;
            }



            // Find available quantity from current prices or use default
            const existingPrice = this.marketPrices.find(p => p.mango_variety === variety);
            const availableQuantity = existingPrice ? existingPrice.available_quantity : 100; // Default 100 tons

            const payload = {
                mango_variety: variety,
                price_per_kg: price / 1000, // Convert ₹/ton to ₹/kg
                available_quantity: availableQuantity
            };

            console.log('📤 Sending price update:', payload);

            const response = await fetch(BROKER_CONFIG.API_BASE + BROKER_CONFIG.ENDPOINTS.UPDATE_PRICES, {
                method: 'POST',
                headers: APIClient.getHeaders(),
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                console.log('✅ Price updated successfully');
                // show server message (may include skipped/locked info)
                this.showSuccess(data.message || 'Price updated successfully!');

                // If server returned refreshed market_prices, update local state immediately
                if (data.market_prices && Array.isArray(data.market_prices)) {
                    this.marketPrices = data.market_prices;
                    this.renderMarketPrices();
                    this.refreshVarietyDropdown();
                }

                // Reload dashboard to ensure full state sync
                await this.loadDashboard();

                // Reset only the price form
                const priceFormEl = document.getElementById('price-form');
                if (priceFormEl) priceFormEl.reset();

                // If server skipped locked varieties, show as a warning
                if (data.message && data.message.toLowerCase().includes('skipped')) {
                    this.showError(data.message);
                }
            } else {
                throw new Error(data.message || 'Failed to update price');
            }
        } catch (error) {
            console.error('❌ Price update error:', error);
            this.showError('Error: ' + error.message);
        }
    },

    // ===== Show Field-Specific Error =====
    showFieldErrorInline(fieldId, message) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        // Remove existing error if any
        const existingError = field.parentElement.querySelector('.field-error-inline');
        if (existingError) existingError.remove();

        // Highlight the field
        field.style.borderColor = '#dc2626';
        field.style.backgroundColor = '#fef2f2';

        // Create error element
        const errorDiv = document.createElement('div');
        errorDiv.className = 'field-error-inline';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            color: #dc2626;
            font-size: 13px;
            margin-top: 6px;
            margin-bottom: 12px;
            font-weight: 500;
            display: block;
        `;

        field.parentElement.appendChild(errorDiv);
    },

    // ===== Clear Field-Specific Error =====
    clearFieldErrorInline(fieldId) {
        const field = document.getElementById(fieldId);
        if (!field) return;

        // Remove error styling
        field.style.borderColor = '';
        field.style.backgroundColor = '';

        // Remove error message
        const errorDiv = field.parentElement.querySelector('.field-error-inline');
        if (errorDiv) errorDiv.remove();
    },

    // ===== Add New Fruit Variety =====
    async addFruit(event) {
        event.preventDefault();
        console.log('🍎 Adding new fruit variety...');

        try {
            // Clear previous errors
            this.clearFieldErrorInline('fruit-name');
            this.clearFieldErrorInline('fruit-initial-price');
            this.clearFieldErrorInline('fruit-quantity');

            const fruitName = document.getElementById('fruit-name').value.trim();
            const fruitPrice = parseFloat(document.getElementById('fruit-initial-price').value);
            const fruitQuantity = parseInt(document.getElementById('fruit-quantity').value) || 100;

            if (!fruitName) {
                this.showFieldErrorInline('fruit-name', '⚠️ Please enter a fruit name');
                return;
            }

            if (!fruitPrice || fruitPrice < 1) {
                this.showFieldErrorInline('fruit-initial-price', '⚠️ Please enter a valid price');
                return;
            }

            // Check if variety already exists
            const existingVariety = this.marketPrices.find(p => 
                p.mango_variety && p.mango_variety.toLowerCase() === fruitName.toLowerCase()
            );

            if (existingVariety) {
                this.showFieldErrorInline('fruit-name', '⚠️ This fruit already exists. Use "Update Today\'s Price" to change it.');
                return;
            }

            const payload = {
                mango_variety: fruitName,
                price_per_kg: fruitPrice / 1000, // Convert ₹/ton to ₹/kg
                available_quantity: fruitQuantity
            };

            console.log('📤 Sending new fruit:', payload);

            const response = await fetch(BROKER_CONFIG.API_BASE + BROKER_CONFIG.ENDPOINTS.UPDATE_PRICES, {
                method: 'POST',
                headers: APIClient.getHeaders(),
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                console.log('✅ Fruit variety added successfully');
                this.showSuccess('Fruit variety "' + fruitName + '" added successfully! 🎉');

                // Update market prices if returned
                if (data.market_prices && Array.isArray(data.market_prices)) {
                    this.marketPrices = data.market_prices;
                    this.renderMarketPrices();
                    this.refreshVarietyDropdown();
                }

                // Reload dashboard
                await this.loadDashboard();

                // Reset form
                const addForm = document.getElementById('add-fruit-form');
                if (addForm) addForm.reset();

                // Clear any errors
                this.clearFieldErrorInline('fruit-name');
                this.clearFieldErrorInline('fruit-initial-price');
                this.clearFieldErrorInline('fruit-quantity');

                // Auto-select the newly added fruit in the price update dropdown
                const varietyDropdown = document.getElementById('mango-variety');
                if (varietyDropdown) {
                    varietyDropdown.value = fruitName;
                    document.getElementById('current-price').focus();
                }
            } else {
                throw new Error(data.message || 'Failed to add fruit variety');
            }
        } catch (error) {
            console.error('❌ Add fruit error:', error);
            // Show error inline below the fruit name field
            if (error.message.includes('This fruit') || error.message.includes('already')) {
                this.showFieldErrorInline('fruit-name', '⚠️ ' + error.message);
            } else {
                this.showFieldErrorInline('fruit-name', '⚠️ ' + error.message);
            }
        }
    },

    // ===== Refresh Variety Dropdown =====
    refreshVarietyDropdown() {
        const dropdown = document.getElementById('mango-variety');
        if (!dropdown) return;

        // Get current selection
        const currentSelection = dropdown.value;

        // Clear ALL options
        dropdown.innerHTML = '<option value="">Select variety...</option>';

        // Add market prices as options
        if (this.marketPrices && this.marketPrices.length > 0) {
            this.marketPrices.forEach(price => {
                const option = document.createElement('option');
                option.value = price.mango_variety;
                option.textContent = price.mango_variety + ' (₹' + (price.price_per_kg * 1000).toFixed(0) + '/ton)';
                dropdown.appendChild(option);
            });
        }

        // Restore selection if it still exists
        if (currentSelection && dropdown.querySelector(`option[value="${currentSelection}"]`)) {
            dropdown.value = currentSelection;
        }
    },

    // ===== Accept Sell Request =====
    async acceptRequest(requestId) {
        // Open the frontend confirmation modal (styled, frontend-only)
        this.openConfirmAccept(requestId);
    },

    // ===== Frontend confirmation modal handlers =====
    openConfirmAccept(requestId) {
        const modal = document.getElementById('confirmAcceptModal');
        if (!modal) return;
        modal.dataset.requestId = requestId;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    closeConfirmAccept() {
        const modal = document.getElementById('confirmAcceptModal');
        if (!modal) return;
        modal.style.display = 'none';
        modal.dataset.requestId = '';
        document.body.style.overflow = '';
    },

    confirmAcceptFromModal() {
        const modal = document.getElementById('confirmAcceptModal');
        if (!modal) return;
        const requestId = modal.dataset.requestId;
        // Close the confirm modal then open the accept modal for details
        this.closeConfirmAccept();
        if (requestId) {
            this.openAcceptModal(Number(requestId));
        }
    },


    // Open modal and prefill values with current request and market price
    openAcceptModal(requestId) {
        const request = this.sellRequests.find(r => r.id === requestId);
        if (!request) {
            this.showError('Request not found');
            return;
        }

        // Find market price for this variety
        const mp = this.marketPrices.find(p => p.mango_variety === request.variety);
        const priceHelpEl = document.getElementById('acceptPriceHelp');
        // FIX: Allow manual agreed price when market price missing — show guidance instead of blocking modal open
        if (!mp) {
            if (priceHelpEl) priceHelpEl.textContent = 'No market price set — enter agreed price manually.';
        } else {
            if (priceHelpEl) priceHelpEl.textContent = 'Default uses current market price.';
        }

        const farmerNameEl = document.getElementById('acceptFarmerName');
        const varietyEl = document.getElementById('acceptVariety');
        const quantityEl = document.getElementById('acceptQuantity');
        const priceInput = document.getElementById('acceptAgreedPrice');
        const dateInput = document.getElementById('acceptExpectedDate');

        if (farmerNameEl) farmerNameEl.textContent = request.farmer_name || `Farmer #${request.farmer_id}`;
        if (varietyEl) varietyEl.textContent = request.variety || '-';
        if (quantityEl) quantityEl.textContent = (request.quantity_tons != null) ? Number(request.quantity_tons).toFixed(2) : 'N/A';

        // Prefill agreed price (use existing agreed price on request if present, else use market price)
        const defaultPrice = (request.agreed_price !== null && request.agreed_price !== undefined) ? request.agreed_price : ((request.price_at_request !== null && request.price_at_request !== undefined) ? request.price_at_request : (mp ? mp.price_per_kg : ''));
        if (priceInput) priceInput.value = defaultPrice !== '' ? Number(defaultPrice).toFixed(2) : '';

        // Prefill expected date
        if (dateInput) dateInput.value = request.expected_delivery_date || request.preferred_date || '';

        // Save request id on modal element dataset
        const modal = document.getElementById('acceptModal');
        if (modal) modal.dataset.requestId = requestId;

        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    },

    closeAcceptModal() {
        const modal = document.getElementById('acceptModal');
        if (!modal) return;
        modal.style.display = 'none';
        modal.dataset.requestId = '';
        document.body.style.overflow = '';
    },

    async confirmAccept() {
        const modal = document.getElementById('acceptModal');
        if (!modal) return;
        const requestId = modal.dataset.requestId;
        if (!requestId) return this.showError('No request selected');

        const priceInput = document.getElementById('acceptAgreedPrice');
        const dateInput = document.getElementById('acceptExpectedDate');

        const agreedPrice = priceInput && priceInput.value ? Number(priceInput.value) : null;
        const expectedDate = dateInput && dateInput.value ? dateInput.value : null;

        // Basic validation
        if (agreedPrice !== null && (isNaN(agreedPrice) || agreedPrice <= 0)) {
            this.showError('Please enter a valid agreed price');
            return;
        }

        // FIX: Ensure agreed price is provided when no market price is set for this variety
        const request = this.sellRequests.find(r => r.id === Number(requestId));
        const mp = this.marketPrices.find(p => p.mango_variety === (request ? request.variety : ''));
        if (!mp && (agreedPrice === null || agreedPrice === undefined)) {
            this.showError('Please enter an agreed price since no market price is set for this variety.');
            return;
        }
        // FIX: Disable confirm button while processing to prevent double clicks
        const confirmBtn = document.getElementById('acceptConfirmBtn');
        let originalConfirmText = null;
        if (confirmBtn) {
            originalConfirmText = confirmBtn.textContent;
            confirmBtn.disabled = true;
            confirmBtn.dataset.busy = '1';
            confirmBtn.textContent = 'Processing...';
        }

        try {
            const acceptUrl = BROKER_CONFIG.API_BASE.replace(/\/$/, '') + `/sell-request/${requestId}/accept`;
            const payload = {};
            if (expectedDate) payload.expected_delivery_date = expectedDate;
            if (agreedPrice !== null) payload.agreed_price = agreedPrice;

            const response = await fetch(acceptUrl, {
                method: 'PUT',
                headers: APIClient.getHeaders(),
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || `API Error: ${response.status}`);
            }

            const data = await response.json();
            if (data.success) {
                this.showSuccess('Request accepted');
                this.closeAcceptModal();
                await this.loadDashboard();
            } else {
                throw new Error(data.message || 'Failed to accept request');
            }
        } catch (err) {
            console.error('Accept (modal) error:', err);
            this.showError('Error: ' + (err.message || err));
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                delete confirmBtn.dataset.busy;
                if (originalConfirmText !== null) confirmBtn.textContent = originalConfirmText;
            }
        }
    },

    // ===== Reject Sell Request (opens modal) =====
    rejectRequest(requestId) {
        // Open a modal to collect rejection reason instead of using prompt()
        this.openRejectModal(requestId);
    },

    openRejectModal(requestId) {
        const modal = document.getElementById('rejectModal');
        if (!modal) return;
        const request = this.sellRequests.find(r => r.id === Number(requestId));
        const farmerInfoEl = document.getElementById('rejectFarmerInfo');
        if (farmerInfoEl) {
            const name = request ? (request.farmer_name || `Farmer #${request.farmer_id}`) : `Request #${requestId}`;
            const variety = request ? (request.variety || '-') : '-';
            farmerInfoEl.innerHTML = `Enter rejection reason for <strong>${name}</strong> (${variety})`;
        }
        const reasonInput = document.getElementById('rejectReason');
        if (reasonInput) reasonInput.value = '';
        modal.dataset.requestId = requestId;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    },

    closeRejectModal() {
        const modal = document.getElementById('rejectModal');
        if (!modal) return;
        modal.style.display = 'none';
        modal.dataset.requestId = '';
        document.body.style.overflow = '';
    },

    async confirmReject() {
        const modal = document.getElementById('rejectModal');
        if (!modal) return;
        const requestId = modal.dataset.requestId;
        if (!requestId) return this.showError('No request selected');

        const reasonInput = document.getElementById('rejectReason');
        const reason = reasonInput && reasonInput.value ? reasonInput.value.trim() : '';
        if (!reason) {
            this.showError('Please enter a rejection reason');
            return;
        }

        try {
            const response = await fetch(
                BROKER_CONFIG.API_BASE + BROKER_CONFIG.ENDPOINTS.UPDATE_REQUEST_STATUS.replace('<id>', requestId),
                {
                    method: 'POST',
                    headers: APIClient.getHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({ status: 'REJECTED', reason: reason })
                }
            );

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                this.showSuccess('Request rejected');
                this.closeRejectModal();
                await this.loadDashboard();
            } else {
                throw new Error(data.message || 'Failed to reject request');
            }
        } catch (error) {
            console.error('❌ Reject error:', error);
            this.showError('Error: ' + error.message);
        }
    },

    // ===== Helper Functions =====
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    printTransaction(transactionId) {
        console.log('🖨️ Printing transaction:', transactionId);
        alert('Print functionality coming soon!');
    },

    // ===== UI Feedback =====
    showSuccess(message) {
        const notification = document.createElement('div');
        notification.className = 'notification success';
        notification.textContent = '✅ ' + message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4caf50;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            z-index: 1000;
            animation: slideDown 0.3s ease;
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 3000);
    },

    showError(message) {
        const notification = document.createElement('div');
        notification.className = 'notification error';
        notification.textContent = '❌ ' + message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #d32f2f;
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            z-index: 1000;
            animation: slideDown 0.3s ease;
        `;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 4000);
    },

    // ===== Event Listeners =====
    setupEventListeners() {
        console.log('🎯 Setting up event listeners...');

        // Price form submission (use specific ID for robustness)
        const priceForm = document.getElementById('price-form');
        if (priceForm) {
            priceForm.addEventListener('submit', (e) => this.updatePrice(e));
        }

        // Add fruit form submission
        const addFruitForm = document.getElementById('add-fruit-form');
        if (addFruitForm) {
            addFruitForm.addEventListener('submit', (e) => this.addFruit(e));
        }

        // Modal event listeners for accept flow
        document.getElementById('acceptCancelBtn')?.addEventListener('click', (e) => { e.preventDefault(); this.closeAcceptModal(); });
        document.querySelector('.close-accept-modal')?.addEventListener('click', (e) => { e.preventDefault(); this.closeAcceptModal(); });
        document.getElementById('acceptConfirmBtn')?.addEventListener('click', (e) => { e.preventDefault(); this.confirmAccept(); });

        // Confirm modal event listeners
        document.getElementById('confirmAcceptCancelBtn')?.addEventListener('click', (e) => { e.preventDefault(); this.closeConfirmAccept(); });
        document.querySelector('.close-confirm-modal')?.addEventListener('click', (e) => { e.preventDefault(); this.closeConfirmAccept(); });
        document.getElementById('confirmAcceptBtn')?.addEventListener('click', (e) => { e.preventDefault(); this.confirmAcceptFromModal(); });

        // Delete confirmation modal (in-page) event listeners
        document.getElementById('confirmDeleteCancelBtn')?.addEventListener('click', (e) => { e.preventDefault(); this.closeConfirmDelete(); });
        document.querySelector('.close-delete-modal')?.addEventListener('click', (e) => { e.preventDefault(); this.closeConfirmDelete(); });
        document.getElementById('confirmDeleteBtn')?.addEventListener('click', (e) => { e.preventDefault(); this.confirmDeleteFromModal(); });

        // Reject modal event listeners
        document.getElementById('rejectCancelBtn')?.addEventListener('click', (e) => { e.preventDefault(); this.closeRejectModal(); });
        document.querySelector('.close-reject-modal')?.addEventListener('click', (e) => { e.preventDefault(); this.closeRejectModal(); });
        document.getElementById('rejectConfirmBtn')?.addEventListener('click', (e) => { e.preventDefault(); this.confirmReject(); });

        // Navigation links
        const navLinks = document.querySelectorAll('header nav a');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                if (link.getAttribute('onclick') !== 'AuthManager.logout()') {
                    navLinks.forEach(l => l.style.color = '');
                    link.style.color = '#e65100';
                }
            });
        });

        console.log('✅ Event listeners setup complete');
    }
};

// =====================================================
// INITIALIZATION ON PAGE LOAD
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loaded. Initializing broker dashboard...');
    BrokerDashboard.init();
});
