// ====== API CONFIGURATION ======
// Prefer the current origin for production deployments where the frontend and Flask backend are served together.
const API_PREFIX = "";

function _resolveApiBase() {
  if (window.location.origin && window.location.origin !== "null") {
    return `${window.location.origin}${API_PREFIX}`;
  }
  return (
    `${window.location.protocol}//${window.location.host || ""}${API_PREFIX}`.replace(
      /:\/?$/,
      "",
    ) || "/"
  );
}

const API_BASE_URL = _resolveApiBase();
window.API_BASE_URL = API_BASE_URL;

async function _ensureApiBase() {
  try {
    const resp = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      credentials: "include",
    });
    if (resp && resp.ok) {
      window.dispatchEvent(
        new CustomEvent("backend:status", {
          detail: { available: true, base: API_BASE_URL },
        }),
      );
      return API_BASE_URL;
    }
  } catch (e) {
    // If the server is unavailable, surface a useful message instead of probing localhost ports.
  }

  window.dispatchEvent(
    new CustomEvent("backend:status", {
      detail: { available: false, base: null },
    }),
  );
  return null;
}

// Expose helper so pages can check backend status & trigger retry
window.ensureApiReady = _ensureApiBase;

// ====== API CLIENT HELPER ======
const APIClient = {
  getHeaders: function () {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const token = localStorage.getItem("session_token");
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }
    return headers;
  },
};

function clearStoredAuth() {
  localStorage.removeItem("user_id");
  localStorage.removeItem("role");
  localStorage.removeItem("role_id");
  localStorage.removeItem("session_token");
  localStorage.removeItem("farmer_token");
  localStorage.removeItem("user_name");
}

function handleUnauthorizedResponse(response, endpoint) {
  const authEndpoints = [
    "/auth/login",
    "/auth/register",
    "/auth/check-email",
    "/auth/check-phone",
    "/auth/send-otp",
    "/auth/verify-otp",
    "/auth/forgot-password",
    "/auth/reset-password",
  ];
  const isAuthFlow = authEndpoints.some((path) => endpoint.startsWith(path));
  if (response.status === 401 && !isAuthFlow) {
    clearStoredAuth();
    window.dispatchEvent(
      new CustomEvent("auth:expired", { detail: { endpoint } }),
    );
  }
}

// ====== REQUEST HANDLER ======
async function apiFetch(endpoint, opts = {}) {
  const base = await _ensureApiBase();
  if (!base) {
    throw new Error("Unable to connect to the server. Please try again.");
  }
  const response = await fetch(`${base}${endpoint}`, opts);
  handleUnauthorizedResponse(response, endpoint);
  return response;
}

