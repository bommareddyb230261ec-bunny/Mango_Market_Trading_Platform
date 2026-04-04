/**
 * Host Verification Panel - JavaScript
 * Handles password verification and broker approval/rejection workflow
 */

const API_BASE = 'http://127.0.0.1:5000';
let currentUserRole = '';

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Host Verify] Page loaded');
    
    // Check if user is already authenticated by checking localStorage
    const prevPassword = localStorage.getItem('host_password_verified');
    if (prevPassword === 'true') {
        // If session is still valid, go straight to dashboard
        setTimeout(() => {
            loadPendingBrokers();
            showDashboard();
        }, 100);
    } else {
        // Show password prompt
        showPasswordPrompt();
    }
    
    // Setup event listeners
    setupEventListeners();
});

function setupEventListeners() {
    // Password verification form - support both button IDs
    const verifyBtn = document.getElementById('verifyAccessBtn') || document.getElementById('verifyPasswordBtn');
    if (verifyBtn) {
        // Ensure click handler is attached
        verifyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            verifyHostAccess();
        });
        console.log('[Host Verify] Button event listener attached');
    } else {
        console.warn('[Host Verify] Verify button not found');
    }
    
    const passwordInput = document.getElementById('hostPassword');
    if (passwordInput) {
        // Allow Enter key to submit
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                verifyHostAccess();
            }
        });
        console.log('[Host Verify] Password input event listener attached');
    }
}

// ============================================
// PASSWORD VERIFICATION
// ============================================

async function verifyHostAccess() {
    const password = (document.getElementById('hostPassword') || {}).value || '';
    const errorMsg = document.getElementById('errorMessage') || document.getElementById('passwordError');
    
    if (!password) {
        console.log('[Host Verify] No password entered');
        if (errorMsg) {
            errorMsg.textContent = 'Please enter the host password';
            errorMsg.style.display = 'block';
        }
        return;
    }
    
    try {
        console.log('[Host Verify] Verifying password...');
        
        const response = await fetch(`${API_BASE}/api/host/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: password }),
            credentials: 'include'
        });
        
        console.log('[Host Verify] API Response Status:', response.status);
        
        const data = await response.json();
        console.log('[Host Verify] API Response Data:', data);
        
        if (data.success === true) {
            console.log('[Host Verify] ✅ Password verified successfully');
            
            // Clear any error messages
            if (errorMsg) {
                errorMsg.style.display = 'none';
                errorMsg.textContent = '';
            }
            
            // Store verification in localStorage (session-based)
            localStorage.setItem('host_password_verified', 'true');
            console.log('[Host Verify] Session stored in localStorage');
            
            // Hide password prompt and show dashboard
            const prompt = document.getElementById('passwordPrompt');
            const dashboard = document.getElementById('verificationDashboard');
            
            if (prompt) {
                prompt.style.display = 'none';
                console.log('[Host Verify] Password prompt hidden');
            }
            if (dashboard) {
                dashboard.style.display = 'block';
                console.log('[Host Verify] Dashboard shown');
                // Load pending brokers
                loadPendingBrokers();
            } else {
                console.log('[Host Verify] Dashboard not found, redirecting...');
                // Redirect to host_dashboard.html if it exists
                window.location.href = 'host_dashboard.html';
            }
        } else {
            console.log('[Host Verify] ❌ Password verification failed:', data.message);
            
            if (errorMsg) {
                errorMsg.textContent = data.message || 'Invalid host password';
                errorMsg.style.display = 'block';
                console.log('[Host Verify] Error message displayed:', errorMsg.textContent);
            }
            
            // Clear the password input
            const passwordInput = document.getElementById('hostPassword');
            if (passwordInput) {
                passwordInput.value = '';
                passwordInput.focus();
            }
        }
    } catch (error) {
        console.error('[Host Verify] ❌ Error verifying password:', error);
        if (errorMsg) {
            errorMsg.textContent = `Error: ${error.message}. Please check if backend is running on http://127.0.0.1:5000`;
            errorMsg.style.display = 'block';
        }
    }
}

// Alias for backward compatibility
async function verifyHostPassword() {
    return verifyHostAccess();
}

function showPasswordPrompt() {
    const prompt = document.getElementById('passwordPrompt');
    if (prompt) {
        prompt.style.display = 'flex';
    }
}

function showDashboard() {
    const dashboard = document.getElementById('verificationDashboard');
    if (dashboard) {
        dashboard.style.display = 'block';
    }
}

// ============================================
// LOAD PENDING BROKERS
// ============================================

