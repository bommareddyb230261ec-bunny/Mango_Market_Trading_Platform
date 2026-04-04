const API_BASE = 'http://127.0.0.1:5000';

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Host Dashboard] Page loaded');
    
    // Check if user has verified password
    const verified = localStorage.getItem('host_password_verified');
    if (verified !== 'true') {
        console.log('[Host Dashboard] Access denied - redirecting to host_access.html');
        window.location.href = 'host_access.html';
        return;
    }
    
    // Load pending brokers
    loadPendingBrokers();
});

async function loadPendingBrokers() {
    const table = document.getElementById('pendingBrokersTable');
    const loadingMsg = document.getElementById('loadingMessage');
    
    if (loadingMsg) {
        loadingMsg.style.display = 'block';
    }
    
    try {
        console.log('[Host Dashboard] Fetching pending brokers...');
        
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
        console.log('[Host Dashboard] Fetched brokers:', brokers);
        
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
        console.error('[Host Dashboard] Error loading brokers:', error);
        if (loadingMsg) {
            loadingMsg.innerHTML = `<p style="color: red;">Error loading brokers: ${error.message}</p>`;
        }
    }
}

function populateBrokersTable(brokers) {
    const tbody = document.getElementById('pendingBrokersData');
    
    if (!tbody) {
        console.error('[Host Dashboard] Table body not found');
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

function viewLicense(licensePath) {
    if (!licensePath) {
        alert('No trade license document available');
        return;
    }
    
    console.log('[Host Dashboard] Downloading license:', licensePath);
    
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
    
    console.log('[Host Dashboard] Download started for:', filename);
}

async function approveBroker(brokerId, brokerName) {
    if (!confirm(`Approve broker "${brokerName}"?`)) {
        return;
    }
    
    try {
        console.log('[Host Dashboard] Approving broker:', brokerId);
        
        const response = await fetch(`${API_BASE}/api/host/brokers/${brokerId}/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success || response.ok) {
            console.log('[Host Dashboard] Broker approved successfully');
            alert(`Broker "${brokerName}" has been approved successfully!`);
            
            // Refresh the table
            loadPendingBrokers();
        } else {
            console.error('[Host Dashboard] Approval failed:', data.message);
            alert(`Error: ${data.message || 'Failed to approve broker'}`);
        }
    } catch (error) {
        console.error('[Host Dashboard] Error approving broker:', error);
        alert(`Error: ${error.message}`);
    }
}

async function rejectBroker(brokerId, brokerName) {
    const reason = prompt(`Enter reason for declining ${brokerName}:`, 'License document is invalid or incomplete');
    
    if (reason === null) {
        // User cancelled
        return;
    }
    
    try {
        console.log('[Host Dashboard] Rejecting broker:', brokerId, 'Reason:', reason);
        
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
            console.log('[Host Dashboard] Broker rejected successfully');
            alert(`Broker "${brokerName}" has been declined.`);
            
            // Refresh the table
            loadPendingBrokers();
        } else {
            console.error('[Host Dashboard] Rejection failed:', data.message);
            alert(`Error: ${data.message || 'Failed to reject broker'}`);
        }
    } catch (error) {
        console.error('[Host Dashboard] Error rejecting broker:', error);
        alert(`Error: ${error.message}`);
    }
}

function logoutHost() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('host_password_verified');
        window.location.href = 'host_access.html';
    }
}

function refreshTable() {
    console.log('[Host Dashboard] Refreshing table...');
    loadPendingBrokers();
}