async function postData(endpoint, data) {
  try {
    const base = await _ensureApiBase();
    if (!base) {
      return {
        success: false,
        message: "Unable to connect to the server. Please try again.",
      };
    }

    const response = await fetch(`${base}${endpoint}`, {
      method: "POST",
      headers: APIClient.getHeaders(),
      credentials: "include",
      body: JSON.stringify(data),
    });
    handleUnauthorizedResponse(response, endpoint);

    if (!response.ok) {
      let errorMsg = `Server error: ${response.status} ${response.statusText}`;
      try {
        const errData = await response.json();
        if (errData && errData.message) errorMsg = errData.message;
      } catch (e) {}
      return { success: false, message: errorMsg };
    }

    const json = await response.json();
    if (json && json.session_token)
      localStorage.setItem("session_token", json.session_token);
    return { success: true, ...json };
  } catch (error) {
    console.error("API Network Error:", error);
    return {
      success: false,
      message:
        "Network error. Is the server running? Check console for details.",
    };
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
  console.log("📡 Fetching payment details for:", transactionId);

  try {
    const base = await _ensureApiBase();
    if (!base) {
      return { success: false, error: "Backend not available" };
    }

    const response = await fetch(
      `${base}/broker/payment-details/${encodeURIComponent(transactionId)}`,
      {
        method: "GET",
        headers: APIClient.getHeaders(),
        credentials: "include",
      },
    );

    if (!response.ok) {
      let errorMsg = `Server error: ${response.status}`;
      try {
        const errData = await response.json();
        if (errData && errData.error) errorMsg = errData.error;
      } catch (e) {}
      console.error("❌ Payment details fetch failed:", errorMsg);
      return { success: false, error: errorMsg };
    }

    const json = await response.json();
    console.log("✅ Payment details received:", json);
    return json;
  } catch (error) {
    console.error("❌ Network error fetching payment details:", error);
    return { success: false, error: "Network error: " + error.message };
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
  console.log("📡 Marking payment initiated for:", transactionId);

  try {
    const base = await _ensureApiBase();
    if (!base) {
      return { success: false, error: "Backend not available" };
    }

    const response = await fetch(`${base}/broker/mark-payment-initiated`, {
      method: "POST",
      headers: APIClient.getHeaders(),
      credentials: "include",
      body: JSON.stringify({ transaction_id: transactionId }),
    });

    if (!response.ok) {
      let errorMsg = `Server error: ${response.status}`;
      try {
        const errData = await response.json();
        if (errData && errData.error) errorMsg = errData.error;
      } catch (e) {}
      console.error("❌ Mark payment initiated failed:", errorMsg);
      return { success: false, error: errorMsg };
    }

    const json = await response.json();
    console.log("✅ Payment initiated marked:", json);
    return json;
  } catch (error) {
    console.error("❌ Network error marking payment initiated:", error);
    return { success: false, error: "Network error: " + error.message };
  }
}

/**
 * Submit the UPI transaction reference after the broker has completed the transfer.
 *
 * @param {string} transactionId - Transaction ID to submit
 * @param {string} upiTransactionId - Broker-entered UPI transaction reference
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function submitUpiTransaction(
  transactionId,
  upiTransactionId,
  proofFile = null,
) {
  console.log(
    "Submitting UPI transaction id for:",
    transactionId,
    upiTransactionId,
  );

  try {
    const base = await _ensureApiBase();
    if (!base) {
      return { success: false, error: "Backend not available" };
    }

    const formData = new FormData();
    formData.append("transaction_id", transactionId);
    formData.append("upi_transaction_id", upiTransactionId);
    if (proofFile) {
      formData.append("payment_proof", proofFile);
    }

    const headers = APIClient.getHeaders();
    if (headers["Content-Type"]) {
      delete headers["Content-Type"];
    }

    const response = await fetch(`${base}/broker/submit-upi-transaction`, {
      method: "POST",
      headers,
      credentials: "include",
      body: formData,
    });

    let json = {};
    try {
      json = await response.json();
    } catch (e) {}

    if (!response.ok || !json.success) {
      const errorMsg =
        json.error || json.message || `Server error: ${response.status}`;
      console.error("Submit UPI transaction failed:", errorMsg);
      return { success: false, error: errorMsg };
    }

    console.log("UPI transaction submitted:", json);
    return json;
  } catch (error) {
    console.error("Network error submitting UPI transaction:", error);
    return { success: false, error: "Network error: " + error.message };
  }
}

/**
 * Mark a payment as completed after the broker confirms the UPI transfer.
 *
 * @param {string} transactionId - Transaction ID to mark as paid
 * @param {string} upiTransactionId - Broker-entered UPI transaction reference
 * @returns {Promise<{success: boolean, message?: string, error?: string}>}
 */
async function markPaymentComplete(
  transactionId,
  upiTransactionId,
  proofFile = null,
) {
  console.log("Marking payment complete for:", transactionId, upiTransactionId);

  if (!upiTransactionId || upiTransactionId.trim() === "") {
    return { success: false, error: "Please enter the UPI transaction ID" };
  }
  if (!proofFile) {
    return {
      success: false,
      error: "Please upload the payment proof screenshot or PDF",
    };
  }

  return submitUpiTransaction(transactionId, upiTransactionId, proofFile);
}

// Expose functions globally
window.fetchPaymentDetails = fetchPaymentDetails;
window.markPaymentInitiated = markPaymentInitiated;
window.markPaymentComplete = markPaymentComplete;
window.submitUpiTransaction = submitUpiTransaction;
