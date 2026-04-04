// =====================================================
// PAYMENT PROCESSOR MANAGER
// =====================================================
const PaymentProcessor = {
    currentTransaction: null,
    API_BASE: null,

    async init() {
        console.log('🚀 Initializing Payment Processor...');
        try {
            // Ensure API_BASE is resolved
            if (!this.API_BASE) {
                if (typeof window.API_BASE_URL !== 'undefined') {
                    this.API_BASE = window.API_BASE_URL;
                } else if (typeof window.ensureApiReady === 'function') {
                    const base = await window.ensureApiReady();
                    this.API_BASE = base || (window.location.protocol + '//' + window.location.hostname + ':5000');
                } else {
                    this.API_BASE = window.location.protocol + '//' + window.location.hostname + ':5000';
                }
            }

            // Verify broker is authenticated
            const userDetails = AuthManager.getUserDetails();
            if (!userDetails || userDetails.role !== 'BROKER') {
                window.location.href = 'broker_login.html';
                return;
            }

            // Load transaction details from URL parameter
            await this.loadTransactionFromUrl();
            this.setupEventListeners();
            console.log('✅ Payment Processor loaded successfully');
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            this.showError('Failed to initialize: ' + error.message);
        }
    },

    async loadTransactionFromUrl() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const transactionId = urlParams.get('transactionId');

            if (!transactionId) {
                this.showError('No transaction ID provided');
                return;
            }

            console.log('📊 Loading transaction:', transactionId);

            // Fetch transaction details from broker dashboard
            const response = await fetch(this.API_BASE + '/broker/dashboard', {
                method: 'GET',
                headers: APIClient.getHeaders(),
                credentials: 'include'
            });

            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed to load');

            // Find the transaction by ID (check both transactions and weighments)
            let tx = data.transactions?.find(t => String(t.id) === String(transactionId));
            
            if (!tx && Array.isArray(data.weighments)) {
                const weighment = data.weighments.find(w => `w-${w.id}` === String(transactionId));
                if (weighment) {
                    tx = {
                        id: `w-${weighment.id}`,
                        farmer_id: weighment.farmer_id,
                        farmer_name: weighment.farmer_name || `Farmer #${weighment.farmer_id}`,
                        variety: weighment.mango_variety || 'Unknown',
                        date: weighment.weighment_date || weighment.created_at,
                        actual_weight: weighment.actual_weight_tons || 0,
                        market_price_at_sale: weighment.final_price_per_kg || 0,
                        total_cost: (weighment.actual_weight_tons || 0) * 1000 * (weighment.final_price_per_kg || 0),
                        commission: 0,
                        net_payable: (weighment.actual_weight_tons || 0) * 1000 * (weighment.final_price_per_kg || 0),
                        payment_status: 'N/A',
                        _is_weighment: true
                    };
                }
            }

            if (!tx) {
                this.showError('Transaction not found');
                return;
            }

            // keep dashboard payload so we can lookup related objects (sell_request.order_id etc.)
            this.dashboardData = data;
            this.currentTransaction = tx;
            await this.displayPaymentDetails(tx);
        } catch (error) {
            console.error('❌ Load error:', error);
            this.showError('Error loading transaction: ' + error.message);
        }
    },

    async displayPaymentDetails(tx) {
        try {
            // Fetch farmer details including bank information
            const farmerDetails = await this.fetchFarmerDetails(tx.farmer_id);

            // Populate farmer details
            document.getElementById('payment-farmer-name').textContent = tx.farmer_name || `Farmer #${tx.farmer_id}`;
            document.getElementById('payment-farmer-phone').textContent = farmerDetails.phone || '-';
            // Prefer an explicit order_id where available. Possible sources (in
            // priority): `tx.order_id`, associated sell_request.order_id, or the
            // weighment.record's order_id (for weighment-based transactions).
            let orderIdDisplay = tx.id || '-';
            try {
                // If transaction object already carries an order_id use it
                if (tx.order_id) {
                    orderIdDisplay = tx.order_id;
                }

                // If linked to a sell_request, prefer the sell_request.order_id
                else if (this.dashboardData && tx.request_id) {
                    const sr = (this.dashboardData.sell_requests || []).find(s => String(s.id) === String(tx.request_id));
                    if (sr && sr.order_id) orderIdDisplay = sr.order_id;
                }

                // If this is a weighment-derived tx, try to find the weighment and
                // use its order_id (weighments in dashboard payload include `order_id`).
                else if (tx._is_weighment && this.dashboardData && Array.isArray(this.dashboardData.weighments)) {
                    const w = (this.dashboardData.weighments || []).find(wi => (`w-${wi.id}` === String(tx.id)) || (String(wi.id) === String(tx.id)));
                    if (w && w.order_id) orderIdDisplay = w.order_id;
                }
            } catch (e) {
                // ignore lookup errors and fall back to tx.id
            }
            document.getElementById('payment-order-id').textContent = orderIdDisplay || '-';

            // Populate transaction amounts
            const totalAmount = typeof tx.total_cost === 'number' ? tx.total_cost : (tx.actual_weight * tx.market_price_at_sale * 1000);
            const commission = typeof tx.commission === 'number' ? tx.commission : 0;
            const netPayable = typeof tx.net_payable === 'number' ? tx.net_payable : totalAmount - commission;

            document.getElementById('payment-total-amount').textContent = '₹' + totalAmount.toFixed(2);
            document.getElementById('payment-commission').textContent = '₹' + commission.toFixed(2);
            document.getElementById('payment-net-payable').textContent = '₹' + netPayable.toFixed(2);

            // Populate bank details
            document.getElementById('payment-account-holder').textContent = farmerDetails.account_holder || '-';
            document.getElementById('payment-account-number').textContent = farmerDetails.account_number || '-';
            document.getElementById('payment-ifsc-code').textContent = farmerDetails.ifsc_code || '-';
            document.getElementById('payment-bank-name').textContent = farmerDetails.bank_name || '-';
            document.getElementById('payment-branch-name').textContent = farmerDetails.branch_name || '-';

            // Reset confirmation checkbox
            const confirmCheckbox = document.getElementById('payment-confirm');
            const confirmBtn = document.getElementById('confirm-payment-btn');
            if (confirmCheckbox) confirmCheckbox.checked = false;
            if (confirmBtn) confirmBtn.disabled = true;

            console.log('✅ Payment details loaded and displayed');
        } catch (error) {
            console.error('❌ Display error:', error);
            this.showError('Error displaying payment details: ' + error.message);
        }
    },

    async fetchFarmerDetails(farmerId) {
        try {
            const response = await fetch(this.API_BASE + `/farmers/${farmerId}`, {
                method: 'GET',
                headers: APIClient.getHeaders(),
                credentials: 'include'
            });

            if (!response.ok) {
                // Return default structure if API fails
                return {
                    phone: '-',
                    account_holder: '-',
                    account_number: '-',
                    ifsc_code: '-',
                    bank_name: '-',
                    branch_name: '-'
                };
            }

            const data = await response.json();
            if (data.success && data.farmer) {
                return {
                    phone: data.farmer.phone || data.farmer.phone_number || '-',
                    account_holder: data.farmer.account_holder || data.farmer.full_name || data.farmer.name || '-',
                    account_number: data.farmer.account_number || '-',
                    ifsc_code: data.farmer.ifsc_code || data.farmer.ifsc || '-',
                    bank_name: data.farmer.bank_name || '-',
                    branch_name: data.farmer.branch_name || '-'
                };
            }
            return {
                phone: '-',
                account_holder: '-',
                account_number: '-',
                ifsc_code: '-',
                bank_name: '-',
                branch_name: '-'
            };
        } catch (error) {
            console.error('Error fetching farmer details:', error);
            return {
                phone: '-',
                account_holder: '-',
                account_number: '-',
                ifsc_code: '-',
                bank_name: '-',
                branch_name: '-'
            };
        }
    },

    togglePaymentButton() {
        const checkbox = document.getElementById('payment-confirm');
        const btn = document.getElementById('confirm-payment-btn');
        if (btn) btn.disabled = !checkbox.checked;
    },

    async confirmPayment() {
        if (!this.currentTransaction) {
            this.showError('No transaction selected');
            return;
        }

        try {
            const tx = this.currentTransaction;

            // Call payment API
            const response = await fetch(this.API_BASE + '/broker/process-payment', {
                method: 'POST',
                headers: APIClient.getHeaders(),
                credentials: 'include',
                body: JSON.stringify({
                    transaction_id: tx.id,
                    farmer_id: tx.farmer_id,
                    amount: tx.net_payable
                })
            });

            const data = await response.json();

            if (data.success) {
                this.showSuccess('Payment processed successfully!');
                setTimeout(() => {
                    window.location.href = 'transactions.html';
                }, 1500);
            } else {
                this.showError(data.error || 'Payment processing failed');
            }
        } catch (error) {
            console.error('❌ Payment error:', error);
            this.showError('Error processing payment: ' + error.message);
        }
    },

    goBackToTransactions() {
        window.location.href = 'transactions.html';
    },

    showSuccess(message) {
        const notification = document.createElement('div');
        notification.textContent = '✅ ' + message;
        notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: #4caf50; color: white; padding: 1rem 1.5rem; border-radius: 8px; z-index: 1000;`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 3000);
    },

    showError(message) {
        const notification = document.createElement('div');
        notification.textContent = '❌ ' + message;
        notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: #d32f2f; color: white; padding: 1rem 1.5rem; border-radius: 8px; z-index: 1000;`;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 4000);
    },

    setupEventListeners() {
        console.log('🎯 Setting up event listeners...');
        const confirmCheckbox = document.getElementById('payment-confirm');
        if (confirmCheckbox) {
            confirmCheckbox.addEventListener('change', () => this.togglePaymentButton());
        }

        const confirmBtn = document.getElementById('confirm-payment-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.confirmPayment();
            });
        }

        const backBtn = document.getElementById('back-to-transactions-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.goBackToTransactions());
        }

        const cancelBtn = document.getElementById('cancel-payment-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.goBackToTransactions());
        }
    }
};

// =====================================================
// INITIALIZATION ON PAGE LOAD
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loaded. Initializing payment processor...');
    PaymentProcessor.init();
});
