// =====================================================
// PAYMENT PROCESSOR MANAGER - UPI Payment System (Fixed)
// =====================================================

// GLOBAL STATE - Store payment data fetched from backend
let paymentData = null;
// Track if payment is in progress to prevent multiple clicks
let isPaymentInProgress = false;

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

            // Show loading state
            this.showLoading(true);

            // Use the new API to fetch payment details dynamically
            const result = await fetchPaymentDetails(transactionId);
            
            if (!result.success) {
                this.showLoading(false);
                this.showError(result.error || 'Failed to load payment details');
                return;
            }

            // Store in global paymentData
            paymentData = result.data;
            console.log('📊 Payment data loaded:', paymentData);

            // Display the payment details
            await this.displayPaymentDetails(paymentData);
            this.showLoading(false);

        } catch (error) {
            this.showLoading(false);
            console.error('❌ Load error:', error);
            this.showError('Error loading transaction: ' + error.message);
        }
    },

    /**
     * Load payment data from backend API
     * Fetches transaction + farmer details dynamically
     */
    async loadPaymentData() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const transactionId = urlParams.get('transactionId');

            if (!transactionId) {
                throw new Error('No transaction ID in URL');
            }

            console.log('📡 Fetching payment data for:', transactionId);

            // Call the backend API
            const result = await fetchPaymentDetails(transactionId);

            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch payment details');
            }

            // Store in global state
            paymentData = result.data;
            console.log('✅ Payment data stored:', paymentData);

            return paymentData;

        } catch (error) {
            console.error('❌ loadPaymentData error:', error);
            throw error;
        }
    },

    /**
     * Build UPI payment URL with proper format for all UPI apps
     * Uses standard Bharat Interface for Money (BHIM) compatible format
     */
    buildUPIUrl(options = {}) {
        if (!paymentData) {
            console.error('❌ No payment data available');
            return null;
        }

        const includeAmount = options.includeAmount !== false;
        const includeNote = options.includeNote !== false;
        const { upi_id, farmer_name, amount, order_id, transaction_id } = paymentData;

        // Validate UPI ID exists
        if (!upi_id || upi_id === '-' || upi_id === '') {
            this.showError('Farmer UPI ID not available. Cannot initiate UPI payment.');
            return null;
        }

        // Keep this intent conservative. PhonePe can reject web-generated UPI
        // links with extra PSP fields such as tr/mode/purpose.
        const cleanUpiId = upi_id.trim();
        const cleanName = (farmer_name || 'Farmer')
            .trim()
            .replace(/[^a-zA-Z0-9 .]/g, ' ')
            .replace(/\s+/g, ' ')
            .slice(0, 50) || 'Farmer';
        
        // Short plain notes are accepted by more UPI apps.
        const note = `Mango Market ${order_id || transaction_id || ''}`
            .replace(/[^a-zA-Z0-9 ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 50);
        
        // Format amount properly - ensure it's a valid number
        const numericAmount = Number.parseFloat(amount);
        const formattedAmount = Number.isFinite(numericAmount) && numericAmount > 0
            ? numericAmount.toFixed(2)
            : '';

        const params = new URLSearchParams();
        params.set('pa', cleanUpiId);
        params.set('pn', cleanName);
        if (includeAmount && formattedAmount) params.set('am', formattedAmount);
        params.set('cu', 'INR');
        if (includeNote && note) params.set('tn', note);

        const upiUrl = `upi://pay?${params.toString()}`;

        console.log('🔗 Generated UPI URL:', upiUrl);
        console.log('   pa (UPI ID):', cleanUpiId);
        console.log('   pn (Name):', cleanName);
        console.log('   am (Amount):', includeAmount ? formattedAmount : '(manual)');
        console.log('   tn (Note):', includeNote ? note : '(manual)');
        
        return upiUrl;
    },

    buildPhonePeIntentUrl(options = {}) {
        const upiUrl = this.buildUPIUrl(options);
        if (!upiUrl) return null;

        const query = upiUrl.replace('upi://pay?', '');
        return `intent://pay?${query}#Intent;scheme=upi;package=com.phonepe.app;end`;
    },

    openPhonePePayment() {
        const phonePeUrl = this.buildPhonePeIntentUrl();
        if (!phonePeUrl) return false;

        window.location.href = phonePeUrl;
        return true;
    },

    buildUpiQrSrc() {
        const upiUrl = this.buildUPIUrl();
        if (!upiUrl) return '';

        return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(upiUrl)}`;
    },

    copyPaymentText(value, label) {
        if (!value) return;
        const text = String(value);
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => this.showSuccess(`${label} copied`))
                .catch(() => this.showError(`Could not copy ${label}`));
            return;
        }

        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        this.showSuccess(`${label} copied`);
    },

    /**
     * Open UPI app using window.open with proper handling
     * This method is more reliable than direct window.location.href
     */
    async openUPIApp(upiUrl) {
        return;
        console.log('📱 Opening UPI app...');
        
        // Try window.open first (more reliable on some devices)
        const upiWindow = window.open(upiUrl, '_blank', 'location=yes,height=570,width=520,scrollbars=yes,status=yes,toolbar=no,menubar=no');
        
        if (upiWindow) {
            // Check if window was opened successfully
            setTimeout(() => {
                if (!upiWindow.closed) {
                    console.log('✅ UPI app window opened');
                }
            }, 1000);
        } else {
            // Fallback to direct redirect
            console.log('⚠️ window.open blocked, using direct redirect');
            window.location.href = upiUrl;
        }
    },

    /**
     * Check payment status after redirect
     * Called when user returns to the page
     */
    async checkPaymentStatus() {
        console.log('🔍 Checking payment status...');
        
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const status = urlParams.get('status');
            const txnId = urlParams.get('txnId');
            
            if (status === 'success' || status === 'SUCCESS') {
                this.showSuccess('Payment completed successfully!');
                // Mark as paid in backend
                await markPaymentInitiated(paymentData.transaction_id);
                setTimeout(() => {
                    window.location.href = 'transactions.html';
                }, 2000);
            } else if (status === 'failed' || status === 'FAILED') {
                this.showError('Payment failed. Please try again.');
            }
        } catch (error) {
            console.error('❌ Status check error:', error);
        }
    },

    /**
     * Detect if user is on mobile device
     */
    isMobileDevice() {
        const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini|IEMobile|MobileSafari/i.test(navigator.userAgent);
        console.log('📱 Mobile detection:', isMobile, '| User Agent:', navigator.userAgent);
        return isMobile;
    },

    /**
     * Show fallback options when UPI redirect fails
     */
    showFallbackOptions() {
        const fallbackMsg = `
            <div style="padding: 20px; background: #fff3e0; border-radius: 12px; margin: 20px 0; text-align: center;">
                <h3 style="color: #e65100; margin-top: 0;">⚠️ UPI Redirect Failed</h3>
                <p style="color: #333;">The UPI app did not open. Please try:</p>
                <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px;">
                    <button onclick="window.open('https://play.google.com/store/apps/details?id=com.google.android.apps.nfc', '_blank')" 
                            style="padding: 12px 20px; background: #4285f4; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        📲 Install Google Pay
                    </button>
                    <button onclick="window.open('https://play.google.com/store/apps/details?id=com.phonepe.app', '_blank')" 
                            style="padding: 12px 20px; background: #6739b7; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        📱 Install PhonePe
                    </button>
                    <button onclick="window.open('https://play.google.com/store/apps/details?id=com.paytm.money', '_blank')" 
                            style="padding: 12px 20px; background: #00bfa5; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        💰 Install Paytm
                    </button>
                </div>
                <p style="margin-top: 15px; font-size: 14px; color: #666;">
                    Or scan QR code from your mobile device
                </p>
            </div>
        `;
        
        // Create modal for fallback
        const modal = document.createElement('div');
        modal.id = 'upi-fallback-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 10000; display: flex; align-items: center; justify-content: center;';
        modal.innerHTML = `<div style="background: white; padding: 30px; border-radius: 12px; max-width: 400px; width: 90%;">${fallbackMsg}<button onclick="document.getElementById('upi-fallback-modal').remove()" style="margin-top: 15px; padding: 10px 20px; background: #666; color: white; border: none; border-radius: 6px; cursor: pointer;">Close</button></div>`;
        document.body.appendChild(modal);
    },

    /**
     * Handle UPI payment process
     * Validates, marks payment initiated, and redirects to UPI app with delay
     */
    async handlePayment() {
        console.log('💳 Handling UPI payment...');

        // Prevent multiple clicks
        if (isPaymentInProgress) {
            console.log('⚠️ Payment already in progress, ignoring duplicate click');
            return;
        }

        // Step 1: Validate confirmation checkbox
        const confirmCheckbox = document.getElementById('payment-confirm');
        if (!confirmCheckbox || !confirmCheckbox.checked) {
            this.showError('Please confirm the payment details before proceeding');
            return;
        }

        // Step 2: Ensure paymentData exists
        if (!paymentData) {
            this.showError('No payment data available. Please refresh the page.');
            return;
        }

        // Step 3: Mark payment as in progress and disable button
        isPaymentInProgress = true;
        const btn = document.getElementById('confirm-payment-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Processing...';
        }

        try {
            // Step 4: Detect device - show alert for desktop
            if (!this.isMobileDevice()) {
                this.showError('Please open this page on a mobile device to complete UPI payment');
                isPaymentInProgress = false;
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Show UPI QR';
                }
                return;
            }

            // Step 5: Validate payment details. PhonePe can reject browser-launched UPI intents.
            if (!paymentData.upi_id || paymentData.upi_id === '-') {
                this.showError('Farmer UPI ID not available. Cannot initiate UPI payment.');
                isPaymentInProgress = false;
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Show UPI QR';
                }
                return;
            }

            // Step 6: Call backend to mark payment as initiated
            console.log('📡 Marking payment as initiated...');
            const initResult = await markPaymentInitiated(paymentData.transaction_id);

            if (!initResult.success) {
                this.showError('Failed to initiate payment: ' + (initResult.error || 'Unknown error'));
                isPaymentInProgress = false;
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Show UPI QR';
                }
                return;
            }

            console.log('✅ Payment marked as initiated');

            // Step 7: Add delay before redirect (300-800ms random)
            const delay = 0;
            console.log('⏳ Waiting', delay, 'ms before redirect...');
            
            if (btn) {
                btn.textContent = 'UPI QR Ready';
            }

            await new Promise(resolve => setTimeout(resolve, delay));

            // Step 8: Show dynamic UPI QR first. PhonePe can decline browser
            // intents for security, while QR scan is the normal e-commerce fallback.
            console.log('Showing UPI QR payment details');
            
            try {
                this.showPaymentConfirmationDialog();
            } catch (redirectError) {
                console.error('❌ Redirect failed:', redirectError);
                this.showFallbackOptions();
                isPaymentInProgress = false;
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Show UPI QR';
                }
            }

        } catch (error) {
            console.error('❌ Payment handling error:', error);
            this.showError('Error processing payment: ' + error.message);
            isPaymentInProgress = false;
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Show UPI QR';
            }
        }
    },

    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /**
     * Show dialog to confirm payment after UPI app opens
     */
    showPaymentConfirmationDialog() {
        const dialog = document.createElement('div');
        dialog.id = 'payment-confirmation-dialog';
        dialog.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.9); z-index: 10000; display: flex; align-items: center; justify-content: center;';
        const upiId = paymentData?.upi_id || '-';
        const phone = paymentData?.phone || '-';
        const amount = Number.parseFloat(paymentData?.amount || 0).toFixed(2);
        const farmerName = paymentData?.farmer_name || 'Farmer';
        const qrSrc = this.buildUpiQrSrc();
        
        dialog.innerHTML = `
            <div style="background: white; padding: 24px; border-radius: 16px; max-width: 460px; width: 92%; text-align: center; max-height: 92vh; overflow: auto;">
                <div style="font-size: 60px; margin-bottom: 20px;">📱</div>
                <h2 style="color: #1a1a1a; margin: 0 0 10px 0;">Scan & Pay</h2>
                <p style="color: #666; margin-bottom: 20px;">
                    Open PhonePe, scan this QR, verify the amount, and enter your UPI PIN.
                </p>

                <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
                    <img src="${this.escapeHtml(qrSrc)}" alt="UPI QR code" style="width: 260px; max-width: 100%; height: auto; display: block; margin: 0 auto;">
                </div>

                <div style="background: #fff7ed; padding: 14px; border-radius: 8px; margin-bottom: 16px; text-align: left;">
                    <p style="margin: 0 0 8px 0; color: #9a3412; font-weight: 700;">Payment details</p>
                    <p style="margin: 0 0 10px 0; color: #444; font-size: 14px;">
                        QR scan avoids PhonePe blocking browser-generated payment links.
                    </p>
                    <p style="margin: 4px 0; color: #222; font-size: 14px;"><strong>Name:</strong> ${this.escapeHtml(farmerName)}</p>
                    <p style="margin: 4px 0; color: #222; font-size: 14px;"><strong>UPI ID:</strong> ${this.escapeHtml(upiId)}</p>
                    <p style="margin: 4px 0; color: #222; font-size: 14px;"><strong>Mobile:</strong> ${this.escapeHtml(phone)}</p>
                    <p style="margin: 4px 0; color: #222; font-size: 14px;"><strong>Amount:</strong> Rs ${this.escapeHtml(amount)}</p>
                    <div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                        <button onclick="PaymentProcessor.copyPaymentText(${JSON.stringify(upiId)}, 'UPI ID')"
                                style="flex: 1; min-width: 120px; padding: 10px 12px; background: #f3f4f6; color: #333; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                            Copy UPI ID
                        </button>
                        <button onclick="PaymentProcessor.copyPaymentText(${JSON.stringify(phone)}, 'Mobile number')"
                                style="flex: 1; min-width: 120px; padding: 10px 12px; background: #f3f4f6; color: #333; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                            Copy Mobile
                        </button>
                        <button onclick="PaymentProcessor.copyPaymentText(${JSON.stringify(amount)}, 'Amount')"
                                style="flex: 1; min-width: 120px; padding: 10px 12px; background: #f3f4f6; color: #333; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                            Copy Amount
                        </button>
                        <button onclick="PaymentProcessor.openPhonePePayment()"
                                style="flex: 1 0 100%; padding: 10px 12px; background: #6739b7; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                            Try opening PhonePe directly
                        </button>
                    </div>
                </div>
                
                <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p style="margin: 0; color: #2e7d32; font-weight: 600;">
                        💡 After completing payment, come back to this page and click below:
                    </p>
                </div>
                
                <div style="display: flex; gap: 10px; flex-direction: column;">
                    <button onclick="PaymentProcessor.confirmPaymentComplete()" 
                            style="padding: 15px 25px; background: #4caf50; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;">
                        ✅ Payment Completed
                    </button>
                    <button onclick="PaymentProcessor.cancelPayment()" 
                            style="padding: 12px 25px; background: #f5f5f5; color: #666; border: none; border-radius: 8px; font-size: 14px; cursor: pointer;">
                        ❌ Payment Not Done
                    </button>
                </div>
                
                <p style="margin-top: 20px; font-size: 12px; color: #999;">
                    Transaction will be recorded after confirmation
                </p>
            </div>
        `;
        
        document.body.appendChild(dialog);
    },

    /**
     * Confirm payment is complete (user clicks after UPI app)
     */
    async confirmPaymentComplete() {
        console.log('✅ User confirmed payment complete');
        
        const dialog = document.getElementById('payment-confirmation-dialog');
        if (dialog) dialog.remove();
        
        // Show loading
        this.showLoading(true);
        
        try {
            // Call backend to mark payment as COMPLETED
            const result = await markPaymentComplete(paymentData.transaction_id);
            
            this.showLoading(false);
            
            if (result.success) {
                this.showSuccess('🎉 Payment recorded successfully!');
                setTimeout(() => {
                    window.location.href = 'transactions.html';
                }, 2000);
            } else {
                this.showError(result.error || 'Failed to record payment');
                isPaymentInProgress = false;
            }
        } catch (error) {
            this.showLoading(false);
            console.error('❌ Confirm payment error:', error);
            this.showError('Error confirming payment: ' + error.message);
            isPaymentInProgress = false;
        }
    },

    /**
     * Cancel payment process
     */
    cancelPayment() {
        console.log('❌ Payment cancelled by user');
        
        const dialog = document.getElementById('payment-confirmation-dialog');
        if (dialog) dialog.remove();
        
        isPaymentInProgress = false;
        const btn = document.getElementById('confirm-payment-btn');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Show UPI QR';
        }
        
        this.showError('Payment cancelled. You can try again.');
    },

    async displayPaymentDetails(data) {
        try {
            if (!data) {
                this.showError('No payment data to display');
                return;
            }

            // Populate farmer details from API data
            document.getElementById('payment-farmer-name').textContent = data.farmer_name || `Farmer #${data.farmer_id}`;
            document.getElementById('payment-farmer-phone').textContent = data.phone || '-';
            document.getElementById('payment-order-id').textContent = data.order_id || '-';

            // Populate transaction amounts
            const totalAmount = data.amount || 0;
            document.getElementById('payment-total-amount').textContent = '₹' + totalAmount.toFixed(2);
            document.getElementById('payment-commission').textContent = '₹0.00';
            document.getElementById('payment-net-payable').textContent = '₹' + totalAmount.toFixed(2);

            // Populate UPI details
            document.getElementById('payment-upi-id').textContent = data.upi_id || '-';
            
            // Bank details - show as N/A since we're using UPI
            document.getElementById('payment-account-holder').textContent = data.farmer_name || '-';
            document.getElementById('payment-account-number').textContent = 'Via UPI';
            document.getElementById('payment-ifsc-code').textContent = 'Via UPI';
            document.getElementById('payment-bank-name').textContent = 'UPI';
            document.getElementById('payment-branch-name').textContent = 'UPI';

            // Reset confirmation checkbox
            const confirmCheckbox = document.getElementById('payment-confirm');
            const confirmBtn = document.getElementById('confirm-payment-btn');
            if (confirmCheckbox) confirmCheckbox.checked = false;
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Show UPI QR';
            }

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
                    branch_name: data.farmer.branch_name || '-',
                    upi_id: data.farmer.upi_id || data.farmer.upi || '-'
                };
            }
            return {
                phone: '-',
                account_holder: '-',
                account_number: '-',
                ifsc_code: '-',
                bank_name: '-',
                branch_name: '-',
                upi_id: '-'
            };
        } catch (error) {
            console.error('Error fetching farmer details:', error);
            return {
                phone: '-',
                account_holder: '-',
                account_number: '-',
                ifsc_code: '-',
                bank_name: '-',
                branch_name: '-',
                upi_id: '-'
            };
        }
    },

    togglePaymentButton() {
        const checkbox = document.getElementById('payment-confirm');
        const btn = document.getElementById('confirm-payment-btn');
        if (btn) btn.disabled = !checkbox.checked;
    },

    async confirmPayment() {
        // Use the new UPI payment flow
        await this.handlePayment();
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

    showLoading(show) {
        const loader = document.getElementById('loading-spinner');
        if (loader) {
            loader.style.display = show ? 'block' : 'none';
        }
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
// EXPOSE GLOBAL FUNCTIONS
// =====================================================
window.paymentData = paymentData;
window.PaymentProcessor = PaymentProcessor;

// =====================================================
// INITIALIZATION ON PAGE LOAD
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM loaded. Initializing payment processor...');
    PaymentProcessor.init();
});