async function loadPendingBrokers() {
    const table = document.getElementById('pendingBrokersTable');
    const loadingMsg = document.getElementById('loadingMessage');
    
    if (loadingMsg) {
        loadingMsg.style.display = 'block';
    }
    
    try {
        console.log('[Host Verify] Fetching pending brokers...');
        
        const response = await fetch(`${API_BASE}/api/host/brokers/pending`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        
        const brokers = await response.json();
        console.log('[Host Verify] Fetched brokers:', brokers);
        
        // Hide loading message
        if (loadingMsg) {
            loadingMsg.style.display = 'none';
        }
        
        // Populate table
        if (Array.isArray(brokers) && brokers.length > 0) {
            populateBrokersTable(brokers);
        } else {
            showNoBrokersMessage(table);
        }
    } catch (error) {
        console.error('[Host Verify] Error loading brokers:', error);
        if (loadingMsg) {
            loadingMsg.innerHTML = `<p style="color: red;">Error loading brokers: ${error.message}</p>`;
        }
    }
}

function populateBrokersTable(brokers) {
    const tbody = document.getElementById('pendingBrokersData');
    
    if (!tbody) {
        console.error('[Host Verify] Table body not found');
        return;
    }
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    brokers.forEach((broker, index) => {
        const row = document.createElement('tr');
        
        // Location (City, District, State)
        let location = broker.location || 'N/A';
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${broker.broker_name || 'N/A'}</td>
            <td>${broker.market_name || 'N/A'}</td>
            <td>${broker.phone || 'N/A'}</td>
            <td><a href="mailto:${broker.email}">${broker.email || 'N/A'}</a></td>
            <td>${location}</td>
            <td>
                ${broker.trade_license ? 
                    `<button class="btn btn-sm btn-info" onclick="viewLicense('${broker.trade_license}')">
                        📥 Download
                    </button>` 
                    : 'No document'}
            </td>
            <td><span class="badge badge-warning">${broker.verification_status}</span></td>
            <td>
                <button class="btn btn-sm btn-success" onclick="approveBroker(${broker.id}, '${broker.broker_name}')">
                    Approve
                </button>
                <button class="btn btn-sm btn-danger" onclick="rejectBroker(${broker.id}, '${broker.broker_name}')">
                    Decline
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

function showNoBrokersMessage(table) {
    const tbody = document.getElementById('pendingBrokersData');
    
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 30px;">
                    <p style="color: #666; font-size: 16px;">No pending broker registrations at this time.</p>
                </td>
            </tr>
        `;
    }
}

// ============================================
// VIEW TRADE LICENSE
// ============================================

function viewLicense(licensePath) {
    if (!licensePath) {
        alert('No trade license document available');
        return;
    }
    
    console.log('[Host Verify] Downloading license:', licensePath);
    
    // Construct full URL
    const licenseUrl = `${API_BASE}/${licensePath}`;
    
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = licenseUrl;
    
    // Extract filename from path for download
    const filename = licensePath.split('/').pop() || 'trade_license.pdf';
    link.download = filename;
    
    // Add to DOM, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('[Host Verify] Download started for:', filename);
}

// ============================================
// APPROVE BROKER
// ============================================

async function approveBroker(brokerId, brokerName) {
    if (!confirm(`Approve broker "${brokerName}"?`)) {
        return;
    }
    
    try {
        console.log('[Host Verify] Approving broker:', brokerId);
        
        const response = await fetch(`${API_BASE}/api/host/brokers/${brokerId}/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success || response.ok) {
            console.log('[Host Verify] Broker approved successfully');
            alert(`✓ ${brokerName} has been approved successfully!`);
            
            // Refresh the table
            loadPendingBrokers();
        } else {
            console.error('[Host Verify] Approval failed:', data.message);
            alert(`Error: ${data.message || 'Failed to approve broker'}`);
        }
    } catch (error) {
        console.error('[Host Verify] Error approving broker:', error);
        alert(`Error: ${error.message}`);
    }
}

// ============================================
// REJECT BROKER
// ============================================

async function rejectBroker(brokerId, brokerName) {
    const reason = prompt(`Enter reason for declining ${brokerName}:`, 'License document is invalid or incomplete');
    
    if (reason === null) {
        // User cancelled
        return;
    }
    
    try {
        console.log('[Host Verify] Rejecting broker:', brokerId, 'Reason:', reason);
        
        const response = await fetch(`${API_BASE}/api/host/brokers/${brokerId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason: reason }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success || response.ok) {
            console.log('[Host Verify] Broker rejected successfully');
            alert(`✗ ${brokerName} has been declined.`);
            
            // Refresh the table
            loadPendingBrokers();
        } else {
            console.error('[Host Verify] Rejection failed:', data.message);
            alert(`Error: ${data.message || 'Failed to reject broker'}`);
        }
    } catch (error) {
        console.error('[Host Verify] Error rejecting broker:', error);
        alert(`Error: ${error.message}`);
    }
}

// ============================================
// LOGOUT
// ============================================

function logoutHost() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('host_password_verified');
        location.reload();
    }
}

// ============================================
// ADDITIONAL FUNCTIONS
// ============================================

function refreshTable() {
    console.log('[Host Verify] Refreshing table...');
    loadPendingBrokers();
}
