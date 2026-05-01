// ====== API CONFIGURATION ======
const API_PORT = 5000; // Change to 8000 if your backend uses that port
const API_PREFIX = ''; // Change to '/api' if your backend requires it

// Helper: prefer localhost when opened from file:// or when hostname is empty
function _defaultProtoHost() {
    let proto = window.location.protocol;
    let host = window.location.hostname;
    if (proto === 'file:' || !host) {
        proto = 'http:';
        host = '127.0.0.1';
    }
    return { proto, host };
}

// Dynamically construct base URL for a given port
const _dh = _defaultProtoHost();
let API_BASE_URL = `${_dh.proto}//${_dh.host}:${API_PORT}${API_PREFIX}`;
console.log("API initial guess:", API_BASE_URL);

// probe ports and resolve active API base; will try each port's /health endpoint
async function _probePorts(ports = [API_PORT, 8000]) {
    const { proto, host } = _defaultProtoHost();
    for (const port of ports) {
        const url = `${proto}//${host}:${port}/health`;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const resp = await fetch(url, { method: 'GET', signal: controller.signal });
            clearTimeout(timeoutId);
            if (resp.ok) {
                API_BASE_URL = `${proto}//${host}:${port}${API_PREFIX}`;
                console.info('API detected at', API_BASE_URL);
                return API_BASE_URL;
            }
        } catch (err) {
            // ignore and try next
        }
    }
    return null;
}

// Ensure we have a resolved API base before sending critical requests
async function _ensureApiBase() {
    // quick probe: if default responds to /health, keep it
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const resp = await fetch(`${API_BASE_URL}/health`, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (resp && resp.ok) {
            // Dispatch an event so UI can react
            window.dispatchEvent(new CustomEvent('backend:status', { detail: { available: true, base: API_BASE_URL } }));
            return API_BASE_URL;
        }
    } catch (e) {
        // not reachable, probe fallback ports
    }
    const found = await _probePorts([API_PORT, 8000]);
    if (found) {
        window.dispatchEvent(new CustomEvent('backend:status', { detail: { available: true, base: found } }));
        return found;
    }
    window.dispatchEvent(new CustomEvent('backend:status', { detail: { available: false, base: null } }));
    return null;
}

// Expose helper so pages can check backend status & trigger retry
window.ensureApiReady = _ensureApiBase;
// Expose current base for debugging
window.API_BASE_URL = API_BASE_URL;

// ====== API CLIENT HELPER ======
const APIClient = {
    getHeaders: function() {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        const token = localStorage.getItem('session_token');
        if (token) {
            headers['Authorization'] = 'Bearer ' + token;
        }
        return headers;
    }
};

// ====== REQUEST HANDLER ======
async function apiFetch(endpoint, opts = {}) {
    const base = await _ensureApiBase();
    if (!base) {
        throw new Error(`Backend not found on ports ${API_PORT} or 8000`);
    }
    return fetch(`${base}${endpoint}`, opts);
}

