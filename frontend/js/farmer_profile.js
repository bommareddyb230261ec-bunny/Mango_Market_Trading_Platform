// Frontend logic for Farmer Profile page

document.addEventListener('DOMContentLoaded', async () => {
    // Auth check: redirect to login if user is not authenticated
    const hasSession = () => {
        const token = localStorage.getItem('session_token');
        const userId = localStorage.getItem('user_id');
        const cookieHasSession = document.cookie.includes('mango_session');
        return (token || userId || cookieHasSession);
    };

    if (!hasSession()) {
        const msg = 'Please log in first to view your profile.';
        alert(msg);
        window.location.href = 'farmer_login.html';
        return;
    }

    // Resolve API base via shared api.js helper when available
    let API_BASE = 'http://127.0.0.1:5000';
    try {
        if (window.API_BASE_URL) {
            API_BASE = window.API_BASE_URL;
        } else if (window.ensureApiReady) {
            const resolved = await window.ensureApiReady();
            if (resolved) API_BASE = resolved;
        }
    } catch (e) {
        console.warn('API base resolution failed, falling back to default', e);
    }
    window.API_BASE = API_BASE;

    const editBtn = document.getElementById('editBtn');
    const saveBtn = document.getElementById('saveBtn');
    const otpModal = document.getElementById('otpModal');
    const cancelOtp = document.getElementById('cancelOtp');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    const otpInput = document.getElementById('otpInput');
    const otpInputSection = document.getElementById('otpInputSection');
    const modalCloseBtn = document.getElementById('modalCloseBtn');

    let editableFields = ['address', 'state', 'district', 'city', 'bankAccount', 'ifsc', 'upi', 'accountHolder', 'bankName', 'branchName'];
    let currentProfile = {};
    let otpVerified = false;
    let otpCountdownInterval = null;

    function getHeaders() {
        return (window.APIClient && typeof APIClient.getHeaders === 'function') ? APIClient.getHeaders() : {'Content-Type':'application/json'};
    }

    function setReadOnly(readonly) {
        editableFields.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.readOnly = readonly;
            el.disabled = false;
            if (!readonly) el.classList.add('editing'); else el.classList.remove('editing');
        });
        saveBtn.disabled = readonly;
    }

    async function loadProfile() {
        try {
            let attemptUrls = [`${API_BASE}/farmer/profile`, `${API_BASE}/api/farmer/profile`];
            let res = null;
            let lastErr = null;
            
            for (const url of attemptUrls) {
                try {
                    res = await fetch(url, { credentials: 'include', headers: getHeaders() });
                    if (res) break;
                } catch (fetchErr) {
                    lastErr = fetchErr;
                    console.warn('Fetch failed for', url, fetchErr);
                }
            }

            if (!res) {
                const hint = lastErr && lastErr.message ? lastErr.message : 'Network error or CORS';
                throw new Error('Failed to fetch (' + hint + '). Is the backend running?');
            }

            if (!res.ok) {
                let body = null;
                try { body = await res.json(); } catch (_) { body = await res.text().catch(()=>null); }
                const msg = body && body.message ? body.message : (body && body.error ? body.error : `HTTP ${res.status}`);
                throw new Error(msg || 'Failed to load profile');
            }

            const data = await res.json();
            if (!data.success) throw new Error(data.message || data.error || 'Failed to load');

            const p = data.profile;
            currentProfile = p;
            
            // Populate all fields
            document.getElementById('fullName').value = p.full_name || '';
            document.getElementById('email').value = p.email || '';
            document.getElementById('phone').value = p.phone || '';
            document.getElementById('address').value = p.address || '';
            document.getElementById('state').value = p.state || '';
            document.getElementById('district').value = p.district || '';
            document.getElementById('city').value = p.city || '';
            document.getElementById('accountHolder').value = p.account_holder || '';
            document.getElementById('bankName').value = p.bank_name || '';
            document.getElementById('branchName').value = p.branch_name || '';
            document.getElementById('bankAccount').value = p.bank_account || '';
            document.getElementById('ifsc').value = p.ifsc || '';
            document.getElementById('upi').value = p.upi || '';
            
            setReadOnly(true);
            console.log('Profile loaded successfully:', p);
            
        } catch (err) {
            console.error('Profile load error:', err);
            alert('Failed to load profile: ' + err.message);
        }
    }

    // Edit button handler
    editBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        otpVerified = false;
        setReadOnly(false);
        otpModal.style.display = 'block';
        otpInput.value = '';
        otpInputSection.style.display = 'none';
        document.getElementById('otpErrorMsg').style.display = 'none';
        document.getElementById('otpSuccessMsg').style.display = 'none';
    });

    // Cancel OTP
    cancelOtp.addEventListener('click', (ev) => {
        ev.preventDefault();
        otpModal.style.display = 'none';
        setReadOnly(true);
        otpVerified = false;
    });

    // Modal close button
    modalCloseBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        otpModal.style.display = 'none';
        setReadOnly(true);
        otpVerified = false;
    });

    // Close modal when clicking on background
    otpModal.addEventListener('click', (e) => {
        if (e.target === otpModal) {
            otpModal.style.display = 'none';
            setReadOnly(true);
            otpVerified = false;
        }
    });

    // Send OTP button
    sendOtpBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        try {
            sendOtpBtn.disabled = true;
            const res = await fetch(`${API_BASE}/farmer/send-otp`, { 
                method: 'POST', 
                credentials: 'include', 
                headers: getHeaders(),
                body: JSON.stringify({}) 
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.message || 'Failed to send OTP');
            }
            otpInputSection.style.display = 'block';
            sendOtpBtn.style.display = 'none';
            document.getElementById('otpErrorMsg').style.display = 'none';
            startOtpCountdown();
        } catch (err) {
            document.getElementById('otpErrorMsg').style.display = 'block';
            document.getElementById('otpErrorMsg').textContent = err.message;
        } finally {
            sendOtpBtn.disabled = false;
        }
    });

    // Start OTP countdown
    function startOtpCountdown() {
        let countdown = 30;
        document.getElementById('otpCountdown').style.display = 'inline';
        resendOtpBtn.style.display = 'none';
        
        if (otpCountdownInterval) clearInterval(otpCountdownInterval);
        otpCountdownInterval = setInterval(() => {
            countdown--;
            document.getElementById('countdownTimer').textContent = countdown;
            if (countdown <= 0) {
                clearInterval(otpCountdownInterval);
                document.getElementById('otpCountdown').style.display = 'none';
                resendOtpBtn.style.display = 'block';
            }
        }, 1000);
    }

    // Resend OTP button
    resendOtpBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        try {
            resendOtpBtn.disabled = true;
            const res = await fetch(`${API_BASE}/farmer/send-otp`, { 
                method: 'POST', 
                credentials: 'include', 
                headers: getHeaders(),
                body: JSON.stringify({}) 
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.message || 'Failed to send OTP');
            }
            otpInput.value = '';
            document.getElementById('otpErrorMsg').style.display = 'none';
            startOtpCountdown();
        } catch (err) {
            document.getElementById('otpErrorMsg').style.display = 'block';
            document.getElementById('otpErrorMsg').textContent = err.message;
        } finally {
            resendOtpBtn.disabled = false;
        }
    });

    // Verify OTP button
    verifyOtpBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const otp = otpInput.value.trim();
        if (!otp) {
            document.getElementById('otpErrorMsg').style.display = 'block';
            document.getElementById('otpErrorMsg').textContent = 'Please enter OTP';
            return;
        }
        try {
            verifyOtpBtn.disabled = true;
            const res = await fetch(`${API_BASE}/farmer/verify-otp`, { 
                method: 'POST', 
                credentials: 'include', 
                headers: getHeaders(),
                body: JSON.stringify({ otp }) 
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.message || 'Invalid OTP');
            }
            otpVerified = true;
            document.getElementById('otpErrorMsg').style.display = 'none';
            document.getElementById('otpSuccessMsg').style.display = 'block';
            setTimeout(() => {
                otpModal.style.display = 'none';
            }, 1000);
        } catch (err) {
            document.getElementById('otpErrorMsg').style.display = 'block';
            document.getElementById('otpErrorMsg').textContent = err.message;
        } finally {
            verifyOtpBtn.disabled = false;
        }
    });

    // Save button handler
    saveBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        if (!otpVerified) {
            alert('Please verify OTP first');
            return;
        }
        try {
            saveBtn.disabled = true;
            const payload = {
                address: document.getElementById('address').value.trim(),
                state: document.getElementById('state').value.trim(),
                district: document.getElementById('district').value.trim(),
                city: document.getElementById('city').value.trim(),
                account_holder: document.getElementById('accountHolder').value.trim(),
                bank_name: document.getElementById('bankName').value.trim(),
                branch_name: document.getElementById('branchName').value.trim(),
                bank_account: document.getElementById('bankAccount').value.trim(),
                ifsc: document.getElementById('ifsc').value.trim(),
                upi: document.getElementById('upi').value.trim()
            };
            const res = await fetch(`${API_BASE}/farmer/profile/update`, { 
                method: 'PUT', 
                credentials: 'include', 
                headers: getHeaders(),
                body: JSON.stringify(payload) 
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.message || 'Failed to update profile');
            }
            alert('Profile updated successfully');
            otpVerified = false;
            await loadProfile();
        } catch (err) {
            alert('Update failed: ' + err.message);
        } finally {
            saveBtn.disabled = false;
        }
    });

    // Logout handler
    try {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                try {
                    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
                } catch (err) {
                    console.warn('Logout failed', err);
                }
                localStorage.removeItem('user_id');
                localStorage.removeItem('role');
                localStorage.removeItem('role_id');
                localStorage.removeItem('user_name');
                window.location.href = 'home.html';
            });
        }
    } catch (e) { /* silent */ }

    loadProfile();
});
