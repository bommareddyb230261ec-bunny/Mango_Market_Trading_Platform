// =====================================================
// TRANSACTION MANAGER
// =====================================================
const TransactionManager = {
    currentBroker: null,
    allTransactions: [],
    filteredTransactions: [],
    currentTransaction: null,
    API_BASE: null,  // Will be set dynamically via ensureApiReady()

    async init() {
        console.log('🚀 Initializing Transaction Manager...');
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
            
            const userDetails = AuthManager.getUserDetails();
            if (!userDetails || userDetails.role !== 'BROKER') {
                window.location.href = 'broker_login.html';
                return;
            }
            await this.loadTransactions();
            this.setupEventListeners();
            console.log('✅ Transaction Manager loaded successfully');
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            this.showError('Failed to initialize: ' + error.message);
        }
    },

    async loadTransactions() {
        try {
            console.log('📊 Loading transactions...');
            const response = await fetch(this.API_BASE + '/broker/dashboard', {
                method: 'GET',
                headers: APIClient.getHeaders(),
                credentials: 'include'
            });

            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Failed to load');

            this.currentBroker = data.broker;

            // Base transactions from backend
            this.allTransactions = data.transactions || [];

            // Include weighments (if present) by converting them into transaction-like objects
            if (Array.isArray(data.weighments)) {
                const wAsTx = data.weighments.map(w => ({
                    id: `w-${w.id}`,
                    request_id: w.sell_request_id || null,
                    farmer_id: w.farmer_id || null,
                    farmer_name: w.farmer_name || `Farmer #${w.farmer_id || 'Unknown'}`,
                    variety: w.mango_variety || 'Unknown',
                    date: w.weighment_date || w.created_at,
                    actual_weight: (w.actual_weight_tons || 0),
                    market_price_at_sale: (w.final_price_per_kg || 0),
                    total_cost: ((w.actual_weight_tons || 0) * 1000 * (w.final_price_per_kg || 0)),
                    commission: 0,
                    net_payable: ((w.actual_weight_tons || 0) * 1000 * (w.final_price_per_kg || 0)),
                    payment_status: 'N/A',
                    _is_weighment: true
                }));
                this.allTransactions = [...this.allTransactions, ...wAsTx];
            }

            this.filteredTransactions = [...this.allTransactions];
            this.renderTransactions();
        } catch (error) {
            console.error('❌ Load error:', error);
            this.showError('Error loading transactions: ' + error.message);
        }
    },

    renderTransactions() {
        const grid = document.getElementById('transactions-grid');
        if (!grid) return;

        if (this.filteredTransactions.length === 0) {
            grid.innerHTML = '<div class="loading-card"><p>No transactions found</p></div>';
            return;
        }

        grid.innerHTML = this.filteredTransactions.map(tx => {
            const idAttr = String(tx.id).replace(/'/g, "\\'");
            const weightText = (typeof tx.actual_weight === 'number') ? `${tx.actual_weight.toFixed(2)} tons` : 'N/A';
            const netPay = (typeof tx.net_payable === 'number') ? `₹${tx.net_payable.toFixed(2)}` : '₹0.00';
            const payment_status = (tx.payment_status || 'N/A');

            const txStatus = this.getTransactionStatus(tx);
            return `
            <div class="transaction-card" onclick="TransactionManager.showDetails('${idAttr}')">
                <div class="card-header-tx">
                    <p class="farmer-name-tx">${tx.farmer_name || `Farmer #${tx.farmer_id}`}</p>
                    <p class="tx-date">${this.formatDate(tx.date)}</p>
                </div>
                <div class="card-body-tx">
                    <div class="tx-meta">
                        <div>
                            <div class="meta-label-tx">Variety</div>
                            <div class="meta-value-tx">${tx.variety}</div>
                        </div>
                        <div>
                            <div class="meta-label-tx">Weight</div>
                            <div class="meta-value-tx">${weightText}</div>
                        </div>
                    </div>
                    <div class="tx-meta">
                        <div>
                            <div class="meta-label-tx">Net Payable</div>
                            <div class="meta-value-tx">${netPay}</div>
                        </div>
                    </div>
                </div>
                <div class="card-footer-tx">
                    <span class="transaction-status-badge ${txStatus.toLowerCase()}">
                        ${txStatus}
                    </span>
                </div>
            </div>
        `;
        }).join('');
    },

    showDetails(transactionId) {
        const tx = this.allTransactions.find(t => String(t.id) === String(transactionId));
        if (!tx) return;

        this.currentTransaction = tx;

        const weight = typeof tx.actual_weight === 'number' ? tx.actual_weight.toFixed(2) + ' tons' : 'N/A';
        const price = typeof tx.market_price_at_sale === 'number' ? '₹' + tx.market_price_at_sale.toFixed(2) : '₹0.00';
        const totalAmount = (typeof tx.total_cost === 'number') ? tx.total_cost.toFixed(2) : ((tx.actual_weight || 0) * (tx.market_price_at_sale || 0) * 1000).toFixed(2);

        document.getElementById('detail-farmer-name').textContent = tx.farmer_name || `Farmer #${tx.farmer_id}`;
        document.getElementById('detail-date').textContent = this.formatDate(tx.date);
        document.getElementById('detail-variety').textContent = tx.variety;
        document.getElementById('detail-weight').textContent = weight;
        document.getElementById('detail-price').textContent = price;
        document.getElementById('detail-total').textContent = '₹' + totalAmount;
        document.getElementById('detail-commission').textContent = typeof tx.commission === 'number' ? '₹' + tx.commission.toFixed(2) : '₹0.00';
        document.getElementById('detail-net-payable').textContent = typeof tx.net_payable === 'number' ? '₹' + tx.net_payable.toFixed(2) : '₹0.00';
        document.getElementById('detail-payment-status').textContent = tx.payment_status || 'N/A';
        
        // Set transaction status
        const txStatus = this.getTransactionStatus(tx);
        const statusElement = document.getElementById('detail-transaction-status');
        statusElement.innerHTML = `<span class="transaction-status-badge ${txStatus.toLowerCase()}">${txStatus}</span>`;

        document.querySelector('.transactions-section').style.display = 'none';
        document.getElementById('transaction-details').style.display = 'block';
        window.scrollTo(0, 0);
    },


    closeDetails() {
        document.querySelector('.transactions-section').style.display = 'block';
        document.getElementById('transaction-details').style.display = 'none';
    },

    getTransactionStatus(tx) {
        // If payment is PAID -> COMPLETED
        if (tx.payment_status === 'PAID') {
            return 'COMPLETED';
        }
        // If payment is FAILED -> FAILED
        if (tx.payment_status === 'FAILED') {
            return 'FAILED';
        }
        // If it's a weighment or has actual weight -> PENDING
        if (tx._is_weighment || (typeof tx.actual_weight === 'number' && tx.actual_weight > 0)) {
            return 'PENDING';
        }
        // Default to PENDING
        return 'PENDING';
    },

    filterByDate() {
        // Date filter removed - now using transaction status filter
        this.filterByTransactionStatus();
    },

    filterByPaymentStatus() {
        // Payment status filter removed - now using transaction status filter
        this.filterByTransactionStatus();
    },

    filterByTransactionStatus() {
        const status = document.getElementById('transaction-status-filter').value;

        if (!status) {
            this.filteredTransactions = [...this.allTransactions];
        } else {
            this.filteredTransactions = this.allTransactions.filter(t => {
                const txStatus = this.getTransactionStatus(t);
                return txStatus === status.toUpperCase();
            });
        }
        this.renderTransactions();
    },

    searchTransactions() {
        const searchTerm = document.getElementById('search-box').value.toLowerCase();
        const transactionStatus = document.getElementById('transaction-status-filter').value;

        this.filteredTransactions = this.allTransactions.filter(t => {
            const matchesSearch = (t.farmer_name || `Farmer #${t.farmer_id}`).toLowerCase().includes(searchTerm);
            
            const txStatus = this.getTransactionStatus(t);
            const matchesStatus = !transactionStatus || txStatus === transactionStatus.toUpperCase();
            
            return matchesSearch && matchesStatus;
        });

        this.renderTransactions();
    },

    printCurrentTransaction() {
        if (!this.currentTransaction) {
            this.showError('No transaction selected');
            return;
        }

        const tx = this.currentTransaction;
        const totalAmount = (tx.actual_weight * tx.market_price_at_sale).toFixed(2);

        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Transaction Receipt - ${tx.id}</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            margin: 2rem; 
                            background: white;
                        }
                        .receipt-container {
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 2rem;
                            border: 2px solid #e65100;
                            border-radius: 8px;
                        }
                        .receipt-header { 
                            text-align: center; 
                            margin-bottom: 2rem; 
                            border-bottom: 2px solid #e65100; 
                            padding-bottom: 1rem; 
                        }
                        .receipt-header h1 {
                            color: #e65100;
                            margin: 0 0 0.5rem 0;
                        }
                        .receipt-header p {
                            color: #666;
                            margin: 0.25rem 0;
                        }
                        .detail-row { 
                            display: flex; 
                            justify-content: space-between; 
                            padding: 0.75rem 0; 
                            border-bottom: 1px solid #eee; 
                        }
                        .detail-label { 
                            font-weight: bold; 
                            color: #333; 
                            min-width: 200px;
                        }
                        .detail-value { 
                            color: #666; 
                            text-align: right;
                        }
                        .total-row { 
                            font-weight: bold; 
                            font-size: 1.1rem; 
                            padding: 1.5rem 0; 
                            color: #e65100;
                            border-top: 2px solid #e65100;
                            border-bottom: 2px solid #e65100;
                        }
                        .footer { 
                            text-align: center; 
                            margin-top: 2rem; 
                            color: #999; 
                            font-size: 0.85rem;
                        }
                        @media print {
                            body { margin: 0; }
                            .receipt-container { border: 1px solid #ccc; }
                        }
                    </style>
                </head>
                <body>
                    <div class="receipt-container">
                        <div class="receipt-header">
                            <h1>🥭 Mango Market Trading</h1>
                            <p>Transaction Receipt</p>
                            <p>Receipt #${tx.id}</p>
                        </div>
                        
                        <div class="detail-row">
                            <span class="detail-label">Farmer Name:</span>
                            <span class="detail-value">${tx.farmer_name || `Farmer #${tx.farmer_id}`}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Date:</span>
                            <span class="detail-value">${this.formatDate(tx.date)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Mango Variety:</span>
                            <span class="detail-value">${tx.variety}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Weight:</span>
                            <span class="detail-value">${tx.actual_weight.toFixed(2)} tons</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Price per KG:</span>
                            <span class="detail-value">₹${tx.market_price_at_sale.toFixed(2)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Total Amount:</span>
                            <span class="detail-value">₹${totalAmount}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Commission:</span>
                            <span class="detail-value">₹${tx.commission.toFixed(2)}</span>
                        </div>
                        <div class="detail-row total-row">
                            <span class="detail-label">Net Payable:</span>
                            <span class="detail-value">₹${tx.net_payable.toFixed(2)}</span>
                        </div>
                        <div class="detail-row">
                            <span class="detail-label">Payment Status:</span>
                            <span class="detail-value">${tx.payment_status}</span>
                        </div>
                        
                        <div class="footer">
                            <p>This is a digitally generated receipt from Mango Market Trading Platform</p>
                            <p>&copy; 2026 All rights reserved</p>
                        </div>
                    </div>
                    <script>
                        window.onload = function() {
                            window.print();
                        }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    },

    openPaymentModal() {
        if (!this.currentTransaction) {
            this.showError('No transaction selected');
            return;
        }

        try {
            const tx = this.currentTransaction;
            // Navigate to payments.html with transaction ID
            window.location.href = `payments.html?transactionId=${encodeURIComponent(tx.id)}`;
        } catch (error) {
            console.error('❌ Error navigating to payment page:', error);
            this.showError('Error opening payment page: ' + error.message);
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
                    phone: data.farmer.phone_number || data.farmer.phone || '-',
                    account_holder: data.farmer.account_holder_name || data.farmer.name || '-',
                    account_number: data.farmer.account_number || '-',
                    ifsc_code: data.farmer.ifsc_code || '-',
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

    closePaymentModal() {
        const modal = document.getElementById('payment-modal');
        modal.style.display = 'none';
    },

    togglePaymentButton() {
        const checkbox = document.getElementById('payment-confirm');
        const btn = document.getElementById('confirm-payment-btn');
        btn.disabled = !checkbox.checked;
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
                this.closePaymentModal();
                // Reload transactions to update status
                await this.loadTransactions();
            } else {
                this.showError(data.error || 'Payment processing failed');
            }
        } catch (error) {
            console.error('❌ Payment error:', error);
            this.showError('Error processing payment: ' + error.message);
        }
    },

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
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
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            if (link.getAttribute('onclick') !== 'AuthManager.logout()') {
                link.addEventListener('click', () => {
                    navLinks.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');
                });
            }
        });
    }
};

// =====================================================
// INITIALIZATION ON PAGE LOAD
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loaded. Initializing transaction manager...');
    TransactionManager.init();
});