async function postData(endpoint, data) {
    try {
        const base = await _ensureApiBase();
        if (!base) {
            return { success: false, message: `Network error. Could not find backend on ports ${API_PORT} or 8000. Make sure the backend is running (e.g. run 'python backend/app.py' or start your FastAPI server).` };
        }

        const response = await fetch(`${base}${endpoint}`, {
            method: 'POST',
            headers: APIClient.getHeaders(),
            credentials: 'include',
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            let errorMsg = `Server error: ${response.status} ${response.statusText}`;
            try {
                const errData = await response.json();
                if (errData && errData.message) errorMsg = errData.message;
            } catch (e) {}
            return { success: false, message: errorMsg };
        }

        const json = await response.json();
        if (json && json.session_token) localStorage.setItem('session_token', json.session_token);
        return { success: true, ...json };

    } catch (error) {
        console.error("API Network Error:", error);
        return { success: false, message: "Network error. Is the server running? Check console for details." };
    }
}


// =====================================================
// UPI PAYMENT APIs - Dynamic Farmer Payments
// =====================================================

/**
 * Fetch payment details for a transaction including farmer UPI information.
 * Dynamically fetches data from backend - NO HARDCODING.
 * 
 * @param {string} transactionId - Transaction ID (numeric or 'w-<id>' for weighments)
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
async function fetchPaymentDetails(transactionId) {
    console.log('📡 Fetching payment details for:', transactionId);
    
    try {
        const base = await _ensureApiBase();
        if (!base) {
            return { success: false, error: 'Backend not available' };
        }

        const response = await fetch(`${base}/broker/payment-details/${encodeURIComponent(transactionId)}`, {
            method: 'GET',
            headers: APIClient.getHeaders(),
            credentials: 'include'
        });

        if (!response.ok) {
            let errorMsg = `Server error: ${response.status}`;
            try {
                const errData = await response.json();
                if (errData && errData.error) errorMsg = errData.error;
            } catch (e) {}
            console.error('❌ Payment details fetch failed:', errorMsg);
            return { success: false, error: errorMsg };
        }

        const json = await response.json();
        console.log('✅ Payment details received:', json);
        return json;

    } catch (error) {
        console.error('❌ Network error fetching payment details:', error);
        return { success: false, error: 'Network error: ' + error.message };
    }
}

/**
 * Mark a payment as initiated via UPI.
 * Updates status to INITIATED in backend.
 * 
 * @param {string} transactionId - Transaction ID to mark as initiated
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function markPaymentInitiated(transactionId) {
    console.log('📡 Marking payment initiated for:', transactionId);
    
    try {
        const base = await _ensureApiBase();
        if (!base) {
            return { success: false, error: 'Backend not available' };
        }

        const response = await fetch(`${base}/broker/mark-payment-initiated`, {
            method: 'POST',
            headers: APIClient.getHeaders(),
            credentials: 'include',
            body: JSON.stringify({ transaction_id: transactionId })
        });

        if (!response.ok) {
            let errorMsg = `Server error: ${response.status}`;
            try {
                const errData = await response.json();
                if (errData && errData.error) errorMsg = errData.error;
            } catch (e) {}
            console.error('❌ Mark payment initiated failed:', errorMsg);
            return { success: false, error: errorMsg };
        }

        const json = await response.json();
        console.log('✅ Payment initiated marked:', json);
        return json;

    } catch (error) {
        console.error('❌ Network error marking payment initiated:', error);
        return { success: false, error: 'Network error: ' + error.message };
    }
}

/**
 * Mark a payment as completed after the broker confirms the UPI transfer.
 *
 * @param {string} transactionId - Transaction ID to mark as paid
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function markPaymentComplete(transactionId) {
    console.log('Marking payment complete for:', transactionId);

    try {
        const base = await _ensureApiBase();
        if (!base) {
            return { success: false, error: 'Backend not available' };
        }

        const response = await fetch(`${base}/broker/process-payment`, {
            method: 'POST',
            headers: APIClient.getHeaders(),
            credentials: 'include',
            body: JSON.stringify({ transaction_id: transactionId })
        });

        let json = {};
        try {
            json = await response.json();
        } catch (e) {}

        if (!response.ok || !json.success) {
            const errorMsg = json.error || json.message || `Server error: ${response.status}`;
            console.error('Mark payment complete failed:', errorMsg);
            return { success: false, error: errorMsg };
        }

        console.log('Payment marked complete:', json);
        return json;

    } catch (error) {
        console.error('Network error marking payment complete:', error);
        return { success: false, error: 'Network error: ' + error.message };
    }
}

// Expose functions globally
window.fetchPaymentDetails = fetchPaymentDetails;
window.markPaymentInitiated = markPaymentInitiated;
window.markPaymentComplete = markPaymentComplete;
