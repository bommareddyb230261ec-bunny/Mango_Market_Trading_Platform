// Frontend logic for Broker Profile page

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
        window.location.href = 'broker_login.html';
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

    function getHeaders() {
        return (window.APIClient && typeof APIClient.getHeaders === 'function') ? APIClient.getHeaders() : {'Content-Type':'application/json'};
    }

    async function loadProfile() {
        try {
            let attemptUrls = [`${API_BASE}/broker/profile`, `${API_BASE}/api/broker/profile`];
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
                throw new Error('Failed to fetch profile. Is the backend running?');
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
            
            // Populate all fields
            document.getElementById('fullName').value = p.full_name || '';
            document.getElementById('email').value = p.email || '';
            document.getElementById('phone').value = p.phone || '';
            document.getElementById('marketName').value = p.market_name || '';
            document.getElementById('state').value = p.state || '';
            document.getElementById('district').value = p.district || '';
            document.getElementById('marketArea').value = p.market_area || '';
            
            // Set fee status badge
            const feeStatusEl = document.getElementById('feeStatus');
            if (p.platform_fee_paid) {
                feeStatusEl.textContent = '✅ Platform Fee Paid';
                feeStatusEl.className = 'info-badge paid';
            } else {
                feeStatusEl.textContent = '⏳ Platform Fee Pending';
                feeStatusEl.className = 'info-badge pending';
            }
            
            // Format registration date
            if (p.registration_date) {
                const regDate = new Date(p.registration_date);
                document.getElementById('registrationDate').value = regDate.toLocaleDateString('en-IN', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } else {
                document.getElementById('registrationDate').value = 'N/A';
            }
            
            console.log('Broker profile loaded successfully:', p);
            
        } catch (err) {
            console.error('Profile load error:', err);
            alert('Failed to load profile: ' + err.message);
        }
    }

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
