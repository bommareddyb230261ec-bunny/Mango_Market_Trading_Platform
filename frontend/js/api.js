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