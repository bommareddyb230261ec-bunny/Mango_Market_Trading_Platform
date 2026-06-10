const BROKER_CONFIG = {
    API_BASE: null,
    ENDPOINTS: {
        DASHBOARD: '/broker/dashboard',
        UPDATE_PRICES: '/broker/update-prices',
        UPDATE_REQUEST_STATUS: '/broker/request/<id>/status',
        UPDATE_COMMISSION: '/broker/commission'
    }
};

const BrokerDashboard = {
    currentBroker: null,
    sellRequests: [],
    transactions: [],
    weighments: [],
    marketPrices: [],
    activeSection: 'overview',
    refreshTimer: null,
    refreshIntervalMs: 5000,

    async init() {
        try {
            await this.resolveApiBase();
            await this.loadDashboard();
            this.bindEvents();
            this.switchSection('overview');
            this.startAutoRefresh();
        } catch (error) {
            console.error('Broker dashboard init failed:', error);
            this.notify('Failed to load dashboard: ' + error.message, 'error');
        }
    },

    async resolveApiBase() {
        if (window.API_BASE_URL) {
            BROKER_CONFIG.API_BASE = window.API_BASE_URL;
            return;
        }

        if (typeof window.ensureApiReady === 'function') {
            const base = await window.ensureApiReady();
            BROKER_CONFIG.API_BASE = base || `${window.location.protocol}//${window.location.hostname}:5000`;
            return;
        }

        BROKER_CONFIG.API_BASE = `${window.location.protocol}//${window.location.hostname}:5000`;
    },

    headers() {
        if (window.APIClient && typeof APIClient.getHeaders === 'function') {
            return APIClient.getHeaders();
        }
        return { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    },

    async loadDashboard() {
        const response = await fetch(BROKER_CONFIG.API_BASE + BROKER_CONFIG.ENDPOINTS.DASHBOARD, {
            method: 'GET',
            headers: this.headers(),
            credentials: 'include'
        });

        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = 'broker_login.html';
                return;
            }
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        if (!data.success) throw new Error(data.message || data.error || 'Unable to load dashboard');

        this.currentBroker = data.broker || {};
        this.sellRequests = this.sortRequests(Array.isArray(data.sell_requests) ? data.sell_requests : []);
        this.transactions = Array.isArray(data.transactions) ? data.transactions : [];
        this.weighments = Array.isArray(data.weighments) ? data.weighments : [];
        this.marketPrices = Array.isArray(data.market_prices) ? data.market_prices : [];

        this.renderAll();
    },

    renderAll() {
        this.renderBrokerInfo();
        this.renderStats();
        this.renderActivity();
        this.renderPrices();
        this.renderVarietyDropdown();
        this.renderRequests();
        this.renderTransactions();
    },

    renderBrokerInfo() {
        const marketName = this.currentBroker.market_name || 'Market Yard';
        const place = this.currentBroker.place || {};
        const location = [place.market_area, place.district, place.state].filter(Boolean).join(', ') || 'Location not available';
        const commission = Number(this.currentBroker.market_commission || 0);

        this.setText('market-name-display', marketName);
        this.setText('brokerName', marketName);
        this.setText('market-location', location);
        this.setText('commission-display-text', `${this.formatMoney(commission)} per ₹100`);

        const commissionInput = document.getElementById('market-commission');
        if (commissionInput) commissionInput.value = commission ? commission.toFixed(2) : '';
    },

    renderStats() {
        const pendingRequests = this.sellRequests.filter(req => String(req.status || '').toUpperCase() === 'PENDING');
        const commission = Number(this.currentBroker.market_commission || 0);
        const transactionCount = this.transactions.length + this.weighments.length;

        this.setText('varietiesCount', this.marketPrices.length);
        this.setText('pendingCount', pendingRequests.length);
        this.setText('pendingTaskCount', pendingRequests.length);
        this.setText('varietyTaskCount', this.marketPrices.length);
        this.setText('requestBadge', pendingRequests.length);
        this.setText('commissionSummary', this.formatMoney(commission));
        this.setText('transactionCount', transactionCount);
    },

    renderActivity() {
        const container = document.getElementById('activityList');
        if (!container) return;

        const requestItems = this.sellRequests.slice(0, 3).map(req => ({
            date: req.created_at || req.preferred_date,
            title: `${req.farmer_name || 'Farmer'} requested ${req.quantity_tons || '-'} tons`,
            detail: `${req.variety || 'Variety'} · ${req.status || 'PENDING'}`
        }));
        const transactionItems = this.transactions.slice(0, 2).map(tx => ({
            date: tx.date,
            title: `${tx.farmer_name || 'Farmer'} transaction`,
            detail: `${tx.variety || 'Variety'} · ${this.formatMoney(tx.net_payable)}`
        }));

        const items = [...requestItems, ...transactionItems]
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
            .slice(0, 5);

        if (items.length === 0) {
            container.innerHTML = '<p class="empty-state">No activity yet.</p>';
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="activity-item">
                <span>${this.formatDate(item.date)}</span>
                <strong>${this.escapeHtml(item.title)}</strong>
                <p>${this.escapeHtml(item.detail)}</p>
            </div>
        `).join('');
    },

    renderPrices() {
        const container = document.getElementById('marketPricesContainer');
        if (!container) return;

        if (this.marketPrices.length === 0) {
            container.innerHTML = '<div class="empty-card">No prices set yet. Add your first variety above.</div>';
            return;
        }

        container.innerHTML = this.marketPrices.map(price => {
            const priceKg = Number(price.price_per_kg || 0);
            const priceTon = priceKg * 1000;
            return `
                <article class="price-card">
                    <div class="price-card-top">
                        <h4>${this.escapeHtml(price.mango_variety || '-')}</h4>
                        <button class="icon-btn danger-text" type="button" data-delete-price="${price.id}" data-variety="${this.escapeHtml(price.mango_variety || '')}" aria-label="Delete variety">x</button>
                    </div>
                    <div class="price-main">${this.formatMoney(priceKg)}<span>/kg</span></div>
                    <div class="price-meta">${this.formatMoney(priceTon)} / ton</div>
                    <div class="price-meta">${Number(price.available_quantity || 0).toLocaleString('en-IN')} tons available</div>
                </article>
            `;
        }).join('');
    },

    renderVarietyDropdown() {
        const dropdown = document.getElementById('mango-variety');
        if (!dropdown) return;

        const current = dropdown.value;
        dropdown.innerHTML = '<option value="">Select variety...</option>';
        this.marketPrices.forEach(price => {
            const option = document.createElement('option');
            option.value = price.mango_variety;
            option.textContent = `${price.mango_variety} (${this.formatMoney(Number(price.price_per_kg || 0) * 1000)}/ton)`;
            dropdown.appendChild(option);
        });

        if (current && Array.from(dropdown.options).some(option => option.value === current)) {
            dropdown.value = current;
        }
    },

    renderRequests() {
        const tbody = document.getElementById('requestsTableBody');
        if (!tbody) return;

        const pending = this.sellRequests.filter(req => String(req.status || '').toUpperCase() === 'PENDING');
        if (pending.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty-table">No pending sell requests.</td></tr>';
            return;
        }

        tbody.innerHTML = pending.map(req => `
            <tr>
                <td data-label="Farmer">${this.escapeHtml(req.farmer_name || `Farmer #${req.farmer_id}`)}</td>
                <td data-label="Variety">${this.escapeHtml(req.variety || '-')}</td>
                <td data-label="Quantity">${req.quantity_tons != null ? Number(req.quantity_tons).toFixed(2) + ' tons' : '-'}</td>
                <td data-label="Preferred">${this.formatDate(req.preferred_date)}</td>
                <td data-label="Commission">${this.formatMoney(req.order_commission || 0)} / ₹100</td>
                <td data-label="Status"><span class="status-pill pending">${this.escapeHtml(req.status || 'PENDING')}</span></td>
                <td data-label="Actions">
                    <div class="table-actions">
                        <button class="btn mini success" type="button" data-accept-request="${req.id}">Accept</button>
                        <button class="btn mini danger" type="button" data-reject-request="${req.id}">Reject</button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    renderTransactions() {
        const tbody = document.getElementById('transactionsTableBody');
        if (!tbody) return;

        const weighmentRows = this.weighments.map(w => ({
            id: `w-${w.id}`,
            farmer_name: w.farmer_name || `Farmer #${w.farmer_id || '-'}`,
            date: w.weighment_date || w.created_at,
            variety: w.mango_variety,
            actual_weight: w.actual_weight_tons,
            market_price_at_sale: w.final_price_per_kg,
            commission: w.commission,
            net_payable: w.net_payable,
            payment_status: w.payment_status || 'PENDING'
        }));

        const rows = [...this.transactions, ...weighmentRows]
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
            .slice(0, 25);

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-table">No transactions yet.</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(tx => `
            <tr>
                <td data-label="Farmer">${this.escapeHtml(tx.farmer_name || `Farmer #${tx.farmer_id || '-'}`)}</td>
                <td data-label="Date">${this.formatDate(tx.date)}</td>
                <td data-label="Variety">${this.escapeHtml(tx.variety || '-')}</td>
                <td data-label="Weight">${tx.actual_weight != null ? Number(tx.actual_weight).toFixed(2) + ' tons' : '-'}</td>
                <td data-label="Price">${tx.market_price_at_sale != null ? this.formatMoney(tx.market_price_at_sale) + '/kg' : '-'}</td>
                <td data-label="Commission">${tx.commission != null ? this.formatMoney(tx.commission) : '-'}</td>
                <td data-label="Net">${tx.net_payable != null ? this.formatMoney(tx.net_payable) : '-'}</td>
                <td data-label="Payment"><span class="status-pill ${this.statusClass(tx.payment_status)}">${this.escapeHtml(tx.payment_status || 'PENDING')}</span></td>
                <td data-label="Action"><a class="btn mini secondary" href="transactions.html">Open</a></td>
            </tr>
        `).join('');
    },

    async updateCommission(event) {
        event.preventDefault();
        const input = document.getElementById('market-commission');
        const commission = Number(input ? input.value : NaN);

        if (Number.isNaN(commission) || commission < 0 || commission > 100) {
            this.notify('Enter commission between 0 and 100 per ₹100.', 'error');
            return;
        }

        const data = await this.postJson(BROKER_CONFIG.ENDPOINTS.UPDATE_COMMISSION, { market_commission: commission });
        this.currentBroker.market_commission = data.market_commission;
        this.renderBrokerInfo();
        this.renderStats();
        this.notify(data.message || 'Commission updated.');
    },

    async updatePrice(event) {
        event.preventDefault();
        const variety = document.getElementById('mango-variety')?.value;
        const priceTon = Number(document.getElementById('current-price')?.value);

        if (!variety || Number.isNaN(priceTon) || priceTon <= 0) {
            this.notify('Select a variety and enter a valid price.', 'error');
            return;
        }

        const existing = this.marketPrices.find(item => item.mango_variety === variety);
        const payload = {
            mango_variety: variety,
            price_per_kg: priceTon / 1000,
            available_quantity: existing ? existing.available_quantity : 100
        };

        const data = await this.postJson(BROKER_CONFIG.ENDPOINTS.UPDATE_PRICES, payload);
        this.notify(data.message || 'Price updated.');
        this.setText('last-update', 'Just now');
        document.getElementById('price-form')?.reset();
        await this.loadDashboard();
    },

    async addFruit(event) {
        event.preventDefault();
        const name = document.getElementById('fruit-name')?.value.trim();
        const priceTon = Number(document.getElementById('fruit-initial-price')?.value);
        const quantity = Number(document.getElementById('fruit-quantity')?.value || 100);

        if (!name) {
            this.notify('Enter a variety name.', 'error');
            return;
        }
        if (Number.isNaN(priceTon) || priceTon <= 0) {
            this.notify('Enter a valid initial price.', 'error');
            return;
        }
        if (this.marketPrices.some(item => String(item.mango_variety || '').toLowerCase() === name.toLowerCase())) {
            this.notify('This variety already exists. Update the existing price instead.', 'error');
            return;
        }

        const payload = {
            mango_variety: name,
            price_per_kg: priceTon / 1000,
            available_quantity: Number.isNaN(quantity) || quantity <= 0 ? 100 : quantity
        };

        const data = await this.postJson(BROKER_CONFIG.ENDPOINTS.UPDATE_PRICES, payload);
        this.notify(data.message || 'Variety added.');
        document.getElementById('add-fruit-form')?.reset();
        const qty = document.getElementById('fruit-quantity');
        if (qty) qty.value = '100';
        await this.loadDashboard();
    },

    openAcceptModal(requestId) {
        const request = this.sellRequests.find(item => Number(item.id) === Number(requestId));
        if (!request) return this.notify('Request not found.', 'error');

        const marketPrice = this.marketPrices.find(item => item.mango_variety === request.variety);
        const priceInput = document.getElementById('acceptAgreedPrice');
        const dateInput = document.getElementById('acceptExpectedDate');
        const help = document.getElementById('acceptPriceHelp');

        this.setText('acceptFarmerName', request.farmer_name || `Farmer #${request.farmer_id}`);
        this.setText('acceptVariety', request.variety || '-');
        this.setText('acceptQuantity', request.quantity_tons != null ? `${Number(request.quantity_tons).toFixed(2)} tons` : '-');

        const defaultPrice = request.agreed_price ?? request.price_at_request ?? marketPrice?.price_per_kg ?? '';
        if (priceInput) priceInput.value = defaultPrice !== '' ? Number(defaultPrice).toFixed(2) : '';
        if (dateInput) dateInput.value = request.expected_delivery_date || request.preferred_date || new Date().toISOString().slice(0, 10);
        if (help) help.textContent = marketPrice ? 'Default uses current market price.' : 'No market price found. Enter agreed price manually.';

        const modal = document.getElementById('acceptModal');
        if (modal) modal.dataset.requestId = request.id;
        this.openModal('acceptModal');
    },

    async confirmAccept(event) {
        event.preventDefault();
        const modal = document.getElementById('acceptModal');
        const requestId = modal?.dataset.requestId;
        if (!requestId) return this.notify('No request selected.', 'error');

        const agreedPrice = Number(document.getElementById('acceptAgreedPrice')?.value);
        const expectedDate = document.getElementById('acceptExpectedDate')?.value;

        if (Number.isNaN(agreedPrice) || agreedPrice <= 0) {
            this.notify('Enter a valid agreed price.', 'error');
            return;
        }

        const payload = { agreed_price: agreedPrice };
        if (expectedDate) payload.expected_delivery_date = expectedDate;

        const response = await fetch(BROKER_CONFIG.API_BASE.replace(/\/$/, '') + `/sell-request/${requestId}/accept`, {
            method: 'PUT',
            headers: this.headers(),
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || data.error || `API Error: ${response.status}`);

        this.closeModal('acceptModal');
        this.notify('Request accepted.');
        await this.loadDashboard();
        this.switchSection('requests');
    },

    openRejectModal(requestId) {
        const request = this.sellRequests.find(item => Number(item.id) === Number(requestId));
        const modal = document.getElementById('rejectModal');
        if (modal) modal.dataset.requestId = requestId;
        this.setText('rejectFarmerInfo', request ? `Reject request from ${request.farmer_name || 'Farmer'} for ${request.variety || 'this variety'}.` : 'Enter rejection reason.');
        const reason = document.getElementById('rejectReason');
        if (reason) reason.value = '';
        this.openModal('rejectModal');
    },

    async confirmReject(event) {
        event.preventDefault();
        const modal = document.getElementById('rejectModal');
        const requestId = modal?.dataset.requestId;
        const reason = document.getElementById('rejectReason')?.value.trim();

        if (!requestId) return this.notify('No request selected.', 'error');
        if (!reason) return this.notify('Enter a rejection reason.', 'error');

        const endpoint = BROKER_CONFIG.ENDPOINTS.UPDATE_REQUEST_STATUS.replace('<id>', requestId);
        await this.postJson(endpoint, { status: 'REJECTED', reason });
        this.closeModal('rejectModal');
        this.notify('Request rejected.');
        await this.loadDashboard();
    },

    openDeleteModal(priceId, variety) {
        const modal = document.getElementById('deleteModal');
        if (modal) {
            modal.dataset.priceId = priceId;
            modal.dataset.variety = variety || '';
        }
        this.setText('deleteMessage', `Delete "${variety || 'this variety'}" from your market?`);
        this.openModal('deleteModal');
    },

    async confirmDelete() {
        const modal = document.getElementById('deleteModal');
        const priceId = modal?.dataset.priceId;
        const variety = modal?.dataset.variety || 'Variety';
        if (!priceId) return;

        const response = await fetch(BROKER_CONFIG.API_BASE + '/api/broker/fruits/' + encodeURIComponent(priceId), {
            method: 'DELETE',
            headers: this.headers(),
            credentials: 'include'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || data.error || `API Error: ${response.status}`);

        this.closeModal('deleteModal');
        this.notify(`${variety} deleted.`);
        await this.loadDashboard();
    },

    async postJson(endpoint, payload) {
        const response = await fetch(BROKER_CONFIG.API_BASE + endpoint, {
            method: 'POST',
            headers: this.headers(),
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || data.error || `API Error: ${response.status}`);
        return data;
    },

    bindEvents() {
        document.querySelectorAll('[data-section]').forEach(element => {
            element.addEventListener('click', event => {
                event.preventDefault();
                this.switchSection(element.dataset.section);
            });
        });

        document.getElementById('openSidebarBtn')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.add('open'));
        document.getElementById('closeSidebarBtn')?.addEventListener('click', () => document.getElementById('sidebar')?.classList.remove('open'));
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            if (window.AuthManager && typeof AuthManager.logout === 'function') AuthManager.logout();
            else window.location.href = 'broker_login.html';
        });

        document.getElementById('commission-form')?.addEventListener('submit', event => this.updateCommission(event).catch(error => this.notify(error.message, 'error')));
        document.getElementById('price-form')?.addEventListener('submit', event => this.updatePrice(event).catch(error => this.notify(error.message, 'error')));
        document.getElementById('add-fruit-form')?.addEventListener('submit', event => this.addFruit(event).catch(error => this.notify(error.message, 'error')));
        document.getElementById('acceptForm')?.addEventListener('submit', event => this.confirmAccept(event).catch(error => this.notify(error.message, 'error')));
        document.getElementById('rejectForm')?.addEventListener('submit', event => this.confirmReject(event).catch(error => this.notify(error.message, 'error')));
        document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => this.confirmDelete().catch(error => this.notify(error.message, 'error')));

        document.addEventListener('click', event => {
            const acceptBtn = event.target.closest('[data-accept-request]');
            if (acceptBtn) this.openAcceptModal(acceptBtn.dataset.acceptRequest);

            const rejectBtn = event.target.closest('[data-reject-request]');
            if (rejectBtn) this.openRejectModal(rejectBtn.dataset.rejectRequest);

            const deleteBtn = event.target.closest('[data-delete-price]');
            if (deleteBtn) this.openDeleteModal(deleteBtn.dataset.deletePrice, deleteBtn.dataset.variety);

            const closeBtn = event.target.closest('[data-close-modal]');
            if (closeBtn) this.closeModal(closeBtn.dataset.closeModal);

            if (event.target.classList.contains('modal')) this.closeModal(event.target.id);
        });

        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(modal => this.closeModal(modal.id));
                document.getElementById('sidebar')?.classList.remove('open');
            }
        });

        window.addEventListener('storage', event => {
            if (event.key === 'mango_market_sell_requests_changed') {
                this.refreshDashboardQuietly();
            }
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.refreshDashboardQuietly();
        });
    },

    startAutoRefresh() {
        if (this.refreshTimer) window.clearInterval(this.refreshTimer);
        this.refreshTimer = window.setInterval(() => {
            if (!document.hidden) this.refreshDashboardQuietly();
        }, this.refreshIntervalMs);
    },

    async refreshDashboardQuietly() {
        try {
            await this.loadDashboard();
        } catch (error) {
            console.warn('Dashboard refresh failed:', error);
        }
    },

    switchSection(section) {
        this.activeSection = section || 'overview';
        document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
        document.getElementById(`${this.activeSection}View`)?.classList.add('active');

        document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.section === this.activeSection));
        const titles = {
            overview: 'Dashboard',
            prices: 'Prices & Commission',
            requests: 'Sell Requests',
            transactions: 'Transactions'
        };
        this.setText('pageTitle', titles[this.activeSection] || 'Dashboard');
        document.getElementById('sidebar')?.classList.remove('open');
    },

    openModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('modal-lock');
    },

    closeModal(id) {
        const modal = document.getElementById(id);
        if (!modal) return;
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        if (!document.querySelector('.modal.open')) document.body.classList.remove('modal-lock');
    },

    notify(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), type === 'error' ? 4500 : 2800);
    },

    setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    },

    formatMoney(value) {
        const number = Number(value || 0);
        return `₹${number.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    },

    formatDate(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
    },

    statusClass(status) {
        const value = String(status || '').toLowerCase();
        if (['paid', 'accepted', 'completed'].includes(value)) return 'success';
        if (['rejected', 'failed'].includes(value)) return 'danger';
        return 'pending';
    },

    sortRequests(requests) {
        return [...requests].sort((a, b) => {
            const bTime = new Date(b.created_at || b.date || b.preferred_date || 0).getTime();
            const aTime = new Date(a.created_at || a.date || a.preferred_date || 0).getTime();
            return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
        });
    },

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }
};

document.addEventListener('DOMContentLoaded', () => {
    BrokerDashboard.init();
});
