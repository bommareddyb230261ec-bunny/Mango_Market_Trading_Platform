// Show inline error message below field
function showFieldError(fieldName, message) {
    const field = document.querySelector(`[name="${fieldName}"]`);
    if (!field) {
        console.log('Field not found:', fieldName); // Debug
        return;
    }
    
    // Remove existing error if any
    const existingError = field.parentElement.querySelector('.field-error');
    if (existingError) existingError.remove();
    
    // Add error class to field
    field.classList.add('error');
    
    // Highlight the field
    field.style.borderColor = '#dc2626';
    field.style.backgroundColor = '#fef2f2';
    
    // Create error element
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
        color: #d32f2f;
        font-size: 13px;
        margin-top: 6px;
        margin-bottom: 12px;
        font-weight: 500;
        display: block;
    `;
    
    field.parentElement.appendChild(errorDiv);
    
    // Scroll to the error field
    field.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    console.log('Error shown for field:', fieldName); // Debug
}

// Clear field error
function clearFieldError(fieldName) {
    const field = document.querySelector(`[name="${fieldName}"]`);
    if (!field) return;
    
    const existingError = field.parentElement.querySelector('.field-error');
    if (existingError) existingError.remove();
    
    field.classList.remove('error');
}

// Global flash helper: type = 'success' | 'error' | 'warning' | 'info'
function showFlash(message, type = 'success', duration = 4000) {
    const colors = {
        success: { bg: '#10b981', text: '#fff' },
        error: { bg: '#d32f2f', text: '#fff' },
        warning: { bg: '#f59e0b', text: '#fff' },
        info: { bg: '#2563eb', text: '#fff' }
    };
    const c = colors[type] || colors.success;
    const flash = document.createElement('div');
    flash.className = 'mango-flash';
    flash.style.cssText = `position:fixed; top:20px; left:50%; transform:translateX(-50%); background:${c.bg}; color:${c.text}; padding:12px 18px; border-radius:8px; z-index:9999; box-shadow:0 6px 18px rgba(0,0,0,0.12); font-weight:700; max-width:90%; text-align:center;`;
    flash.textContent = message;
    document.body.appendChild(flash);
    setTimeout(() => {
        try { flash.remove(); } catch (e) {}
    }, duration);
    return flash;
}

// Real-time email validation - check if email already exists
async function validateEmailUnique(email) {
    if (!email || !email.includes('@')) return true;
    
    try {
        const response = await apiFetch(`/auth/check-email?email=${encodeURIComponent(email)}`, {
            method: 'GET',
            headers: APIClient.getHeaders(),
            credentials: 'include'
        });
        if (!response.ok) return true;
        const result = await response.json();
        return result.available !== false;
    } catch (e) {
        console.error('Email check error:', e);
        return true;
    }
}

// Real-time phone validation - check if phone already exists
async function validatePhoneUnique(phone) {
    if (!phone || phone.length < 10) return true;
    
    try {
        const response = await apiFetch(`/auth/check-phone?phone=${encodeURIComponent(phone)}`, {
            method: 'GET',
            headers: APIClient.getHeaders(),
            credentials: 'include'
        });
        if (!response.ok) return true;
        const result = await response.json();
        return result.available !== false;
    } catch (e) {
        console.error('Phone check error:', e);
        return true;
    }
}

// Add real-time validation listeners
function setupFieldValidation() {
    // Email field validation
    const emailField = document.querySelector('input[type="email"]');
    if (emailField) {
        emailField.addEventListener('blur', async (e) => {
            if (e.target.value) {
                const isAvailable = await validateEmailUnique(e.target.value);
                if (!isAvailable) {
                    showFieldError('email', 'Email is already registered');
                } else {
                    clearFieldError('email');
                }
            }
        });
        
        emailField.addEventListener('input', () => {
            clearFieldError('email');
        });
    }
    
    // Phone field validation
    const phoneField = document.querySelector('input[type="tel"]');
    if (phoneField) {
        phoneField.addEventListener('blur', async (e) => {
            if (e.target.value && e.target.value.length === 10) {
                const isAvailable = await validatePhoneUnique(e.target.value);
                if (!isAvailable) {
                    showFieldError('phone', 'Phone number is already registered');
                } else {
                    clearFieldError('phone');
                }
            }
        });
        
        phoneField.addEventListener('input', () => {
            clearFieldError('phone');
        });
    }
    
    // Password confirmation validation
    const passwordField = document.querySelector('input[name="password"]');
    const confirmField = document.querySelector('input[name="confirm_password"]');
    
    if (confirmField && passwordField) {
        confirmField.addEventListener('input', () => {
            if (confirmField.value && passwordField.value !== confirmField.value) {
                showFieldError('confirm_password', 'Passwords do not match');
            } else {
                clearFieldError('confirm_password');
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {

    // Persistent backend status banner (shows if backend unreachable)
    (function setupBackendBanner(){
        const bannerId = 'backend-status-banner';
        if (!document.getElementById(bannerId)) {
            const banner = document.createElement('div');
            banner.id = bannerId;
            banner.style.cssText = 'display:none; position:fixed; top:10px; left:50%; transform:translateX(-50%); background:#ffcc00; color:#000; padding:10px 16px; border-radius:6px; z-index:9999; box-shadow:0 2px 6px rgba(0,0,0,0.15); font-weight:600;';
            banner.innerHTML = `<span id="backend-status-msg">Checking backend...</span> <button id="backend-retry-btn" style="margin-left:12px;padding:6px 10px;border-radius:4px;border:none;background:#2e7d32;color:#fff;cursor:pointer">Retry</button>`;
            document.body.appendChild(banner);
            document.getElementById('backend-retry-btn').addEventListener('click', async () => {
                document.getElementById('backend-status-msg').textContent = 'Checking...';
                try {
                    const ok = await (window.ensureApiReady ? window.ensureApiReady() : null);
                    if (ok) {
                        document.getElementById('backend-status-msg').textContent = 'Backend available';
                        setTimeout(() => document.getElementById(bannerId).style.display = 'none', 1000);
                    } else {
                        document.getElementById('backend-status-msg').textContent = 'Backend still unavailable';
                    }
                } catch (e) {
                    document.getElementById('backend-status-msg').textContent = 'Check failed';
                }
            });
        }

        window.addEventListener('backend:status', (ev) => {
            const { available } = ev.detail || {};
            const banner = document.getElementById('backend-status-banner');
            if (!banner) return;
            if (!available) {
                document.getElementById('backend-status-msg').textContent = 'Backend not found on default ports';
                banner.style.display = 'block';
            } else {
                banner.style.display = 'none';
            }
        });

        // Kick off an initial probe (non-blocking)
        (async () => {
            try {
                const ok = await (window.ensureApiReady ? window.ensureApiReady() : null);
                if (!ok) {
                    const banner = document.getElementById('backend-status-banner');
                    if (banner) banner.style.display = 'block';
                }
            } catch (e) {
                const banner = document.getElementById('backend-status-banner');
                if (banner) banner.style.display = 'block';
            }
        })();
    })();

    // --- REGISTER HANDLERS ---

    const handleRegister = async (event, role) => {
        event.preventDefault();
        console.log('handleRegister called with role:', role); // Debug
        const form = event.target;
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerText;

        // Clear all previous errors
        form.querySelectorAll('.field-error').forEach(el => el.remove());
        form.querySelectorAll('input').forEach(el => {
            el.style.borderColor = '';
            el.style.backgroundColor = '';
        });

        // UI Loading State
        btn.disabled = true;
        btn.innerText = "Processing...";

        // Collect Data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Client-side validation
        let hasError = false;

        if (!data.full_name) {
            showFieldError('full_name', 'Full name is required');
            hasError = true;
        }

        if (!data.phone) {
            showFieldError('phone', 'Phone number is required');
            hasError = true;
        } else if (data.phone.length !== 10) {
            showFieldError('phone', 'Phone number must be 10 digits');
            hasError = true;
        }

        if (!data.email) {
            showFieldError('email', 'Email address is required');
            hasError = true;
        }

        // Broker-specific: validate market name
        if (role === 'BROKER' && !data.market_name) {
            showFieldError('market_name', 'Agency / Market Name is required');
            hasError = true;
        }

        if (!data.password) {
            showFieldError('password', 'Password is required');
            hasError = true;
        }

        if (data.password !== data.confirm_password) {
            showFieldError('confirm_password', 'Passwords do not match');
            hasError = true;
        }

        if (!data.state) {
            showFieldError('state', 'State is required');
            hasError = true;
        }

        if (!data.district) {
            showFieldError('district', 'District is required');
            hasError = true;
        }

        // For FARMER: require address/village field
        // For BROKER: require city/market hub field
        if (role === 'FARMER' && !data.address) {
            showFieldError('address', 'Address / Village is required');
            hasError = true;
        } else if (role === 'BROKER' && !data.city) {
            showFieldError('city', 'City / Market Hub is required');
            hasError = true;
        }

        // Check if email has been verified via OTP
        if (!isEmailVerified) {
            showFieldError('email', '✓ Please verify your email with OTP before submitting');
            hasError = true;
        }

        if (hasError) {
            console.log('Validation errors found, not submitting'); // Debug
            btn.disabled = false;
            btn.innerText = originalText;
            return;
        }

        delete data.confirm_password;
        data.role = role;

        if (role === 'BROKER') {
            const feeCheckbox = document.getElementById('platform_fee_paid');
            data.platform_fee_paid = feeCheckbox ? feeCheckbox.checked : false;
            console.log('Broker platform_fee_paid checked:', data.platform_fee_paid); // Debug
            
            if (!data.platform_fee_paid) {
                console.log('Platform fee not agreed - blocking submission'); // Debug
                showFieldError('platform_fee_paid', '✓ Please check this box to agree and continue');
                btn.disabled = false;
                btn.innerText = originalText;
                return;
            }

            // Check for trade license file
            const tradeLicenseInput = document.getElementById('tradeLicenseFile');
            if (!tradeLicenseInput || !tradeLicenseInput.files || tradeLicenseInput.files.length === 0) {
                console.log('Trade license file not selected'); // Debug
                showFieldError('tradeLicenseFile', '✓ Please upload your trade license document');
                btn.disabled = false;
                btn.innerText = originalText;
                return;
            }
        } else if (role === 'FARMER') {
            if (!data.upi_id) {
                data.upi_id = '';
            }
        }

        // API Call
        console.log('Submitting form with data:', data); // Debug
        
        let result;
        if (role === 'BROKER') {
            // For brokers, use FormData to include file upload
            const formDataToSend = new FormData();
            
            // Append all form fields
            for (const [key, value] of Object.entries(data)) {
                if (key !== 'trade_license_file') {  // Skip the file field as we'll handle it separately
                    formDataToSend.append(key, value);
                }
            }
            
            // Append the trade license file
            const tradeLicenseInput = document.getElementById('tradeLicenseFile');
            if (tradeLicenseInput.files.length > 0) {
                formDataToSend.append('trade_license_file', tradeLicenseInput.files[0]);
            }
            
            // Send with multipart/form-data
            try {
                const base = await _ensureApiBase();
                if (!base) {
                    result = { success: false, message: 'Cannot reach backend. Make sure the backend server is running.' };
                } else {
                    const response = await fetch(`${base}/auth/register`, {
                        method: 'POST',
                        credentials: 'include',
                        body: formDataToSend
                    });
                    
                    if (!response.ok) {
                        let errorMsg = `Server error: ${response.status} ${response.statusText}`;
                        try {
                            const errData = await response.json();
                            if (errData && errData.message) errorMsg = errData.message;
                        } catch (e) {}
                        result = { success: false, message: errorMsg };
                    } else {
                        result = await response.json();
                        if (result && result.session_token) localStorage.setItem('session_token', result.session_token);
                    }
                }
            } catch (error) {
                console.error('Registration API error:', error);
                result = { success: false, message: error.message || 'Network error occurred' };
            }
        } else {
            // For farmers, use standard postData (JSON)
            result = await postData('/auth/register', data);
        }
        
        console.log('Registration API response:', result); // Debug

        if (result.user_id) {
            console.log('Registration successful'); // Debug
            // Success - store minimal session info if provided
            try {
                if (result.token) {
                    localStorage.setItem('token', result.token);
                }
                const resolvedRole = result.role || role;
                localStorage.setItem('role', resolvedRole);
                if (result.role_specific_id) localStorage.setItem('role_id', result.role_specific_id);
                localStorage.setItem('user_id', result.user_id);
                if (result.user_name) localStorage.setItem('user_name', result.user_name);
            } catch (e) {
                console.warn('Failed to persist session info locally', e);
            }

            // If the registrant is a BROKER, show a confirmation flash and redirect to login
            const isBroker = (role === 'BROKER') || (result.role && result.role.toUpperCase() === 'BROKER');
            if (isBroker) {
                showFlash('Registration successful — we will verify your license soon. Please log in after 24 hours.', 'success');
                setTimeout(() => { window.location.href = 'broker_login.html'; }, 3500);
            } else {
                const isFarmer = (role === 'FARMER') || (result.role && result.role.toUpperCase() === 'FARMER');
                if (isFarmer) {
                    showFlash('Registration successful — Please login to continue.', 'success');
                    setTimeout(() => { window.location.href = 'farmer_login.html'; }, 3000);
                } else {
                    setTimeout(() => { window.location.href = (role === 'FARMER' || (result.role && result.role.toUpperCase() === 'FARMER')) ? 'farmer_dashboard.html' : 'broker_dashboard.html'; }, 300);
                }
            }
        } else {
            // Show backend error on specific field
            console.log('Registration failed with error:', result.message); // Debug
            const errorMsg = result.message || "Registration failed";
            
            // Parse error and show on correct field (use more specific phrase matching)
            const lowerMsg = (errorMsg || '').toLowerCase();
            if (lowerMsg.includes('email')) {
                showFieldError('email', 'You have already used this email');
            } else if (lowerMsg.includes('phone')) {
                showFieldError('phone', 'You have already used this phone number');
            } else if (lowerMsg.includes('market')) {
                showFieldError('market_name', 'Market name is required');
            } else if (lowerMsg.includes('account holder')) {
                // Banking-related informational message
                showFlash('Note: Banking details were accepted. ' + errorMsg, 'warning');
            } else if (lowerMsg.includes('bank account')) {
                showFlash('Note: Banking details were accepted. ' + errorMsg, 'warning');

            // IFSC-related errors: do not mark the IFSC field invalid — accept any IFSC/bank details
            
            } else if (lowerMsg.includes('location') || lowerMsg.includes('market area') || lowerMsg.includes('city')) {
                showFieldError('market_area', 'Location is required');
                showFieldError('city', 'Location is required');
            } else {
                // Generic error - show as flash
                showFlash('Error: ' + errorMsg, 'error');
            }
            
            btn.disabled = false;
            btn.innerText = originalText;
        }
    };

    // --- LOGIN HANDLERS ---

    const handleLogin = async (event, expectedRole) => {
        event.preventDefault();
        const form = event.target;
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerText;

        // Clear errors
        form.querySelectorAll('.field-error').forEach(el => el.remove());
        form.querySelectorAll('input').forEach(el => {
            el.style.borderColor = '';
            el.style.backgroundColor = '';
        });

        btn.disabled = true;
        btn.innerText = "Verifying...";

        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Validation
        let hasError = false;
        if (!data.identifier) {
            showFieldError('identifier', 'Phone or email is required');
            hasError = true;
        }
        if (!data.password) {
            showFieldError('password', 'Password is required');
            hasError = true;
        }

        if (hasError) {
            btn.disabled = false;
            btn.innerText = originalText;
            return;
        }

        // API Call
        const result = await postData('/auth/login', {
            identifier: data.identifier,
            password: data.password
        });

        if (result.user_id) {
            // Role Check
            if (result.role !== expectedRole) {
                showFieldError('identifier', 'Invalid credentials');
                btn.disabled = false;
                btn.innerText = originalText;
                return;
            }

            // Save Session
            localStorage.setItem('user_id', result.user_id);
            localStorage.setItem('role', result.role);
            if(result.role_specific_id) localStorage.setItem('role_id', result.role_specific_id);
            localStorage.setItem('user_name', data.identifier);

            // Redirect immediately
            window.location.href = expectedRole === 'FARMER' ? 'farmer_dashboard.html' : 'broker_dashboard.html';
        } else {
            showFieldError('password', result.message || 'Invalid credentials');
            btn.disabled = false;
            btn.innerText = originalText;
        }
    };

    // --- EVENT LISTENERS ---

    const fReg = document.getElementById('farmerRegisterForm');
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    
    if (fReg) {
        fReg.addEventListener('submit', (e) => handleRegister(e, 'FARMER'));
        setupFieldValidation();
        
        // Attach OTP button listeners for farmer registration
        if (sendOtpBtn && !document.getElementById('forgotPasswordModal')) {
            console.log('Attaching sendOtpBtn listener for registration'); // Debug
            sendOtpBtn.addEventListener('click', sendOTP);
        }
        if (verifyOtpBtn && !document.getElementById('forgotPasswordModal')) {
            console.log('Attaching verifyOtpBtn listener for registration'); // Debug
            verifyOtpBtn.addEventListener('click', verifyOTP);
        }
    }

    const bReg = document.getElementById('brokerRegisterForm');
    if (bReg) {
        bReg.addEventListener('submit', (e) => handleRegister(e, 'BROKER'));
        setupFieldValidation();
        
        // Attach OTP button listeners for broker registration
        const sendOtpBtn2 = document.getElementById('sendOtpBtn');
        const verifyOtpBtn2 = document.getElementById('verifyOtpBtn');
        
        if (sendOtpBtn2 && !document.getElementById('forgotPasswordModal')) {
            console.log('Attaching sendOtpBtn listener for broker registration'); // Debug
            sendOtpBtn2.addEventListener('click', sendOTP);
        }
        if (verifyOtpBtn2 && !document.getElementById('forgotPasswordModal')) {
            console.log('Attaching verifyOtpBtn listener for broker registration'); // Debug
            verifyOtpBtn2.addEventListener('click', verifyOTP);
        }
    }

    const fLog = document.getElementById('farmerLoginForm');
    if (fLog) fLog.addEventListener('submit', (e) => handleLogin(e, 'FARMER'));

    const bLog = document.getElementById('brokerLoginForm');
    if (bLog) bLog.addEventListener('submit', (e) => handleLogin(e, 'BROKER'));

    // Setup forgot password handlers for login pages
    setupForgotPasswordHandlers();

});

// --- AUTH MANAGER OBJECT ---

const AuthManager = {
    getUserDetails: function() {
        // Retrieve user details from localStorage
        const user_id = localStorage.getItem('user_id');
        const role = localStorage.getItem('role');
        const role_id = localStorage.getItem('role_id');
        
        // Return user details if user is authenticated
        if (user_id && role) {
            return {
                user_id: user_id,
                role: role,
                role_id: role_id,
                name: localStorage.getItem('user_name') || 'User'
            };
        }
        
        return null;
    },

    logout: async function() {
        try {
            // Call backend logout endpoint to clear session
            await apiFetch('/auth/logout', {
                method: 'POST',
                headers: APIClient.getHeaders(),
                credentials: 'include'
            });
        } catch (err) {
            console.error('Logout error:', err);
        }
        
        // Clear all session data from localStorage
        localStorage.removeItem('user_id');
        localStorage.removeItem('role');
        localStorage.removeItem('role_id');
        localStorage.removeItem('session_token');
        localStorage.removeItem('user_name');
        
        // Redirect to home
        alert('You have been logged out.');
        window.location.href = 'home.html';
    }
};
let isEmailVerified = false;
let countdownTimer = null;

// Helper: Show error below specific field
function showFieldError(fieldName, message) {
    const field = document.querySelector(`[name="${fieldName}"]`);
    if (!field) return;
    field.classList.add('error');
    
    // Remove old error if exists
    const existing = field.parentElement.querySelector('.field-error');
    if (existing) existing.remove();
    
    const div = document.createElement('div');
    div.className = 'field-error';
    div.textContent = message;
    field.parentElement.appendChild(div);
}

// 1. Send OTP
async function sendOTP() {
    console.log('sendOTP called'); // Debug
    const emailInput = document.getElementById('email');
    const sendBtn = document.getElementById('sendOtpBtn');
    
    if (!emailInput || !sendBtn) {
        console.error('Email input or send button not found'); // Debug
        return;
    }
    
    const email = emailInput.value.trim();
    console.log('Email value:', email); // Debug

    if (!email || !email.includes('@')) {
        showFieldError('email', 'Please enter a valid email');
        return;
    }

    sendBtn.disabled = true;
    sendBtn.innerText = "Sending...";

    console.log('Calling /auth/send-otp with email:', email); // Debug
    const result = await postData('/auth/send-otp', { email: email });
    console.log('Result from /auth/send-otp:', result); // Debug

    if (result.success) {
        const otpSection = document.getElementById('otpSection');
        if (otpSection) {
            otpSection.style.display = 'block';
        }
        startCountdown(30);
        sendBtn.innerText = "Sent";
    } else {
        showFlash(result.message || 'Failed to send OTP', 'error');
        sendBtn.disabled = false;
        sendBtn.innerText = "Get OTP";
    }
}

// 2. Countdown Timer
function startCountdown(seconds) {
    const timerSpan = document.getElementById('countdown');
    const sendBtn = document.getElementById('sendOtpBtn');
    let timeLeft = seconds;

    sendBtn.disabled = true;

    if (countdownTimer) clearInterval(countdownTimer);
    
    countdownTimer = setInterval(() => {
        timeLeft--;
        timerSpan.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(countdownTimer);
            sendBtn.disabled = false;
            sendBtn.innerText = "Resend OTP";
            document.getElementById('timer').textContent = "Resend OTP now";
        }
    }, 1000);
}

// 3. Verify OTP
async function verifyOTP() {
    const email = document.getElementById('email').value.trim();
    const otp = document.getElementById('otpInput').value.trim();
    const verifyBtn = document.getElementById('verifyOtpBtn');

    if (otp.length !== 6) {
        showFlash('Enter 6-digit OTP', 'error');
        return;
    }

    verifyBtn.innerText = "Verifying...";
    const result = await postData('/auth/verify-otp', { email: email, otp: otp });

    if (result.success) {
        isEmailVerified = true;
        document.getElementById('otpSection').style.display = 'none';
        document.getElementById('otpSuccessMsg').style.display = 'block';
        document.getElementById('sendOtpBtn').style.display = 'none';
        document.getElementById('verifyWarning').style.display = 'none';
        
        // Lock email
        document.getElementById('email').readOnly = true;
        
        // Enable Submit
        document.getElementById('submitBtn').disabled = false;
    } else {
        showFlash(result.message || 'OTP verification failed', 'error');
        verifyBtn.innerText = "Verify";
    }
}

// =====================================================
// FORGOT PASSWORD FUNCTIONALITY
// =====================================================

let forgotPasswordState = {
    email: '',
    otp: '',
    step: 1
};

function showForgotPasswordStep(stepNumber) {
    // Hide all steps
    document.getElementById('step1')?.classList.remove('active');
    document.getElementById('step2')?.classList.remove('active');
    document.getElementById('step3')?.classList.remove('active');
    document.getElementById('step4')?.classList.remove('active');
    
    // Show requested step
    const stepEl = document.getElementById(`step${stepNumber}`);
    if (stepEl) {
        stepEl.classList.add('active');
        forgotPasswordState.step = stepNumber;
    }
}

function showForgotPasswordError(stepNumber, fieldName, message) {
    const step = document.getElementById(`step${stepNumber}`);
    if (!step) return;
    
    const field = step.querySelector(`[name="${fieldName}"]`);
    if (!field) return;
    
    field.classList.add('error');
    const existingError = field.parentElement.querySelector('.field-error');
    if (existingError) existingError.remove();
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'field-error';
    errorDiv.textContent = message;
    field.parentElement.appendChild(errorDiv);
}

function clearForgotPasswordError(stepNumber, fieldName) {
    const step = document.getElementById(`step${stepNumber}`);
    if (!step) return;
    
    const field = step.querySelector(`[name="${fieldName}"]`);
    if (!field) return;
    
    field.classList.remove('error');
    const existingError = field.parentElement.querySelector('.field-error');
    if (existingError) existingError.remove();
}

async function handleSendOtp() {
    console.log('handleSendOtp called'); // Debug
    const emailInput = document.getElementById('forgotEmail');
    const email = emailInput ? emailInput.value.trim() : '';
    
    console.log('Email value:', email); // Debug
    
    if (!email) {
        showForgotPasswordError(1, 'email', 'Email is required');
        return;
    }
    
    if (!email.includes('@')) {
        showForgotPasswordError(1, 'email', 'Please enter a valid email');
        return;
    }
    
    clearForgotPasswordError(1, 'email');
    
    const sendBtn = document.getElementById('sendOtpBtn');
    if (!sendBtn) {
        console.error('sendOtpBtn not found'); // Debug
        return;
    }
    
    const originalText = sendBtn.innerText;
    sendBtn.disabled = true;
    sendBtn.innerText = 'Sending OTP...';
    
    try {
        console.log('Calling /auth/forgot-password'); // Debug
        const result = await postData('/auth/forgot-password', { email: email });
        console.log('Result:', result); // Debug
        
        if (result.success) {
            forgotPasswordState.email = email;
            showForgotPasswordStep(2);
            
            // Start OTP countdown
            startOtpCountdown();
        } else {
            showForgotPasswordError(1, 'email', result.message || 'Failed to send OTP');
            sendBtn.disabled = false;
            sendBtn.innerText = originalText;
        }
    } catch (error) {
        console.error('Error sending OTP:', error);
        showForgotPasswordError(1, 'email', 'An error occurred. Please try again.');
        sendBtn.disabled = false;
        sendBtn.innerText = originalText;
    }
}

function startOtpCountdown() {
    const verifyBtn = document.getElementById('verifyOtpBtn');
    let timeLeft = 300; // 5 minutes
    
    verifyBtn.disabled = false;
    
    const updateCountdown = () => {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        // You can optionally display the timer somewhere
        timeLeft--;
        
        if (timeLeft < 0) {
            // OTP expired
            clearInterval(window.otpCountdownInterval);
        }
    };
    
    window.otpCountdownInterval = setInterval(updateCountdown, 1000);
}

async function handleVerifyOtp() {
    const otpInput = document.getElementById('otpInput').value.trim();
    
    if (!otpInput) {
        showForgotPasswordError(2, 'otp', 'OTP is required');
        return;
    }
    
    if (otpInput.length !== 6 || !/^\d{6}$/.test(otpInput)) {
        showForgotPasswordError(2, 'otp', 'OTP must be 6 digits');
        return;
    }
    
    clearForgotPasswordError(2, 'otp');
    
    const verifyBtn = document.getElementById('verifyOtpBtn');
    const originalText = verifyBtn.innerText;
    verifyBtn.disabled = true;
    verifyBtn.innerText = 'Verifying OTP...';
    
    try {
        const result = await postData('/auth/verify-otp', {
            email: forgotPasswordState.email,
            otp: otpInput
        });
        
        if (result.success) {
            forgotPasswordState.otp = otpInput;
            showForgotPasswordStep(3);
            if (window.otpCountdownInterval) clearInterval(window.otpCountdownInterval);
        } else {
            showForgotPasswordError(2, 'otp', result.message || 'Invalid or expired OTP');
            verifyBtn.disabled = false;
            verifyBtn.innerText = originalText;
        }
    } catch (error) {
        console.error('Error verifying OTP:', error);
        showForgotPasswordError(2, 'otp', 'An error occurred. Please try again.');
        verifyBtn.disabled = false;
        verifyBtn.innerText = originalText;
    }
}

async function handleResetPassword() {
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    let hasError = false;
    
    if (!newPassword) {
        showForgotPasswordError(3, 'new_password', 'New password is required');
        hasError = true;
    } else if (newPassword.length < 6) {
        showForgotPasswordError(3, 'new_password', 'Password must be at least 6 characters');
        hasError = true;
    } else {
        clearForgotPasswordError(3, 'new_password');
    }
    
    if (!confirmPassword) {
        showForgotPasswordError(3, 'confirm_password', 'Please confirm your password');
        hasError = true;
    } else if (newPassword !== confirmPassword) {
        showForgotPasswordError(3, 'confirm_password', 'Passwords do not match');
        hasError = true;
    } else {
        clearForgotPasswordError(3, 'confirm_password');
    }
    
    if (hasError) return;
    
    const resetBtn = document.getElementById('resetPasswordBtn');
    const originalText = resetBtn.innerText;
    resetBtn.disabled = true;
    resetBtn.innerText = 'Resetting Password...';
    
    try {
        const result = await postData('/auth/reset-password', {
            email: forgotPasswordState.email,
            otp: forgotPasswordState.otp,
            new_password: newPassword,
            confirm_password: confirmPassword
        });
        
        if (result.success) {
            showForgotPasswordStep(4);
        } else {
            showForgotPasswordError(3, 'confirm_password', result.message || 'Failed to reset password');
            resetBtn.disabled = false;
            resetBtn.innerText = originalText;
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        showForgotPasswordError(3, 'confirm_password', 'An error occurred. Please try again.');
        resetBtn.disabled = false;
        resetBtn.innerText = originalText;
    }
}

function closeForgotPasswordModal() {
    const modal = document.getElementById('forgotPasswordModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // Reset state
    forgotPasswordState = { email: '', otp: '', step: 1 };
    showForgotPasswordStep(1);
    // Clear all fields
    const fields = document.querySelectorAll('#forgotPasswordModal input');
    fields.forEach(field => {
        field.value = '';
        field.classList.remove('error');
    });
    document.querySelectorAll('#forgotPasswordModal .field-error').forEach(el => el.remove());
    if (window.otpCountdownInterval) clearInterval(window.otpCountdownInterval);
}

function setupForgotPasswordHandlers() {
    const forgotLink = document.getElementById('forgotPasswordLink');
    const modal = document.getElementById('forgotPasswordModal');
    const closeBtn = document.getElementById('modalClose');
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const resetPasswordBtn = document.getElementById('resetPasswordBtn');
    const cancelBtn1 = document.getElementById('cancelBtn1');
    const cancelBtn2 = document.getElementById('cancelBtn2');
    const cancelBtn3 = document.getElementById('cancelBtn3');
    const loginBtn = document.getElementById('loginBtn');
    
    console.log('setupForgotPasswordHandlers called'); // Debug
    console.log('Modal exists:', !!modal); // Debug
    console.log('SendOtpBtn exists:', !!sendOtpBtn); // Debug
    
    if (!modal) {
        console.log('No modal found, exiting setupForgotPasswordHandlers'); // Debug
        return; // Modal doesn't exist on this page
    }
    
    // Open modal
    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Forgot password link clicked'); // Debug
            if (window.otpCountdownInterval) clearInterval(window.otpCountdownInterval);
            modal.style.display = 'block';
            showForgotPasswordStep(1);
        });
    }
    
    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', closeForgotPasswordModal);
    }
    
    // Cancel buttons
    if (cancelBtn1) cancelBtn1.addEventListener('click', closeForgotPasswordModal);
    if (cancelBtn2) {
        cancelBtn2.addEventListener('click', () => {
            showForgotPasswordStep(1);
            document.getElementById('otpInput').value = '';
            clearForgotPasswordError(2, 'otp');
        });
    }
    if (cancelBtn3) cancelBtn3.addEventListener('click', closeForgotPasswordModal);
    
    // Step buttons
    if (sendOtpBtn) {
        console.log('Attaching sendOtpBtn listener'); // Debug
        sendOtpBtn.addEventListener('click', handleSendOtp);
    } else {
        console.warn('sendOtpBtn not found when setting up handlers'); // Debug
    }
    
    if (verifyOtpBtn) {
        console.log('Attaching verifyOtpBtn listener'); // Debug
        verifyOtpBtn.addEventListener('click', handleVerifyOtp);
    }
    
    if (resetPasswordBtn) {
        console.log('Attaching resetPasswordBtn listener'); // Debug
        resetPasswordBtn.addEventListener('click', handleResetPassword);
    }
    
    // Login button on success
    if (loginBtn) {
        loginBtn.addEventListener('click', closeForgotPasswordModal);
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeForgotPasswordModal();
        }
    });
    
    // Allow Enter key on OTP input to verify
    const otpInput = document.getElementById('otpInput');
    if (otpInput) {
        otpInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleVerifyOtp();
            }
        });
    }
}

// EOF